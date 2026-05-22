import React, { useMemo } from "react";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  BarElement, CategoryScale, LinearScale,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
import { useFetch } from "../utils/useFetch";

ChartJS.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

export default function Occupancy() {
  const { data, loading, error } = useFetch("/api/occupancy");

  const donutData = useMemo(() => {
    if (!data) return null;
    return {
      labels: ["Films loués", "Jamais loués"],
      datasets: [{
        data: [data.rented_count, data.never_rented],
        backgroundColor: ["#2de08ecc", "#ff5c7a88"],
        borderColor:     ["#2de08e",   "#ff5c7a"],
        borderWidth: 2,
        hoverOffset: 8,
      }],
    };
  }, [data]);

  const barData = useMemo(() => {
    if (!data) return null;
    const cats = data.by_category.slice(0, 10);
    return {
      labels: cats.map(c => c.category),
      datasets: [
        {
          label: "Loués",
          data: cats.map(c => c.rented),
          backgroundColor: "#2de08e88",
          borderColor: "#2de08e",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: "Jamais loués",
          data: cats.map(c => c.never),
          backgroundColor: "#ff5c7a66",
          borderColor: "#ff5c7a",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };
  }, [data]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: "#8892b0", font: { size: 11, family: "DM Mono" }, boxWidth: 12 },
      },
      tooltip: {
        backgroundColor: "#161b2b",
        borderColor: "rgba(99,120,200,0.3)",
        borderWidth: 1,
        titleColor: "#e8ecf8",
        bodyColor: "#8892b0",
      },
    },
    scales: {
      x: { grid: { color: "rgba(99,120,200,0.07)" }, ticks: { color: "#8892b0", font: { size: 11 } } },
      y: { grid: { color: "rgba(99,120,200,0.07)" }, ticks: { color: "#8892b0", font: { size: 11 } } },
    },
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "70%",
    plugins: {
      legend: { position: "bottom", labels: { color: "#8892b0", font: { size: 11, family: "DM Mono" }, boxWidth: 12 } },
      tooltip: {
        backgroundColor: "#161b2b",
        borderColor: "rgba(99,120,200,0.3)",
        borderWidth: 1,
        titleColor: "#e8ecf8",
        bodyColor: "#8892b0",
      },
    },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="page-title">Taux d'<span>occupation</span> de l'inventaire</div>
        <div className="page-desc">Films jamais loués sur le dernier trimestre disponible</div>
      </div>

      {error && <div className="error-box">⚠ Erreur API : {error}</div>}

      {/* Stat cards */}
      {!loading && data && (
        <div className="kpi-grid animate-in">
          {[
            { label: "Total films", value: data.total, accent: "#00d4ff" },
            { label: "Films loués", value: data.rented_count, accent: "#2de08e" },
            { label: "Jamais loués", value: data.never_rented, accent: "#ff5c7a" },
            { label: "% Jamais loués", value: `${data.pct_never}%`, accent: "#f5a623" },
          ].map((k, i) => (
            <div key={k.label} className={`kpi-card delay-${i+1}`} style={{"--accent": k.accent}}>
              <div className="kpi-value">{k.value}</div>
              <div className="kpi-label">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card-grid">
        {/* Donut */}
        <div className="card animate-in">
          <div className="card-title">Répartition globale</div>
          <div className="card-sub">REQUÊTE OLAP Q4 — derniers 3 mois</div>
          {loading
            ? <div className="loader"><div className="spinner"/> Chargement…</div>
            : (
              <div style={{ position: "relative", height: 260 }}>
                <Doughnut data={donutData} options={donutOptions} />
                {data && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%,-60%)",
                    textAlign: "center", pointerEvents: "none",
                  }}>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "DM Mono", color: "#ff5c7a" }}>
                      {data.pct_never}%
                    </div>
                    <div style={{ fontSize: 10, color: "#8892b0" }}>non loués</div>
                  </div>
                )}
              </div>
            )
          }
        </div>

        {/* Barre par catégorie */}
        <div className="card animate-in delay-1">
          <div className="card-title">Par catégorie</div>
          <div className="card-sub">Comparaison loués vs jamais loués</div>
          {loading
            ? <div className="loader"><div className="spinner"/> Chargement…</div>
            : <div style={{ height: 260 }}>
                <Bar data={barData} options={{ ...chartOptions, indexAxis: "y" }} />
              </div>
          }
        </div>
      </div>

      {/* Liste des films jamais loués */}
      {!loading && data && (
        <div className="card animate-in delay-2">
          <div className="card-title">Films jamais loués (extrait)</div>
          <div className="card-sub">Ces films n'ont généré aucune location sur la période</div>
          <table className="data-table">
            <thead><tr><th>#</th><th>Film</th><th>Catégorie</th></tr></thead>
            <tbody>
              {data.never_films.map((f, i) => (
                <tr key={f.film_key}>
                  <td style={{ color: "#4a5580", fontFamily: "DM Mono", fontSize: 11 }}>{i + 1}</td>
                  <td>{f.title}</td>
                  <td><span className="pill">{f.category}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
