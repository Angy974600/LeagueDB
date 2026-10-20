from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from src.database import SessionLocal, init_db
from src.riot_client import RiotAPIClient
from src.models import (
    BronzeStgPlayer,
    BronzeStgMatches,
    DimPlayerRank,
    DimPlayer,
    DimMatch,
    FactMatchParticipant,
    DimPlayerChampionsMasteries
)

class ETLPipeline:
    def __init__(self, client:Optional[RiotAPIClient]=None):
        self.client=client or RiotAPIClient()
        init_db()

    def sync_player_profile(
        self,
        game_name:str,
        tag_line:str,
        routing_region:str="europe",
        platform_region:str ="euw1",
        match_count:int =5
        )-> Dict [str,Any]:
        """
        Esegue l'intero flusso Medallion per un player:
        Bronze(RAW JSONB)->SILVER(Dati puliti e normalizzati)->Gold (Gold marts)
        """
        db=SessionLocal()
        try:
            print(f"[1/4] Estrazione dell'account Riot {game_name}#{tag_line}")
            account=self.client.get_account_by_riot_id(game_name,tag_line,routing_region)
            if not account:
                raise ValueError(f"Account {game_name}#{tag_line} non trovato")
            puuid=account["puuid"]
            actual_name=account.get("gameName",game_name)
            actual_tag=account.get("tagLine",tag_line)
            
            summoner=self.client.get_summoner_by_puuid(puuid,platform_region)
            ranks=self.client.get_league_entries_by_puuid(puuid,platform_region)
            masteries=self.client.get_all_champion_mastery_sorted_by_puuid(puuid,platform_region)

            # ------------------------------------------------------------------
            # BRONZE LAYER: Ingestion grezza del Player
            # ------------------------------------------------------------------
            stg_player = db.query(BronzeStgPlayer).filter(BronzeStgPlayer.puuid == puuid).first()
            if not stg_player:
                # INSERT: Il player non esiste in db
                stg_player=BronzeStgPlayer(
                    puuid=puuid,
                    game_name=actual_name,
                    tag_line=actual_tag,
                    raw_account=account,
                    raw_summoner=summoner,
                    raw_ranks=ranks,
                    raw_masteries=masteries
                )
                db.add(stg_player)
            else:
                # UPDATE: se esiste già, aggiorni solo i dati modificati
                stg_player.game_name = actual_name
                stg_player.tag_line = actual_tag
                stg_player.raw_account = account
                stg_player.raw_summoner = summoner
                stg_player.raw_ranks = ranks
                stg_player.raw_masteries = masteries
                stg_player.ingested_at=datetime.utcnow()
            
            # ------------------------------------------------------------------
            # SILVER LAYER: Normalizzazione Player & Ranks
            # ------------------------------------------------------------------
            dim_player = db.query(DimPlayer).filter(DimPlayer.puuid == puuid).first()
            summoner_level=summoner.get("summonerLevel") if summoner else None                
            player_icon_id =summoner.get("profileIconId") if summoner else None

            if not dim_player:
                dim_player=DimPlayer(
                    puuid=puuid,
                    game_name=actual_name,
                    tag_line=actual_tag,
                    summoner_level=summoner_level,
                    profile_icon_id=player_icon_id
                )
                db.add(dim_player)
            else:
                dim_player.game_name=actual_name
                dim_player.tag_line=actual_tag
                dim_player.summoner_level=summoner_level
                dim_player.profile_icon_id=player_icon_id
                dim_player.updated_at=datetime.utcnow()
            
            db.add(dim_player)
            db.commit()
            print(f"[1/4] Dim player persistito: {puuid}")
            # Upsert Silver ranks
            for rank_data in ranks:
                q_type=rank_data.get("queueType")
                rank_obj=(
                    db.query(DimPlayerRank)
                    .filter(DimPlayerRank.puuid==puuid, DimPlayerRank.queue_type==q_type)
                    .first()
                )
                if not rank_obj:
                    rank_obj=DimPlayerRank(
                        puuid=puuid,
                        queue_type=q_type,
                        tier=rank_data.get("tier"),
                        rank=rank_data.get("rank"),
                        league_points=rank_data.get("leaguePoints",0),
                        wins=rank_data.get("wins",0),
                        losses=rank_data.get("losses",0)
                    )
                    db.add(rank_obj)
                else:
                    rank_obj.tier=rank_data.get("tier")
                    rank_obj.rank=rank_data.get("rank")
                    rank_obj.league_points=rank_data.get("leaguePoints",0)
                    rank_obj.wins=rank_data.get("wins",0)
                    rank_obj.losses=rank_data.get("losses",0)
                    rank_obj.updated_at=datetime.utcnow()
                    
            db.commit()
            print(f"Bronze e Silver layer aggiornati")
            # ------------------------------------------------------------------
            # MASTERIES INGESTION: 
            # ------------------------------------------------------------------ 

            for m_data in (masteries or []):
                champion_id =m_data.get("championId")
                champion_points=m_data.get("championPoints")
                champion_level=m_data.get("championLevel")
                last_play_time = datetime.fromtimestamp(m_data.get("lastPlayTime") / 1000) if m_data.get("lastPlayTime") else None
                
                mastery = (
                    db.query(DimPlayerChampionsMasteries)
                    .filter(DimPlayerChampionsMasteries.puuid == puuid, DimPlayerChampionsMasteries.champion_id == champion_id)
                    .first()
                )

                if not mastery:
                    mastery=DimPlayerChampionsMasteries(
                        puuid=puuid,
                        champion_id=champion_id,
                        champion_points=champion_points,
                        champion_level=champion_level,
                        last_play_time=last_play_time
                    )
                    db.add(mastery)
                else:
                    mastery.champion_points = champion_points
                    mastery.champion_level = champion_level
                    mastery.last_play_time = last_play_time
                    mastery.updated_at = datetime.utcnow()
                
                db.add(mastery)
            db.commit()
            print(f"Dim player, ranks e masteries persistiti")       
            # ------------------------------------------------------------------
            # MATCH INGESTION: Paginazione e caricamento
            # ------------------------------------------------------------------
            is_full_backfill =(match_count is None or  match_count<=0)
            req_label= "TUTTI (storico completo)" if is_full_backfill else str(match_count)
            print(f"[2/4] Richiesta {req_label} di partite per {actual_name}#{actual_tag}")
            match_ids = self.client.get_recent_match_ids(puuid, routing_region, count=match_count)
            print(f"      -> {len(match_ids)} match totali identificati nello storico.")

            new_bronze_count=0
            new_silver_count=0
            already_cached=0

            print(f"Elaborazione Bronze")
            total_m=len(match_ids)
            for idx, m_id in enumerate(match_ids, 1):
                match_data = None
                
                # 1. Controlla Bronze Staging nel db (cache)
                stg_match = db.query(BronzeStgMatches).filter(BronzeStgMatches.match_id == m_id).first()
                if stg_match:
                    match_data = stg_match.raw_json
                    already_cached += 1
                else:
                    match_data = self.client.get_match_details(m_id, routing_region)
                    if match_data:
                        db.add(BronzeStgMatches(match_id=m_id, raw_json=match_data))
                        new_bronze_count += 1

                if not match_data:
                    continue

                # 2.Controllo del Silver layer
                try:
                    with db.begin_nested():
                        existing_silver_match = db.query(DimMatch).filter(DimMatch.match_id == m_id).first()
                        if not existing_silver_match:
                            if self._transform_and_load_silver(db, m_id, match_data):
                                new_silver_count += 1
                        else:
                            # Match presente
                            self._link_player_to_match(db, m_id, match_data, puuid)
                except Exception as e:
                    print(f"      [Errore] Match {m_id} saltato: {e}")
                
                # Commit a blocchi di 20 partite per performance
                if idx % 20 == 0 or idx == total_m:
                    db.commit()
                    print(f" Progresso:{idx} / {total_m}")
            
            db.commit() # Commit finale di questo chunk
            print(f"      -> {new_bronze_count} nuovi file Bronze.")
            print(f"      -> {already_cached} match già in cache (Bronze/Silver).")
            print(f"      -> {new_silver_count} partite trasformate in Silver.")

            return {
                "player": f"{actual_name}#{actual_tag}",
                "puuid": puuid,
                "matches_processed": new_silver_count,
                "total_requested": match_count,
                "total_available": len(match_ids)
            }
        finally:
            db.close()

    def _link_player_to_match(self, db: Session, match_id: str, data: Dict[str, Any], puuid: str):
        """Imposta il puuid sulla riga partecipante se era rimasta scollegata."""
        for p in data.get("info", {}).get("participants", []):
            if p.get("puuid") == puuid:
                db.query(FactMatchParticipant).filter(
                    FactMatchParticipant.match_id == match_id,
                    FactMatchParticipant.participant_id == p.get("participantId"),
                    FactMatchParticipant.puuid.is_(None),
                ).update({FactMatchParticipant.puuid: puuid}, synchronize_session=False)
                break

    def _transform_and_load_silver(self, db: Session, match_id: str, data: Dict[str, Any]) -> bool:
        """Trasforma il JSON grezzo di Bronze nelle tabelle normalizzate di Silver."""
        info = data.get("info", {})
        participants = info.get("participants", [])

        # Salta match senza partecipanti o abortiti prima dell'inizio
        if not participants or info.get("endOfGameResult") == "Abort_Unexpected":
            print(f"      [Skip] Match {match_id} senza partecipanti o abortito ({info.get('endOfGameResult', 'No participants')})")
            return False

        game_creation_ts = (
            info.get("gameCreation")
            or info.get("gameStartTimestamp")
            or info.get("gameEndTimestamp")
        )
        if game_creation_ts and game_creation_ts > 0:
            game_creation = datetime.fromtimestamp(game_creation_ts / 1000.0)
        else:
            game_creation = datetime.utcnow()

        dim_match = DimMatch(
            match_id=match_id,
            game_creation=game_creation,
            game_duration_seconds=info.get("gameDuration", 0),
            game_mode=info.get("gameMode") or "UNKNOWN",
            game_version=info.get("gameVersion") or "UNKNOWN",
            queue_id=info.get("queueId") or 0,
        )
        db.add(dim_match)
        db.flush()

        for p in info.get("participants", []):
            p_puuid = p.get("puuid")

            # Collega alla dimensione giocatore se registrato
            player_exists = db.query(DimPlayer.puuid).filter(DimPlayer.puuid == p_puuid).first()
            valid_puuid = p_puuid if player_exists else None

            participant = FactMatchParticipant(
                match_id=match_id,
                puuid=valid_puuid,
                riot_id_game_name=p.get("riotIdGameName") or p.get("summonerName"),
                riot_id_tagline=p.get("riotIdTagline"),
                participant_id=p.get("participantId"),
                champion_id=p.get("championId", 0),
                champion_name=p.get("championName", "Unknown"),
                team_id=p.get("teamId", 100),
                team_position=p.get("teamPosition") or p.get("individualPosition"),
                win=bool(p.get("win")),
                kills=p.get("kills", 0),
                deaths=p.get("deaths", 0),
                assists=p.get("assists", 0),
                total_damage_dealt_to_champions=p.get("totalDamageDealtToChampions", 0),
                gold_earned=p.get("goldEarned", 0),
                total_minions_killed=p.get("totalMinionsKilled", 0),
                neutral_minions_killed=p.get("neutralMinionsKilled", 0),
                vision_score=p.get("visionScore", 0),
                item_0=p.get("item0", 0),
                item_1=p.get("item1", 0),
                item_2=p.get("item2", 0),
                item_3=p.get("item3", 0),
                item_4=p.get("item4", 0),
                item_5=p.get("item5", 0),
                item_6=p.get("item6", 0),
            )
            db.add(participant)
        return True
                        