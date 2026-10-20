# ⚔️ LeagueDB

> **Data Warehouse, ETL Pipeline & Analytics Dashboard for League of Legends.**  
> Built with Riot Games API, PostgreSQL Medallion Architecture, FastAPI, and a modern vanilla web dashboard.

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Medallion Architecture](#-medallion-architecture)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites & Setup](#-prerequisites--setup)
- [Quick Start](#-quick-start)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [Legal Notice](#️-legal-notice)

---

## 🎯 Overview

**LeagueDB** is an end-to-end analytics platform designed to collect, model, store, and visualize League of Legends player performance data.

The project combines:
1. **Idempotent ETL Pipeline**: Extracts raw data from the official Riot Games APIs (Account, Summoner, League Entries, Champion Masteries, and Match History), handling rate limiting (`HTTP 429 Retry-After`) and automatic exponential retries.
2. **PostgreSQL Medallion Data Warehouse**: Structures data into **Bronze** (raw staging JSONB), **Silver** (normalized star schema with dimensions and facts), and **Gold** (pre-aggregated analytics data marts).
3. **High-Performance FastAPI Backend**: Exposes RESTful endpoints with pagination, multi-field sorting, date filters, and stats aggregation.
4. **Reactive Single Page Application (SPA)**: Modern, dependency-free frontend featuring dark/light modes, glassmorphism, instant player search, comprehensive match scoreboards, and an interactive **Hall of Masteries**.

---

## 🏗️ Medallion Architecture

The relational PostgreSQL database implements the **Medallion Architecture**, a data engineering best practice for reliable analytics:

```
               [ Riot Games API ]
                       │
                       ▼  (Raw JSON extraction)
┌────────────────────────────────────────────────────────┐
│  BRONZE LAYER (Schema: bronze)                         │
│  - stg_players: raw account, summoner, rank & masteries│
│  - stg_matches: raw JSONB payload for every match      │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼  (Parsing, Cleansing & Star Schema)
┌────────────────────────────────────────────────────────┐
│  SILVER LAYER (Schema: silver)                         │
│  - dim_player: player identity & summoner levels       │
│  - dim_player_rank: tier, division & LP per queue      │
│  - dim_champion: synchronized DataDragon metadata      │
│  - dim_player_champions_masteries: mastery pts & lvls  │
│  - dim_match: match metadata (duration, patch, queue)  │
│  - fact_match_participant: granular participant facts  │
│    (KDA, CS, gold, champion damage, items, role, win) │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼  (Analytical Views & Aggregations)
┌────────────────────────────────────────────────────────┐
│  GOLD LAYER (Schema: gold)                             │
│  - mart_player_overview: global player metrics         │
│  - mart_player_champion_stats: per-champion performance│
│  - mart_role_performance: lane & role breakdown        │
└────────────────────────────────────────────────────────┘
```

- **Bronze (Staging)**: Raw, unedited `JSONB` responses from Riot endpoints, ensuring data provenance, audibility, and zero information loss.
- **Silver (Cleaned & Normalized)**: Relational star schema with foreign keys, constraints, and cascading rules for data integrity.
- **Gold (Marts)**: SQL views pre-aggregating core KPIs (win rates, KDAs, averages) for instantaneous response times on analytical queries.

---

## ✨ Key Features

### 🔄 Dynamic ETL Ingestion
- Real-time on-demand indexing for any player by Riot ID (`GameName#TagLine`, e.g. `Anfrost#EUW`).
- Automatic rate-limit throttling according to Riot's dynamic `Retry-After` headers.
- Automatic champion dictionary sync against the latest **Riot DataDragon** release.

### 📊 Player Profile Dashboard
- **Rank & Overview**: Solo/Duo and Flex ranks, LP, global winrate, total games, and average KDA.
- **Role Distribution**: Winrate and game volume across Top, Jungle, Mid, ADC, and Support positions.
- **Top Champions**: In-depth champion metrics (winrate, KDA, CS/min, gold earned, average damage).
- **Match History**: Paginated match history with customizable sorting (date, KDA, damage, CS, kills, deaths) and queue/date filtering.
- **Detailed Scoreboard**: 10-player breakdown with item builds, damage share, gold, and vision score.

### 🏆 Hall of Masteries
- **Hero Main Showcase**: Dynamic banner with high-res splash art of the player's primary champion.
- **Interactive 3D Podium**: Top 3 most mastered champions with level badges and festive click animations.
- **One-Trick Meter & Charts**: Visual meter gauging main champion dependency, level distribution bar charts, and an interactive class breakdown donut chart.
- **Dynamic Trivia Carousel**: Contextual stats and fun facts generated from the player's unique roster numbers.
- **3D Tilt Champion Cards**: Collection grid displaying over 160 champions with responsive 3D mouse perspective tilt, glow rings, and progress indicators.
- **"What to play tonight?" Roulette**: Animated wheel selecting a random champion from the player's pool.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.10+, FastAPI, Uvicorn (ASGI)
- **Database & Data Warehouse**: PostgreSQL 16 Alpine
- **ORM & DB Tools**: SQLAlchemy 2.0, psycopg2-binary
- **Containerization**: Docker & Docker Compose (PostgreSQL + pgAdmin 4)
- **Frontend**: Vanilla JavaScript (ES Modules), Vanilla CSS3 (Custom Properties, Flexbox, Grid, 3D Transforms, native Dark/Light mode)
- **External Assets**: Riot Games DataDragon CDN (champion splashes, icons, item textures)

---

## ⚙️ Prerequisites & Setup

1. **Docker & Docker Compose** installed and running.
2. **Python 3.10+** installed.
3. A valid Riot Games API Key (obtainable at [Riot Developer Portal](https://developer.riotgames.com/)).

### 1. Clone the repository

```bash
git clone https://github.com/Angy974600/LeagueDB.git
cd LeagueDB
```

### 2. Configure Environment Variables

Create your `.env` file based on [.env_example](file:///.env_example):

```env
RIOT_API_KEY=RGAPI-your-api-key-here
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=lol_inspector_db
POSTGRES_HOST=localhost
POSTGRES_PORT=5433

PGADMIN_PORT=5050
PGADMIN_DEFAULT_EMAIL=admin@leaguedb.com
PGADMIN_DEFAULT_PASSWORD=admin
```

---

## 🚀 Quick Start

### 1. Start the PostgreSQL Container

```bash
docker compose up -d
```

PostgreSQL will be available on port `5433` (to avoid conflicts with local port `5432`), and **pgAdmin 4** will be available at `http://localhost:5050`.

### 2. Setup the Python Virtual Environment

```bash
# Create and activate virtual environment
python -m venv .venv

# On Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# On Linux / macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Launch the Web Application

```bash
uvicorn src.api:app --reload --port 8000
```

Upon startup, the server automatically:
1. Provisions `bronze`, `silver`, and `gold` schemas.
2. Generates all tables and analytical views.
3. Populates `silver.dim_champion` with the latest patch metadata via DataDragon.

Access the dashboard at:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 📡 API Documentation

Interactive OpenAPI / Swagger documentation is automatically generated by FastAPI and available at:
👉 **`http://localhost:8000/docs`**

### Key Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/stats` | Pipeline ingestion metrics (bronze, silver, gold record counts) |
| `GET` | `/api/players` | Index of indexed players with rankings and overview stats |
| `GET` | `/api/players/{puuid}` | Full player profile, overview KPIs, role and champion stats |
| `GET` | `/api/players/{puuid}/matches` | Paginated match history with queue, date, and sorting filters |
| `GET` | `/api/players/{puuid}/mastery` | Complete Hall of Masteries dataset with aggregated match history |
| `GET` | `/api/matches/{match_id}` | Detailed 10-player match scoreboard with items and metrics |
| `POST` | `/api/sync` | Trigger ETL synchronization (`game_name`, `tag_line`, `count`) |

---

## 📂 Project Structure

```text
LeagueDB/
├── docker-compose.yml       # PostgreSQL 16 & pgAdmin 4 services
├── requirements.txt         # Python dependencies
├── .env_example             # Environment variable template
├── .gitignore               # Ignored files (secrets, venv, temporary DBs)
├── README.md                # Project documentation
├── src/
│   ├── __init__.py
│   ├── database.py          # SQLAlchemy connection, engine & schema init
│   ├── models.py            # ORM models (Bronze, Silver) & Gold views
│   ├── riot_client.py       # Riot API client with rate limiting & retry handling
│   ├── pipeline.py          # ETL orchestrator (Bronze -> Silver -> Gold)
│   └── api.py               # FastAPI backend & REST endpoints
└── web/                     # Frontend Single Page Application
    ├── index.html           # SPA entry point
    ├── css/
    │   ├── style.css        # Core design system tokens, typography & layout
    │   └── mastery.css      # Hall of Masteries styles & animations
    └── js/
        ├── app.js           # SPA router, Home & Profile views
        └── mastery.js       # Hall of Masteries interactive view & 3D tilt
```

---

## ⚖️ Legal Notice

LeagueDB isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc. League of Legends © Riot Games, Inc.
