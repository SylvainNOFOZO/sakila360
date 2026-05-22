import React, { useState, useMemo } from "react";
import {
  Chart as ChartJS, BarElement, CategoryScale,
  LinearScale, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { useFetch } from "../utils/useFetch";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const RANK_CLASS = ["gold", "silver", "bronze", "", ""];

export default function TopLateFees() {
  const { data, loading, error } = useFetch("/api/top-late-fees");
  const [activeStore, setActiveStore] = useState(null);

  const stores = useMemo(() => {
    if (!data) return [];
    return [...new Map(data.map(r => [r.store_id, { id: r.store_id, city: r.store_city, manager: r.manager_name }])).values()];
  }, [data]);

  const selectedStore = activeStore ?? stores[0]?.id;

  const filtered = useMemo(
    () => data?.filter(r => r.store_id === selectedStore) ?? [],
    [data, selectedStore]
  );

  const chartData = useMemo(() => ({
    labels: filtered.map(r => r.title.length > 18 ? r.title.slice(0, 18) + "…" : r.title),
    datasets: [{
      label: "Pénalités de retard ($)",
      data: filtered.map(r => parseFloat(r.total_late_fees)),
      backgroundColor: ["#f5a623dd","#f5a623aa","#f5a62388","#f5a62355","#f5a62333"],
      borderColor:     ["#f5a623","#f5a623aa","#f5a62388","#f5a62355","#f5a62333"],
      borderWidth: 1,
      borderRadius: 6,
    }],
  }), [filtered]);

  const barOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#161b2b",
        borderColor: "rgba(99,120,200,0.3)",
        borderWidth: 1,
        titleColor: "#e8ecf8",
        bodyColor: "#8892b0",
        callbacks: { label: ctx => ` $${Number(ctx.raw).toLocaleString("fr-FR")}` },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(99,120,200,0.07)" },
        ticks: { color: "#8892b0", font: { size: 11, family: "DM Mono" },
          callback: v => `$${v}` },
      },
      y: {
        grid: { display: false },
        ticks: { color: "#e8ecf8", font: { size: 12 } },
      },
    },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="page-title">Top 5 films — <span>pénalités de retard</span></div>
        <div className="page-desc">Films générant le plus de late fees, par magasin</div>
      </div>

      {error && <div className="error-box">⚠ Erreur API : {error}</div>}

      {!loading && (
        <div className="tab-row">
          {stores.map(s => (
            <button
              key={s.id}
              className={`tab-btn ${selectedStore === s.id ? "active" : ""}`}
              onClick={() => setActiveStore(s.id)}
            >
              🏪 Magasin {s.id} — {s.city}
            </button>
          ))}
        </div>
      )}

      <div className="card-grid">
        <div className="card animate-in">
          <div className="card-title">Graphique — Top 5</div>
          <div className="card-sub">REQUÊTE OLAP Q2 — RANK() OVER PARTITION BY store_key</div>
          {loading
            ? <div className="loader"><div className="spinner"/> Chargement…</div>
            : <div style={{ height: 280 }}>
                <Bar data={chartData} options={barOptions} />
              </div>
          }
        </div>

        <div className="card animate-in delay-1">
          <div className="card-title">Classement détaillé</div>
          <div className="card-sub">
            {stores.find(s => s.id === selectedStore)
              ? `Manager : ${stores.find(s => s.id === selectedStore).manager}`
              : "—"}
          </div>
          {loading
            ? <div className="loader"><div className="spinner"/> Chargement…</div>
            : <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th><th>Film</th><th>Catégorie</th>
                    <th>Pénalités</th><th>Locations</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.title}>
                      <td><span className={`rank ${RANK_CLASS[i]}`}>{i + 1}</span></td>
                      <td>{r.title}</td>
                      <td><span className="pill">{r.category}</span></td>
                      <td style={{ fontFamily: "DM Mono", color: "#f5a623", fontWeight: 600 }}>
                        ${Number(r.total_late_fees).toLocaleString("fr-FR")}
                      </td>
                      <td style={{ fontFamily: "DM Mono" }}>{r.nb_rentals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      </div>
    </div>
  );
}
