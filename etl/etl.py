#!/usr/bin/env python3
"""
SAKILA 360 — Pipeline ETL
Extrait depuis sakila (MySQL), transforme et charge dans sakila_dwh.
Gère : NULL return_date, late_fee, SCD Type 2, dim_date peuplée dynamiquement.
"""

import os
import sys
import logging
from datetime import date, timedelta, datetime
from decimal import Decimal

import mysql.connector
from mysql.connector import Error

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("etl")

# ── Config depuis les variables d'environnement ──────────────────────────────
SRC = dict(
    host=os.getenv("SRC_HOST", "db_source"),
    port=int(os.getenv("SRC_PORT", 3306)),
    database=os.getenv("SRC_DB", "sakila"),
    user=os.getenv("SRC_USER", "sakila_user"),
    password=os.getenv("SRC_PASS", "sakila_pass"),
)
DWH = dict(
    host=os.getenv("DWH_HOST", "db_dwh"),
    port=int(os.getenv("DWH_PORT", 3306)),
    database=os.getenv("DWH_DB", "sakila_dwh"),
    user=os.getenv("DWH_USER", "dwh_user"),
    password=os.getenv("DWH_PASS", "dwh_pass"),
)

# ── Constantes métier ─────────────────────────────────────────────────────────
LATE_FEE_RATE_PER_DAY = Decimal("1.00")   # 1 $ par jour de retard
LOYAL_THRESHOLD       = 10                 # nb de locations → Fidèle
REGULAR_THRESHOLD     = 4                 # nb de locations → Régulier


# ════════════════════════════════════════════════════════════════════════════════
#  UTILITAIRES
# ════════════════════════════════════════════════════════════════════════════════

def get_conn(cfg: dict, retries: int = 10, delay: int = 5):
    """Connexion MySQL avec retry automatique (containers qui démarrent)."""
    import time
    for attempt in range(1, retries + 1):
        try:
            conn = mysql.connector.connect(**cfg)
            log.info(f"Connecté à {cfg['host']}:{cfg['port']} / {cfg['database']}")
            return conn
        except Error as e:
            log.warning(f"Tentative {attempt}/{retries} — {e}")
            time.sleep(delay)
    raise RuntimeError(f"Impossible de se connecter à {cfg['host']}")


def date_to_key(d: date) -> int:
    """Convertit une date en clé entière YYYYMMDD."""
    return int(d.strftime("%Y%m%d"))


# ════════════════════════════════════════════════════════════════════════════════
#  ÉTAPE 1 — DIM_DATE
# ════════════════════════════════════════════════════════════════════════════════

MONTH_NAMES = [
    "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
]
DAY_NAMES = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

def load_dim_date(dwh_conn, start: date, end: date):
    """Peuple dim_date pour toute la plage [start, end]."""
    log.info(f"[DIM_DATE] Chargement de {start} à {end}")
    cursor = dwh_conn.cursor()

    cursor.execute("SELECT date_key FROM dim_date")
    existing = {row[0] for row in cursor.fetchall()}

    rows = []
    current = start
    while current <= end:
        key = date_to_key(current)
        if key not in existing:
            iso_day  = current.isoweekday()   # 1=Lun … 7=Dim
            is_wkend = iso_day >= 6
            rows.append((
                key,
                current,
                current.day,
                current.month,
                MONTH_NAMES[current.month],
                (current.month - 1) // 3 + 1,
                current.year,
                iso_day,
                DAY_NAMES[iso_day],
                is_wkend,
                False,  # is_holiday (à enrichir si besoin)
            ))
        current += timedelta(days=1)

    if rows:
        cursor.executemany("""
            INSERT IGNORE INTO dim_date
              (date_key, full_date, day, month, month_name, quarter, year,
               day_of_week, day_name, is_weekend, is_holiday)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, rows)
        dwh_conn.commit()
        log.info(f"[DIM_DATE] {cursor.rowcount} lignes insérées")
    else:
        log.info("[DIM_DATE] Déjà à jour")
    cursor.close()


# ════════════════════════════════════════════════════════════════════════════════
#  ÉTAPE 2 — DIM_FILM
# ════════════════════════════════════════════════════════════════════════════════

def load_dim_film(src_conn, dwh_conn):
    log.info("[DIM_FILM] Extraction depuis sakila...")
    src = src_conn.cursor(dictionary=True)
    src.execute("""
        SELECT
          f.film_id,
          f.title,
          c.name          AS category,
          f.rating,
          f.release_year,
          l.name          AS language,
          f.rental_duration
        FROM film f
        JOIN film_category fc ON fc.film_id = f.film_id
        JOIN category      c  ON c.category_id = fc.category_id
        JOIN language      l  ON l.language_id = f.language_id
    """)
    films = src.fetchall()
    src.close()

    dwh = dwh_conn.cursor()
    dwh.execute("SELECT film_id FROM dim_film")
    existing = {row[0] for row in dwh.fetchall()}

    rows = [
        (f["film_id"], f["title"], f["category"], f["rating"],
         f["release_year"], f["language"], f["rental_duration"])
        for f in films if f["film_id"] not in existing
    ]
    if rows:
        dwh.executemany("""
            INSERT INTO dim_film
              (film_id, title, category, rating, release_year, language, rental_duration)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
        """, rows)
        dwh_conn.commit()
        log.info(f"[DIM_FILM] {len(rows)} films insérés")
    else:
        log.info("[DIM_FILM] Déjà à jour")
    dwh.close()


# ════════════════════════════════════════════════════════════════════════════════
#  ÉTAPE 3 — DIM_CUSTOMER (SCD Type 2)
# ════════════════════════════════════════════════════════════════════════════════

def compute_segment(rental_count: int) -> str:
    if rental_count >= LOYAL_THRESHOLD:
        return "Fidèle"
    if rental_count >= REGULAR_THRESHOLD:
        return "Régulier"
    return "Occasionnel"


def load_dim_customer(src_conn, dwh_conn):
    log.info("[DIM_CUSTOMER] Extraction + SCD Type 2...")
    src = src_conn.cursor(dictionary=True)
    src.execute("""
        SELECT
          cu.customer_id,
          cu.first_name,
          cu.last_name,
          cu.email,
          ci.city,
          co.country,
          COUNT(r.rental_id) AS rental_count
        FROM customer cu
        JOIN address  a  ON a.address_id  = cu.address_id
        JOIN city     ci ON ci.city_id    = a.city_id
        JOIN country  co ON co.country_id = ci.country_id
        LEFT JOIN rental r ON r.customer_id = cu.customer_id
        GROUP BY cu.customer_id, cu.first_name, cu.last_name,
                 cu.email, ci.city, co.country
    """)
    customers = src.fetchall()
    src.close()

    dwh = dwh_conn.cursor(dictionary=True)
    dwh.execute("""
        SELECT customer_id, city, country, segment, customer_key
        FROM dim_customer WHERE is_current = TRUE
    """)
    current_dim = {row["customer_id"]: row for row in dwh.fetchall()}
    dwh.close()

    cur = dwh_conn.cursor()
    today = date.today()
    inserts, scd_closes = 0, 0

    for c in customers:
        cid     = c["customer_id"]
        segment = compute_segment(c["rental_count"])
        existing = current_dim.get(cid)

        if not existing:
            # Nouveau client
            cur.execute("""
                INSERT INTO dim_customer
                  (customer_id, first_name, last_name, email,
                   city, country, segment, is_current, date_from)
                VALUES (%s,%s,%s,%s,%s,%s,%s,TRUE,%s)
            """, (cid, c["first_name"], c["last_name"], c["email"],
                  c["city"], c["country"], segment, today))
            inserts += 1
        else:
            # SCD Type 2 : déménagement ou changement de segment ?
            changed = (
                existing["city"]    != c["city"]    or
                existing["country"] != c["country"] or
                existing["segment"] != segment
            )
            if changed:
                # Fermer l'ancien enregistrement
                cur.execute("""
                    UPDATE dim_customer
                    SET is_current = FALSE, date_to = %s
                    WHERE customer_key = %s
                """, (today - timedelta(days=1), existing["customer_key"]))
                # Insérer le nouveau
                cur.execute("""
                    INSERT INTO dim_customer
                      (customer_id, first_name, last_name, email,
                       city, country, segment, is_current, date_from)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,TRUE,%s)
                """, (cid, c["first_name"], c["last_name"], c["email"],
                      c["city"], c["country"], segment, today))
                scd_closes += 1

    dwh_conn.commit()
    cur.close()
    log.info(f"[DIM_CUSTOMER] {inserts} insérés, {scd_closes} SCD mis à jour")


# ════════════════════════════════════════════════════════════════════════════════
#  ÉTAPE 4 — DIM_STORE
# ════════════════════════════════════════════════════════════════════════════════

def load_dim_store(src_conn, dwh_conn):
    log.info("[DIM_STORE] Extraction...")
    src = src_conn.cursor(dictionary=True)
    src.execute("""
        SELECT
          s.store_id,
          a.address,
          a.district,
          ci.city,
          co.country,
          CONCAT(st.first_name,' ',st.last_name) AS manager_name
        FROM store s
        JOIN address  a  ON a.address_id  = s.address_id
        JOIN city     ci ON ci.city_id    = a.city_id
        JOIN country  co ON co.country_id = ci.country_id
        JOIN staff    st ON st.staff_id   = s.manager_staff_id
    """)
    stores = src.fetchall()
    src.close()

    dwh = dwh_conn.cursor()
    dwh.execute("SELECT store_id FROM dim_store")
    existing = {row[0] for row in dwh.fetchall()}

    rows = [
        (s["store_id"], s["address"], s["district"],
         s["city"], s["country"], s["manager_name"])
        for s in stores if s["store_id"] not in existing
    ]
    if rows:
        dwh.executemany("""
            INSERT INTO dim_store
              (store_id, address, district, city, country, manager_name)
            VALUES (%s,%s,%s,%s,%s,%s)
        """, rows)
        dwh_conn.commit()
        log.info(f"[DIM_STORE] {len(rows)} magasins insérés")
    else:
        log.info("[DIM_STORE] Déjà à jour")
    dwh.close()


# ════════════════════════════════════════════════════════════════════════════════
#  ÉTAPE 5 — FACT_RENTAL
# ════════════════════════════════════════════════════════════════════════════════

def load_fact_rental(src_conn, dwh_conn):
    log.info("[FACT_RENTAL] Extraction et calcul des métriques...")

    src = src_conn.cursor(dictionary=True)
    # Jointure complète avec rental_rate pour calculer late_fee
    src.execute("""
        SELECT
          r.rental_id,
          r.inventory_id,
          r.rental_date,
          r.return_date,                      -- NULL = pas encore rendu
          r.customer_id,
          i.store_id,
          f.film_id,
          f.rental_duration  AS std_duration, -- durée contractuelle en jours
          f.rental_rate,                      -- tarif de base
          p.amount
        FROM rental r
        JOIN inventory  i  ON i.inventory_id  = r.inventory_id
        JOIN film       f  ON f.film_id       = i.film_id
        LEFT JOIN payment p ON p.rental_id   = r.rental_id
        WHERE p.amount IS NOT NULL            -- on ne garde que les loc payées
    """)
    rentals = src.fetchall()
    src.close()

    # Construire les lookup tables (clé naturelle → clé surrogate)
    dwh = dwh_conn.cursor(dictionary=True)
    dwh.execute("SELECT film_id, film_key, rental_duration FROM dim_film")
    film_map = {r["film_id"]: r for r in dwh.fetchall()}

    dwh.execute("SELECT customer_id, customer_key FROM dim_customer WHERE is_current=TRUE")
    cust_map = {r["customer_id"]: r["customer_key"] for r in dwh.fetchall()}

    dwh.execute("SELECT store_id, store_key FROM dim_store")
    store_map = {r["store_id"]: r["store_key"] for r in dwh.fetchall()}

    dwh.execute("SELECT rental_id FROM fact_rental")
    existing_rentals = {r["rental_id"] for r in dwh.fetchall()}
    dwh.close()

    today = date.today()
    rows  = []

    for r in rentals:
        if r["rental_id"] in existing_rentals:
            continue

        rental_date = r["rental_date"].date() if isinstance(r["rental_date"], datetime) else r["rental_date"]
        return_date = r["return_date"]
        is_returned = return_date is not None

        if is_returned:
            if isinstance(return_date, datetime):
                return_date = return_date.date()
            actual_duration = (return_date - rental_date).days
        else:
            # Film non rendu : durée calculée jusqu'à aujourd'hui
            actual_duration = (today - rental_date).days
            return_date     = None   # on garde NULL

        std_duration = r["std_duration"]
        overdue_days = max(0, actual_duration - std_duration)
        late_fee     = Decimal(str(overdue_days)) * LATE_FEE_RATE_PER_DAY

        film   = film_map.get(r["film_id"])
        if not film:
            continue
        cust_k  = cust_map.get(r["customer_id"])
        store_k = store_map.get(r["store_id"])
        if not cust_k or not store_k:
            continue

        rows.append((
            date_to_key(rental_date),   # date_key
            film["film_key"],           # film_key
            cust_k,                     # customer_key
            store_k,                    # store_key
            r["rental_id"],
            r["inventory_id"],
            Decimal(str(actual_duration)),
            Decimal(str(r["amount"])),
            late_fee,
            1,                          # count_rental
            is_returned,
        ))

    if rows:
        cur = dwh_conn.cursor()
        cur.executemany("""
            INSERT INTO fact_rental
              (date_key, film_key, customer_key, store_key,
               rental_id, inventory_id,
               rental_duration, amount, late_fee, count_rental, is_returned)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, rows)
        dwh_conn.commit()
        cur.close()
        log.info(f"[FACT_RENTAL] {len(rows)} locations chargées")
    else:
        log.info("[FACT_RENTAL] Déjà à jour")


# ════════════════════════════════════════════════════════════════════════════════
#  MAIN
# ════════════════════════════════════════════════════════════════════════════════

def main():
    log.info("═══════════════════════════════════════════")
    log.info("  SAKILA 360 — Démarrage du pipeline ETL  ")
    log.info("═══════════════════════════════════════════")

    src_conn = get_conn(SRC)
    dwh_conn = get_conn(DWH)

    try:
        # 1. Dimension temporelle : couvrir 2004-2006 (période Sakila)
        load_dim_date(dwh_conn, date(2004, 1, 1), date(2006, 12, 31))

        # 2. Dimensions
        load_dim_film(src_conn, dwh_conn)
        load_dim_customer(src_conn, dwh_conn)
        load_dim_store(src_conn, dwh_conn)

        # 3. Table de faits
        load_fact_rental(src_conn, dwh_conn)

        log.info("✅ ETL terminé avec succès !")
    except Exception as e:
        log.error(f"❌ Erreur ETL : {e}", exc_info=True)
        sys.exit(1)
    finally:
        src_conn.close()
        dwh_conn.close()


if __name__ == "__main__":
    main()
