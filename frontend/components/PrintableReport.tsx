"use client";

/**
 * GetEcoPulse — PrintableReport  (light-theme edition, A4-optimised)
 *
 * Off-screen component captured by html2canvas → jsPDF.
 *
 * Design principles:
 *  - Width 800 px → at html2canvas ×2 scale → 1 600 px canvas → 194 mm A4 content
 *    → 1 px = 0.243 mm = 0.688 pt  →  minimum 12 px font = 8.25 pt (readable)
 *  - White background — prints cleanly, looks professional
 *  - Dark navy header — brand identity preserved
 *  - No Tailwind, no web fonts — all inline styles, Arial only
 */

import React from "react";
import type { AuditResult } from "@/lib/api";

// ── Constants (mirrored from business_config.yaml) ─────────────────────────

const EUI_REF: Record<string, { kwh_m2: number; median_global: number; night_pct: number }> = {
  NAF_BUREAUX:      { kwh_m2: 150,  median_global: 160,  night_pct: 0.15 },
  NAF_INDUSTRIE:    { kwh_m2: 300,  median_global: 240,  night_pct: 0.30 },
  NAF_ENTREPOT:     { kwh_m2: 50,   median_global: 65,   night_pct: 0.20 },
  NAF_COMMERCE:     { kwh_m2: 200,  median_global: 250,  night_pct: 0.25 },
  NAF_ENSEIGNEMENT: { kwh_m2: 120,  median_global: 130,  night_pct: 0.10 },
  NAF_SANTE:        { kwh_m2: 350,  median_global: 400,  night_pct: 0.20 },
  NAF_HOTELLERIE:   { kwh_m2: 280,  median_global: 200,  night_pct: 0.25 },
};

const EMISSION_FACTORS: Record<string, number> = {
  FR: 0.052, DE: 0.380, GB: 0.233, ES: 0.195, IT: 0.372,
  NL: 0.290, BE: 0.167, PL: 0.773, US: 0.386, CA: 0.130,
  MX: 0.454, BR: 0.074, CN: 0.581, JP: 0.463, IN: 0.708,
  AU: 0.610, ZA: 0.928, DEFAULT: 0.400,
};

const GRADE_CFG: Record<string, { bg: string; border: string; text: string; label: string }> = {
  A: { bg: "#dcfce7", border: "#16a34a", text: "#14532d", label: "Leader sectoriel" },
  B: { bg: "#d1fae5", border: "#059669", text: "#064e3b", label: "Bonne performance" },
  C: { bg: "#fef9c3", border: "#ca8a04", text: "#713f12", label: "Dans la moyenne" },
  D: { bg: "#ffedd5", border: "#ea580c", text: "#7c2d12", label: "Sous la médiane IEA" },
  E: { bg: "#fee2e2", border: "#dc2626", text: "#7f1d1d", label: "Consommation excessive" },
  F: { bg: "#fce7f3", border: "#be185d", text: "#831843", label: "Urgence d'action" },
};

const NAF_LABELS: Record<string, string> = {
  NAF_BUREAUX:      "Bureaux & Tertiaire",
  NAF_INDUSTRIE:    "Industrie manufacturière",
  NAF_ENTREPOT:     "Entrepôt & Logistique",
  NAF_COMMERCE:     "Commerce & Distribution",
  NAF_ENSEIGNEMENT: "Enseignement",
  NAF_SANTE:        "Santé & Médico-social",
  NAF_HOTELLERIE:   "Hôtellerie & Restauration",
};

const ROOF_TYPE_FR: Record<string, string> = {
  flat: "Plat", gable: "Deux pentes", hip: "Quatre pentes",
  shed: "Shed / Bâtière", complex: "Complexe / Mixte", unknown: "Indéterminé",
};

// ── Utilities ──────────────────────────────────────────────────────────────

function azimuthLabel(deg: number) {
  const d = ((deg % 360) + 360) % 360;
  const dirs = ["Nord","Nord-Est","Est","Sud-Est","Sud","Sud-Ouest","Ouest","Nord-Ouest"];
  const dir  = dirs[Math.round(d / 45) % 8];
  const solar = d >= 135 && d <= 225 ? "optimal"
    : d >= 90  && d <= 270 ? "acceptable" : "défavorable";
  return { dir, solar };
}

function n(v: number, decimals = 0) {
  return v.toLocaleString("fr-FR", { maximumFractionDigits: decimals });
}

const formatSurface = (val: number | string): string => {
  const s = String(val).replace(/[$~^{}]/g, "").trim();
  const numStr = s.replace(/m²|m2/gi, "").replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(numStr);
  if (!isNaN(num) && num > 0)
    return new Intl.NumberFormat("fr-FR").format(Math.round(num)) + " m²";
  return String(val);
};

// ── Design tokens ──────────────────────────────────────────────────────────

const T = {
  // Backgrounds
  white:    "#ffffff",
  bgLight:  "#f8fafc",
  bgMid:    "#f1f5f9",

  // Borders
  border:   "#e2e8f0",
  borderMd: "#cbd5e1",

  // Text
  t900:     "#0f172a",
  t700:     "#334155",
  t500:     "#64748b",
  t400:     "#94a3b8",

  // Accent — green
  green700: "#15803d",
  green100: "#dcfce7",
  green50:  "#f0fdf4",
  greenBdr: "#86efac",

  // Blue
  blue700:  "#1d4ed8",
  blue100:  "#dbeafe",
  blue50:   "#eff6ff",

  // Header (dark — brand identity)
  navyDark: "#0f172a",
  navyMid:  "#1e293b",
  lime:     "#bef264",
  limeDim:  "rgba(190,242,100,0.15)",
  limeBdr:  "rgba(190,242,100,0.35)",
};

// ── Sub-components ─────────────────────────────────────────────────────────

function LoadProfileSvg({
  weekday_kw, weekend_kw, labels, peak_hours,
}: AuditResult["diagnostic"]["load_profile"]) {
  const count  = labels.length;
  const maxVal = Math.max(...weekday_kw, ...weekend_kw, 0.01);
  const H = 100;
  const PW = Math.max(14, Math.floor(720 / count));
  const BW = Math.max(4,  Math.floor(PW * 0.42));
  const W  = count * PW;
  return (
    <svg width={W} height={H + 22} style={{ display: "block", overflow: "visible" }}>
      {labels.map((label, i) => {
        const x   = i * PW;
        const wdH = Math.max((weekday_kw[i]  ?? 0) / maxVal * H, 1);
        const weH = Math.max((weekend_kw[i]  ?? 0) / maxVal * H, 1);
        const pk  = i >= peak_hours[0] && i < peak_hours[1];
        return (
          <g key={i}>
            <rect x={x}            y={H - wdH} width={BW} height={wdH}
              fill={pk ? "#16a34a" : "#4ade80"} opacity={0.9} rx={1} />
            <rect x={x + BW + 1}   y={H - weH} width={BW} height={weH}
              fill="#60a5fa" opacity={0.7} rx={1} />
            {(i % 6 === 0) && (
              <text x={x + BW} y={H + 14} textAnchor="middle" fontSize={9}
                fill="#94a3b8" fontFamily="ui-monospace,monospace">{label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SectionBar({ n: num, title }: { n: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <span style={{
        fontFamily: "ui-monospace,monospace", fontSize: 11, fontWeight: 700,
        color: T.green700, background: T.green50, border: `1px solid ${T.greenBdr}`,
        borderRadius: 4, padding: "2px 9px", flexShrink: 0,
      }}>{num}</span>
      <span style={{ fontSize: 17, fontWeight: 700, color: T.t900 }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );
}

function Stat({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{
      background: T.white, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: "12px 14px",
      borderTop: accent ? `3px solid ${T.green700}` : `3px solid ${T.borderMd}`,
    }}>
      <p style={{ fontSize: 10, color: T.t500, textTransform: "uppercase",
        letterSpacing: "0.07em", margin: "0 0 4px", fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700,
        color: accent ? T.green700 : T.t900, margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: T.t400, marginTop: 3 }}>{sub}</p>}
    </div>
  );
}

function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div style={{
      background: T.bgLight, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: "14px",
      borderLeft: `4px solid ${color}`,
    }}>
      <p style={{ fontSize: 11, color: T.t500, margin: "0 0 5px",
        textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: T.t400, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function AppRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 12,
      padding: "6px 0", borderBottom: `1px solid ${T.bgMid}`,
    }}>
      <span style={{ width: 210, fontSize: 11, color: T.t500,
        flexShrink: 0, wordBreak: "break-word" }}>{label}</span>
      <span style={{ flex: 1, fontSize: 11, color: T.t900,
        fontWeight: 500, wordBreak: "break-word" }}>{value}</span>
      {note && <span style={{ fontSize: 10, color: T.t400, textAlign: "right",
        flexShrink: 0, maxWidth: 200, wordBreak: "break-word" }}>{note}</span>}
    </div>
  );
}

function Formula({ text, result }: { text: string; result?: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: T.green50, border: `1px solid ${T.greenBdr}`,
      borderRadius: 6, padding: "7px 12px", marginBottom: 5,
    }}>
      <code style={{ fontSize: 11, color: T.green700, fontFamily: "ui-monospace,monospace" }}>
        {text}
      </code>
      {result && (
        <span style={{ fontSize: 11, color: T.t500, marginLeft: 16,
          flexShrink: 0, fontStyle: "italic" }}>{result}</span>
      )}
    </div>
  );
}

function AnnexTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 700, color: T.green700,
      letterSpacing: "0.08em", margin: "0 0 8px",
      textTransform: "uppercase", borderLeft: `3px solid ${T.green700}`,
      paddingLeft: 8,
    }}>{children}</p>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export interface PrintableReportProps {
  audit:      AuditResult;
  diag:       AuditResult["diagnostic"];
  nafCode:    string;
  isRealData: boolean;
}

const PrintableReport = React.forwardRef<HTMLDivElement, PrintableReportProps>(
  function PrintableReport({ audit, diag, nafCode, isRealData }, ref) {
    const phys = audit.physical_data;
    const fin  = audit.financial_projection;
    const pc   = audit.plausibility_check;

    const dateStr = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric",
    });

    const surfaceM2  = phys.footprint.area_m2 ?? phys.roof_analysis.surface_m2_used;
    const sector     = EUI_REF[nafCode];
    const euiUsed    = sector?.kwh_m2     ?? Math.round(fin.theoretical_consumption_kwh_year / Math.max(surfaceM2, 1));
    const euiMedian  = sector?.median_global ?? euiUsed;
    const countryCode = (audit.country_code ?? "DEFAULT").toUpperCase();
    const emFactor   = EMISSION_FACTORS[countryCode] ?? EMISSION_FACTORS.DEFAULT;
    const { dir: azDir, solar: azSolar } = azimuthLabel(phys.roof_analysis.azimuth_degrees);

    const grade    = diag.grade && diag.grade !== "N/A" ? diag.grade : null;
    const gradeCfg = grade ? (GRADE_CFG[grade] ?? GRADE_CFG.F) : null;

    return (
      <div
        ref={ref}
        style={{
          position: "absolute",
          left: -9999,
          top: 0,
          width: 800,
          background: T.white,
          color: T.t900,
          fontFamily: "Arial, Helvetica, sans-serif",
          fontVariantLigatures: "none",
          WebkitFontSmoothing: "auto",
          textRendering: "auto",
        }}
      >
        {/* ════════════════════════════════════════════════════
            HEADER — dark navy brand bar
        ════════════════════════════════════════════════════ */}
        <div style={{
          background: T.navyDark,
          borderBottom: `3px solid ${T.lime}`,
          padding: "24px 32px 20px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              {/* Logo */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: T.lime, letterSpacing: "-0.01em" }}>
                  GetEcoPulse
                </span>
                <span style={{ fontSize: 9, color: "#475569", letterSpacing: "0.2em",
                  textTransform: "uppercase", marginLeft: 2 }}>PoC</span>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff",
                margin: "0 0 8px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                Rapport d&apos;Audit Énergétique Bâtiment
              </h1>
              <p style={{ fontSize: 13, color: "#94a3b8", margin: 0,
                maxWidth: 460, lineHeight: 1.5, wordBreak: "break-word" }}>
                {audit.address}
              </p>
              <p style={{ fontSize: 11, color: "#475569", margin: "5px 0 0",
                fontFamily: "ui-monospace,monospace" }}>
                {audit.coordinates.lat.toFixed(5)},&nbsp;{audit.coordinates.lon.toFixed(5)}
              </p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 20 }}>
              <p style={{ fontSize: 9, color: "#475569", margin: "0 0 3px",
                textTransform: "uppercase", letterSpacing: "0.1em" }}>Généré le</p>
              <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 12px" }}>{dateStr}</p>
              <div style={{
                padding: "6px 14px",
                background: isRealData ? T.limeDim : "rgba(245,158,11,0.12)",
                border: `1px solid ${isRealData ? T.limeBdr : "rgba(245,158,11,0.4)"}`,
                borderRadius: 6, fontSize: 10,
                color: isRealData ? T.lime : "#fbbf24",
                fontWeight: 700, letterSpacing: "0.02em",
              }}>
                {isRealData ? "✅ Données Linky réelles" : "⚠ Estimation sectorielle ±30%"}
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════
            BODY
        ════════════════════════════════════════════════════ */}
        <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ──────────────────────────────────────────────
              01 — Identité & Emprise
          ────────────────────────────────────────────── */}
          <section>
            <SectionBar n="01" title="Identité & Emprise" />

            {/* Satellite image — side by side layout */}
            <div style={{ display: "flex", gap: 16, marginBottom: 14, alignItems: "flex-start" }}>

              {/* Image (left, 55%) */}
              {audit.satellite_image_url && (
                <div style={{
                  flex: "0 0 55%", borderRadius: 8, overflow: "hidden",
                  border: `1px solid ${T.border}`, lineHeight: 0,
                  background: T.bgLight,
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={audit.satellite_image_url}
                    alt="Vue satellite"
                    crossOrigin="anonymous"
                    style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }}
                  />
                </div>
              )}

              {/* Right column: 4 stats + info boxes */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Stat
                    label="Surface de calcul"
                    value={formatSurface(phys.roof_analysis.surface_m2_used)}
                    sub={`Source : ${phys.footprint.source === "fallback" ? "Vision IA" : phys.footprint.source.toUpperCase()}`}
                    accent
                  />
                  <Stat
                    label="Type de toit"
                    value={ROOF_TYPE_FR[phys.roof_analysis.roof_type] ?? phys.roof_analysis.roof_type}
                    sub={`Confiance : ${phys.roof_analysis.confidence}`}
                  />
                  <Stat
                    label="Orientation"
                    value={azDir}
                    sub={`${phys.roof_analysis.azimuth_degrees}° — ${azSolar}`}
                    accent={azSolar === "optimal"}
                  />
                  <Stat
                    label="Irradiance locale"
                    value={`${phys.climate.dni_annual_kwh_m2}`}
                    sub={`kWh/m²/an · ${phys.climate.year}`}
                    accent
                  />
                </div>

                {/* Vision IA reasoning */}
                <div style={{
                  background: T.bgLight, border: `1px solid ${T.border}`,
                  borderRadius: 8, padding: "10px 12px", fontSize: 11, color: T.t500,
                  lineHeight: 1.5,
                }}>
                  <span style={{ fontWeight: 600, color: T.t700 }}>Vision IA : </span>
                  {phys.roof_analysis.reasoning}
                </div>

                {/* Business context */}
                {pc && pc.activity_type !== "N/A" && (
                  <div style={{
                    background: T.bgLight, border: `1px solid ${T.border}`,
                    borderRadius: 8, padding: "10px 12px", fontSize: 11, color: T.t500,
                    lineHeight: 1.5,
                  }}>
                    <span style={{ fontWeight: 600, color: T.t700 }}>Activité : </span>
                    <span style={{ color: T.t900 }}>{pc.activity_type}</span>
                    <span style={{ color: T.t400, marginLeft: 8 }}>
                      · Plausibilité : <strong style={{ color: T.t700 }}>{pc.surface_plausibility}</strong>
                    </span>
                    {pc.coherence_ratio != null && (
                      <span style={{ color: T.t400, marginLeft: 6 }}>
                        · Ratio V/OSM : {pc.coherence_ratio}×
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Obstructions — full width */}
            {phys.roof_analysis.obstructions.length > 0 && (
              <div style={{
                background: T.bgLight, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: "9px 14px", fontSize: 11, color: T.t500,
              }}>
                <span style={{ fontWeight: 600, color: T.t700 }}>Obstructions détectées : </span>
                {phys.roof_analysis.obstructions.join(", ")}
              </div>
            )}
          </section>

          {/* ──────────────────────────────────────────────
              02 — Diagnostic de Consommation
          ────────────────────────────────────────────── */}
          <section>
            <SectionBar n="02" title="Diagnostic de Consommation" />

            {/* Chart */}
            <div style={{
              background: T.bgLight, border: `1px solid ${T.border}`,
              borderRadius: 10, padding: "16px 18px", marginBottom: 14,
            }}>
              <p style={{ fontSize: 11, color: T.t500, textTransform: "uppercase",
                letterSpacing: "0.08em", margin: "0 0 12px", fontWeight: 600 }}>
                Profil de charge journalier
                {isRealData ? " — données Enedis réelles" : " — estimation sectorielle"}
              </p>
              <div style={{ overflow: "hidden" }}>
                <LoadProfileSvg {...diag.load_profile} />
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 11, color: T.t400 }}>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10,
                    background: "#4ade80", borderRadius: 2, marginRight: 5 }} />
                  Sem. (heures creuses)
                </span>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10,
                    background: "#16a34a", borderRadius: 2, marginRight: 5 }} />
                  Sem. (heures pleines)
                </span>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10,
                    background: "#60a5fa", borderRadius: 2, marginRight: 5 }} />
                  Week-end
                </span>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>
              <KpiCard
                label="Consommation annuelle"
                value={`${n(diag.theoretical_annual_consumption_kwh / 1000)} MWh/an`}
                sub={`${n(diag.theoretical_annual_consumption_kwh)} kWh`}
                color={T.t700}
              />
              <KpiCard
                label="Gaspillage nocturne"
                value={`${n(diag.estimated_waste_kwh / 1000)} MWh/an`}
                sub={`Talon : ${Math.round(diag.night_talon_pct * 100)}% · ${diag.wasted_tco2e} tCO₂e/an`}
                color="#ea580c"
              />
              <KpiCard
                label="Économie potentielle"
                value={`${n(diag.opex_savings_eur_per_year)} €/an`}
                sub={`ROI : ${diag.opex_roi}`}
                color={T.green700}
              />
            </div>

            {/* Grade + ISO */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {gradeCfg && (
                <div style={{
                  background: gradeCfg.bg,
                  border: `2px solid ${gradeCfg.border}`,
                  borderRadius: 10, padding: "14px 18px",
                  display: "flex", alignItems: "center", gap: 16,
                }}>
                  <div style={{
                    width: 52, height: 52, background: gradeCfg.border,
                    borderRadius: 10, display: "flex", alignItems: "center",
                    justifyContent: "center", flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>{grade}</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: gradeCfg.text, textTransform: "uppercase",
                      letterSpacing: "0.08em", margin: "0 0 3px", fontWeight: 700, opacity: 0.7 }}>
                      GetEcoPulse Grade
                    </p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: gradeCfg.text, margin: 0 }}>
                      {gradeCfg.label}
                    </p>
                    <p style={{ fontSize: 11, color: gradeCfg.text, marginTop: 3, opacity: 0.75 }}>
                      vs médiane IEA mondiale ({euiMedian} kWh/m²/an)
                    </p>
                  </div>
                </div>
              )}
              {diag.iso_50001_assessment && (
                <div style={{
                  background: T.bgLight, border: `1px solid ${T.border}`,
                  borderRadius: 10, padding: "14px 18px",
                }}>
                  <p style={{ fontSize: 10, color: T.t500, textTransform: "uppercase",
                    letterSpacing: "0.08em", margin: "0 0 10px", fontWeight: 700 }}>
                    Pré-évaluation ISO 50001
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      {
                        ok: diag.iso_50001_assessment.has_30min_data,
                        ok_text:  "Mesure continue validée (§6.3)",
                        ko_text: "Défaut de mesure continue (§6.3)",
                      },
                      {
                        ok: diag.iso_50001_assessment.has_quantified_baseline,
                        ok_text:  "Talon de nuit documenté (§6.6)",
                        ko_text: "Talon de consommation non piloté (§6.6)",
                      },
                    ].map((item, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8,
                        fontSize: 12 }}>
                        <span style={{
                          fontSize: 14,
                          color: item.ok ? T.green700 : "#dc2626", flexShrink: 0,
                        }}>
                          {item.ok ? "✓" : "✗"}
                        </span>
                        <span style={{ color: item.ok ? T.green700 : "#dc2626", fontWeight: 500 }}>
                          {item.ok ? item.ok_text : item.ko_text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ──────────────────────────────────────────────
              03 — Plan d'Action & Scénarios
          ────────────────────────────────────────────── */}
          <section>
            <SectionBar n="03" title="Plan d'Action & Scénarios" />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>

              {/* OPEX — Night curtailment */}
              <div style={{
                background: T.white, border: `2px solid ${T.green700}`,
                borderRadius: 10, padding: "16px", position: "relative",
              }}>
                <div style={{
                  position: "absolute", top: -11, left: 14,
                  background: T.green700, color: "#fff",
                  fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
                  letterSpacing: "0.06em",
                }}>PRIORITAIRE</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>🌙</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: T.t900, margin: 0 }}>
                      Effacement Talon de Nuit
                    </p>
                    <p style={{ fontSize: 11, color: T.t500, margin: 0 }}>
                      OPEX — sans investissement
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {([
                    ["Économie annuelle",  `${n(diag.opex_savings_eur_per_year)} €/an`],
                    ["Gaspillage ciblé",   `${n(diag.estimated_waste_kwh / 1000)} MWh/an`],
                    ["Talon nocturne",     `${Math.round(diag.night_talon_pct * 100)} %`],
                    ["Investissement",     `${n(diag.opex_capex_eur)} €`],
                  ] as [string,string][]).map(([lbl, val]) => (
                    <div key={lbl} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: T.bgLight, borderRadius: 6, padding: "6px 10px",
                    }}>
                      <span style={{ fontSize: 11, color: T.t500 }}>{lbl}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.green700 }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 10,
                  paddingTop: 8, fontSize: 12, color: T.t500 }}>
                  ROI : <span style={{ color: T.green700, fontWeight: 700 }}>{diag.opex_roi}</span>
                </div>
              </div>

              {/* Solar PV */}
              <div style={{
                background: T.white, border: `2px solid ${T.blue700}`,
                borderRadius: 10, padding: "16px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>☀️</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: T.t900, margin: 0 }}>
                      Installation Solaire
                    </p>
                    <p style={{ fontSize: 11, color: T.t500, margin: 0 }}>
                      CAPEX — Autoconsommation PV
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {([
                    ["CAPEX estimé",    `${n(fin.capex_eur / 1000, 0)} k€`],
                    ["Économie ann.",   `${n(fin.annual_savings_eur / 1000, 0)} k€/an`],
                    ["Puissance crête", `${phys.solar_potential.peak_power_kwp.toFixed(0)} kWp`],
                    ["Couverture",      `${fin.solar_coverage_pct} %`],
                  ] as [string,string][]).map(([lbl, val]) => (
                    <div key={lbl} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: T.bgLight, borderRadius: 6, padding: "6px 10px",
                    }}>
                      <span style={{ fontSize: 11, color: T.t500 }}>{lbl}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.blue700 }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 10,
                  paddingTop: 8, fontSize: 12, color: T.t500 }}>
                  ROI : <span style={{ color: T.blue700, fontWeight: 700 }}>
                    {fin.roi_years !== null ? `${fin.roi_years} ans` : "Non calculable"}
                  </span>
                </div>
              </div>

              {/* Thermal — coming soon */}
              <div style={{
                background: T.bgLight, border: `1px solid ${T.border}`,
                borderRadius: 10, padding: "16px", opacity: 0.6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>🔥</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: T.t700, margin: 0 }}>
                      Isolation Thermique
                    </p>
                    <p style={{ fontSize: 11, color: T.t500, margin: 0 }}>
                      Pertes par la toiture
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {([
                    ["Risque thermique", phys.thermal_assessment.risk_level],
                    ["Score de perte",  `${Math.round(phys.thermal_assessment.score * 100)} %`],
                  ] as [string,string][]).map(([lbl, val]) => (
                    <div key={lbl} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: T.white, borderRadius: 6, padding: "6px 10px",
                    }}>
                      <span style={{ fontSize: 11, color: T.t500 }}>{lbl}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.t700 }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 10,
                  paddingTop: 8, fontSize: 11, color: T.t400, fontStyle: "italic" }}>
                  Module en cours de développement
                </div>
              </div>
            </div>
          </section>

          {/* ════════════════════════════════════════════════════
              ANNEXES TECHNIQUES
          ════════════════════════════════════════════════════ */}
          <section>
            <div style={{
              borderTop: `2px solid ${T.border}`,
              paddingTop: 22, marginBottom: 18,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 800, color: T.green700,
                letterSpacing: "0.18em", textTransform: "uppercase",
              }}>ANNEXES TECHNIQUES</span>
              <div style={{ flex: 1, height: 1, background: T.border }} />
            </div>

            <div style={{
              background: T.bgLight, border: `1px solid ${T.border}`,
              borderRadius: 12, padding: "22px 26px",
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: T.t900,
                margin: "0 0 20px", letterSpacing: "-0.01em" }}>
                Notes de Calculs &amp; Hypothèses
              </h3>

              {/* A. Géospatiales */}
              <div style={{ marginBottom: 20 }}>
                <AnnexTitle>A. Données Géospatiales</AnnexTitle>
                <AppRow label="Source de la surface"
                  value={phys.footprint.source === "fallback" ? "Vision IA" : phys.footprint.source.toUpperCase()}
                  note={phys.footprint.area_m2 ? `Empreinte OSM brute : ${n(phys.footprint.area_m2)} m²` : "Aucun polygone OSM disponible"} />
                <AppRow label="Surface Vision IA"
                  value={formatSurface(phys.roof_analysis.surface_m2_vision)}
                  note="Estimation Vision IA via image satellite" />
                <AppRow label="Surface de calcul retenue"
                  value={formatSurface(phys.roof_analysis.surface_m2_used)}
                  note={`Confiance : ${phys.roof_analysis.confidence}`} />
                {pc?.coherence_ratio != null && (
                  <AppRow label="Ratio cohérence Vision / OSM"
                    value={`${pc.coherence_ratio}×`} note={pc.coherence_flag} />
                )}
                <AppRow label="Azimuth du toit"
                  value={`${phys.roof_analysis.azimuth_degrees}° — ${azDir}`}
                  note={`Exposition solaire : ${azSolar}`} />
                <AppRow label="Obstructions détectées"
                  value={phys.roof_analysis.obstructions.length === 0
                    ? "Aucune" : phys.roof_analysis.obstructions.join(", ")} />
                <AppRow label="Facteur d'orientation solaire"
                  value={phys.solar_potential.orientation_factor.toFixed(3)}
                  note="1.000 = exposition plein Sud optimale" />
                <AppRow label="Facteur d'ombrage / obstruction"
                  value={phys.solar_potential.obstruction_factor.toFixed(3)}
                  note="1.000 = surface libre sans ombrage" />
                <AppRow label="Surface PV exploitable"
                  value={formatSurface(phys.solar_potential.usable_surface_m2)}
                  note="= surface × 0.85 (marge structurale) × facteur obstruction" />
                <AppRow label="Zoom satellite utilisé"
                  value={`Niveau ${phys.footprint.zoom_used}`}
                  note="Mapbox Static API — satellite-v9" />
              </div>

              {/* B. Sectoriels */}
              <div style={{ marginBottom: 20 }}>
                <AnnexTitle>B. Paramètres Sectoriels</AnnexTitle>
                <AppRow label="Code NAF / Secteur"
                  value={`${nafCode} — ${NAF_LABELS[nafCode] ?? fin.naf_sector}`} />
                <AppRow label="EUI de référence (calcul)"
                  value={`${euiUsed} kWh/m²/an`}
                  note="Consommation de référence utilisée pour le calcul" />
                <AppRow label="EUI médiane IEA mondiale"
                  value={`${euiMedian} kWh/m²/an`}
                  note="Benchmark pour le classement GetEcoPulse Grade" />
                <AppRow label="Prix de l'énergie"
                  value={`${fin.energy_price_eur_kwh} €/kWh`}
                  note="Tarif industriel moyen France HT" />
                <AppRow label="Facteur d'émission Scope 2"
                  value={`${emFactor} kg CO₂e/kWh`}
                  note={`Pays : ${countryCode} — Source : IEA 2023 market-based`} />
                <AppRow label="Talon de nuit sectoriel"
                  value={`${sector ? Math.round(sector.night_pct * 100) : Math.round(diag.night_talon_pct * 100)} %`}
                  note="Fraction hors heures d'exploitation" />
              </div>

              {/* C. Formules */}
              <div style={{ marginBottom: 20 }}>
                <AnnexTitle>C. Formules de Calcul</AnnexTitle>
                {isRealData ? (
                  <Formula text="Consommation annuelle = Mesure directe Enedis / Linky"
                    result={`= ${n(diag.theoretical_annual_consumption_kwh)} kWh/an`} />
                ) : (
                  <Formula
                    text={`Conso. = ${formatSurface(phys.roof_analysis.surface_m2_used)} × ${euiUsed} kWh/m²/an`}
                    result={`= ${n(diag.theoretical_annual_consumption_kwh)} kWh/an`} />
                )}
                <Formula
                  text={`Gaspillage = ${n(diag.theoretical_annual_consumption_kwh)} kWh × ${Math.round(diag.night_talon_pct * 100)}%`}
                  result={`= ${n(diag.estimated_waste_kwh)} kWh/an`} />
                <Formula
                  text={`Coût gaspillage = ${n(diag.estimated_waste_kwh)} kWh × ${fin.energy_price_eur_kwh} €/kWh`}
                  result={`= ${n(diag.opex_savings_eur_per_year)} €/an`} />
                <Formula
                  text={`Emissions Scope 2 = ${n(diag.estimated_waste_kwh)} kWh × ${emFactor} kg/kWh ÷ 1000`}
                  result={`= ${diag.wasted_tco2e} tCO₂e/an`} />
                <Formula
                  text={`Puissance PV = ${formatSurface(phys.solar_potential.usable_surface_m2)} ÷ 5.5 m²/kWp`}
                  result={`= ${phys.solar_potential.peak_power_kwp.toFixed(1)} kWc`} />
                <Formula
                  text={`Production PV = ${phys.solar_potential.peak_power_kwp.toFixed(1)} kWc × ${phys.climate.dni_annual_kwh_m2} kWh/m²/an × 0.80`}
                  result={`≈ ${n(phys.solar_potential.annual_production_kwh)} kWh/an`} />
              </div>

              {/* D. Marges */}
              <div style={{ marginBottom: 0 }}>
                <AnnexTitle>D. Marges &amp; Incertitudes</AnnexTitle>
                <AppRow label="Type de données"
                  value={isRealData
                    ? "Enedis / Linky — mesures terrain directes"
                    : "Synthétique — profil sectoriel IEA"} />
                <AppRow label="Marge d'incertitude"
                  value={isRealData ? "±5% (précision compteur)" : "±30% (variance sectorielle)"}
                  note={isRealData ? undefined : "Scénario bas × 0.70 / Scénario haut × 1.30"} />
                <AppRow label="Fiabilité de la surface"
                  value={phys.roof_analysis.confidence}
                  note={`Vision IA : ${formatSurface(phys.roof_analysis.surface_m2_vision)}${phys.footprint.area_m2 ? ` / OSM : ${formatSurface(phys.footprint.area_m2)}` : ""}`} />
                <AppRow label="Modèle IA — analyse toiture"
                  value="Modèle Vision IA propriétaire"
                  note="temperature=0.1 · 3 tentatives · réponse JSON contrôlée" />
                <AppRow label="Baseline ISO 50001"
                  value={diag.iso_50001_assessment.has_quantified_baseline
                    ? "Établie — talon documenté (§6.6)"
                    : "Non établie — données insuffisantes"} />
                <AppRow label="GetEcoPulse Grade"
                  value={grade ?? "N/A"}
                  note={grade
                    ? `EUI vs médiane IEA ${euiMedian} kWh/m²/an (${NAF_LABELS[nafCode] ?? fin.naf_sector})`
                    : "Surface insuffisante pour calculer l'EUI"} />
              </div>
            </div>
          </section>

          {/* Footer disclaimer */}
          <div style={{
            borderTop: `1px solid ${T.border}`, paddingTop: 10, paddingBottom: 4,
          }}>
            <p style={{ fontSize: 10, color: T.t400, margin: 0, textAlign: "center", lineHeight: 1.5 }}>
              Ce rapport est généré automatiquement à titre informatif et ne constitue pas un audit
              énergétique réglementaire (décret tertiaire, BACS, CEE).
              Estimations basées sur données publiques et profils sectoriels IEA. — GetEcoPulse PoC v1.0
            </p>
          </div>

        </div>
      </div>
    );
  }
);

export default PrintableReport;
