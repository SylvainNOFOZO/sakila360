import React, { useMemo } from "react";
import {
  Chart as ChartJS,
  LineElement, PointElement, LinearScale, CategoryScale,
  Tooltip, Legend, Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useFetch } from "../utils/useFetch";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

const PALETTE = [
  "#00d4ff","#7c6fff","#2de08e","#f5a623",
  "#ff5c7a","#a78bfa","#34d399","#fb923c",
  "#60a5fa","#f472b6","#4ade80","#facc15",
  "#38bdf8","#e879f9","#a3e635","#fb7185",
];

const MONTH_SHORT = ["","Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

export default function RevenueMonthly() {
  const { data, loading, error } = useFetch("/api/revenue-monthly");

  const { chartData, options } = useMemo(() => {
    if (!data) return { chartData: null, options: {} };

    const { data: rows, categories } = data;
    const labels = [...new Set(rows.map(r => MONTH_SHORT[r.month]))];

    const datasets = categories.map((cat, i) => {
      const color = PALETTE[i % PALETTE.length];
      // rows est déjà pivoté par l'API : chaque row = { month, month_name, Action: x, Comedy: y, … }
      // On récupère directement la valeur de la catégorie sur chaque row trié par mois.
      const values = rows.map(row => row[cat] ?? 0);
      return {
        label: cat,
        data: values,
        borderColor: color,
        backgroundColor: color + "18",
        pointBackgroundColor: color,
        pointRadius: 4,
        pointHoverRadius: 7,
        borderWidth: 2,
        tension: 0.4,
        fill: false,
      };
    });

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#8892b0", font: { size: 11, family: "DM Mono" },
            boxWidth: 12, padding: 16 },
        },
        tooltip: {
          backgroundColor: "#161b2b",
          borderColor: "rgba(99,120,200,0.3)",
          borderWidth: 1,
          titleColor: "#e8ecf8",
          bodyColor: "#8892b0",
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: $${Number(ctx.raw).toLocaleString("fr-FR")}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(99,120,200,0.07)" },
          ticks: { color: "#8892b0", font: { size: 11 } },
        },
        y: {
          grid: { color: "rgba(99,120,200,0.07)" },
          ticks: {
            color: "#8892b0",
            font: { size: 11, family: "DM Mono" },
            callback: v => `$${v.toLocaleString("fr-FR")}`,
          },
        },
      },
    };

    return { chartData: { labels, datasets }, options };
  }, [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="page-title">Évolution mensuelle du <span>chiffre d'affaires</span></div>
        <div className="page-desc">Répartition par catégorie de film — Année 2005</div>
      </div>

      {error && <div className="error-box">⚠ Erreur API : {error}</div>}

      <div className="card animate-in">
        <div className="card-title">CA mensuel par catégorie (2005)</div>
        <div className="card-sub">REQUÊTE OLAP Q1 — fact_rental ⋈ dim_date ⋈ dim_film</div>
        {loading
          ? <div className="loader"><div className="spinner"/> Chargement…</div>
          : <div style={{ height: 380 }}>
              <Line data={chartData} options={options} />
            </div>
        }
      </div>

      {!loading && data && (
        <div className="card animate-in delay-1">
          <div className="card-title">Détail mensuel</div>
          <div className="card-sub">Toutes catégories confondues</div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mois</th>
                  {data.categories.map(c => <th key={c}>{c}</th>)}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map(row => {
                  const total = data.categories.reduce((s, c) => s + (row[c] || 0), 0);
                  return (
                    <tr key={row.month}>
                      <td>{MONTH_SHORT[row.month]} 2005</td>
                      {data.categories.map(c => (
                        <td key={c} style={{ fontFamily: "DM Mono", fontSize: 11 }}>
                          {row[c] ? `$${Number(row[c]).toLocaleString("fr-FR")}` : "—"}
                        </td>
                      ))}
                      <td style={{ fontFamily: "DM Mono", fontWeight: 700, color: "#00d4ff" }}>
                        ${total.toLocaleString("fr-FR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
