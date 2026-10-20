import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base,sessionmaker
import requests

load_dotenv()

POSTGRES_USER=os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD=os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB=os.getenv("POSTGRES_DB")
POSTGRES_HOST=os.getenv("POSTGRES_HOST")
POSTGRES_PORT=os.getenv("POSTGRES_PORT")

DATABASE_URL=f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

engine=create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

SessionLocal=sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base= declarative_base()

def get_db():
    """Apre una nuova connessione e la presta a chi lo ha chiamato e quando ha finito la chiude"""
    db=SessionLocal()
    try:
        yield db
    finally:
        db.close()
def sync_champions(engine):
    with engine.connect() as conn:
        has_champs = conn.execute(text("SELECT 1 FROM silver.dim_champion LIMIT 1")).fetchone()
        if has_champs:
            return
        
        # Prende l'ultima patch
        versions = requests.get("https://ddragon.leagueoflegends.com/api/versions.json").json()
        latest = versions[0]
        data = requests.get(f"https://ddragon.leagueoflegends.com/cdn/{latest}/data/en_US/champion.json").json()
        
        for champ_key, champ_data in data["data"].items():
            conn.execute(
                text("""
                    INSERT INTO silver.dim_champion (champion_id, champion_name, title)
                    VALUES (:id, :name, :title)
                    ON CONFLICT (champion_id) DO NOTHING
                """),
                {
                    "id": int(champ_data["key"]),
                    "name": champ_data["id"], # es. "Aatrox"
                    "title": champ_data["title"]
                }
            )
        conn.commit()

def init_db():
    """Crea gli schemi Bronze, Silver, Golde e tutte le tabelle/viste"""
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS bronze"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS silver"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS gold"))
        conn.execute(text("ALTER TABLE bronze.stg_players ADD COLUMN IF NOT EXISTS raw_masteries JSONB;"))
        conn.commit()

    import src.models
    Base.metadata.create_all(bind=engine)
    sync_champions(engine)
    src.models.create_gold_views(engine)