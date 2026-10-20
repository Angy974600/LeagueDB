from sqlalchemy import ColumnOperators
from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    BigInteger,
    UniqueConstraint,
    text
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from src.database import Base


# ==========================================
# BRONZE LAYER (Raw Staging)
# ==========================================

class BronzeStgPlayer(Base):
    """Ingestion raw dei dati del giocatore direttamente dalla API, prima normalizzazione"""
    __tablename__="stg_players"
    __table_args__={"schema":"bronze"}

    puuid= Column(String(100), primary_key=True)
    game_name = Column(String(50), nullable=False)
    tag_line= Column(String(20), nullable=False)
    raw_account=Column (JSONB,nullable=False)
    raw_summoner= Column(JSONB, nullable=False)
    raw_masteries= Column(JSONB, nullable=False)
    raw_ranks=Column(JSONB,nullable=False)
    ingested_at=Column(DateTime,default=datetime.utcnow,nullable=False)

    def __repr__(self):
        return f"<BronzeStgPlayer(puuid='{self.puuid}', game_name='{self.game_name}', tag_line='{self.tag_line}')>"

class BronzeStgMatches(Base):
    __tablename__="stg_matches"
    __table_args__={"schema":"bronze"}

    match_id=Column(String(50),primary_key=True)
    raw_json=Column(JSONB,nullable=False)
    ingested_at=Column(DateTime,default=datetime.utcnow,nullable=False)

    def __repr__(self):
        return f"<BronzeStgMatch(match_id='{self.match_id}')>"

# ==========================================
# SILVER LAYER (Dati puliti e normalizzati)
# ==========================================

class DimPlayer(Base):
    __tablename__="dim_player"
    __table_args__=(
        UniqueConstraint("game_name","tag_line",name="uc_player_name_tag"),
        {"schema":"silver"}
    )
    puuid=Column(String(100),primary_key=True,index=True)
    game_name=Column(String(50),nullable=False,index=True)
    tag_line=Column(String(20),nullable=False,index=True)
    summoner_level= Column(Integer,nullable=True)
    profile_icon_id=Column(Integer,nullable=True)
    updated_at=Column(DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
    masteries=relationship("DimPlayerChampionsMasteries",back_populates="player",cascade="all,delete-orphan")
    ranks=relationship("DimPlayerRank",back_populates="player",cascade="all,delete-orphan")
    participations =relationship("FactMatchParticipant",back_populates="player")
    def __repr__(self):
        return f"<DimPlayer(puuid='{self.puuid}', game_name='{self.game_name}', tag_line='{self.tag_line}')>"

class DimPlayerRank(Base):
    __tablename__="dim_player_rank"
    __table_args__=({"schema":"silver"})
    
    puuid= Column (String(100), ForeignKey("silver.dim_player.puuid",ondelete="CASCADE"),primary_key=True)
    queue_type=Column(String(20),primary_key=True)
    tier=Column(String(20),nullable=True)
    rank=Column(String(20),nullable=True)
    league_points=Column(Integer,default=0)
    wins=Column(Integer,default=0)
    losses=Column(Integer,default=0)
    updated_at=Column(DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)

    player=relationship("DimPlayer",back_populates="ranks")

    def __repr__(self):
        return f"<DimPlayerRank(puuid='{self.puuid}', queue_type='{self.queue_type}', tier='{self.tier}', rank='{self.rank}')>"

class DimMatch(Base):
    __tablename__="dim_match"
    __table_args__={"schema":"silver"}
    
    match_id=Column(String(50),primary_key=True, index=True)
    game_creation= Column(DateTime,nullable=False)
    game_duration_seconds= Column(Integer, nullable=False)
    game_mode=Column(String(50),nullable=False)
    game_version = Column(String(50),nullable=False)
    queue_id= Column(Integer, nullable=False)
    participants=relationship("FactMatchParticipant",back_populates="match",cascade="all, delete-orphan")
    def __repr__(self):
        return f"<DimMatch(match_id='{self.match_id}', game_mode='{self.game_mode}', game_version='{self.game_version}', queue_id={self.queue_id})>"
class FactMatchParticipant(Base):
    __tablename__="fact_match_participant"
    __table_args__={"schema":"silver"}

    id=Column(Integer,primary_key=True,autoincrement=True)
    match_id=Column(String(50),ForeignKey("silver.dim_match.match_id",ondelete="CASCADE"),index=True,nullable=False)
    puuid= Column(String(100),ForeignKey("silver.dim_player.puuid",ondelete="SET NULL"),index=True,nullable=True)

    riot_id_game_name=Column(String(50),nullable=True)
    riot_id_tagline=Column(String(20),nullable=True)
    participant_id = Column(Integer, nullable=True)

    champion_id = Column(Integer, nullable=False)
    champion_name = Column(String(50), nullable=False, index=True)
    team_id = Column(Integer, nullable=False)
    team_position = Column(String(20), nullable=True)

    win = Column(Boolean, nullable=False)
    kills = Column(Integer, default=0)
    deaths = Column(Integer, default=0)
    assists = Column(Integer, default=0)
    total_damage_dealt_to_champions = Column(Integer, default=0)
    gold_earned = Column(Integer, default=0)
    total_minions_killed = Column(Integer, default=0)
    neutral_minions_killed = Column(Integer, default=0)
    vision_score = Column(Integer, default=0)

    item_0 = Column(Integer, default=0)
    item_1 = Column(Integer, default=0)
    item_2 = Column(Integer, default=0)
    item_3 = Column(Integer, default=0)
    item_4 = Column(Integer, default=0)
    item_5 = Column(Integer, default=0)
    item_6 = Column(Integer, default=0)
    
    match=relationship("DimMatch",back_populates="participants")
    player=relationship("DimPlayer",back_populates="participations")
    def __repr__(self):
        return f"<FactMatchParticipant(match_id='{self.match_id}', participant_id={self.participant_id})>"
class DimChampion(Base):
    __tablename__ = "dim_champion"
    __table_args__ = {"schema": "silver"}
    
    champion_id = Column(Integer, primary_key=True)
    champion_name = Column(String(50), nullable=False)
    title = Column(String(100), nullable=True)
class DimPlayerChampionsMasteries(Base):
    __tablename__="dim_player_champions_masteries"
    __table_args__={"schema":"silver"}
    puuid=Column(String(100),ForeignKey("silver.dim_player.puuid",ondelete="CASCADE"),primary_key=True)
    champion_id=Column(Integer,primary_key=True)
    champion_points = Column(Integer, nullable=False)
    champion_level = Column(Integer, nullable=False)
    last_play_time = Column(DateTime, nullable=True)
    updated_at=Column(DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
    player=relationship("DimPlayer",back_populates="masteries")
    def __repr__(self):
        return f"<DimPlayerChampionsMasteries(puuid='{self.puuid}', champion_id={self.champion_id}, champion_points={self.championPoints}, champion_level={self.championLevel})>"

# ==========================================
# GOLD LAYER (Data Marts & Views)
# ==========================================

def create_gold_views(engine):
    """Crea le viste analitiche Gold sopra la Silver"""
    views_sql = """
    DROP VIEW IF EXISTS gold.mart_player_champion_stats CASCADE;
    DROP VIEW IF EXISTS gold.mart_player_overview CASCADE;
    DROP VIEW IF EXISTS gold.mart_role_performance CASCADE;

    -- 1. Gold Mart: Statistiche dettagliate per campione
    CREATE OR REPLACE VIEW gold.mart_player_champion_stats AS
    SELECT
        p.puuid,
        p.game_name,
        p.tag_line,
        f.champion_name,
        COUNT(f.id) AS total_matches,
        SUM(CASE WHEN f.win THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN NOT f.win THEN 1 ELSE 0 END) AS losses,
        ROUND(AVG(CASE WHEN f.win THEN 100.0 ELSE 0.0 END), 1) AS winrate_pct,
        ROUND(AVG(f.kills), 1) AS avg_kills,
        ROUND(AVG(f.deaths), 1) AS avg_deaths,
        ROUND(AVG(f.assists), 1) AS avg_assists,
        ROUND(
            (SUM(f.kills) + SUM(f.assists))::numeric / NULLIF(SUM(f.deaths), 0), 2
        ) AS kda_ratio,
        ROUND(
            (SUM(f.kills) + SUM(f.assists))::numeric / NULLIF(SUM(f.deaths), 0), 2
        ) AS avg_kda,
        ROUND(AVG(f.total_damage_dealt_to_champions)) AS avg_damage,
        ROUND(AVG(f.gold_earned)) AS avg_gold,
        ROUND(AVG(f.total_minions_killed + f.neutral_minions_killed), 1) AS avg_cs
    FROM silver.dim_player p
    JOIN silver.fact_match_participant f ON p.puuid = f.puuid
    GROUP BY p.puuid, p.game_name, p.tag_line, f.champion_name;
    
    -- 2. Gold Mart: Panoramica giocatore (Overview)
    CREATE OR REPLACE VIEW gold.mart_player_overview AS
    SELECT 
        p.puuid,
        p.game_name,
        p.tag_line,
        p.summoner_level,
        COUNT(f.id) AS total_indexed_matches,
        SUM(CASE WHEN f.win THEN 1 ELSE 0 END) AS total_wins,
        SUM(CASE WHEN NOT f.win THEN 1 ELSE 0 END) AS total_losses,
        ROUND(AVG(CASE WHEN f.win THEN 100.0 ELSE 0.0 END), 1) AS overall_winrate_pct,
        ROUND(
            (SUM(f.kills) + SUM(f.assists))::numeric / 
            NULLIF(SUM(f.deaths), 0), 2
        ) AS overall_kda_ratio,
        ROUND(AVG(f.total_damage_dealt_to_champions)) AS avg_damage_per_game,
        MAX(m.game_creation) AS latest_match_played
    FROM silver.dim_player p
    LEFT JOIN silver.fact_match_participant f ON p.puuid = f.puuid
    LEFT JOIN silver.dim_match m ON f.match_id = m.match_id
    GROUP BY p.puuid, p.game_name, p.tag_line, p.summoner_level;
    
    -- 3. Gold Mart: Performance per Ruolo (Role Distribution)
    CREATE OR REPLACE VIEW gold.mart_role_performance AS
    SELECT 
        p.puuid,
        p.game_name,
        p.tag_line,
        COALESCE(NULLIF(f.team_position, ''), 'UNKNOWN') AS role,
        COUNT(f.id) AS matches_count,
        SUM(CASE WHEN f.win THEN 1 ELSE 0 END) AS wins,
        ROUND(AVG(CASE WHEN f.win THEN 100.0 ELSE 0.0 END), 1) AS winrate_pct,
        ROUND(AVG(f.kills), 1) AS avg_kills,
        ROUND(AVG(f.deaths), 1) AS avg_deaths,
        ROUND(AVG(f.assists), 1) AS avg_assists
    FROM silver.dim_player p
    JOIN silver.fact_match_participant f ON p.puuid = f.puuid
    GROUP BY p.puuid, p.game_name, p.tag_line, f.team_position;
    """
    with engine.connect() as conn:
        conn.execute(text(views_sql))
        conn.commit()

    