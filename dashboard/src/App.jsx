import React, { useState } from "react";
import KpiStrip       from "./components/KpiStrip.jsx";
import RevenueMonthly from "./pages/RevenueMonthly.jsx";
import TopLateFees    from "./pages/TopLateFees.jsx";
import CountryCategory from "./pages/CountryCategory.jsx";
import Occupancy      from "./pages/Occupancy.jsx";
import WorldRevenue   from "./pages/WorldRevenue.jsx";

const PAGES = [
  {
    id: "overview",
    label: "Vue d'ensemble",
    icon: "⬡",
    section: "TABLEAU DE BORD",
    component: null, // Affiche les KPIs + toutes les pages en résumé
  },
  {
    id: "revenue",
    label: "CA Mensuel",
    icon: "◈",
    section: "ANALYSES OLAP",
    component: RevenueMonthly,
    badge: "Q1",
  },
  {
    id: "latefees",
    label: "Top Pénalités",
    icon: "◈",
    component: TopLateFees,
    badge: "Q2",
  },
  {
    id: "country",
    label: "Pays × Catégorie",
    icon: "◈",
    component: CountryCategory,
    badge: "Q3",
  },
  {
    id: "occupancy",
    label: "Taux d'occupation",
    icon: "◈",
    component: Occupancy,
    badge: "Q4",
  },
  {
    id: "world",
    label: "Carte Mondiale",
    icon: "◉",
    section: "BONUS",
    component: WorldRevenue,
    badge: "★",
  },
];

export default function App() {
  const [active, setActive] = useState("overview");
  const page = PAGES.find(p => p.id === active);

  return (
    <div className="layout">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="header-logo">Sakila<span> 360</span></div>
        <div className="header-badge">DATA WAREHOUSE</div>
        <div className="header-sub">
          sakila_dwh · Star Schema · ETL Python · MySQL 8.0
        </div>
      </header>

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <nav className="sidebar">
        {PAGES.map((p, i) => (
          <React.Fragment key={p.id}>
            {p.section && (
              <div className="nav-section">{p.section}</div>
            )}
            <div
              className={`nav-item ${active === p.id ? "active" : ""}`}
              onClick={() => setActive(p.id)}
            >
              <span className="nav-icon">{p.icon}</span>
              <span style={{ flex: 1 }}>{p.label}</span>
              {p.badge && (
                <span style={{
                  fontSize: 9,
                  fontFamily: "DM Mono",
                  padding: "1px 6px",
                  borderRadius: 99,
                  background: active === p.id ? "rgba(0,212,255,0.2)" : "rgba(99,120,200,0.1)",
                  color: active === p.id ? "#00d4ff" : "#4a5580",
                  border: `1px solid ${active === p.id ? "rgba(0,212,255,0.3)" : "rgba(99,120,200,0.15)"}`,
                }}>
                  {p.badge}
                </span>
              )}
            </div>
          </React.Fragment>
        ))}

        {/* Footer sidebar */}
        <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid rgba(99,120,200,0.12)" }}>
          <div style={{ fontSize: 10, fontFamily: "DM Mono", color: "#4a5580", lineHeight: 1.7 }}>
            <div>Sakila 360 v1.0</div>
            <div>Star Schema · 4 dims</div>
            <div style={{ color: "#2de08e", marginTop: 4 }}>● ETL complet</div>
          </div>
        </div>
      </nav>

      {/* ── Main Content ───────────────────────────────────────────────── */}
      <main className="main">
        {active === "overview" ? (
          <>
            <div>
              <div className="page-title">Vue d'ensemble — <span>Sakila 360</span></div>
              <div className="page-desc">
                Data Warehouse en étoile · Schéma décisionnel · Analyse de performance des locations
              </div>
            </div>
            <KpiStrip />

            {/* Résumé architecture */}
            <div className="card animate-in delay-1">
              <div className="card-title">Architecture du Data Warehouse</div>
              <div className="card-sub">Modèle en étoile · 1 table de faits · 4 dimensions</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 4 }}>
                {[
                  { name: "fact_rental", desc: "Granularité : 1 location", color: "#ff5c7a", keys: "amount · late_fee · rental_duration" },
                  { name: "dim_film",    desc: "Titre, catégorie, rating", color: "#7c6fff", keys: "film_key · category · release_year" },
                  { name: "dim_customer",desc: "SCD Type 2",              color: "#2de08e", keys: "customer_key · country · segment" },
                  { name: "dim_date",    desc: "Calendrier enrichi",      color: "#00d4ff", keys: "date_key · quarter · is_weekend" },
                  { name: "dim_store",   desc: "Magasin + manager",       color: "#f5a623", keys: "store_key · city · manager_name" },
                ].map(t => (
                  <div key={t.name} style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${t.color}33`,
                    borderLeft: `3px solid ${t.color}`,
                    borderRadius: 8, padding: "12px 14px",
                  }}>
                    <div style={{ fontFamily: "DM Mono", fontSize: 12, color: t.color, fontWeight: 600 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "#8892b0", marginTop: 3 }}>{t.desc}</div>
                    <div style={{ fontSize: 10, color: "#4a5580", marginTop: 6, fontFamily: "DM Mono" }}>{t.keys}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation rapide */}
            <div className="card animate-in delay-2">
              <div className="card-title">Questions analytiques (OLAP)</div>
              <div className="card-sub">Cliquez pour accéder à chaque analyse</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                {PAGES.filter(p => p.badge && p.badge !== "★").map(p => (
                  <div
                    key={p.id}
                    onClick={() => setActive(p.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(99,120,200,0.1)",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(0,212,255,0.3)"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(99,120,200,0.1)"}
                  >
                    <span style={{
                      fontFamily: "DM Mono", fontSize: 10, padding: "2px 8px",
                      borderRadius: 99, background: "rgba(0,212,255,0.1)",
                      color: "#00d4ff", border: "1px solid rgba(0,212,255,0.2)",
                    }}>{p.badge}</span>
                    <span style={{ fontSize: 13, color: "#e8ecf8" }}>{p.label}</span>
                    <span style={{ marginLeft: "auto", color: "#4a5580", fontSize: 11 }}>→</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          page?.component && <page.component />
        )}
      </main>
    </div>
  );
}
