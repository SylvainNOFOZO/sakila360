import React, { useMemo, useState } from "react";
import { useFetch } from "../utils/useFetch";

// Interpolation de couleur entre deux hex
function lerp(a, b, t) {
  const h = s => parseInt(s, 16);
  const r = c => Math.round(h(c.slice(1,3)) + t*(h(b.slice(1,3))-h(a.slice(1,3)))).toString(16).padStart(2,"0");
  // compute properly
  const ra = parseInt(a.slice(1,3),16), rb = parseInt(b.slice(1,3),16);
  const ga = parseInt(a.slice(3,5),16), gb = parseInt(b.slice(3,5),16);
  const ba = parseInt(a.slice(5,7),16), bb = parseInt(b.slice(5,7),16);
  const rr = Math.round(ra+(rb-ra)*t).toString(16).padStart(2,"0");
  const gr = Math.round(ga+(gb-ga)*t).toString(16).padStart(2,"0");
  const br = Math.round(ba+(bb-ba)*t).toString(16).padStart(2,"0");
  return `#${rr}${gr}${br}`;
}

export default function CountryCategory() {
  const { data, loading, error } = useFetch("/api/country-category");
  const [sortBy, setSortBy] = useState("rentals");

  const { countries, categories, matrix, maxVal, topCountries } = useMemo(() => {
    if (!data) return {};
    const rows = data.data;

    const cats  = [...new Set(rows.map(r => r.category))].sort();
    const all_c = [...new Set(rows.map(r => r.country))];

    // Total par pays pour trier
    const totals = {};
    for (const r of rows) totals[r.country] = (totals[r.country] || 0) + parseInt(r.nb_rentals);
    const sorted = all_c.sort((a, b) => (totals[b] || 0) - (totals[a] || 0));

    const top = sorted.slice(0, 20); // top 20 pays

    // Construire la matrice
    const mat = {};
    for (const r of rows) {
      if (!mat[r.country]) mat[r.country] = {};
      mat[r.country][r.category] = { rentals: parseInt(r.nb_rentals), revenue: parseFloat(r.total_revenue) };
    }

    const maxV = Math.max(...rows.map(r => parseInt(r.nb_rentals)));

    return { countries: top, categories: cats, matrix: mat, maxVal: maxV, topCountries: sorted };
  }, [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="page-title">Corrélation <span>Pays × Catégorie</span></div>
        <div className="page-desc">Nombre de locations par pays d'origine du client et genre de film</div>
      </div>

      {error && <div className="error-box">⚠ Erreur API : {error}</div>}

      {/* Heatmap */}
      <div className="card animate-in">
        <div className="card-title">Heatmap d'intensité — Top 20 pays</div>
        <div className="card-sub">REQUÊTE OLAP Q3 — fact_rental ⋈ dim_customer ⋈ dim_film</div>
        {loading
          ? <div className="loader"><div className="spinner"/> Chargement…</div>
          : (
            <div className="heatmap-wrap">
              <table className="heatmap-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingRight: 12 }}>Pays</th>
                    {categories?.map(c => (
                      <th key={c} style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", height: 80, verticalAlign: "bottom", paddingBottom: 6 }}>
                        {c}
                      </th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {countries?.map(country => {
                    const total = categories?.reduce((s, c) => s + (matrix?.[country]?.[c]?.rentals || 0), 0);
                    return (
                      <tr key={country}>
                        <td style={{ paddingRight: 12, color: "#e8ecf8", fontSize: 11, whiteSpace: "nowrap", fontWeight: 500 }}>
                          {country}
                        </td>
                        {categories?.map(cat => {
                          const val = matrix?.[country]?.[cat]?.rentals || 0;
                          const t   = maxVal ? val / maxVal : 0;
                          const bg  = lerp("#161b2b", "#00d4ff", t * 0.85);
                          const fc  = t > 0.5 ? "#0a0d14" : "#8892b0";
                          return (
                            <td key={cat}>
                              <div
                                className="heatmap-cell"
                                style={{ background: bg, color: fc }}
                                title={`${country} × ${cat} : ${val} locations`}
                              >
                                {val > 0 ? val : ""}
                              </div>
                            </td>
                          );
                        })}
                        <td style={{ fontFamily: "DM Mono", fontSize: 11, color: "#00d4ff", fontWeight: 600, paddingLeft: 8 }}>
                          {total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      {/* Top catégorie par pays */}
      {!loading && data && (
        <div className="card animate-in delay-1">
          <div className="card-title">Catégorie préférée par pays</div>
          <div className="card-sub">Genre le plus loué — tous pays confondus</div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr><th>Pays</th><th>Catégorie #1</th><th>Locations</th><th>CA total</th></tr>
              </thead>
              <tbody>
                {data.summary.slice(0, 15).map(s => (
                  <tr key={s.country}>
                    <td>{s.country}</td>
                    <td><span className="pill">{s.top_category}</span></td>
                    <td style={{ fontFamily: "DM Mono" }}>{s.top_rentals}</td>
                    <td style={{ fontFamily: "DM Mono", color: "#2de08e" }}>
                      ${s.all_categories.reduce((a, c) => a + c.total_revenue, 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
