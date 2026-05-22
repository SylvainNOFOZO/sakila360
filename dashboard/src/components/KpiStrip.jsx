import React from "react";
import { useFetch } from "../utils/useFetch";

const fmt  = n => n == null ? "—" : Number(n).toLocaleString("fr-FR");
const fmtC = n => n == null ? "—" : `$${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 0 })}`;

const KPIS = [
  { key: "total_revenue",    label: "Chiffre d'affaires", fmt: fmtC, accent: "#00d4ff" },
  { key: "total_rentals",    label: "Locations",          fmt: fmt,  accent: "#7c6fff" },
  { key: "total_customers",  label: "Clients",            fmt: fmt,  accent: "#2de08e" },
  { key: "total_late_fees",  label: "Pénalités retard",   fmt: fmtC, accent: "#f5a623" },
  { key: "total_films",      label: "Films catalogués",   fmt: fmt,  accent: "#ff5c7a" },
  { key: "total_stores",     label: "Magasins",           fmt: fmt,  accent: "#00d4ff" },
];

export default function KpiStrip() {
  const { data, loading } = useFetch("/api/kpis");

  return (
    <div className="kpi-grid">
      {KPIS.map((k, i) => (
        <div
          key={k.key}
          className={`kpi-card animate-in delay-${Math.min(i + 1, 4)}`}
          style={{ "--accent": k.accent }}
        >
          <div className="kpi-value">
            {loading ? "…" : k.fmt(data?.[k.key])}
          </div>
          <div className="kpi-label">{k.label}</div>
        </div>
      ))}
    </div>
  );
}
