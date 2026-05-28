/**
 * GetEcoPulse — AuditPdfDocument
 *
 * Pure @react-pdf/renderer component.  No DOM APIs, no "use client" needed.
 * Generates vector PDF with selectable text, crisp fonts at any zoom level.
 *
 * Page 1 : Header · §01 Identité & Emprise · §02 Diagnostic
 * Page 2 : §03 Plan d'Action · §04 Annexes Techniques · Footer
 */

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Svg,
  Rect,
  G,
} from "@react-pdf/renderer";
import type { AuditResult } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Diag = AuditResult["diagnostic"];

export interface AuditPdfProps {
  audit: AuditResult;
  diag: Diag;
  nafCode: string;
  isRealData: boolean;
  /** Pre-fetched data-URI for the satellite image (avoids CORS in the PDF renderer). */
  satelliteDataUri?: string | null;
}

// ── Design constants ──────────────────────────────────────────────────────────

const C = {
  navy:     "#0f172a",
  lime:     "#bef264",
  white:    "#ffffff",
  bg:       "#f8fafc",
  bgMid:    "#f1f5f9",
  border:   "#e2e8f0",
  green:    "#15803d",
  greenBg:  "#f0fdf4",
  greenBdr: "#86efac",
  t900:     "#0f172a",
  t700:     "#334155",
  t500:     "#64748b",
  t400:     "#94a3b8",
  blue:     "#1d4ed8",
  orange:   "#ea580c",
  red:      "#dc2626",
} as const;

const GRADE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  A: { bg: "#dcfce7", border: "#16a34a", text: "#14532d", label: "Leader sectoriel" },
  B: { bg: "#d1fae5", border: "#059669", text: "#064e3b", label: "Bonne performance" },
  C: { bg: "#fef9c3", border: "#ca8a04", text: "#713f12", label: "Dans la moyenne" },
  D: { bg: "#ffedd5", border: "#ea580c", text: "#7c2d12", label: "Sous la médiane IEA" },
  E: { bg: "#fee2e2", border: "#dc2626", text: "#7f1d1d", label: "Consommation excessive" },
  F: { bg: "#fce7f3", border: "#be185d", text: "#831843", label: "Urgence d'action" },
};

const NAF_LABELS: Record<string, string> = {
  NAF_BUREAUX:      "Bureaux & Tertiaire",
  NAF_INDUSTRIE:    "Industrie manufacturiere",
  NAF_ENTREPOT:     "Entrepot & Logistique",
  NAF_COMMERCE:     "Commerce & Distribution",
  NAF_ENSEIGNEMENT: "Enseignement",
  NAF_SANTE:        "Sante & Medico-social",
  NAF_HOTELLERIE:   "Hotellerie & Restauration",
};

const ROOF_FR: Record<string, string> = {
  flat:    "Plat",
  gable:   "Deux pentes",
  hip:     "Quatre pentes",
  shed:    "Shed / Batiere",
  complex: "Complexe / Mixte",
  unknown: "Indetermine",
};

const EUI: Record<string, { kwh_m2: number; median: number; night: number }> = {
  NAF_BUREAUX:      { kwh_m2: 150, median: 160, night: 0.15 },
  NAF_INDUSTRIE:    { kwh_m2: 300, median: 240, night: 0.30 },
  NAF_ENTREPOT:     { kwh_m2: 50,  median: 65,  night: 0.20 },
  NAF_COMMERCE:     { kwh_m2: 200, median: 250, night: 0.25 },
  NAF_ENSEIGNEMENT: { kwh_m2: 120, median: 130, night: 0.10 },
  NAF_SANTE:        { kwh_m2: 350, median: 400, night: 0.20 },
  NAF_HOTELLERIE:   { kwh_m2: 280, median: 200, night: 0.25 },
};

const EF: Record<string, number> = {
  FR: 0.052, DE: 0.380, GB: 0.233, ES: 0.195, IT: 0.372,
  NL: 0.290, BE: 0.167, PL: 0.773, US: 0.386, CA: 0.130,
  MX: 0.454, BR: 0.074, CN: 0.581, JP: 0.463, IN: 0.708,
  AU: 0.610, ZA: 0.928, DEFAULT: 0.400,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fr = (v: number, d = 0) =>
  v.toLocaleString("fr-FR", { maximumFractionDigits: d });

function m2(v: number | null | undefined): string {
  if (v == null) return "N/A";
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(Number(v)))} m2`;
}

function azLabel(deg: number): { dir: string; solar: string } {
  const d = ((deg % 360) + 360) % 360;
  const dirs = ["Nord", "N-Est", "Est", "S-Est", "Sud", "S-Ouest", "Ouest", "N-Ouest"];
  const dir = dirs[Math.round(d / 45) % 8];
  const solar =
    d >= 135 && d <= 225 ? "Optimal"
    : d >= 90 && d <= 270 ? "Acceptable"
    : "Defavorable";
  return { dir, solar };
}

// ── StyleSheet ────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // ── Page / layout
  page: {
    backgroundColor: C.white,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: C.t900,
  },
  body: { paddingHorizontal: 30, paddingBottom: 30 },

  // ── Header (dark navy)
  header: {
    backgroundColor: C.navy,
    borderBottomWidth: 3,
    borderBottomColor: C.lime,
    borderBottomStyle: "solid",
    paddingHorizontal: 30,
    paddingVertical: 14,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: { flex: 1, paddingRight: 16 },
  logoRow:   { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  logoText:  { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.lime },
  pocTag:    { fontSize: 7, color: "#475569", marginLeft: 7, marginTop: 2, letterSpacing: 1.5 },
  headTitle: {
    fontSize: 13, fontFamily: "Helvetica-Bold",
    color: C.white, marginBottom: 5, lineHeight: 1.2,
  },
  headAddr:   { fontSize: 9, color: "#94a3b8", lineHeight: 1.4 },
  headCoords: { fontSize: 7, color: "#475569", marginTop: 3 },
  headerRight: { alignItems: "flex-end", minWidth: 140 },
  headDateLbl: { fontSize: 7, color: "#475569", marginBottom: 2 },
  headDate:    { fontSize: 9.5, color: "#94a3b8", marginBottom: 8 },
  badge: {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1, borderStyle: "solid",
    fontSize: 8, fontFamily: "Helvetica-Bold",
  },

  // ── Section bar
  sectionRow: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  sectionNum: {
    fontSize: 8.5, fontFamily: "Helvetica-Bold",
    color: C.green, backgroundColor: C.greenBg,
    borderWidth: 1, borderColor: C.greenBdr, borderStyle: "solid",
    borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1.5,
    marginRight: 8,
  },
  sectionTitle: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: C.t900, marginRight: 8 },
  sectionLine:  {
    flex: 1,
    borderBottomWidth: 1, borderBottomColor: C.border, borderBottomStyle: "solid",
  },

  // ── Stat card (used in §01 2×2 grid)
  statCard: {
    backgroundColor: C.white,
    borderWidth: 1, borderColor: C.border, borderStyle: "solid",
    borderRadius: 6, padding: 8,
    borderTopWidth: 3, borderTopStyle: "solid",
  },
  statLabel: {
    fontSize: 7, fontFamily: "Helvetica-Bold", color: C.t500,
    marginBottom: 3,
  },
  statValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.t900 },
  statSub:   { fontSize: 7, color: C.t400, marginTop: 2 },

  // ── Info box
  infoBox: {
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border, borderStyle: "solid",
    borderRadius: 5,
    paddingHorizontal: 8, paddingVertical: 5,
    marginTop: 6,
    flexDirection: "row",
  },
  infoLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.t700 },
  infoText:  { fontSize: 7.5, color: C.t500, lineHeight: 1.4, flex: 1 },

  // ── KPI card (§02)
  kpiCard: {
    flex: 1,
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border, borderStyle: "solid",
    borderRadius: 6, padding: 9,
    borderLeftWidth: 4, borderLeftStyle: "solid",
  },
  kpiLabel: {
    fontSize: 7, fontFamily: "Helvetica-Bold", color: C.t500,
    marginBottom: 3,
  },
  kpiValue: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  kpiSub:   { fontSize: 7, color: C.t400, marginTop: 2 },

  // ── Chart
  chartBox: {
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border, borderStyle: "solid",
    borderRadius: 7,
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6,
    marginBottom: 8,
  },
  chartTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.t500, marginBottom: 6 },
  legendRow:  { flexDirection: "row", marginTop: 5 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 14 },
  legendDot:  { width: 7, height: 7, borderRadius: 1, marginRight: 4 },
  legendText: { fontSize: 7, color: C.t400 },
  axisRow: {
    flexDirection: "row", justifyContent: "space-between",
    marginTop: 2, paddingHorizontal: 2,
  },
  axisLabel: { fontSize: 6, color: C.t400, width: 28, textAlign: "center" },

  // ── Action card (§03)
  actionCard: {
    flex: 1,
    borderWidth: 2, borderStyle: "solid",
    borderRadius: 8, padding: 11,
  },
  actionHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  actionTitle:  { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.t900 },
  actionSub:    { fontSize: 7.5, color: C.t500, marginTop: 1 },
  actionRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: C.bg, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 3,
    marginBottom: 3,
  },
  actionRowLbl: { fontSize: 7.5, color: C.t500 },
  actionRowVal: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  actionRoiRow: {
    borderTopWidth: 1, borderTopColor: C.border, borderTopStyle: "solid",
    paddingTop: 6, marginTop: 6,
    flexDirection: "row",
  },

  // ── Annex
  annexHeader: {
    borderTopWidth: 2, borderTopColor: C.border, borderTopStyle: "solid",
    paddingTop: 10, marginTop: 4, marginBottom: 8,
    flexDirection: "row", alignItems: "center",
  },
  annexHeaderText: {
    fontSize: 9, fontFamily: "Helvetica-Bold",
    color: C.green, letterSpacing: 1.5,
  },
  annexHeaderLine: {
    flex: 1, marginLeft: 10,
    borderBottomWidth: 1, borderBottomColor: C.border, borderBottomStyle: "solid",
  },
  annexCard: {
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border, borderStyle: "solid",
    borderRadius: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8,
  },
  annexCardTitle: {
    fontSize: 11, fontFamily: "Helvetica-Bold", color: C.t900, marginBottom: 10,
  },
  subTitle: {
    fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.green,
    borderLeftWidth: 2, borderLeftColor: C.green, borderLeftStyle: "solid",
    paddingLeft: 6, marginBottom: 5, marginTop: 8,
  },
  appRow: {
    flexDirection: "row", alignItems: "flex-start",
    paddingVertical: 2.5,
    borderBottomWidth: 1, borderBottomColor: C.bgMid, borderBottomStyle: "solid",
  },
  appLbl:  { width: 170, fontSize: 7.5, color: C.t500 },
  appVal:  { flex: 1, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.t900 },
  appNote: { width: 155, fontSize: 7, color: C.t400, textAlign: "right" },
  formulaRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: C.greenBg,
    borderWidth: 1, borderColor: C.greenBdr, borderStyle: "solid",
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2.5,
    marginBottom: 2,
  },
  formulaTxt: { fontSize: 7.5, color: C.green },
  formulaRes: { fontSize: 7.5, color: C.t500 },

  // ── Footer
  footer: {
    borderTopWidth: 1, borderTopColor: C.border, borderTopStyle: "solid",
    paddingTop: 8, marginTop: 8,
  },
  footerText: { fontSize: 7, color: C.t400, textAlign: "center", lineHeight: 1.5 },
});

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionBar({ n, title }: { n: string; title: string }) {
  return (
    <View style={S.sectionRow}>
      <Text style={S.sectionNum}>{n}</Text>
      <Text style={S.sectionTitle}>{title}</Text>
      <View style={S.sectionLine} />
    </View>
  );
}

function StatCard({
  label, value, sub, accentColor,
}: { label: string; value: string; sub?: string; accentColor?: string }) {
  return (
    <View style={[S.statCard, { borderTopColor: accentColor ?? C.border }]}>
      <Text style={S.statLabel}>{label}</Text>
      <Text style={[S.statValue, accentColor ? { color: accentColor } : {}]}>{value}</Text>
      {sub ? <Text style={S.statSub}>{sub}</Text> : null}
    </View>
  );
}

function KpiCard({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color: string }) {
  return (
    <View style={[S.kpiCard, { borderLeftColor: color }]}>
      <Text style={S.kpiLabel}>{label.toUpperCase()}</Text>
      <Text style={[S.kpiValue, { color }]}>{value}</Text>
      {sub ? <Text style={S.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function ActionRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={S.actionRow}>
      <Text style={S.actionRowLbl}>{label}</Text>
      <Text style={[S.actionRowVal, { color: color ?? C.t700 }]}>{value}</Text>
    </View>
  );
}

function AppRow({
  label, value, note,
}: { label: string; value: string; note?: string }) {
  return (
    <View style={S.appRow}>
      <Text style={S.appLbl}>{label}</Text>
      <Text style={S.appVal}>{value}</Text>
      {note ? <Text style={S.appNote}>{note}</Text> : null}
    </View>
  );
}

function FormulaRow({ text, result }: { text: string; result?: string }) {
  return (
    <View style={S.formulaRow}>
      <Text style={S.formulaTxt}>{text}</Text>
      {result ? <Text style={S.formulaRes}>{result}</Text> : null}
    </View>
  );
}

/** SVG load-profile chart (48 half-hour bars, green = weekday, blue = weekend). */
function LoadProfileChart({
  weekday_kw, weekend_kw, peak_hours,
}: Diag["load_profile"]) {
  const W = 515;
  const H = 64;
  const count = weekday_kw.length || 48;
  const maxVal = Math.max(...weekday_kw, ...weekend_kw, 0.01);
  const slotW = W / count;
  const bw = Math.max(2.5, slotW * 0.40);

  return (
    <Svg width={W} height={H}>
      {weekday_kw.map((wdKw, i) => {
        const weKw = weekend_kw[i] ?? 0;
        const wdH = Math.max((wdKw / maxVal) * H, 0.5);
        const weH = Math.max((weKw / maxVal) * H, 0.5);
        const x = i * slotW;
        const pk = i >= peak_hours[0] && i < peak_hours[1];
        return (
          <G key={i}>
            <Rect
              x={x + 0.5} y={H - wdH}
              width={bw} height={wdH}
              fill={pk ? "#16a34a" : "#4ade80"}
              opacity={0.9}
            />
            <Rect
              x={x + bw + 1.5} y={H - weH}
              width={bw} height={weH}
              fill="#60a5fa"
              opacity={0.7}
            />
          </G>
        );
      })}
    </Svg>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

export default function AuditPdfDocument({
  audit, diag, nafCode, isRealData, satelliteDataUri,
}: AuditPdfProps) {
  const phys = audit.physical_data;
  const fin  = audit.financial_projection;
  const pc   = audit.plausibility_check;

  const dateStr = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  });

  const sector    = EUI[nafCode];
  const euiUsed   = sector?.kwh_m2  ?? Math.round(fin.theoretical_consumption_kwh_year / Math.max(phys.roof_analysis.surface_m2_used, 1));
  const euiMedian = sector?.median  ?? euiUsed;
  const emFactor  = EF[(audit.country_code ?? "DEFAULT").toUpperCase()] ?? EF.DEFAULT;
  const { dir: azDir, solar: azSolar } = azLabel(phys.roof_analysis.azimuth_degrees);

  const grade    = diag.grade && diag.grade !== "N/A" ? diag.grade : null;
  const gradeCfg = grade ? (GRADE[grade] ?? GRADE.F) : null;

  const surfaceRef = phys.footprint.area_m2 ?? phys.roof_analysis.surface_m2_used;
  const imgSrc     = satelliteDataUri || audit.satellite_image_url || null;

  // ── PAGE 1 ──────────────────────────────────────────────────────────────────
  return (
    <Document
      title={`GetEcoPulse — Audit ${audit.address}`}
      author="GetEcoPulse"
      subject="Rapport d'audit energetique batiment"
    >
      <Page size="A4" style={S.page}>

        {/* ── HEADER ── */}
        <View style={S.header}>
          <View style={S.headerLeft}>
            <View style={S.logoRow}>
              <Text style={S.logoText}>GetEcoPulse</Text>
              <Text style={S.pocTag}>PoC</Text>
            </View>
            <Text style={S.headTitle}>Rapport d&apos;Audit Energetique Batiment</Text>
            <Text style={S.headAddr}>{audit.address}</Text>
            <Text style={S.headCoords}>
              {audit.coordinates.lat.toFixed(5)}, {audit.coordinates.lon.toFixed(5)}
            </Text>
          </View>
          <View style={S.headerRight}>
            <Text style={S.headDateLbl}>GENERE LE</Text>
            <Text style={S.headDate}>{dateStr}</Text>
            <View style={[
              S.badge,
              isRealData
                ? { backgroundColor: "rgba(190,242,100,0.15)", borderColor: "rgba(190,242,100,0.4)", color: C.lime }
                : { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.4)", color: "#fbbf24" },
            ]}>
              <Text>{isRealData ? "Donnees Linky reelles" : "Estimation sectorielle ±30%"}</Text>
            </View>
          </View>
        </View>

        {/* ── BODY ── */}
        <View style={S.body}>

          {/* ── §01 IDENTITE & EMPRISE ── */}
          <SectionBar n="01" title="Identite & Emprise" />

          {/* Satellite image + stats */}
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 6 }}>

            {/* Left: satellite image */}
            <View style={{
              width: 165, height: 165,
              borderRadius: 7, overflow: "hidden",
              borderWidth: 1, borderColor: C.border, borderStyle: "solid",
            }}>
              {imgSrc ? (
                <Image
                  src={imgSrc}
                  style={{ width: 165, height: 165, objectFit: "cover" }}
                />
              ) : (
                <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 8, color: C.t400 }}>Image non disponible</Text>
                </View>
              )}
            </View>

            {/* Right: 2×2 stat grid + reasoning */}
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <StatCard
                  label="SURFACE DE CALCUL"
                  value={m2(surfaceRef)}
                  sub={`Source : ${phys.footprint.source === "fallback" ? "Vision IA" : phys.footprint.source.toUpperCase()}`}
                  accentColor={C.green}
                />
                <StatCard
                  label="TYPE DE TOIT"
                  value={ROOF_FR[phys.roof_analysis.roof_type] ?? phys.roof_analysis.roof_type}
                  sub={`Confiance : ${phys.roof_analysis.confidence}`}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <StatCard
                  label="ORIENTATION"
                  value={azDir}
                  sub={`${phys.roof_analysis.azimuth_degrees}  — ${azSolar}`}
                  accentColor={azSolar === "Optimal" ? C.green : undefined}
                />
                <StatCard
                  label="IRRADIANCE LOCALE"
                  value={`${phys.climate.dni_annual_kwh_m2}`}
                  sub={`kWh/m2/an  (${phys.climate.year})`}
                  accentColor={C.green}
                />
              </View>
              {/* Vision IA reasoning */}
              <View style={S.infoBox}>
                <Text style={S.infoLabel}>Vision IA : </Text>
                <Text style={S.infoText}>{phys.roof_analysis.reasoning}</Text>
              </View>
            </View>
          </View>

          {/* Business context */}
          {pc && pc.activity_type !== "N/A" && (
            <View style={[S.infoBox, { marginTop: 0 }]}>
              <Text style={S.infoLabel}>Activite : </Text>
              <Text style={[S.infoText, { color: C.t900, fontFamily: "Helvetica-Bold" }]}>
                {pc.activity_type}
              </Text>
              <Text style={[S.infoText, { color: C.t400, marginLeft: 8 }]}>
                {" Plausibilite : "}{pc.surface_plausibility}
                {pc.coherence_ratio != null ? `  Ratio V/OSM : ${pc.coherence_ratio}x` : ""}
              </Text>
            </View>
          )}

          {/* Obstructions */}
          {phys.roof_analysis.obstructions.length > 0 && (
            <View style={[S.infoBox, { marginTop: 6 }]}>
              <Text style={S.infoLabel}>Obstructions : </Text>
              <Text style={S.infoText}>{phys.roof_analysis.obstructions.join(", ")}</Text>
            </View>
          )}

          <View style={{ marginTop: 14 }} />

          {/* ── §02 DIAGNOSTIC ── */}
          <SectionBar n="02" title="Diagnostic de Consommation" />

          {/* Load profile chart */}
          <View style={S.chartBox}>
            <Text style={S.chartTitle}>
              PROFIL DE CHARGE JOURNALIER
              {isRealData ? "  —  donnees Enedis reelles" : "  —  estimation sectorielle"}
            </Text>
            <LoadProfileChart {...diag.load_profile} />
            {/* Axis labels */}
            <View style={S.axisRow}>
              {["00:00", "06:00", "12:00", "18:00", "23:30"].map((lbl) => (
                <Text key={lbl} style={S.axisLabel}>{lbl}</Text>
              ))}
            </View>
            {/* Legend */}
            <View style={S.legendRow}>
              <View style={S.legendItem}>
                <View style={[S.legendDot, { backgroundColor: "#4ade80" }]} />
                <Text style={S.legendText}>Sem. creuses</Text>
              </View>
              <View style={S.legendItem}>
                <View style={[S.legendDot, { backgroundColor: "#16a34a" }]} />
                <Text style={S.legendText}>Sem. pleines</Text>
              </View>
              <View style={S.legendItem}>
                <View style={[S.legendDot, { backgroundColor: "#60a5fa" }]} />
                <Text style={S.legendText}>Week-end</Text>
              </View>
            </View>
          </View>

          {/* KPIs row */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <KpiCard
              label="Consommation annuelle"
              value={`${fr(diag.theoretical_annual_consumption_kwh / 1000)} MWh/an`}
              sub={`${fr(diag.theoretical_annual_consumption_kwh)} kWh`}
              color={C.t700}
            />
            <KpiCard
              label="Gaspillage nocturne"
              value={`${fr(diag.estimated_waste_kwh / 1000)} MWh/an`}
              sub={`Talon : ${Math.round(diag.night_talon_pct * 100)}%  —  ${diag.wasted_tco2e} tCO2e/an`}
              color={C.orange}
            />
            <KpiCard
              label="Economie potentielle"
              value={`${fr(diag.opex_savings_eur_per_year)} EUR/an`}
              sub={`ROI : ${diag.opex_roi}`}
              color={C.green}
            />
          </View>

          {/* Grade + ISO 50001 */}
          <View style={{ flexDirection: "row", gap: 8 }}>

            {/* Grade badge */}
            {gradeCfg ? (
              <View style={{
                flex: 1, flexDirection: "row", alignItems: "center",
                backgroundColor: gradeCfg.bg,
                borderWidth: 2, borderColor: gradeCfg.border, borderStyle: "solid",
                borderRadius: 8, padding: 10, gap: 12,
              }}>
                <View style={{
                  width: 42, height: 42,
                  backgroundColor: gradeCfg.border,
                  borderRadius: 7,
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Text style={{ fontSize: 22, fontFamily: "Helvetica-Bold", color: C.white }}>
                    {grade}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: gradeCfg.text, marginBottom: 3 }}>
                    GETECOPULSE GRADE
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: gradeCfg.text }}>
                    {gradeCfg.label}
                  </Text>
                  <Text style={{ fontSize: 7.5, color: gradeCfg.text, marginTop: 2, opacity: 0.75 }}>
                    vs mediane IEA ({euiMedian} kWh/m2/an)
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            {/* ISO 50001 */}
            <View style={{
              flex: 1,
              backgroundColor: C.bg,
              borderWidth: 1, borderColor: C.border, borderStyle: "solid",
              borderRadius: 8, padding: 10,
            }}>
              <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.t500, marginBottom: 7 }}>
                PRE-EVALUATION ISO 50001
              </Text>
              {[
                {
                  ok: diag.iso_50001_assessment.has_30min_data,
                  ok_text:  "Mesure continue validee (§6.3)",
                  ko_text: "Defaut de mesure continue (§6.3)",
                },
                {
                  ok: diag.iso_50001_assessment.has_quantified_baseline,
                  ok_text:  "Talon de nuit documente (§6.6)",
                  ko_text: "Talon non pilote (§6.6)",
                },
              ].map((item, idx) => (
                <View key={idx} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                  <Text style={{
                    fontSize: 9, fontFamily: "Helvetica-Bold",
                    color: item.ok ? C.green : C.red,
                    marginRight: 5,
                  }}>
                    {item.ok ? "✓" : "✗"}
                  </Text>
                  <Text style={{ fontSize: 8, color: item.ok ? C.green : C.red, fontFamily: "Helvetica-Bold" }}>
                    {item.ok ? item.ok_text : item.ko_text}
                  </Text>
                </View>
              ))}
            </View>
          </View>

        </View>
      </Page>

      {/* ── PAGE 2 ─────────────────────────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <View style={S.body}>

          {/* ── §03 PLAN D'ACTION ── */}
          <View style={{ paddingTop: 20, marginBottom: 14 }}>
            <SectionBar n="03" title="Plan d'Action & Scenarios" />
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>

            {/* OPEX — Night */}
            <View style={[S.actionCard, { borderColor: C.green }]}>
              <View style={{
                backgroundColor: C.green,
                paddingHorizontal: 7, paddingVertical: 2,
                borderRadius: 3, alignSelf: "flex-start", marginBottom: 8,
              }}>
                <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.white }}>
                  PRIORITAIRE
                </Text>
              </View>
              <Text style={S.actionTitle}>Effacement Talon de Nuit</Text>
              <Text style={[S.actionSub, { marginBottom: 8 }]}>OPEX — sans investissement</Text>
              <ActionRow label="Economie annuelle" value={`${fr(diag.opex_savings_eur_per_year)} EUR/an`} color={C.green} />
              <ActionRow label="Gaspillage cible"  value={`${fr(diag.estimated_waste_kwh / 1000)} MWh/an`} />
              <ActionRow label="Talon nocturne"    value={`${Math.round(diag.night_talon_pct * 100)} %`} />
              <ActionRow label="Investissement"    value={`${fr(diag.opex_capex_eur)} EUR`} />
              <View style={S.actionRoiRow}>
                <Text style={{ fontSize: 8, color: C.t500, marginRight: 4 }}>ROI : </Text>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.green }}>{diag.opex_roi}</Text>
              </View>
            </View>

            {/* CAPEX — Solar */}
            <View style={[S.actionCard, { borderColor: C.blue }]}>
              <Text style={S.actionTitle}>Installation Solaire</Text>
              <Text style={[S.actionSub, { marginBottom: 8 }]}>CAPEX — Autoconsommation PV</Text>
              <ActionRow label="CAPEX estime"  value={`${fr(fin.capex_eur / 1000)} kEUR`} color={C.blue} />
              <ActionRow label="Economie ann." value={`${fr(fin.annual_savings_eur / 1000)} kEUR/an`} />
              <ActionRow label="Puissance crete" value={`${phys.solar_potential.peak_power_kwp.toFixed(0)} kWp`} />
              <ActionRow label="Couverture"     value={`${fin.solar_coverage_pct} %`} />
              <View style={S.actionRoiRow}>
                <Text style={{ fontSize: 8, color: C.t500, marginRight: 4 }}>ROI : </Text>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.blue }}>
                  {fin.roi_years !== null ? `${fin.roi_years} ans` : "Non calculable"}
                </Text>
              </View>
            </View>

            {/* Thermal — coming soon */}
            <View style={[S.actionCard, { borderColor: C.border, opacity: 0.6 }]}>
              <Text style={S.actionTitle}>Isolation Thermique</Text>
              <Text style={[S.actionSub, { marginBottom: 8 }]}>Pertes par la toiture</Text>
              <ActionRow label="Risque thermique" value={phys.thermal_assessment.risk_level} />
              <ActionRow label="Score de perte"   value={`${Math.round(phys.thermal_assessment.score * 100)} %`} />
              <View style={S.actionRoiRow}>
                <Text style={{ fontSize: 8, color: C.t400, fontStyle: "italic" }}>Module en developpement</Text>
              </View>
            </View>
          </View>

          {/* ── Quick Win : Optimisation Tarifaire Immédiate ── */}
          {diag.power_optimization && (
            <View style={{ marginTop: 12, marginBottom: 4, borderWidth: 1, borderColor: "#b45309", borderStyle: "solid", borderRadius: 8, overflow: "hidden" }}>
              {/* Header */}
              <View style={{ backgroundColor: "#78350f", paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#fcd34d", letterSpacing: 1 }}>
                  ⚡  OPTIMISATION TARIFAIRE IMMÉDIATE — QUICK WIN
                </Text>
              </View>
              {/* Metrics row */}
              <View style={{ flexDirection: "row", gap: 8, padding: 10 }}>
                <View style={{ flex: 1, backgroundColor: "#1e293b", borderRadius: 6, padding: 8 }}>
                  <Text style={{ fontSize: 7, color: "#94a3b8", marginBottom: 3 }}>PUISSANCE FACTURÉE</Text>
                  <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: "#f8fafc" }}>
                    {diag.power_optimization.puissance_souscrite_kva} <Text style={{ fontSize: 9, color: "#94a3b8" }}>kVA</Text>
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: "#1e293b", borderRadius: 6, padding: 8 }}>
                  <Text style={{ fontSize: 7, color: "#94a3b8", marginBottom: 3 }}>PIC RÉEL MESURÉ</Text>
                  <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: "#f8fafc" }}>
                    {diag.power_optimization.pic_puissance_reelle_kva} <Text style={{ fontSize: 9, color: "#94a3b8" }}>kVA</Text>
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: "#1e293b", borderRadius: 6, padding: 8 }}>
                  <Text style={{ fontSize: 7, color: "#94a3b8", marginBottom: 3 }}>SUR-DIMENSIONNEMENT</Text>
                  <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: diag.power_optimization.is_over_dimensioned ? "#fbbf24" : "#94a3b8" }}>
                    {diag.power_optimization.is_over_dimensioned ? `+${diag.power_optimization.sur_capacite_kva}` : "0"} <Text style={{ fontSize: 9, color: "#94a3b8" }}>kVA</Text>
                  </Text>
                </View>
                <View style={{ flex: 1.2, backgroundColor: "#1a2e0a", borderRadius: 6, padding: 8, borderWidth: 1, borderColor: "#4d7c0f", borderStyle: "solid" }}>
                  <Text style={{ fontSize: 7, color: "#a3e635", marginBottom: 3 }}>ÉCONOMIE ANNUELLE ESTIMÉE</Text>
                  <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: "#bef264" }}>
                    {diag.power_optimization.economie_abonnement_estimee_eur.toLocaleString("fr-FR")} €
                    <Text style={{ fontSize: 8, color: "#84cc16" }}>/an</Text>
                  </Text>
                </View>
              </View>
              {/* CTA */}
              {diag.power_optimization.is_over_dimensioned && (
                <View style={{ marginHorizontal: 10, marginBottom: 10, backgroundColor: "#1e293b", borderRadius: 6, padding: 8 }}>
                  <Text style={{ fontSize: 8.5, color: "#e2e8f0", lineHeight: 1.5 }}>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>Action immédiate : </Text>
                    Contactez votre fournisseur d&apos;énergie pour abaisser votre contrat à{" "}
                    <Text style={{ fontFamily: "Helvetica-Bold", color: "#bef264" }}>{diag.power_optimization.puissance_recommandee_kva} kVA</Text>.
                    L&apos;économie sur la part fixe de votre facture sera instantanée.
                  </Text>
                  <Text style={{ fontSize: 7, color: "#475569", marginTop: 4, fontStyle: "italic" }}>
                    Estimation basée sur un coût moyen réseau de 20 €/kVA/an. kVA ≈ kW (PF = 1, hypothèse conservative).
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── §04 ANNEXES TECHNIQUES ── */}
          <View style={S.annexHeader}>
            <Text style={S.annexHeaderText}>ANNEXES TECHNIQUES</Text>
            <View style={S.annexHeaderLine} />
          </View>

          <View style={S.annexCard}>
            <Text style={S.annexCardTitle}>Notes de Calculs & Hypotheses</Text>

            {/* A. Geospatiales */}
            <Text style={S.subTitle}>A. DONNEES GEOSPATIALES</Text>
            <AppRow
              label="Source de la surface"
              value={phys.footprint.source === "fallback" ? "Vision IA" : phys.footprint.source.toUpperCase()}
              note={phys.footprint.area_m2 ? `Empreinte OSM : ${m2(phys.footprint.area_m2)}` : "Polygone OSM non disponible"}
            />
            <AppRow label="Surface Vision IA"      value={m2(phys.roof_analysis.surface_m2_vision)} note="Estimation Vision IA image satellite" />
            <AppRow label="Surface retenue"         value={m2(phys.roof_analysis.surface_m2_used)}   note={`Confiance : ${phys.roof_analysis.confidence}`} />
            {pc?.coherence_ratio != null && (
              <AppRow label="Ratio Vision / OSM"    value={`${pc.coherence_ratio}x`}                  note={pc.coherence_flag?.replace(/[✅⚠️]/g, "").trim()} />
            )}
            <AppRow label="Azimuth"                 value={`${phys.roof_analysis.azimuth_degrees}  — ${azDir}`} note={`Exposition : ${azSolar}`} />
            <AppRow label="Obstructions"            value={phys.roof_analysis.obstructions.length === 0 ? "Aucune" : phys.roof_analysis.obstructions.join(", ")} />
            <AppRow label="Facteur orientation"     value={phys.solar_potential.orientation_factor.toFixed(3)}  note="1.000 = plein Sud optimal" />
            <AppRow label="Facteur obstruction"     value={phys.solar_potential.obstruction_factor.toFixed(3)}  note="1.000 = sans ombrage" />
            <AppRow label="Surface PV exploitable"  value={m2(phys.solar_potential.usable_surface_m2)}          note="surface x 0.85 x fact. obstruction" />

            {/* B. Sectoriels */}
            <Text style={S.subTitle}>B. PARAMETRES SECTORIELS</Text>
            <AppRow label="Secteur NAF"             value={`${nafCode} — ${NAF_LABELS[nafCode] ?? fin.naf_sector}`} />
            <AppRow label="EUI de reference"        value={`${euiUsed} kWh/m2/an`}           note="Consommation de reference calcul" />
            <AppRow label="EUI mediane IEA"         value={`${euiMedian} kWh/m2/an`}         note="Benchmark GetEcoPulse Grade" />
            <AppRow label="Prix energie"            value={`${fin.energy_price_eur_kwh} EUR/kWh`} note="Tarif industriel France HT" />
            <AppRow label="Facteur emission Scope 2" value={`${emFactor} kg CO2e/kWh`}        note={`Pays : ${(audit.country_code ?? "DEFAULT").toUpperCase()}  — IEA 2023`} />
            <AppRow label="Talon de nuit sectoriel" value={`${sector ? Math.round(sector.night * 100) : Math.round(diag.night_talon_pct * 100)} %`} note="Fraction hors heures exploitation" />

            {/* C. Formules */}
            <Text style={S.subTitle}>C. FORMULES DE CALCUL</Text>
            {isRealData ? (
              <FormulaRow
                text="Consommation annuelle = Mesure directe Enedis / Linky"
                result={`= ${fr(diag.theoretical_annual_consumption_kwh)} kWh/an`}
              />
            ) : (
              <FormulaRow
                text={`Conso. = ${m2(phys.roof_analysis.surface_m2_used)} x ${euiUsed} kWh/m2/an`}
                result={`= ${fr(diag.theoretical_annual_consumption_kwh)} kWh/an`}
              />
            )}
            <FormulaRow
              text={`Gaspillage = ${fr(diag.theoretical_annual_consumption_kwh)} kWh x ${Math.round(diag.night_talon_pct * 100)}%`}
              result={`= ${fr(diag.estimated_waste_kwh)} kWh/an`}
            />
            <FormulaRow
              text={`Cout gaspillage = ${fr(diag.estimated_waste_kwh)} kWh x ${fin.energy_price_eur_kwh} EUR/kWh`}
              result={`= ${fr(diag.opex_savings_eur_per_year)} EUR/an`}
            />
            <FormulaRow
              text={`Emissions Scope 2 = ${fr(diag.estimated_waste_kwh)} kWh x ${emFactor} kg/kWh / 1000`}
              result={`= ${diag.wasted_tco2e} tCO2e/an`}
            />
            <FormulaRow
              text={`Puissance PV = ${m2(phys.solar_potential.usable_surface_m2)} / 5.5 m2/kWp`}
              result={`= ${phys.solar_potential.peak_power_kwp.toFixed(1)} kWc`}
            />
            <FormulaRow
              text={`Production PV = ${phys.solar_potential.peak_power_kwp.toFixed(1)} kWc x ${phys.climate.dni_annual_kwh_m2} kWh/m2/an x 0.80`}
              result={`= ${fr(phys.solar_potential.annual_production_kwh)} kWh/an`}
            />

            {/* D. Marges */}
            <Text style={S.subTitle}>D. MARGES & INCERTITUDES</Text>
            <AppRow label="Type de donnees" value={isRealData ? "Enedis / Linky — mesures terrain" : "Synthetique — profil sectoriel IEA"} />
            <AppRow
              label="Marge d'incertitude"
              value={isRealData ? "±5% (precision compteur)" : "±30% (variance sectorielle)"}
              note={isRealData ? undefined : "Scenario bas x 0.70 / haut x 1.30"}
            />
            <AppRow
              label="Fiabilite surface"
              value={phys.roof_analysis.confidence}
              note={`Vision IA : ${m2(phys.roof_analysis.surface_m2_vision)}${phys.footprint.area_m2 ? ` / OSM : ${m2(phys.footprint.area_m2)}` : ""}`}
            />
            <AppRow label="Modele IA toiture" value="Gemini Vision — temperature=0.1" note="3 tentatives, JSON controle" />
            <AppRow
              label="Baseline ISO 50001"
              value={diag.iso_50001_assessment.has_quantified_baseline ? "Etablie (§6.6)" : "Non etablie — donnees insuffisantes"}
            />
            <AppRow
              label="GetEcoPulse Grade"
              value={grade ?? "N/A"}
              note={grade ? `EUI vs mediane IEA ${euiMedian} kWh/m2/an` : "Surface insuffisante pour EUI"}
            />
          </View>

          {/* ── Footer disclaimer ── */}
          <View style={S.footer}>
            <Text style={S.footerText}>
              Ce rapport est genere automatiquement a titre informatif et ne constitue pas un audit energetique reglementaire
              (decret tertiaire, BACS, CEE). Estimations basees sur donnees publiques et profils sectoriels IEA. — GetEcoPulse PoC v1.0
            </Text>
          </View>

        </View>
      </Page>
    </Document>
  );
}
