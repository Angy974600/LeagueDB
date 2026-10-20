import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base,sessionmaker


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

def init_db():
    """Crea gli schemi Bronze, Silver, Golde e tutte le tabelle/viste"""
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS bronze"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS silver"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS gold"))
        conn.commit()

    import src.models
    Base.metadata.create_all(bind=engine)
    src.models.create_gold_views(engine)