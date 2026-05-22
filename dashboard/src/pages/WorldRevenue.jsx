import React, { useMemo } from "react";
import {
  Chart as ChartJS, BarElement, CategoryScale,
  LinearScale, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { useFetch } from "../utils/useFetch";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function WorldRevenue() {
  const { data, loading, error } = useFetch("/api/revenue-by-country");

  const top20 = useMemo(() => data?.slice(0, 20) ?? [], [data]);

  const chartData = useMemo(() => ({
    labels: top20.map(r => r.country),
    datasets: [{
      label: "Chiffre d'affaires ($)",
      data: top20.map(r => parseFloat(r.total_revenue)),
      backgroundColor: top20.map((_, i) => {
        const t = 1 - i / 20;
        const r = Math.round(0   + t * 0);
        const g = Math.round(100 + t * 112);
        const b = Math.round(160 + t * 95);
        return `rgba(${r},${g},${b},0.75)`;
      }),
      borderColor: top20.map((_, i) => {
        const t = 1 - i / 20;
        const g = Math.round(100 + t * 112);
        const b = Math.round(160 + t * 95);
        return `rgba(0,${g},${b},1)`;
      }),
      borderWidth: 1,
      borderRadius: 5,
    }],
  }), [top20]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#161b2b",
        borderColor: "rgba(99,120,200,0.3)",
        borderWidth: 1,
        titleColor: "#e8ecf8",
        bodyColor: "#8892b0",
        callbacks: {
          label: ctx => ` $${Number(ctx.raw).toLocaleString("fr-FR")}`,
          afterLabel: ctx => {
            const row = top20[ctx.dataIndex];
            return ` ${row?.nb_rentals} locations · ${row?.nb_customers} clients`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(99,120,200,0.07)" },
        ticks: {
          color: "#8892b0",
          font: { size: 11, family: "DM Mono" },
          callback: v => `$${v.toLocaleString("fr-FR")}`,
        },
      },
      y: {
        grid: { display: false },
        ticks: { color: "#e8ecf8", font: { size: 11 } },
      },
    },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="page-title">Revenus <span>mondiaux</span> par pays</div>
        <div className="page-desc">Bonus — Classement dynamique des 20 premiers pays</div>
      </div>

      {error && <div className="error-box">⚠ Erreur API : {error}</div>}

      <div className="card animate-in" style={{ gridColumn: "1/-1" }}>
        <div className="card-title">Top 20 pays — Chiffre d'affaires</div>
        <div className="card-sub">BONUS OLAP — fact_rental ⋈ dim_customer GROUP BY country</div>
        {loading
          ? <div className="loader"><div className="spinner"/> Chargement…</div>
          : <div style={{ height: 520 }}>
              <Bar data={chartData} options={options} />
            </div>
        }
      </div>

      {!loading && data && (
        <div className="card animate-in delay-1">
          <div className="card-title">Tableau complet</div>
          <div className="card-sub">Tous les pays avec au moins une location</div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th><th>Pays</th>
                  <th>CA ($)</th><th>Locations</th><th>Clients</th>
                  <th>Panier moyen</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={r.country}>
                    <td style={{ fontFamily: "DM Mono", color: "#4a5580", fontSize: 11 }}>{i + 1}</td>
                    <td>{r.country}</td>
                    <td style={{ fontFamily: "DM Mono", color: "#00d4ff", fontWeight: 600 }}>
                      ${Number(r.total_revenue).toLocaleString("fr-FR")}
                    </td>
                    <td style={{ fontFamily: "DM Mono" }}>{Number(r.nb_rentals).toLocaleString("fr-FR")}</td>
                    <td style={{ fontFamily: "DM Mono" }}>{r.nb_customers}</td>
                    <td style={{ fontFamily: "DM Mono", color: "#2de08e" }}>
                      ${r.nb_rentals > 0
                        ? (parseFloat(r.total_revenue) / parseInt(r.nb_rentals)).toFixed(2)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
