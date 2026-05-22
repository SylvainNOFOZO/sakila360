const express = require("express");
const mysql   = require("mysql2/promise");
const cors    = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── Pool de connexions vers le DWH ───────────────────────────────────────────
const pool = mysql.createPool({
  host    : process.env.DWH_HOST || "db_dwh",
  port    : parseInt(process.env.DWH_PORT || "3306"),
  database: process.env.DWH_DB   || "sakila_dwh",
  user    : process.env.DWH_USER || "dwh_user",
  password: process.env.DWH_PASS || "dwh_pass",
  waitForConnections: true,
  connectionLimit   : 10,
});

const q = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok" }));

// ════════════════════════════════════════════════════════════════════════════
//  Q1 — Évolution mensuelle du CA par catégorie (2005)
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/revenue-monthly", async (req, res) => {
  try {
    const rows = await q(`
      SELECT
        d.month,
        d.month_name,
        f.category,
        ROUND(SUM(r.amount), 2)   AS total_revenue,
        COUNT(r.rental_key)       AS nb_rentals
      FROM fact_rental r
      JOIN dim_date d ON d.date_key = r.date_key
      JOIN dim_film f ON f.film_key = r.film_key
      WHERE d.year = 2005
      GROUP BY d.month, d.month_name, f.category
      ORDER BY d.month, f.category
    `);

    // Pivot : { month, month_name, [category]: revenue, ... }
    const months = {};
    const categories = new Set();

    for (const row of rows) {
      const key = row.month;
      if (!months[key]) months[key] = { month: row.month, month_name: row.month_name };
      months[key][row.category] = parseFloat(row.total_revenue);
      categories.add(row.category);
    }

    res.json({
      data      : Object.values(months).sort((a, b) => a.month - b.month),
      categories: [...categories].sort(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  Q2 — Top 5 films avec le plus de pénalités de retard par magasin
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/top-late-fees", async (req, res) => {
  try {
    const rows = await q(`
      SELECT * FROM (
        SELECT
          s.city         AS store_city,
          s.manager_name,
          s.store_id,
          f.title,
          f.category,
          ROUND(SUM(r.late_fee), 2)     AS total_late_fees,
          COUNT(r.rental_key)           AS nb_rentals,
          RANK() OVER (
            PARTITION BY r.store_key
            ORDER BY SUM(r.late_fee) DESC
          ) AS rnk
        FROM fact_rental r
        JOIN dim_film  f ON f.film_key  = r.film_key
        JOIN dim_store s ON s.store_key = r.store_key
        WHERE r.late_fee > 0
        GROUP BY r.store_key, s.city, s.manager_name, s.store_id,
                 f.film_key, f.title, f.category
      ) ranked
      WHERE rnk <= 5
      ORDER BY store_id, rnk
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  Q3 — Corrélation pays × catégorie
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/country-category", async (req, res) => {
  try {
    const rows = await q(`
      SELECT
        c.country,
        f.category,
        COUNT(r.rental_key)        AS nb_rentals,
        ROUND(SUM(r.amount), 2)    AS total_revenue
      FROM fact_rental r
      JOIN dim_customer c ON c.customer_key = r.customer_key AND c.is_current = TRUE
      JOIN dim_film     f ON f.film_key     = r.film_key
      GROUP BY c.country, f.category
      ORDER BY c.country, nb_rentals DESC
    `);

    // Top catégorie par pays
    const byCountry = {};
    for (const row of rows) {
      if (!byCountry[row.country]) byCountry[row.country] = [];
      byCountry[row.country].push({
        category    : row.category,
        nb_rentals  : parseInt(row.nb_rentals),
        total_revenue: parseFloat(row.total_revenue),
      });
    }

    const summary = Object.entries(byCountry).map(([country, cats]) => ({
      country,
      top_category : cats[0].category,
      top_rentals  : cats[0].nb_rentals,
      all_categories: cats,
    }));

    res.json({ data: rows, summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  Q4 — Taux d'occupation (films jamais loués sur le dernier trimestre)
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/occupancy", async (req, res) => {
  try {
    // Dernier trimestre disponible dans les données
    const [maxDate] = await q(`SELECT MAX(full_date) AS max_dt FROM dim_date`);
    const max = maxDate.max_dt;

    const rows = await q(`
      SELECT
        f.film_key,
        f.title,
        f.category,
        COUNT(r.rental_key)  AS times_rented
      FROM dim_film f
      LEFT JOIN fact_rental r ON r.film_key = f.film_key
      LEFT JOIN dim_date    d ON d.date_key = r.date_key
        AND d.full_date >= DATE_SUB(?, INTERVAL 3 MONTH)
      GROUP BY f.film_key, f.title, f.category
    `, [max]);

    const never    = rows.filter(r => parseInt(r.times_rented) === 0);
    const rented   = rows.filter(r => parseInt(r.times_rented) >  0);
    const total    = rows.length;
    const pctNever = total > 0 ? ((never.length / total) * 100).toFixed(1) : 0;

    // Par catégorie
    const byCat = {};
    for (const r of rows) {
      if (!byCat[r.category]) byCat[r.category] = { rented: 0, never: 0 };
      parseInt(r.times_rented) > 0
        ? byCat[r.category].rented++
        : byCat[r.category].never++;
    }

    res.json({
      total,
      never_rented  : never.length,
      rented_count  : rented.length,
      pct_never     : parseFloat(pctNever),
      pct_rented    : parseFloat((100 - pctNever).toFixed(1)),
      never_films   : never.slice(0, 20),
      by_category   : Object.entries(byCat).map(([cat, v]) => ({
        category: cat, ...v,
        pct_never: ((v.never / (v.never + v.rented)) * 100).toFixed(1),
      })).sort((a, b) => b.pct_never - a.pct_never),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  BONUS — Revenus totaux par pays (carte du monde)
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/revenue-by-country", async (req, res) => {
  try {
    const rows = await q(`
      SELECT
        c.country,
        ROUND(SUM(r.amount), 2)  AS total_revenue,
        COUNT(r.rental_key)      AS nb_rentals,
        COUNT(DISTINCT c.customer_key) AS nb_customers
      FROM fact_rental  r
      JOIN dim_customer c ON c.customer_key = r.customer_key AND c.is_current = TRUE
      GROUP BY c.country
      ORDER BY total_revenue DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  KPIs globaux pour le header du dashboard
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/kpis", async (req, res) => {
  try {
    const [[totals]] = await pool.execute(`
      SELECT
        ROUND(SUM(amount), 2)    AS total_revenue,
        ROUND(SUM(late_fee), 2)  AS total_late_fees,
        COUNT(rental_key)        AS total_rentals,
        COUNT(DISTINCT customer_key) AS total_customers
      FROM fact_rental
    `);
    const [[films]]  = await pool.execute(`SELECT COUNT(*) AS cnt FROM dim_film`);
    const [[stores]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM dim_store`);

    res.json({
      total_revenue   : parseFloat(totals.total_revenue),
      total_late_fees : parseFloat(totals.total_late_fees),
      total_rentals   : parseInt(totals.total_rentals),
      total_customers : parseInt(totals.total_customers),
      total_films     : parseInt(films.cnt),
      total_stores    : parseInt(stores.cnt),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅  API Sakila 360 — port ${PORT}`));
