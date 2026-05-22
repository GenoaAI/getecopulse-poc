"use client";

/**
 * GetEcoPulse — PrintableReport
 *
 * Off-screen component rendered at position: absolute; left: -9999px.
 * Captured by html2canvas via a forwarded ref to produce the PDF.
 *
 * Rules:
 *  - No dynamic imports (no Recharts, no Leaflet) — pure React / HTML / SVG
 *  - Inline styles for all layout-critical properties (html2canvas reads computed styles)
 *  - Tailwind used only for colour tokens that Tailwind injects as global CSS
 */

import React from "react";
import type { AuditResult } from "@/lib/api";

// ── Business config constants (mirrored from business_config.yaml) ────────────

const EUI_REF: Record<string, { kwh_m2: number; median_global: number; night_pct: number }> = {
  NAF_BUREAUX:      { kwh_m2: 150,  median_global: 160,  night_pct: 0.15 },
  NAF_INDUSTRIE:    { kwh_m2: 300,  median_global: 240,  night_pct: 0.30 },
  NAF_ENTREPOT:     { kwh_m2: 50,   median_global: 65,   night_pct: 0.20 },
  NAF_COMMERCE:     { kwh_m2: 200,  median_global: 250,  night_pct: 0.25 },
  NAF_ENSEIGNEMENT: { kwh_m2: 120,  median_global: 130,  night_pct: 0.10 },
  NAF_SANTE:        { kwh_m2: 350,  median_global: 400,  night_pct: 0.20 },
  NAF_HOTELLERIE:   { kwh_m2: 280,  median_global: 200,  night_pct: 0.25 },
};

/** IEA 2023 electricity emission factors (kgCO₂/kWh) */
const EMISSION_FACTORS: Record<string, number> = {
  FR: 0.052, DE: 0.380, GB: 0.233, ES: 0.195, IT: 0.372,
  NL: 0.290, BE: 0.167, PL: 0.773, US: 0.386, CA: 0.130,
  MX: 0.454, BR: 0.074, CN: 0.581, JP: 0.463, IN: 0.708,
  AU: 0.610, ZA: 0.928, DEFAULT: 0.400,
};

const GRADE_CFG: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: "#065f46", text: "#a7f3d0", label: "Leader sectoriel" },
  B: { bg: "#16a34a", text: "#dcfce7", label: "Bonne performance" },
  C: { bg: "#ca8a04", text: "#fef08a", label: "Dans la moyenne" },
  D: { bg: "#ea580c", text: "#ffedd5", label: "Sous la médiane IEA" },
  E: { bg: "#dc2626", text: "#fee2e2", label: "Consommation excessive" },
  F: { bg: "#7f1d1d", text: "#fca5a5", label: "Urgence d'action" },
};

/** Human-readable NAF sector labels (mirrored from config) */
const NAF_LABELS: Record<string, string> = {
  NAF_BUREAUX:      "Bureaux & Tertiaire",
  NAF_INDUSTRIE:    "Industrie manufacturière",
  NAF_ENTREPOT:     "Entrepôt & Logistique",
  NAF_COMMERCE:     "Commerce & Distribution",
  NAF_ENSEIGNEMENT: "Enseignement",
  NAF_SANTE:        "Santé & Médico-social",
  NAF_HOTELLERIE:   "Hôtellerie & Restauration",
};

/** French translation for Gemini roof_type enum values */
const ROOF_TYPE_FR: Record<string, string> = {
  flat:    "Plat",
  gable:   "Deux pentes",
  hip:     "Quatre pentes",
  shed:    "Shed / Bâtière",
  complex: "Complexe / Mixte",
  unknown: "Indéterminé",
};

// ── Utilities ─────────────────────────────────────────────────────────────────

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

/**
 * Format a surface value robustly.
 * Handles both plain numbers (5400 → "5 400 m²") and LaTeX strings
 * from Vision IA (e.g. "$7~036~m^{2}$" → "7 036 m²").
 * Always returns a fr-FR locale formatted string with "m²" suffix.
 */
const formatSurface = (val: number | string): string => {
  // 1. Strip LaTeX artefacts: $, ~, ^, {, }
  const s = String(val).replace(/[$~^{}]/g, "").trim();
  // 2. Remove any trailing "m²" / "m2" so we can re-add it formatted
  const numStr = s.replace(/m²|m2/gi, "").replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(numStr);
  if (!isNaN(num) && num > 0) {
    return new Intl.NumberFormat("fr-FR").format(Math.round(num)) + " m²";
  }
  return String(val); // fallback: return raw value
};

// ── Sub-components ────────────────────────────────────────────────────────────

/** Simple SVG load-profile bar chart — no external library */
function LoadProfileSvg({
  weekday_kw, weekend_kw, labels, peak_hours,
}: AuditResult["diagnostic"]["load_profile"]) {
  const count  = labels.length;
  const maxVal = Math.max(...weekday_kw, ...weekend_kw, 0.01);
  const H = 88;
  // Adaptive sizing: always fit within 800px regardless of slot count (24h or 48×30min)
  const PW = Math.max(14, Math.floor(800 / count)); // pair width per slot
  const BW = Math.max(4,  Math.floor(PW * 0.42));   // individual bar width
  const G  = 1;
  const W  = count * PW;

  return (
    <svg width={W} height={H + 22} style={{ display: "block", overflow: "visible" }}>
      {labels.map((label, i) => {
        const x    = i * PW;
        const wdH  = Math.max((weekday_kw[i]  ?? 0) / maxVal * H, 1);
        const weH  = Math.max((weekend_kw[i]  ?? 0) / maxVal * H, 1);
        const peak = i >= peak_hours[0] && i < peak_hours[1];
        return (
          <g key={i}>
            <rect x={x} y={H - wdH} width={BW} height={wdH}
              fill={peak ? "#bef264" : "#4ade80"} opacity={0.85} rx={1} />
            <rect x={x + BW + G} y={H - weH} width={BW} height={weH}
              fill="#60a5fa" opacity={0.7} rx={1} />
            {(i % 6 === 0) && (
              <text x={x + BW} y={H + 14} textAnchor="middle" fontSize={8}
                fill="#64748b" fontFamily="ui-monospace,monospace">
                {label}
              </text>
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
        fontFamily: "ui-monospace,monospace", fontSize: 9, color: "#bef264",
        background: "rgba(190,242,100,0.1)", border: "1px solid rgba(190,242,100,0.3)",
        borderRadius: 4, padding: "2px 7px", flexShrink: 0,
      }}>{num}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: "rgba(190,242,100,0.12)" }} />
    </div>
  );
}

function Stat({ label, value, sub, lime }: {
  label: string; value: string; sub?: string; lime?: boolean;
}) {
  return (
    <div style={{
      background: "#1e293b", border: "1px solid rgba(71,85,105,0.4)",
      borderRadius: 10, padding: "11px 13px",
      pageBreakInside: "avoid", breakInside: "avoid",
    }}>
      <p style={{ fontSize: 8, color: "#94a3b8", textTransform: "uppercase",
        letterSpacing: "0.08em", margin: "0 0 3px 0" }}>{label}</p>
      <p style={{ fontSize: 17, fontWeight: 700, color: lime ? "#bef264" : "#fff", margin: 0 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 8, color: "#64748b", marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

function AppRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 10,
      padding: "5px 0", borderBottom: "1px solid rgba(51,65,85,0.4)",
      pageBreakInside: "avoid", breakInside: "avoid",
    }}>
      <span style={{ width: 210, fontSize: 9.5, color: "#94a3b8", flexShrink: 0,
        wordBreak: "break-word" }}>{label}</span>
      <span style={{ flex: 1, fontSize: 9.5, color: "#e2e8f0", fontWeight: 500,
        wordBreak: "break-word" }}>{value}</span>
      {note && <span style={{ fontSize: 8.5, color: "#64748b", textAlign: "right", flexShrink: 0,
        maxWidth: 220, wordBreak: "break-word" }}>{note}</span>}
    </div>
  );
}

function Formula({ text, result }: { text: string; result?: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: "rgba(15,23,42,0.8)", border: "1px solid rgba(51,65,85,0.5)",
      borderRadius: 6, padding: "6px 12px", marginBottom: 5,
    }}>
      <code style={{ fontSize: 9.5, color: "#bef264", fontFamily: "ui-monospace,monospace" }}>
        {text}
      </code>
      {result && (
        <span style={{ fontSize: 9.5, color: "#94a3b8", fontStyle: "italic",
          marginLeft: 16, flexShrink: 0 }}>
          {result}
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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

    // Resolved values
    const surfaceM2 = phys.footprint.area_m2 ?? phys.roof_analysis.surface_m2_used;
    const sector    = EUI_REF[nafCode];
    const euiUsed   = sector?.kwh_m2   ?? Math.round(fin.theoretical_consumption_kwh_year / Math.max(surfaceM2, 1));
    const euiMedian = sector?.median_global ?? euiUsed;
    const countryCode  = (audit.country_code ?? "DEFAULT").toUpperCase();
    const emFactor  = EMISSION_FACTORS[countryCode] ?? EMISSION_FACTORS.DEFAULT;
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
          width: 920,
          overflow: "hidden",
          background: "#0f172a",
          color: "#fff",
          // Arial is a system font guaranteed to be loaded before html2canvas fires —
          // avoids the cyrillic/glyph-swap artefact caused by async web-font loading.
          fontFamily: "Arial, Helvetica, sans-serif",
          fontVariantLigatures: "none",
          WebkitFontSmoothing: "auto",
          textRendering: "auto",
        }}
      >
        {/* ══════════════════════════════════════════════════════════
            COVER HEADER
        ══════════════════════════════════════════════════════════ */}
        <div style={{
          background: "linear-gradient(135deg,#1e293b 0%,#0f172a 100%)",
          borderBottom: "2px solid #bef264",
          padding: "28px 36px 24px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              {/* Logo row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>⚡</span>
                <span style={{ fontSize: 17, fontWeight: 800, color: "#bef264", letterSpacing: "-0.01em" }}>
                  GetEcoPulse
                </span>
                <span style={{ fontSize: 8, color: "#475569", letterSpacing: "0.18em",
                  textTransform: "uppercase" }}>PoC</span>
              </div>
              <h1 style={{ fontSize: 21, fontWeight: 700, color: "#fff",
                margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                Rapport d&apos;Audit Énergétique Bâtiment
              </h1>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: 0, maxWidth: 520,
                lineHeight: 1.5, wordBreak: "break-word", overflowWrap: "break-word" }}>
                {audit.address}
              </p>
              <p style={{ fontSize: 10, color: "#64748b", margin: "6px 0 0",
                fontFamily: "ui-monospace,monospace" }}>
                {audit.coordinates.lat.toFixed(5)}, {audit.coordinates.lon.toFixed(5)}
              </p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ fontSize: 8, color: "#475569", margin: "0 0 4px",
                textTransform: "uppercase", letterSpacing: "0.1em" }}>Généré le</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 10px" }}>{dateStr}</p>
              <div style={{
                padding: "5px 12px",
                background: isRealData ? "rgba(190,242,100,0.12)" : "rgba(245,158,11,0.12)",
                border: `1px solid ${isRealData ? "rgba(190,242,100,0.4)" : "rgba(245,158,11,0.4)"}`,
                borderRadius: 6, fontSize: 9,
                color: isRealData ? "#bef264" : "#fbbf24",
                fontWeight: 600,
              }}>
                {isRealData ? "✅ Données Linky réelles" : "⚠ Estimation sectorielle ±30%"}
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            BODY
        ══════════════════════════════════════════════════════════ */}
        <div style={{ padding: "28px 36px", display: "flex", flexDirection: "column", gap: 22 }}>

          {/* ──────────────────────────────────────────────────────
              SECTION 01 — Identité & Emprise
          ────────────────────────────────────────────────────── */}
          <section>
            <SectionBar n="01" title="Identité & Emprise" />

            {/* Satellite image */}
            {audit.satellite_image_url && (
              <div style={{
                borderRadius: 10, overflow: "hidden", marginBottom: 14,
                border: "1px solid rgba(71,85,105,0.4)", lineHeight: 0,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={audit.satellite_image_url}
                  alt="Vue satellite"
                  crossOrigin="anonymous"
                  style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }}
                />
              </div>
            )}

            {/* 4-stat grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 10 }}>
              <Stat
                label="Surface de calcul"
                value={formatSurface(phys.roof_analysis.surface_m2_used)}
                sub={phys.footprint.source === "fallback" ? "Source : Vision IA" : `Source : ${phys.footprint.source}`}
                lime
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
                lime={azSolar === "optimal"}
              />
              <Stat
                label="Irradiance locale"
                value={`${phys.climate.dni_annual_kwh_m2}`}
                sub={`kWh/m²/an · ${phys.climate.year}`}
                lime
              />
            </div>

            {/* Obstructions */}
            <div style={{
              background: "#1e293b", border: "1px solid rgba(71,85,105,0.4)",
              borderRadius: 8, padding: "8px 14px", fontSize: 9.5, color: "#94a3b8",
              marginBottom: 6,
            }}>
              <span style={{ color: "#64748b", marginRight: 8 }}>Obstructions détectées :</span>
              {phys.roof_analysis.obstructions.length === 0
                ? <span style={{ color: "#34d399" }}>✅ Aucune</span>
                : phys.roof_analysis.obstructions.join(", ")
              }
              <span style={{ marginLeft: 20, color: "#64748b", wordBreak: "break-word" }}>
                Raisonnement IA : {phys.roof_analysis.reasoning}
              </span>
            </div>

            {/* Plausibility */}
            {pc && pc.activity_type !== "N/A" && (
              <div style={{
                background: "#1e293b", border: "1px solid rgba(71,85,105,0.4)",
                borderRadius: 8, padding: "8px 14px", fontSize: 9.5, color: "#94a3b8",
              }}>
                <span style={{ color: "#64748b", marginRight: 8 }}>Activité identifiée :</span>
                <span style={{ color: "#e2e8f0" }}>{pc.activity_type}</span>
                <span style={{ marginLeft: 10, color: "#64748b" }}>
                  Plausibilité : {pc.surface_plausibility}
                </span>
                {pc.coherence_ratio != null && (
                  <span style={{ marginLeft: 10, color: "#64748b" }}>
                    | Ratio V/OSM : {pc.coherence_ratio}× — {pc.coherence_flag}
                  </span>
                )}
              </div>
            )}
          </section>

          {/* ──────────────────────────────────────────────────────
              SECTION 02 — Diagnostic de Consommation
          ────────────────────────────────────────────────────── */}
          <section>
            <SectionBar n="02" title="Diagnostic de Consommation" />

            {/* Chart panel */}
            <div style={{
              background: "#1e293b", border: "1px solid rgba(71,85,105,0.4)",
              borderRadius: 12, padding: "16px 18px", marginBottom: 12,
            }}>
              <p style={{ fontSize: 8, color: "#64748b", textTransform: "uppercase",
                letterSpacing: "0.1em", margin: "0 0 12px" }}>
                Profil de charge journalier
                {isRealData ? " — données Enedis réelles" : " — estimation sectorielle"}
              </p>
              {/* SVG sizing is adaptive — always fits, no overflow clipping by html2canvas */}
              <div style={{ overflow: "hidden" }}>
                <LoadProfileSvg {...diag.load_profile} />
              </div>
              <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 8.5, color: "#64748b" }}>
                <span>
                  <span style={{ display: "inline-block", width: 9, height: 9,
                    background: "#4ade80", borderRadius: 2, marginRight: 4 }} />
                  Sem. (heures creuses)
                </span>
                <span>
                  <span style={{ display: "inline-block", width: 9, height: 9,
                    background: "#bef264", borderRadius: 2, marginRight: 4 }} />
                  Sem. (heures pleines)
                </span>
                <span>
                  <span style={{ display: "inline-block", width: 9, height: 9,
                    background: "#60a5fa", borderRadius: 2, marginRight: 4 }} />
                  Week-end
                </span>
              </div>
            </div>

            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
              <Stat
                label="Consommation annuelle"
                value={`${n(diag.theoretical_annual_consumption_kwh / 1000)} MWh/an`}
                sub={`${n(diag.theoretical_annual_consumption_kwh)} kWh`}
              />
              <Stat
                label="Gaspillage nocturne"
                value={`${n(diag.estimated_waste_kwh / 1000)} MWh/an`}
                sub={`Talon : ${Math.round(diag.night_talon_pct * 100)}% · ${diag.wasted_tco2e} tCO₂e/an`}
                lime
              />
              <Stat
                label="Économie potentielle"
                value={`${n(diag.opex_savings_eur_per_year)} €/an`}
                sub={`ROI : ${diag.opex_roi}`}
                lime
              />
            </div>

            {/* Grade + ISO 50001 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {gradeCfg && (
                <div style={{
                  background: "#0f172a", border: "1px solid rgba(71,85,105,0.4)",
                  borderRadius: 10, padding: "12px 16px",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <div style={{
                    width: 50, height: 50, background: gradeCfg.bg,
                    borderRadius: 10, display: "flex", alignItems: "center",
                    justifyContent: "center", flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 26, fontWeight: 900, color: gradeCfg.text }}>{grade}</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 8, color: "#64748b", textTransform: "uppercase",
                      letterSpacing: "0.1em", margin: "0 0 3px" }}>GetEcoPulse Grade</p>
                    <p style={{ fontSize: 11, fontWeight: 600, color: gradeCfg.text, margin: 0 }}>
                      {gradeCfg.label}
                    </p>
                    <p style={{ fontSize: 8.5, color: "#64748b", marginTop: 3 }}>
                      vs médiane IEA mondiale ({euiMedian} kWh/m²/an)
                    </p>
                  </div>
                </div>
              )}
              {diag.iso_50001_assessment && (
                <div style={{
                  background: "#0f172a", border: "1px solid rgba(71,85,105,0.4)",
                  borderRadius: 10, padding: "12px 16px",
                }}>
                  <p style={{ fontSize: 8, color: "#64748b", textTransform: "uppercase",
                    letterSpacing: "0.1em", margin: "0 0 8px" }}>
                    Pré-évaluation ISO 50001
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {[
                      {
                        ok: diag.iso_50001_assessment.has_30min_data,
                        ok_text: "Mesure continue validée (§6.3)",
                        ko_text: "Défaut de mesure continue (§6.3)",
                      },
                      {
                        ok: diag.iso_50001_assessment.has_quantified_baseline,
                        ok_text: "Talon de nuit documenté (§6.6)",
                        ko_text: "Talon de consommation non piloté (§6.6)",
                      },
                    ].map((item, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 6,
                        fontSize: 9.5 }}>
                        <span style={{ color: item.ok ? "#34d399" : "#f87171", flexShrink: 0 }}>
                          {item.ok ? "✅" : "✗"}
                        </span>
                        <span style={{ color: item.ok ? "#6ee7b7" : "#fca5a5" }}>
                          {item.ok ? item.ok_text : item.ko_text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ──────────────────────────────────────────────────────
              SECTION 03 — Plan d'Action
          ────────────────────────────────────────────────────── */}
          <section>
            <SectionBar n="03" title="Plan d'Action & Scénarios" />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {/* Card 1 — OPEX Night Curtailment */}
              <div style={{
                background: "#1e293b", border: "1px solid rgba(190,242,100,0.45)",
                borderRadius: 12, padding: "14px", position: "relative",
                pageBreakInside: "avoid", breakInside: "avoid",
              }}>
                <span style={{
                  position: "absolute", top: -10, left: 12,
                  background: "#bef264", color: "#0f172a",
                  fontSize: 7.5, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                }}>PRIORITAIRE</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 13 }}>🌙</span>
                  <div>
                    <p style={{ fontSize: 10.5, fontWeight: 600, color: "#fff", margin: 0 }}>
                      Effacement Talon de Nuit
                    </p>
                    <p style={{ fontSize: 8.5, color: "#94a3b8", margin: 0,
                      whiteSpace: "normal", wordBreak: "break-word" }}>Actions OPEX sans investissement lourd</p>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    ["Économie", `${n(diag.opex_savings_eur_per_year)} €/an`],
                    ["Gaspillage ciblé", `${n(diag.estimated_waste_kwh / 1000)} MWh/an`],
                    ["Talon nocturne", `${Math.round(diag.night_talon_pct * 100)} %`],
                    ["Investissement", `${n(diag.opex_capex_eur)} €`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ background: "#0f172a", borderRadius: 6, padding: "6px 8px" }}>
                      <p style={{ fontSize: 7.5, color: "#94a3b8", margin: "0 0 2px" }}>{label}</p>
                      <p style={{ fontSize: 10.5, fontWeight: 700, color: "#bef264", margin: 0 }}>{value}</p>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid rgba(51,65,85,0.6)", marginTop: 8,
                  paddingTop: 6, fontSize: 8.5, color: "#94a3b8" }}>
                  ROI : <span style={{ color: "#bef264", fontWeight: 600 }}>{diag.opex_roi}</span>
                </div>
              </div>

              {/* Card 2 — Solar */}
              <div style={{
                background: "#1e293b", border: "1px solid rgba(96,165,250,0.35)",
                borderRadius: 12, padding: "14px",
                pageBreakInside: "avoid", breakInside: "avoid",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 13 }}>☀️</span>
                  <div>
                    <p style={{ fontSize: 10.5, fontWeight: 600, color: "#fff", margin: 0 }}>
                      Installation Solaire
                    </p>
                    <p style={{ fontSize: 8.5, color: "#94a3b8", margin: 0 }}>Autoconsommation photovoltaïque</p>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    ["CAPEX estimé", `${n(fin.capex_eur / 1000, 0)} k€`],
                    ["Économie ann.", `${n(fin.annual_savings_eur / 1000, 0)} k€/an`],
                    ["Puissance crête", `${phys.solar_potential.peak_power_kwp.toFixed(0)} kWp`],
                    ["Couverture", `${fin.solar_coverage_pct} %`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ background: "#0f172a", borderRadius: 6, padding: "6px 8px" }}>
                      <p style={{ fontSize: 7.5, color: "#94a3b8", margin: "0 0 2px" }}>{label}</p>
                      <p style={{ fontSize: 10.5, fontWeight: 700, color: "#60a5fa", margin: 0 }}>{value}</p>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid rgba(51,65,85,0.6)", marginTop: 8,
                  paddingTop: 6, fontSize: 8.5, color: "#94a3b8" }}>
                  ROI : <span style={{ color: "#60a5fa", fontWeight: 600 }}>
                    {fin.roi_years !== null ? `${fin.roi_years} ans` : "Non calculable"}
                  </span>
                </div>
              </div>

              {/* Card 3 — Thermal (coming soon) */}
              <div style={{
                background: "#1e293b", border: "1px solid rgba(71,85,105,0.3)",
                borderRadius: 12, padding: "14px", opacity: 0.55,
                pageBreakInside: "avoid", breakInside: "avoid",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 13 }}>🔥</span>
                  <div>
                    <p style={{ fontSize: 10.5, fontWeight: 600, color: "#fff", margin: 0 }}>
                      Isolation Thermique
                    </p>
                    <p style={{ fontSize: 8.5, color: "#94a3b8", margin: 0 }}>Pertes par la toiture</p>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    ["Risque thermique", phys.thermal_assessment.risk_level],
                    ["Score de perte", `${Math.round(phys.thermal_assessment.score * 100)} %`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ background: "#0f172a", borderRadius: 6, padding: "6px 8px" }}>
                      <p style={{ fontSize: 7.5, color: "#94a3b8", margin: "0 0 2px" }}>{label}</p>
                      <p style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", margin: 0 }}>{value}</p>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid rgba(51,65,85,0.6)", marginTop: 8,
                  paddingTop: 6, fontSize: 8.5, color: "#64748b" }}>
                  Prochainement disponible
                </div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              TECHNICAL APPENDIX
          ══════════════════════════════════════════════════════════ */}
          <section>
            {/* Divider */}
            <div style={{
              display: "flex", alignItems: "center", gap: 0,
              borderTop: "1px solid rgba(190,242,100,0.25)",
              paddingTop: 20, marginBottom: 18,
            }}>
              <span style={{
                fontSize: 9.5, fontWeight: 700, color: "#bef264",
                letterSpacing: "0.18em", textTransform: "uppercase",
                background: "#0f172a", paddingRight: 14,
              }}>
                ANNEXES TECHNIQUES
              </span>
              <div style={{ flex: 1, height: 1, background: "rgba(190,242,100,0.12)" }} />
            </div>

            <div style={{
              background: "#1e293b", border: "1px solid rgba(71,85,105,0.3)",
              borderRadius: 12, padding: "20px 24px",
            }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "#fff",
                margin: "0 0 20px", letterSpacing: "-0.01em" }}>
                Notes de Calculs & Hypothèses
              </h3>

              {/* ── A. Données géospatiales ─────────────────────── */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 9.5, fontWeight: 700, color: "#bef264",
                  letterSpacing: "0.06em", margin: "0 0 8px",
                  textTransform: "uppercase" }}>
                  A. Données Géospatiales
                </p>
                <AppRow
                  label="Source de la surface"
                  value={phys.footprint.source === "fallback"
                    ? "Vision IA"
                    : phys.footprint.source.toUpperCase()}
                  note={phys.footprint.area_m2
                    ? `Empreinte OSM brute : ${n(phys.footprint.area_m2)} m²`
                    : "Aucun polygone OSM disponible"}
                />
                <AppRow
                  label="Surface Vision IA"
                  value={formatSurface(phys.roof_analysis.surface_m2_vision)}
                  note="Estimation Vision IA via image satellite"
                />
                <AppRow
                  label="Surface de calcul retenue"
                  value={formatSurface(phys.roof_analysis.surface_m2_used)}
                  note={`Confiance : ${phys.roof_analysis.confidence}`}
                />
                {pc?.coherence_ratio != null && (
                  <AppRow
                    label="Ratio cohérence Vision / OSM"
                    value={`${pc.coherence_ratio}×`}
                    note={pc.coherence_flag}
                  />
                )}
                <AppRow
                  label="Azimuth du toit"
                  value={`${phys.roof_analysis.azimuth_degrees}° — ${azDir}`}
                  note={`Exposition solaire : ${azSolar}`}
                />
                <AppRow
                  label="Obstructions détectées"
                  value={phys.roof_analysis.obstructions.length === 0
                    ? "Aucune"
                    : phys.roof_analysis.obstructions.join(", ")}
                />
                <AppRow
                  label="Facteur d'orientation solaire"
                  value={phys.solar_potential.orientation_factor.toFixed(3)}
                  note="1.000 = exposition plein Sud optimale"
                />
                <AppRow
                  label="Facteur d'ombrage / obstruction"
                  value={phys.solar_potential.obstruction_factor.toFixed(3)}
                  note="1.000 = surface libre sans ombrage"
                />
                <AppRow
                  label="Surface PV exploitable"
                  value={formatSurface(phys.solar_potential.usable_surface_m2)}
                  note="= surface toiture × 0.85 (marge structurale) × facteur obstruction"
                />
                <AppRow
                  label="Zoom satellite utilisé"
                  value={`Niveau ${phys.footprint.zoom_used}`}
                  note="Mapbox Static API — satellite-v9"
                />
              </div>

              {/* ── B. Paramètres sectoriels ────────────────────── */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 9.5, fontWeight: 700, color: "#bef264",
                  letterSpacing: "0.06em", margin: "0 0 8px",
                  textTransform: "uppercase" }}>
                  B. Paramètres Sectoriels
                </p>
                <AppRow
                  label="Code NAF / Secteur"
                  value={`${nafCode} — ${NAF_LABELS[nafCode] ?? fin.naf_sector}`}
                />
                <AppRow
                  label="EUI de référence (calcul)"
                  value={`${euiUsed} kWh/m²/an`}
                  note="Consommation de référence utilisée pour le calcul"
                />
                <AppRow
                  label="EUI médiane IEA mondiale"
                  value={`${euiMedian} kWh/m²/an`}
                  note="Benchmark pour le classement GetEcoPulse Grade"
                />
                <AppRow
                  label="Prix de l'énergie"
                  value={`${fin.energy_price_eur_kwh} €/kWh`}
                  note="Tarif industriel moyen France HT (source : business_config)"
                />
                <AppRow
                  label="Facteur d'émission Scope 2"
                  value={`${emFactor} kg CO₂e/kWh`}
                  note={`Pays : ${countryCode} — Source : IEA 2023 market-based`}
                />
                <AppRow
                  label="Talon de nuit sectoriel"
                  value={`${sector ? Math.round(sector.night_pct * 100) : Math.round(diag.night_talon_pct * 100)} %`}
                  note="Fraction de la consommation en dehors des heures d'exploitation"
                />
              </div>

              {/* ── C. Formules de calcul ───────────────────────── */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 9.5, fontWeight: 700, color: "#bef264",
                  letterSpacing: "0.06em", margin: "0 0 10px",
                  textTransform: "uppercase" }}>
                  C. Formules de Calcul
                </p>

                {/*
                  Consommation — two cases:
                  • Synthetic : surface × EUI (calculated)
                  • Real Linky : direct meter reading (NOT calculated — showing the formula
                    as surface×EUI would be arithmetically false)
                */}
                {isRealData ? (
                  <Formula
                    text="Consommation annuelle = Mesure directe Enedis / Linky (compteur Linky)"
                    result={`= ${n(diag.theoretical_annual_consumption_kwh)} kWh/an`}
                  />
                ) : (
                  <Formula
                    text={`Conso. annuelle = ${formatSurface(phys.roof_analysis.surface_m2_used)} × ${euiUsed} kWh/m²/an (EUI sectoriel)`}
                    result={`= ${n(diag.theoretical_annual_consumption_kwh)} kWh/an`}
                  />
                )}

                <Formula
                  text={`Gaspillage talon = ${n(diag.theoretical_annual_consumption_kwh)} kWh × ${Math.round(diag.night_talon_pct * 100)}% (talon nocturne sectoriel)`}
                  result={`= ${n(diag.estimated_waste_kwh)} kWh/an`}
                />
                <Formula
                  text={`Coût gaspillage = ${n(diag.estimated_waste_kwh)} kWh × ${fin.energy_price_eur_kwh} €/kWh`}
                  result={`= ${n(diag.opex_savings_eur_per_year)} €/an`}
                />
                <Formula
                  text={`Émissions Scope 2 = ${n(diag.estimated_waste_kwh)} kWh × ${emFactor} kg/kWh ÷ 1 000`}
                  result={`= ${diag.wasted_tco2e} tCO₂e/an`}
                />
                <Formula
                  text={`Puissance PV = ${formatSurface(phys.solar_potential.usable_surface_m2)} ÷ 5.5 m²/kWp`}
                  result={`= ${phys.solar_potential.peak_power_kwp.toFixed(1)} kWc`}
                />
                <Formula
                  text={`Production PV = ${phys.solar_potential.peak_power_kwp.toFixed(1)} kWc × ${phys.climate.dni_annual_kwh_m2} kWh/m²/an × 0.80 (PR)`}
                  result={`≈ ${n(phys.solar_potential.annual_production_kwh)} kWh/an`}
                />
              </div>

              {/* ── D. Marges & incertitudes ────────────────────── */}
              <div style={{ marginBottom: 0 }}>
                <p style={{ fontSize: 9.5, fontWeight: 700, color: "#bef264",
                  letterSpacing: "0.06em", margin: "0 0 8px",
                  textTransform: "uppercase" }}>
                  D. Marges & Incertitudes
                </p>
                <AppRow
                  label="Type de données"
                  value={isRealData
                    ? "Enedis / Linky — mesures terrain directes"
                    : "Synthétique — profil sectoriel IEA"}
                />
                <AppRow
                  label="Marge d'incertitude (variance)"
                  value={isRealData ? "±5% (précision compteur)" : "±30% (variance sectorielle)"}
                  note={isRealData
                    ? undefined
                    : "Scénario bas = valeur affichée × 0.70 / Scénario haut = × 1.30"}
                />
                <AppRow
                  label="Fiabilité de la surface"
                  value={phys.roof_analysis.confidence}
                  note={`Vision IA : ${formatSurface(phys.roof_analysis.surface_m2_vision)}${phys.footprint.area_m2 ? ` / OSM : ${formatSurface(phys.footprint.area_m2)}` : ""}`}
                />
                <AppRow
                  label="Modèle IA — analyse toiture"
                  value="Modèle Vision IA propriétaire"
                  note="temperature=0.1 · 3 tentatives · réponse JSON contrôlée"
                />
                <AppRow
                  label="Baseline ISO 50001"
                  value={diag.iso_50001_assessment.has_quantified_baseline
                    ? "Établie — talon documenté (§6.6)"
                    : "Non établie — données insuffisantes"}
                />
                <AppRow
                  label="GetEcoPulse Grade"
                  value={grade ?? "N/A"}
                  note={grade
                    ? `EUI mesuré vs médiane IEA ${euiMedian} kWh/m²/an (${NAF_LABELS[nafCode] ?? fin.naf_sector})`
                    : "Surface insuffisante pour calculer l'EUI"}
                />
              </div>
            </div>
          </section>

          {/* Footer disclaimer — kept minimal to avoid ghost 3rd page.
              Full date/page-number/disclaimer is injected by jsPDF in pdf-export.ts */}
          <div style={{
            borderTop: "1px solid rgba(71,85,105,0.25)",
            marginTop: 4,
            paddingTop: 8,
            paddingBottom: 6,
          }}>
            <p style={{ fontSize: 7, color: "#334155", margin: 0, textAlign: "center", lineHeight: 1.4 }}>
              Ce rapport est généré automatiquement à titre informatif et ne constitue pas un audit
              énergétique réglementaire (décret tertiaire, BACS, CEE). Estimations basées sur données
              publiques et profils sectoriels IEA. — GetEcoPulse PoC v1.0
            </p>
          </div>

        </div>
      </div>
    );
  }
);

export default PrintableReport;
