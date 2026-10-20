"""FastAPI backend"""
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import text
from src.database import engine, init_db

WEB_DIR=Path(__file__).resolve().parent.parent /"web"

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield

app=FastAPI(title="LeagueDB API",version="1.0.0", lifespan=lifespan)

def fetch_all(sql:str,params:Optional[Dict[str,Any]] = None) -> List[Dict[str,Any]]:
    with engine.connect() as conn:
        return [dict(r) for r in conn.execute(text(sql),params or {}).mappings().all()]

def fetch_one(sql:str,params:Optional[Dict[str,Any]] = None) -> Optional[Dict[str,Any]]:
    rows=fetch_all(sql,params)
    return rows[0] if rows else None

# ==========================================
# Statistiche della pipeline
# ==========================================

@app.get("/api/stats")
def pipeline_stats():
    return fetch_one("""
        SELECT
            (SELECT COUNT(*) FROM bronze.stg_matches)              AS bronze_matches,
            (SELECT COUNT(*) FROM bronze.stg_players)              AS bronze_players,
            (SELECT COUNT(*) FROM silver.dim_player)               AS players,
            (SELECT COUNT(*) FROM silver.dim_match)                AS matches,
            (SELECT COUNT(*) FROM silver.fact_match_participant)   AS participants,
            (SELECT COUNT(*) FROM information_schema.views
              WHERE table_schema = 'gold')                         AS gold_marts
    """)


# ==========================================
# Giocatori
# ==========================================

@app.get("/api/players")
def list_players():
    return fetch_all("""
        SELECT
            o.puuid, o.game_name, o.tag_line, o.summoner_level,
            o.total_indexed_matches, o.total_wins, o.total_losses,
            o.overall_winrate_pct, o.overall_kda_ratio, o.latest_match_played,
            p.profile_icon_id,
            r.tier AS solo_tier, r.rank AS solo_rank, r.league_points AS solo_lp
        FROM gold.mart_player_overview o
        JOIN silver.dim_player p ON p.puuid = o.puuid
        LEFT JOIN silver.dim_player_rank r
               ON r.puuid = o.puuid AND r.queue_type = 'RANKED_SOLO_5x5'
        ORDER BY o.total_indexed_matches DESC, o.game_name
    """)

@app.get("/api/players/{puuid}")
def player_profile(puuid:str):
    params= {"puuid": puuid}
    overview = fetch_one("""
        SELECT o.*, p.profile_icon_id, p.updated_at
        FROM gold.mart_player_overview o
        JOIN silver.dim_player p ON p.puuid = o.puuid
        WHERE o.puuid = :puuid
    """, params)
    if not overview:
        raise HTTPException(status_code=404, detail="Giocatore non trovato nel database.")
    averages = fetch_one("""
        SELECT
            ROUND(AVG(kills), 1)   AS avg_kills,
            ROUND(AVG(deaths), 1)  AS avg_deaths,
            ROUND(AVG(assists), 1) AS avg_assists,
            ROUND(AVG(total_minions_killed + neutral_minions_killed), 1) AS avg_cs,
            ROUND(AVG(vision_score), 1) AS avg_vision,
            ROUND(AVG(gold_earned)) AS avg_gold
        FROM silver.fact_match_participant
        WHERE puuid = :puuid
    """, params) or {}
    overview.update(averages)

    return {
        "overview": overview,
        "ranks": fetch_all("""
            SELECT queue_type, tier, rank, league_points, wins, losses
            FROM silver.dim_player_rank
            WHERE puuid = :puuid
            ORDER BY queue_type DESC
        """, params),
        "roles": fetch_all("""
            SELECT role, matches_count, wins, winrate_pct, avg_kills, avg_deaths, avg_assists
            FROM gold.mart_role_performance
            WHERE puuid = :puuid
            ORDER BY matches_count DESC
        """, params),
        "champions": fetch_all("""
            SELECT champion_name, total_matches, wins, losses, winrate_pct,
                   avg_kills, avg_deaths, avg_assists, kda_ratio, avg_damage, avg_gold, avg_cs
            FROM gold.mart_player_champion_stats
            WHERE puuid = :puuid
            ORDER BY total_matches DESC, winrate_pct DESC
        """, params),
        "recent_form": fetch_all("""
            SELECT f.match_id, f.win, f.champion_name
            FROM silver.fact_match_participant f
            JOIN silver.dim_match m ON m.match_id = f.match_id
            WHERE f.puuid = :puuid
            ORDER BY m.game_creation DESC
            LIMIT 20
        """, params),
        "queues": fetch_all("""
            SELECT m.queue_id, MAX(m.game_mode) AS game_mode, COUNT(*) AS matches
            FROM silver.fact_match_participant f
            JOIN silver.dim_match m ON m.match_id = f.match_id
            WHERE f.puuid = :puuid
            GROUP BY m.queue_id
            ORDER BY matches DESC
        """, params),
    }
    
SORT_CLAUSES = {
    "date_desc": "m.game_creation DESC NULLS LAST",
    "date_asc": "m.game_creation ASC NULLS LAST",
    "kda_desc": "(CAST(f.kills + f.assists AS FLOAT) / GREATEST(f.deaths, 1)) DESC, m.game_creation DESC",
    "kills_desc": "f.kills DESC, m.game_creation DESC",
    "deaths_desc": "f.deaths DESC, m.game_creation DESC",
    "deaths_asc": "f.deaths ASC, m.game_creation DESC",
    "damage_desc": "f.total_damage_dealt_to_champions DESC, m.game_creation DESC",
    "cs_desc": "(f.total_minions_killed + f.neutral_minions_killed) DESC, m.game_creation DESC",
    "duration_desc": "m.game_duration_seconds DESC, m.game_creation DESC",
}
@app.get("/api/players/{puuid}/matches")
def player_matches(
    puuid: str,
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    queue: Optional[int] = None,
    sort_by: str = Query("date_desc"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    limit_val = int(limit.default if hasattr(limit, "default") else limit)
    offset_val = int(offset.default if hasattr(offset, "default") else offset)
    sort_val = str(sort_by.default if hasattr(sort_by, "default") else sort_by)

    params: Dict[str, Any] = {"puuid": puuid, "limit": limit_val, "offset": offset_val}
    filters = ["f.puuid = :puuid"]

    if queue is not None:
        filters.append("m.queue_id = :queue")
        params["queue"] = queue

    if date_from and date_from.strip():
        filters.append("m.game_creation >= :date_from")
        params["date_from"] = f"{date_from.strip()} 00:00:00"

    if date_to and date_to.strip():
        filters.append("m.game_creation <= :date_to")
        params["date_to"] = f"{date_to.strip()} 23:59:59.999999"

    where_clause = " AND ".join(filters)
    order_clause = SORT_CLAUSES.get(sort_val, SORT_CLAUSES["date_desc"])

    total = fetch_one(f"""
        SELECT COUNT(*) AS n
        FROM silver.fact_match_participant f
        JOIN silver.dim_match m ON m.match_id = f.match_id
        WHERE {where_clause}
    """, params)["n"]

    matches = fetch_all(f"""
        SELECT
            f.match_id, m.game_creation, m.game_duration_seconds, m.game_mode,
            m.queue_id, m.game_version,
            f.champion_name, f.champion_id, f.team_id, f.team_position, f.win,
            f.kills, f.deaths, f.assists,
            f.total_damage_dealt_to_champions, f.gold_earned, f.vision_score,
            f.total_minions_killed + f.neutral_minions_killed AS cs,
            f.item_0, f.item_1, f.item_2, f.item_3, f.item_4, f.item_5, f.item_6,
            (SELECT SUM(t.kills) FROM silver.fact_match_participant t
              WHERE t.match_id = f.match_id AND t.team_id = f.team_id) AS team_kills
        FROM silver.fact_match_participant f
        JOIN silver.dim_match m ON m.match_id = f.match_id
        WHERE {where_clause}
        ORDER BY {order_clause}
        LIMIT :limit OFFSET :offset
    """, params)

    return {"total": total, "matches": matches}


# ==========================================
# Dettaglio partita
# ==========================================

@app.get("/api/matches/{match_id}")
def match_detail(match_id: str):
    match = fetch_one("""
        SELECT match_id, game_creation, game_duration_seconds, game_mode, queue_id, game_version
        FROM silver.dim_match
        WHERE match_id = :match_id
    """, {"match_id": match_id})
    if not match:
        raise HTTPException(status_code=404, detail="Partita non trovata.")

    match["participants"] = fetch_all("""
        SELECT
            f.puuid, f.riot_id_game_name, f.riot_id_tagline, f.participant_id,
            f.champion_name, f.team_id, f.team_position, f.win,
            f.kills, f.deaths, f.assists,
            f.total_damage_dealt_to_champions, f.gold_earned, f.vision_score,
            f.total_minions_killed + f.neutral_minions_killed AS cs,
            f.item_0, f.item_1, f.item_2, f.item_3, f.item_4, f.item_5, f.item_6,
            SUM(f.kills) OVER (PARTITION BY f.team_id) AS team_kills
        FROM silver.fact_match_participant f
        WHERE f.match_id = :match_id
        ORDER BY f.team_id, f.participant_id
    """, {"match_id": match_id})
    return match


# ==========================================
# Sincronizzazione (trigger della pipeline ETL)
# ==========================================

class SyncRequest(BaseModel):
    game_name: str = Field(..., min_length=1, max_length=50)
    tag_line: str = Field(..., min_length=1, max_length=20)
    count: int = Field(20, ge=-1, le=5000)


@app.post("/api/sync")
def sync_player(req: SyncRequest):
    """Funzione sincrona: FastAPI la esegue in un threadpool, senza bloccare il server."""
    from src.pipeline import ETLPipeline

    try:
        # 0 o -1 indica full backfill (tutte le partite disponibili su Riot)
        target_count = 0 if req.count <= 0 else req.count
        return ETLPipeline().sync_player_profile(
            game_name=req.game_name,
            tag_line=req.tag_line,
            match_count=target_count,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Errore durante la sincronizzazione: {e}")


# ==========================================
# Frontend statico
# ==========================================

app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(WEB_DIR / "index.html")
