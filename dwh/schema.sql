-- ============================================================
--  SAKILA 360 — Data Warehouse : Schéma en Étoile (Star Schema)
--  Base : sakila_dwh
-- ============================================================

CREATE DATABASE IF NOT EXISTS sakila_dwh
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sakila_dwh;

-- ──────────────────────────────────────────────────────────────
-- DIM_DATE
-- Dimension temporelle enrichie (nécessaire pour les tendances)
-- La clé est un entier YYYYMMDD (ex: 20050101)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_date (
  date_key        INT          NOT NULL,
  full_date       DATE         NOT NULL,
  day             TINYINT      NOT NULL,
  month           TINYINT      NOT NULL,
  month_name      VARCHAR(20)  NOT NULL,
  quarter         TINYINT      NOT NULL,
  year            SMALLINT     NOT NULL,
  day_of_week     TINYINT      NOT NULL COMMENT '1=Lundi … 7=Dimanche',
  day_name        VARCHAR(20)  NOT NULL,
  is_weekend      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_holiday      BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (date_key)
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────────────────────
-- DIM_FILM
-- Titre, catégorie, rating, langue, année de sortie
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_film (
  film_key        INT          NOT NULL AUTO_INCREMENT,
  film_id         SMALLINT     NOT NULL COMMENT 'Clé naturelle (source)',
  title           VARCHAR(255) NOT NULL,
  category        VARCHAR(100) NOT NULL,
  rating          VARCHAR(10)  NOT NULL,
  release_year    YEAR,
  language        VARCHAR(50)  NOT NULL,
  rental_duration TINYINT      NOT NULL COMMENT 'Durée standard en jours',
  PRIMARY KEY (film_key),
  INDEX idx_film_id (film_id),
  INDEX idx_category (category),
  INDEX idx_rating (rating)
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────────────────────
-- DIM_CUSTOMER  (SCD Type 2)
-- Nom, ville, pays + segment comportemental
-- La colonne is_current + date_from/to gèrent les déménagements
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_customer (
  customer_key    INT          NOT NULL AUTO_INCREMENT,
  customer_id     SMALLINT     NOT NULL COMMENT 'Clé naturelle',
  first_name      VARCHAR(50)  NOT NULL,
  last_name       VARCHAR(50)  NOT NULL,
  email           VARCHAR(100),
  city            VARCHAR(100) NOT NULL,
  country         VARCHAR(100) NOT NULL,
  segment         ENUM('Fidèle','Régulier','Occasionnel') NOT NULL
                  COMMENT 'Fidèle ≥10 loc, Régulier 4-9, Occasionnel ≤3',
  -- SCD Type 2 ──
  is_current      BOOLEAN      NOT NULL DEFAULT TRUE,
  date_from       DATE         NOT NULL,
  date_to         DATE                  DEFAULT NULL,
  PRIMARY KEY (customer_key),
  INDEX idx_customer_id (customer_id),
  INDEX idx_country (country),
  INDEX idx_is_current (is_current)
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────────────────────
-- DIM_STORE
-- Adresse du magasin + nom du manager
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_store (
  store_key       INT          NOT NULL AUTO_INCREMENT,
  store_id        TINYINT      NOT NULL COMMENT 'Clé naturelle',
  address         VARCHAR(255) NOT NULL,
  district        VARCHAR(100),
  city            VARCHAR(100) NOT NULL,
  country         VARCHAR(100) NOT NULL,
  manager_name    VARCHAR(100) NOT NULL,
  PRIMARY KEY (store_key),
  INDEX idx_store_id (store_id)
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────────────────────
-- FACT_RENTAL  (Table de Faits)
-- Granularité : 1 ligne = 1 location
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fact_rental (
  rental_key      BIGINT       NOT NULL AUTO_INCREMENT,
  -- Clés étrangères
  date_key        INT          NOT NULL COMMENT 'Date de la location',
  film_key        INT          NOT NULL,
  customer_key    INT          NOT NULL,
  store_key       INT          NOT NULL,
  -- Clé naturelle (traçabilité)
  rental_id       INT          NOT NULL,
  inventory_id    INT          NOT NULL,
  -- Mesures
  rental_duration DECIMAL(6,2) NOT NULL COMMENT 'Durée réelle en jours',
  amount          DECIMAL(6,2) NOT NULL COMMENT 'Montant total payé',
  late_fee        DECIMAL(6,2) NOT NULL DEFAULT 0
                  COMMENT 'Pénalité = jours de retard × rental_rate/rental_duration',
  count_rental    TINYINT      NOT NULL DEFAULT 1 COMMENT 'Toujours 1, pour SUM()',
  -- Indicateur retour
  is_returned     BOOLEAN      NOT NULL DEFAULT TRUE COMMENT 'FALSE = film non rendu',
  PRIMARY KEY (rental_key),
  -- FK simulées (pas de FOREIGN KEY pour perf OLAP)
  INDEX idx_date_key     (date_key),
  INDEX idx_film_key     (film_key),
  INDEX idx_customer_key (customer_key),
  INDEX idx_store_key    (store_key),
  INDEX idx_rental_id    (rental_id)
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────────────────────
-- VUE OLAP : revenus mensuels par catégorie (Q1)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_revenue_monthly_category AS
SELECT
  d.year,
  d.month,
  d.month_name,
  f.category,
  SUM(r.amount)     AS total_revenue,
  SUM(r.late_fee)   AS total_late_fees,
  COUNT(r.rental_key) AS nb_rentals
FROM fact_rental r
JOIN dim_date     d ON d.date_key    = r.date_key
JOIN dim_film     f ON f.film_key    = r.film_key
WHERE d.year = 2005
GROUP BY d.year, d.month, d.month_name, f.category
ORDER BY d.month, f.category;

-- ──────────────────────────────────────────────────────────────
-- VUE OLAP : Top films par pénalités et par magasin (Q2)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_top_films_late_fee AS
SELECT
  s.store_key,
  s.city         AS store_city,
  s.manager_name,
  f.title,
  f.category,
  SUM(r.late_fee)         AS total_late_fees,
  COUNT(r.rental_key)     AS nb_rentals,
  RANK() OVER (PARTITION BY r.store_key ORDER BY SUM(r.late_fee) DESC) AS rnk
FROM fact_rental r
JOIN dim_film  f ON f.film_key  = r.film_key
JOIN dim_store s ON s.store_key = r.store_key
GROUP BY s.store_key, s.city, s.manager_name, f.film_key, f.title, f.category;

-- ──────────────────────────────────────────────────────────────
-- VUE OLAP : Corrélation pays × catégorie (Q3)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_country_category AS
SELECT
  c.country,
  f.category,
  COUNT(r.rental_key) AS nb_rentals,
  SUM(r.amount)       AS total_revenue
FROM fact_rental r
JOIN dim_customer c ON c.customer_key = r.customer_key AND c.is_current = TRUE
JOIN dim_film     f ON f.film_key     = r.film_key
GROUP BY c.country, f.category
ORDER BY c.country, nb_rentals DESC;

-- ──────────────────────────────────────────────────────────────
-- VUE OLAP : Taux d'occupation du dernier trimestre (Q4)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_occupancy_rate AS
SELECT
  f.film_key,
  f.title,
  f.category,
  COUNT(DISTINCT r.rental_key)   AS times_rented,
  MAX(d.full_date)               AS last_rental_date,
  CASE WHEN COUNT(r.rental_key) = 0 THEN 'Jamais loué' ELSE 'Loué' END AS status
FROM dim_film f
LEFT JOIN fact_rental r ON r.film_key = f.film_key
LEFT JOIN dim_date    d ON d.date_key = r.date_key
  AND d.full_date >= DATE_SUB(
    (SELECT MAX(full_date) FROM dim_date), INTERVAL 3 MONTH
  )
GROUP BY f.film_key, f.title, f.category;
