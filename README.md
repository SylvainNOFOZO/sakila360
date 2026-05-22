# Sakila 360 — Data Warehouse & Dashboard

> Analyse de la performance des locations · Star Schema · ETL Python · React + Chart.js

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Docker Compose                                                  │
│                                                                  │
│  ┌──────────────┐   ETL Python   ┌──────────────────────────┐  │
│  │  db_source   │ ─────────────► │        db_dwh            │  │
│  │  MySQL 8.0   │                │  sakila_dwh (Star Schema) │  │
│  │  sakila      │                │                          │  │
│  └──────────────┘                │  fact_rental             │  │
│                                  │  dim_film                │  │
│                                  │  dim_customer (SCD T2)   │  │
│                                  │  dim_date                │  │
│                                  │  dim_store               │  │
│                                  └──────────┬───────────────┘  │
│                                             │ SQL OLAP          │
│                                  ┌──────────▼───────────────┐  │
│                                  │   api (Express.js :4000) │  │
│                                  └──────────┬───────────────┘  │
│                                             │ REST/JSON         │
│                                  ┌──────────▼───────────────┐  │
│                                  │  dashboard (React :3000) │  │
│                                  │  Nginx + Chart.js        │  │
│                                  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Démarrage rapide

```bash
# 1. Cloner / décompresser le projet
cd sakila360

# 2. Rendre le script exécutable
chmod +x start.sh

# 3. Lancer tout le projet
./start.sh
```

Le script :
- Télécharge automatiquement la base Sakila (MySQL officiel)
- Démarre les containers MySQL source + DWH
- Lance le pipeline ETL Python
- Démarre l'API Express et le dashboard React

### URLs
| Service     | URL                       |
|-------------|---------------------------|
| Dashboard   | http://localhost:3000     |
| API REST    | http://localhost:4000     |
| DWH MySQL   | localhost:3307            |
| Source MySQL| localhost:3306            |

---

## Structure du projet

```
sakila360/
├── docker-compose.yml          # Orchestration complète
├── start.sh                    # Script de démarrage
├── init/
│   ├── sakila-schema.sql       # Schéma Sakila (auto-téléchargé)
│   └── sakila-data.sql         # Données Sakila (auto-téléchargé)
├── dwh/
│   └── schema.sql              # Star Schema + vues OLAP
├── etl/
│   ├── etl.py                  # Pipeline ETL Python
│   ├── requirements.txt
│   └── Dockerfile
├── api/
│   ├── index.js                # API Express.js (6 endpoints)
│   ├── package.json
│   └── Dockerfile
└── dashboard/
    ├── src/
    │   ├── App.jsx             # Navigation + routage
    │   ├── index.css           # Thème dark industriel
    │   ├── components/
    │   │   └── KpiStrip.jsx    # KPIs globaux
    │   ├── pages/
    │   │   ├── RevenueMonthly.jsx   # Q1 — CA mensuel/catégorie
    │   │   ├── TopLateFees.jsx      # Q2 — Top 5 pénalités/magasin
    │   │   ├── CountryCategory.jsx  # Q3 — Corrélation pays×catégorie
    │   │   ├── Occupancy.jsx        # Q4 — Taux d'occupation
    │   │   └── WorldRevenue.jsx     # Bonus — Carte mondiale
    │   └── utils/
    │       └── useFetch.js     # Hook React pour l'API
    ├── Dockerfile              # Multi-stage build + Nginx
    ├── nginx.conf
    └── package.json
```

---

## Modèle en Étoile (Star Schema)

### Table de Faits : `fact_rental`
| Colonne          | Type          | Description                          |
|------------------|---------------|--------------------------------------|
| rental_key       | BIGINT PK     | Clé surrogate                        |
| date_key         | INT FK        | → dim_date                           |
| film_key         | INT FK        | → dim_film                           |
| customer_key     | INT FK        | → dim_customer                       |
| store_key        | INT FK        | → dim_store                          |
| rental_duration  | DECIMAL(6,2)  | Durée réelle (jours)                 |
| amount           | DECIMAL(6,2)  | Montant payé                         |
| late_fee         | DECIMAL(6,2)  | Pénalité = jours_retard × 1$/jour    |
| count_rental     | TINYINT       | Toujours 1 (pour SUM)                |
| is_returned      | BOOLEAN       | FALSE = film non rendu               |

### Gestion SCD Type 2 (dim_customer)
Si un client déménage, l'ancien enregistrement est **fermé** (`is_current=FALSE`, `date_to` renseigné) et un nouveau est créé. Toutes les anciennes locations continuent de pointer vers l'ancienne ville ✓

---

## Requêtes OLAP (API endpoints)

| Endpoint                  | Question                                       |
|---------------------------|------------------------------------------------|
| `GET /api/revenue-monthly`| Q1 — CA mensuel par catégorie (2005)           |
| `GET /api/top-late-fees`  | Q2 — Top 5 films pénalités par magasin         |
| `GET /api/country-category`| Q3 — Corrélation pays × catégorie             |
| `GET /api/occupancy`      | Q4 — % films jamais loués (dernier trimestre)  |
| `GET /api/revenue-by-country`| Bonus — Revenus par pays                   |
| `GET /api/kpis`           | KPIs globaux (header dashboard)                |

---

## Commandes utiles

```bash
# Voir les logs ETL
docker compose logs etl

# Relancer uniquement l'ETL
docker compose run --rm etl

# Se connecter au DWH
docker exec -it sakila_dwh mysql -u dwh_user -pdwh_pass sakila_dwh

# Arrêter tout
docker compose down

# Arrêter et supprimer les volumes (reset complet)
docker compose down -v
```

---

## Calcul des pénalités (late_fee)

```
late_fee = max(0, durée_réelle - durée_contractuelle) × 1.00 $/jour
```

Les films non rendus (`return_date IS NULL`) ont leur durée calculée
jusqu'à la date d'exécution de l'ETL.
