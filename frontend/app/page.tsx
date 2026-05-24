"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";
import type { User } from "@supabase/supabase-js";
import {
  Search,
  Zap,
  Sun,
  Building2,
  Loader2,
  AlertCircle,
  Moon,
  Flame,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  ArrowRight,
  BarChart2,
  Leaf,
  Award,
  FileDown,
} from "lucide-react";
import {
  runAudit, fetchFootprint, type AuditResult,
  computeAddressHash, createCheckoutSession, checkPurchase,
} from "@/lib/api";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";
import { exportAuditPdf } from "@/lib/pdf-export";
import AuthModal from "@/components/AuthModal";
import CsvUpload from "@/components/CsvUpload";

// Critical: react-leaflet must be loaded client-side only (no SSR)
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
// recharts uses browser APIs — load client-side only
const ConsumptionChart = dynamic(
  () => import("@/components/ConsumptionChart"),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAF_OPTIONS = [
  { value: "NAF_BUREAUX",      label: "Bureaux" },
  { value: "NAF_INDUSTRIE",    label: "Industrie" },
  { value: "NAF_ENTREPOT",     label: "Entrepôt" },
  { value: "NAF_COMMERCE",     label: "Commerce" },
  { value: "NAF_ENSEIGNEMENT", label: "Enseignement" },
  { value: "NAF_SANTE",        label: "Santé" },
  { value: "NAF_HOTELLERIE",   label: "Hôtellerie" },
];

const FRANCE_CENTER: [number, number] = [46.603354, 1.888334];

/** localStorage keys for purchase persistence */
const LS_PURCHASED = "gep_purchased";
const LS_RESTORE   = "gep_restore";

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

function SectionHeading({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs font-mono text-[#bef264] bg-[#bef264]/10 border border-[#bef264]/30 rounded px-2 py-0.5">
          {number}
        </span>
        <h2 className="text-lg font-bold text-white">{title}</h2>
      </div>
      {subtitle && (
        <p className="text-sm text-slate-400 ml-10">{subtitle}</p>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Solution card
// ---------------------------------------------------------------------------

type CardVariant = "primary" | "secondary" | "disabled";

function SolutionCard({
  variant,
  badge,
  icon: Icon,
  title,
  description,
  metrics,
  roi,
}: {
  variant: CardVariant;
  badge?: string;
  icon: React.ElementType;
  title: string;
  description: string;
  metrics: Array<{ label: string; value: string }>;
  roi: string;
}) {
  const borderColor =
    variant === "primary"
      ? "border-[#bef264]/50"
      : variant === "secondary"
      ? "border-blue-500/30"
      : "border-slate-700";

  const accentColor =
    variant === "primary"
      ? "text-[#bef264]"
      : variant === "secondary"
      ? "text-blue-400"
      : "text-slate-500";

  const iconBg =
    variant === "primary"
      ? "bg-[#bef264]/10"
      : variant === "secondary"
      ? "bg-blue-500/10"
      : "bg-slate-700/50";

  const badgeBg =
    variant === "primary"
      ? "bg-[#bef264] text-slate-900"
      : "bg-slate-600 text-slate-300";

  return (
    <div
      className={`relative bg-[#1e293b] border ${borderColor} rounded-2xl p-5 flex flex-col gap-4
                  ${variant === "disabled" ? "opacity-50" : ""}`}
    >
      {badge && (
        <span
          className={`absolute -top-2.5 left-4 text-xs font-bold px-2 py-0.5 rounded ${badgeBg}`}
        >
          {badge}
        </span>
      )}

      {variant === "disabled" && (
        <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-[#0f172a]/40 z-10">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Lock className="w-4 h-4" />
            <span>Prochainement</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconBg}`}>
          <Icon className={`w-5 h-5 ${accentColor}`} />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">{title}</h3>
          <p className="text-slate-400 text-xs">{description}</p>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="bg-[#0f172a] rounded-lg px-3 py-2">
            <p className="text-xs text-slate-400 mb-0.5">{m.label}</p>
            <p className={`text-base font-bold ${accentColor}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* ROI footer */}
      <div className="flex items-center gap-2 text-xs text-slate-400 border-t border-slate-700 pt-3">
        <CheckCircle className={`w-3.5 h-3.5 ${accentColor}`} />
        <span>
          ROI :{" "}
          <span className={`font-medium ${accentColor}`}>{roi}</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grade visual config
// ---------------------------------------------------------------------------

const GRADE_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: "bg-emerald-800",  text: "text-emerald-200", label: "Leader sectoriel" },
  B: { bg: "bg-green-600",    text: "text-green-100",   label: "Bonne performance" },
  C: { bg: "bg-yellow-500",   text: "text-yellow-900",  label: "Dans la moyenne" },
  D: { bg: "bg-orange-500",   text: "text-orange-100",  label: "Sous la médiane" },
  E: { bg: "bg-red-600",      text: "text-red-100",     label: "Consommation excessive" },
  F: { bg: "bg-red-900",      text: "text-red-200",     label: "Urgence d'action" },
};

// ---------------------------------------------------------------------------
// Azimuth → human-readable direction + solar suitability
// ---------------------------------------------------------------------------

function azimuthToLabel(deg: number): { dir: string; solar: "optimal" | "acceptable" | "défavorable" } {
  const d = ((deg % 360) + 360) % 360;
  let dir = "Nord";
  if (d >= 22.5  && d < 67.5)  dir = "Nord-Est";
  if (d >= 67.5  && d < 112.5) dir = "Est";
  if (d >= 112.5 && d < 157.5) dir = "Sud-Est";
  if (d >= 157.5 && d < 202.5) dir = "Sud";
  if (d >= 202.5 && d < 247.5) dir = "Sud-Ouest";
  if (d >= 247.5 && d < 292.5) dir = "Ouest";
  if (d >= 292.5 && d < 337.5) dir = "Nord-Ouest";
  const solar =
    d >= 135 && d <= 225 ? "optimal"
    : d >= 90 && d <= 270 ? "acceptable"
    : "défavorable";
  return { dir, solar };
}

// ---------------------------------------------------------------------------
// Skeleton pulse card
// ---------------------------------------------------------------------------

function SkeletonBlock({ h = "h-40" }: { h?: string }) {
  return (
    <div className={`bg-[#1e293b] border border-slate-700 rounded-2xl ${h} animate-pulse`} />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [address, setAddress]       = useState("");
  const [nafCode, setNafCode]       = useState("NAF_INDUSTRIE");
  const [loading, setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const [audit, setAudit]           = useState<AuditResult | null>(null);
  const [geojson, setGeojson]       = useState<FeatureCollection | null>(null);
  const [error, setError]           = useState<string | null>(null);

  // Auth + real-data states
  const [user, setUser]             = useState<User | null>(null);
  const [showAuth, setShowAuth]     = useState(false);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [realDiag, setRealDiag]     = useState<AuditResult["diagnostic"] | null>(null);

  const [pdfLoading, setPdfLoading] = useState(false);

  // Purchase / unlock state
  const [isPurchased,      setIsPurchased]      = useState(false);
  const [addressHash,      setAddressHash]      = useState<string | null>(null);
  const [checkingPurchase, setCheckingPurchase] = useState(false);

  // Ref for auto-scroll to consumption section when real data loads
  const section02Ref = useRef<HTMLElement>(null);

  // Scroll to Section 02 when real Linky data is loaded
  useEffect(() => {
    if (realDiag && section02Ref.current) {
      setTimeout(() => {
        section02Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150); // small delay so the DOM has updated
    }
  }, [realDiag]);

  // ── On mount: restore audit state if returning from Stripe success ─────
  useEffect(() => {
    const raw = localStorage.getItem(LS_RESTORE);
    if (!raw) return;
    localStorage.removeItem(LS_RESTORE);
    try {
      const saved = JSON.parse(raw) as {
        audit:   AuditResult;
        diag:    AuditResult["diagnostic"] | null;
        nafCode: string;
        hash:    string;
      };
      setAudit(saved.audit);
      setNafCode(saved.nafCode);
      if (saved.audit.address) setAddress(saved.audit.address);
      // If diag differs from audit.diagnostic, it was real Linky data
      if (saved.diag && saved.diag !== saved.audit.diagnostic) {
        setRealDiag(saved.diag as AuditResult["diagnostic"]);
      }
      setAddressHash(saved.hash);
      setIsPurchased(true);
    } catch { /* ignore malformed data */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── When audit loads: compute hash + check localStorage for prior purchase
  useEffect(() => {
    if (!audit) return;
    computeAddressHash(audit.address).then((hash) => {
      setAddressHash(hash);
      const stored = JSON.parse(localStorage.getItem(LS_PURCHASED) ?? "[]") as string[];
      if (stored.includes(hash)) setIsPurchased(true);
    });
  }, [audit?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check Supabase session on mount and listen for auth changes
  // Guard: Supabase is optional — skip entirely when env vars are absent
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient()!;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      // If user just logged in via magic link, open the CSV upload
      if (session?.user) {
        setShowAuth(false);
        setShowCsvUpload(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleExportPdf() {
    if (!audit || !diag) return;
    setPdfLoading(true);
    try {
      await exportAuditPdf(audit, diag, nafCode, !!realDiag);
    } finally {
      setPdfLoading(false);
    }
  }

  async function handlePurchase() {
    if (!audit || !addressHash) return;
    setCheckingPurchase(true);
    try {
      // Persist current audit state so it can be restored after Stripe redirect
      const savePayload = {
        audit:   { ...audit, satellite_image_data_uri: undefined },
        diag:    diag ?? null,
        nafCode,
        hash:    addressHash,
        address: audit.address,
      };
      localStorage.setItem(`gep_pending_${addressHash}`, JSON.stringify(savePayload));

      const { url } = await createCheckoutSession(
        audit.address, nafCode, addressHash, window.location.origin,
      );
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création du paiement.");
      setCheckingPurchase(false);
    }
  }

  async function handleAnalyse() {
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    setAudit(null);
    setGeojson(null);
    setRealDiag(null);
    setShowCsvUpload(false);

    try {
      setLoadingMsg("Démarrage de l'audit…");
      setLoadingStep(0);
      const auditResult = await runAudit(address.trim(), nafCode, (step, _total, status) => {
        setLoadingStep(step);
        setLoadingMsg(status);
      });
      setAudit(auditResult);

      setLoadingMsg("Récupération du polygone OSM…");
      const footprintResult = await fetchFootprint(address.trim());
      setGeojson(footprintResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  const fin  = audit?.financial_projection;
  const phys = audit?.physical_data;
  // Real Linky data takes priority over the synthetic diagnostic
  const diag = (realDiag ?? audit?.diagnostic) as AuditResult["diagnostic"] | undefined;

  const center: [number, number] = audit
    ? (phys?.footprint?.centroid
        ? [phys.footprint.centroid.lat, phys.footprint.centroid.lon]
        : [audit.coordinates.lat, audit.coordinates.lon])
    : FRANCE_CENTER;

  const showResults = audit !== null || loading;

  return (
    <div className="relative min-h-screen bg-[#0f172a] text-white flex flex-col overflow-x-hidden">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-[#0f172a]/90 backdrop-blur border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4 flex-wrap">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <Zap className="w-5 h-5 text-[#bef264]" />
            <span className="text-base font-bold text-white">GetEcoPulse</span>
            <span className="text-[10px] text-slate-500 ml-0.5 tracking-widest uppercase">PoC</span>
          </div>

          {/* Search bar */}
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyse()}
                placeholder="Adresse complète du bâtiment…"
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-800 border border-slate-700
                           text-sm text-white placeholder:text-slate-500
                           focus:outline-none focus:ring-1 focus:ring-[#bef264]/50 focus:border-[#bef264]/50"
              />
            </div>
            <select
              value={nafCode}
              onChange={(e) => setNafCode(e.target.value)}
              className="py-2 px-3 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white
                         focus:outline-none focus:ring-1 focus:ring-[#bef264]/50"
            >
              {NAF_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleAnalyse}
              disabled={loading || !address.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                         bg-[#bef264] text-slate-900 hover:bg-[#a3e635] transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Analyser
            </button>

            {/* PDF export — visible only when report is unlocked */}
            {audit && (isPurchased || !!realDiag) && (
              <button
                onClick={handleExportPdf}
                disabled={pdfLoading}
                title="Télécharger le rapport PDF"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                           bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {pdfLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                {pdfLoading ? "Génération…" : "Rapport PDF"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Loading banner ── */}
      {loading && (
        <div className="bg-[#bef264]/5 border-b border-[#bef264]/10 px-6 py-3">
          <div className="max-w-6xl mx-auto">
            {/* Step labels */}
            <p className="text-sm text-[#bef264]/90 flex items-center gap-2 mb-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              {loadingMsg}
            </p>
            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-1">
              <div
                className="bg-[#bef264] h-1 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${loadingStep > 0 ? (loadingStep / 6) * 100 : 5}%` }}
              />
            </div>
            {/* Step dots */}
            <div className="flex justify-between mt-1.5">
              {["Géocodage", "OSM", "Satellite", "Vision IA", "Contexte", "Bilan"].map((label, i) => (
                <span
                  key={label}
                  className={`text-[9px] uppercase tracking-widest transition-colors ${
                    loadingStep > i ? "text-[#bef264]" : "text-slate-600"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="max-w-6xl mx-auto mt-4 px-6 w-full">
          <div className="flex items-center gap-2 bg-red-900/20 border border-red-500/30
                          rounded-xl p-4 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* ── Hero (empty state) ── */}
      {!showResults && !error && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <Zap className="w-16 h-16 text-[#bef264] mx-auto mb-5 opacity-20" />
            <h1 className="text-3xl font-bold text-white mb-3">
              Audit Énergétique Bâtiment
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Saisissez l&apos;adresse d&apos;un bâtiment industriel ou commercial
              pour obtenir une analyse complète de son potentiel énergétique —
              emprise OSM, diagnostic de consommation et scénarios d&apos;économies.
            </p>
            <div className="flex items-center justify-center gap-6 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><Moon className="w-3 h-3 text-[#bef264]" />Talon de Nuit</span>
              <span className="flex items-center gap-1.5"><Sun className="w-3 h-3 text-blue-400" />Solaire</span>
              <span className="flex items-center gap-1.5"><Flame className="w-3 h-3 text-slate-600" />Thermique</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          RESULTS — 3 narrative sections
      ═══════════════════════════════════════════════════════════════════ */}
      {showResults && (
        <main className="max-w-6xl mx-auto w-full px-6 py-8 flex flex-col gap-14">

          {/* ────────────────────────────────────────────────────────────
              SECTION 01 — Identité & Emprise
          ──────────────────────────────────────────────────────────── */}
          <section>
            <SectionHeading
              number="01"
              title="Identité & Emprise"
              subtitle="Vue satellite et empreinte bâtimentaire issue d'OpenStreetMap"
            />

            {/* Satellite + Map */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700"
                   style={{ aspectRatio: "16/9" }}>
                {loading && !audit ? (
                  <div className="w-full h-full bg-slate-700 animate-pulse flex items-center justify-center">
                    <span className="text-xs text-slate-500">Chargement image satellite…</span>
                  </div>
                ) : audit?.satellite_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={audit.satellite_image_url}
                    alt={`Vue satellite — ${audit.address}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-600 p-8 text-center">
                    <Building2 className="w-10 h-10" />
                    <span className="text-xs text-slate-500">
                      {audit ? "Image satellite non disponible" : ""}
                    </span>
                  </div>
                )}
              </div>

              <div className="rounded-xl overflow-hidden border border-slate-700 min-h-[260px]">
                <MapView center={center} geojson={geojson} />
              </div>
            </div>

            {/* Building characteristics */}
            {phys && audit ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-[#1e293b] rounded-xl p-4 border border-slate-700 col-span-2 sm:col-span-1">
                    <p className="text-[10px] text-slate-400 mb-1.5 uppercase tracking-widest">Adresse</p>
                    <p className="text-sm text-white font-medium leading-snug line-clamp-3">
                      {audit.address}
                    </p>
                  </div>
                  <div className="bg-[#1e293b] rounded-xl p-4 border border-slate-700">
                    <p className="text-[10px] text-slate-400 mb-1.5 uppercase tracking-widest">Surface toiture</p>
                    <p className="text-2xl font-bold text-[#bef264]">
                      {phys.roof_analysis.surface_m2_used.toLocaleString("fr-FR")}
                    </p>
                    <p className="text-xs text-slate-500">
                      m² · {phys.footprint.source === "fallback" ? "Vision IA" : phys.footprint.source}
                    </p>
                  </div>
                  <div className="bg-[#1e293b] rounded-xl p-4 border border-slate-700">
                    <p className="text-[10px] text-slate-400 mb-1.5 uppercase tracking-widest">Type de toit</p>
                    <p className="text-lg font-bold text-white capitalize">
                      {phys.roof_analysis.roof_type}
                    </p>
                    <p className="text-xs text-slate-500">
                      Confiance : {phys.roof_analysis.confidence}
                    </p>
                  </div>
                  <div className="bg-[#1e293b] rounded-xl p-4 border border-slate-700">
                    <p className="text-[10px] text-slate-400 mb-1.5 uppercase tracking-widest">Irradiance locale</p>
                    <p className="text-2xl font-bold text-[#bef264]">
                      {phys.climate.dni_annual_kwh_m2}
                    </p>
                    <p className="text-xs text-slate-500">kWh/m²/an · {phys.climate.year}</p>
                  </div>
                </div>

                {/* Vision IA — Roof analysis details */}
                <div className="mt-3 bg-[#1e293b] rounded-xl p-4 border border-slate-700">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">
                    Analyse vision IA — toiture
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Orientation */}
                    <div>
                      <p className="text-xs text-slate-400 mb-1.5">Orientation</p>
                      {(() => {
                        const { dir, solar } = azimuthToLabel(phys.roof_analysis.azimuth_degrees);
                        const color = solar === "optimal" ? "text-[#bef264]"
                          : solar === "acceptable" ? "text-yellow-400" : "text-slate-400";
                        const tag = solar === "optimal" ? "✅ Optimal solaire"
                          : solar === "acceptable" ? "⚡ Acceptable" : "↘ Défavorable";
                        return (
                          <>
                            <p className="text-sm font-bold text-white">
                              {dir}
                              <span className="text-slate-500 font-normal text-xs ml-1">
                                ({phys.roof_analysis.azimuth_degrees}°)
                              </span>
                            </p>
                            <p className={`text-xs mt-0.5 ${color}`}>{tag}</p>
                          </>
                        );
                      })()}
                    </div>
                    {/* Obstructions */}
                    <div>
                      <p className="text-xs text-slate-400 mb-1.5">Obstructions détectées</p>
                      {phys.roof_analysis.obstructions.length === 0 ? (
                        <span className="text-xs text-emerald-400">✅ Aucune</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {phys.roof_analysis.obstructions.map((o, i) => (
                            <span key={i}
                              className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                              {o}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Reasoning */}
                    <div>
                      <p className="text-xs text-slate-400 mb-1.5">Observation</p>
                      <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                        {phys.roof_analysis.reasoning}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Plausibility check card */}
                {audit.plausibility_check && (() => {
                  const pc = audit.plausibility_check!;
                  const isNA = pc.activity_type === "N/A";
                  const plausBadge: Record<string, string> = {
                    high:   "bg-emerald-900/40 text-emerald-400 border-emerald-500/30",
                    medium: "bg-yellow-900/40  text-yellow-400  border-yellow-500/30",
                    low:    "bg-red-900/40     text-red-400     border-red-500/30",
                  };
                  const badgeClass = plausBadge[pc.surface_plausibility] ?? "bg-slate-800 text-slate-500 border-slate-600";
                  const flagColor  = pc.coherence_flag?.startsWith("✅")
                    ? "text-emerald-400"
                    : pc.coherence_flag?.startsWith("⚠️")
                    ? "text-yellow-400"
                    : "text-slate-500";

                  return (
                    <div className={`mt-3 bg-[#1e293b] rounded-xl p-4 border flex items-start gap-3
                                    ${isNA ? "border-slate-700/50 opacity-60" : "border-slate-700"}`}>
                      <div className="p-1.5 bg-slate-700/60 rounded-lg shrink-0 mt-0.5">
                        <Search className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Header row */}
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                            Contexte métier · Vérification web
                          </p>
                          {!isNA && (
                            <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${badgeClass}`}>
                              Plausibilité {pc.surface_plausibility}
                            </span>
                          )}
                        </div>
                        {/* Activity */}
                        <p className="text-sm text-white font-medium leading-snug">
                          {isNA ? "Activité non identifiée pour cette adresse" : pc.activity_type}
                        </p>
                        {!isNA && (
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                            {pc.reasoning}
                          </p>
                        )}
                        {/* Coherence flag — always shown */}
                        {pc.coherence_flag && pc.coherence_flag !== "N/A — surface OSM non disponible" && (
                          <p className={`text-xs mt-2 ${flagColor}`}>
                            {pc.coherence_flag}
                            {pc.coherence_ratio != null && (
                              <span className="text-slate-600 ml-1.5">
                                (Vision {pc.surface_vision_m2.toLocaleString("fr-FR")} m²
                                {" / "}OSM {pc.surface_osm_m2?.toLocaleString("fr-FR")} m²
                                {" → "}{pc.coherence_ratio}×)
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {/* Data sources strip */}
                <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
                  <span className="text-[10px] text-slate-600 uppercase tracking-widest shrink-0">
                    Sources :
                  </span>
                  {[
                    { label: "OpenStreetMap",    title: "Empreinte bâtiment" },
                    { label: "Satellite",        title: "Image aérienne" },
                    { label: "Météo historique", title: `Irradiance ${phys.climate.year}` },
                    { label: "Vision IA",        title: "Analyse toiture" },
                    { label: "Vérification web", title: "Contexte métier" },
                  ].map((s) => (
                    <span key={s.label} title={s.title}
                      className="text-[10px] bg-slate-800 border border-slate-700/60
                                 text-slate-500 px-2.5 py-1 rounded-full hover:text-slate-400
                                 transition-colors cursor-default">
                      {s.label}
                    </span>
                  ))}
                </div>
              </>
            ) : loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-[#1e293b] rounded-xl p-4 border border-slate-700 animate-pulse h-20"
                  />
                ))}
              </div>
            ) : null}
          </section>

          {/* ────────────────────────────────────────────────────────────
              SECTION 02 — Diagnostic de Consommation
          ──────────────────────────────────────────────────────────── */}
          <section ref={section02Ref}>
            <SectionHeading
              number="02"
              title="Diagnostic de Consommation"
              subtitle={
                realDiag
                  ? `Courbe de charge réelle Enedis — ${(realDiag as { days_measured?: number }).days_measured ?? "?"} jours mesurés`
                  : "Estimation du talon de nuit — énergie consommée hors heures de production"
              }
            />

            {loading && !audit ? (
              <SkeletonBlock h="h-72" />
            ) : diag ? (
              <div className={`bg-[#1e293b] rounded-2xl p-6 border space-y-6 transition-colors duration-500
                              ${realDiag ? "border-[#bef264]/40" : "border-slate-700"}`}>
                {/* Pedagogical intro — changes when real data is loaded */}
                {realDiag ? (
                  <div className="flex items-start gap-3 bg-[#bef264]/5 border border-[#bef264]/20 rounded-xl px-4 py-3">
                    <CheckCircle className="w-4 h-4 text-[#bef264] shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Profil issu de{" "}
                      <span className="text-[#bef264] font-semibold">vos données Enedis réelles</span>.
                      Le graphique ci-dessous reflète votre courbe de charge mesurée —
                      les chiffres sont précis à l&apos;euro près.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Sans données Linky / Enedis, la consommation est estimée à partir
                    de la surface bâtie et du profil sectoriel. Le{" "}
                    <span className="text-[#bef264] font-semibold">talon de nuit</span> représente
                    la fraction consommée hors heures d&apos;exploitation : éclairage résiduel,
                    veilles machines, climatisation de garde, etc.
                  </p>
                )}

                {/* Load-profile chart */}
                <ConsumptionChart
                  profile={diag.load_profile}
                  annualKwh={diag.theoretical_annual_consumption_kwh}
                />

                {/* Key figures */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-700">
                  <div className="bg-[#0f172a] rounded-xl p-4">
                    <p className="text-xs text-slate-400 mb-1">Consommation estimée</p>
                    <p className="text-xl font-bold text-white">
                      {(diag.theoretical_annual_consumption_kwh / 1000).toFixed(0)}
                      <span className="text-sm font-normal text-slate-400 ml-1">MWh / an</span>
                    </p>
                  </div>
                  <div className="bg-[#0f172a] rounded-xl p-4">
                    <p className="text-xs text-slate-400 mb-1">Gaspillage nocturne</p>
                    <p className="text-xl font-bold text-[#bef264]">
                      {(diag.estimated_waste_kwh / 1000).toFixed(0)}
                      <span className="text-sm font-normal text-slate-400 ml-1">MWh / an</span>
                    </p>
                    {/* Scope 2 CO2e inline */}
                    {diag.wasted_tco2e != null && (
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <Leaf className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="text-emerald-400 font-medium">{diag.wasted_tco2e} tCO₂e</span>
                        <span>inutiles / an (Scope 2)</span>
                      </p>
                    )}
                  </div>
                  <div className="bg-[#0f172a] rounded-xl p-4">
                    <p className="text-xs text-slate-400 mb-1">Potentiel d&apos;économie</p>
                    <p className="text-xl font-bold text-[#bef264]">
                      {diag.opex_savings_eur_per_year.toLocaleString("fr-FR")}
                      <span className="text-sm font-normal text-slate-400 ml-1">€ / an</span>
                    </p>
                  </div>
                </div>

                {/* ── GetEcoPulse Grade + ISO 50001 ─────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-700">

                  {/* Grade badge */}
                  {diag.grade && diag.grade !== "N/A" && (() => {
                    const cfg = GRADE_CONFIG[diag.grade] ?? GRADE_CONFIG["F"];
                    return (
                      <div className="bg-[#0f172a] rounded-xl p-4 flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                          <span className={`text-3xl font-black ${cfg.text}`}>{diag.grade}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Award className="w-3.5 h-3.5 text-slate-400" />
                            <p className="text-xs text-slate-400 uppercase tracking-widest">GetEcoPulse Grade</p>
                          </div>
                          <p className={`text-sm font-semibold ${cfg.text}`}>
                            {cfg.label}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            vs médiane IEA mondiale du secteur
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ISO 50001 pre-assessment */}
                  {diag.iso_50001_assessment && (
                    <div className="bg-[#0f172a] rounded-xl p-4">
                      <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">
                        Pré-évaluation ISO 50001
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2 text-xs">
                          {diag.iso_50001_assessment.has_30min_data ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          )}
                          <span className={diag.iso_50001_assessment.has_30min_data ? "text-emerald-300" : "text-red-300"}>
                            {diag.iso_50001_assessment.has_30min_data
                              ? "Mesure continue validée (§6.3)"
                              : "Défaut de mesure continue — requis §6.3"}
                          </span>
                        </li>
                        <li className="flex items-start gap-2 text-xs">
                          {diag.iso_50001_assessment.has_quantified_baseline ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                          )}
                          <span className={diag.iso_50001_assessment.has_quantified_baseline ? "text-emerald-300" : "text-yellow-300"}>
                            {diag.iso_50001_assessment.has_quantified_baseline
                              ? "Talon de nuit documenté (§6.6)"
                              : "Talon de consommation non piloté (§6.6)"}
                          </span>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          {/* ────────────────────────────────────────────────────────────
              SECTION 03 — Pistes d'Économies
          ──────────────────────────────────────────────────────────── */}
          <section>
            <SectionHeading
              number="03"
              title="Pistes d'Économies & Scénarios"
              subtitle="Trois leviers d'action classés par facilité de mise en œuvre"
            />

            {loading && !audit ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SkeletonBlock h="h-64" />
                <SkeletonBlock h="h-64" />
                <SkeletonBlock h="h-64" />
              </div>
            ) : fin && diag && phys ? (
              /* ── Wrapper: relative so the lock overlay can be absolute ── */
              <div className="relative">

                {/* Cards grid — blurred when locked */}
                <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 transition-all duration-300
                                 ${!isPurchased && !realDiag ? "blur-sm pointer-events-none select-none" : ""}`}>

                  {/* Card 1 — Effacement OPEX */}
                  <SolutionCard
                    variant="primary"
                    badge="PRIORITAIRE"
                    icon={Moon}
                    title="Effacement Talon de Nuit"
                    description="Actions OPEX — sans investissement lourd"
                    metrics={[
                      {
                        label: "Économie potentielle",
                        value: `${diag.opex_savings_eur_per_year.toLocaleString("fr-FR")} €/an`,
                      },
                      {
                        label: "Gaspillage ciblé",
                        value: `${(diag.estimated_waste_kwh / 1000).toFixed(0)} MWh/an`,
                      },
                      {
                        label: "Talon nocturne",
                        value: `${Math.round(diag.night_talon_pct * 100)} %`,
                      },
                      {
                        label: "Investissement",
                        value: `${diag.opex_capex_eur.toLocaleString("fr-FR")} €`,
                      },
                    ]}
                    roi={diag.opex_roi}
                  />

                  {/* Card 2 — Solaire CAPEX */}
                  <SolutionCard
                    variant="secondary"
                    icon={Sun}
                    title="Installation Solaire"
                    description="Autoconsommation — réduction de la facture"
                    metrics={[
                      {
                        label: "CAPEX estimé",
                        value: `${(fin.capex_eur / 1000).toFixed(0)} k€`,
                      },
                      {
                        label: "Économie annuelle",
                        value: `${(fin.annual_savings_eur / 1000).toFixed(0)} k€/an`,
                      },
                      {
                        label: "Puissance crête",
                        value: `${phys.solar_potential.peak_power_kwp.toFixed(0)} kWp`,
                      },
                      {
                        label: "Couverture",
                        value: `${fin.solar_coverage_pct} %`,
                      },
                    ]}
                    roi={
                      fin.roi_years !== null
                        ? `${fin.roi_years} ans`
                        : "Non calculable"
                    }
                  />

                  {/* Card 3 — Thermique (coming soon) */}
                  <SolutionCard
                    variant="disabled"
                    icon={Flame}
                    title="Isolation Thermique"
                    description="Réduction des pertes par la toiture"
                    metrics={[
                      {
                        label: "Risque thermique",
                        value: phys.thermal_assessment.risk_level,
                      },
                      {
                        label: "Score de perte",
                        value: `${Math.round(phys.thermal_assessment.score * 100)} %`,
                      },
                    ]}
                    roi="À venir"
                  />
                </div>

                {/* ── Lock overlay — shown when not purchased ────────── */}
                {!isPurchased && !realDiag && (
                  <div className="absolute inset-0 flex items-center justify-center
                                  rounded-2xl bg-[#0f172a]/75 backdrop-blur-[2px]">
                    <div className="flex flex-col items-center gap-5 text-center px-6 max-w-sm">
                      <div className="w-12 h-12 rounded-full bg-[#1e293b] border border-slate-700
                                      flex items-center justify-center">
                        <Lock className="w-5 h-5 text-[#bef264]" />
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm mb-1">
                          Plan d&apos;action complet
                        </p>
                        <p className="text-slate-400 text-xs leading-relaxed">
                          Chiffres détaillés, scénarios ROI et recommandations
                          personnalisées pour ce bâtiment.
                        </p>
                      </div>
                      <button
                        onClick={handlePurchase}
                        disabled={checkingPurchase || !addressHash}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold
                                   bg-[#bef264] text-slate-900 hover:bg-[#a3e635] transition-colors
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {checkingPurchase ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Lock className="w-4 h-4" />
                        )}
                        {checkingPurchase ? "Redirection…" : "Déverrouiller — 29 €"}
                      </button>
                      <p className="text-[10px] text-slate-600">
                        Paiement unique · Accès permanent dans ce navigateur
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </section>

          {/* ────────────────────────────────────────────────────────────
              CTA — Affiner avec les vraies données
          ──────────────────────────────────────────────────────────── */}
          {audit && (
            <section className="pb-4">
              {/* Badge "Données réelles actives" */}
              {realDiag && (
                <div className="flex items-center gap-2 mb-4 text-sm text-[#bef264] bg-[#bef264]/10
                                border border-[#bef264]/30 rounded-xl px-4 py-3">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Analyse basée sur vos données Linky réelles —{" "}
                    <span className="font-semibold">
                      {(realDiag as { days_measured?: number }).days_measured ?? "?"} jours mesurés
                    </span>
                  </span>
                </div>
              )}

              {/* CTA block — hidden once CSV is uploaded */}
              {!realDiag && !showCsvUpload && (
                <div className="bg-gradient-to-r from-[#1e293b] to-[#0f172a]
                                border border-slate-700 rounded-2xl p-6
                                flex flex-col sm:flex-row items-center gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart2 className="w-5 h-5 text-[#bef264]" />
                      <span className="text-[#bef264] text-xs font-semibold uppercase tracking-widest">
                        Précision maximale
                      </span>
                    </div>
                    <h3 className="text-white font-bold text-base mb-1">
                      Ces chiffres sont des estimations sectorielles.
                    </h3>
                    <p className="text-slate-400 text-sm">
                      Importez votre courbe de charge Enedis pour obtenir votre
                      diagnostic réel — précis à l&apos;euro près sur vos données.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCsvUpload(true)}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl
                               bg-[#bef264] text-slate-900 text-sm font-bold
                               hover:bg-[#a3e635] transition-colors shrink-0 whitespace-nowrap"
                  >
                    Affiner avec mes données réelles
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* CSV upload panel — shown after auth */}
              {showCsvUpload && !realDiag && (
                <CsvUpload
                  nafCode={nafCode}
                  surfaceM2={audit?.physical_data.footprint.area_m2 ?? undefined}
                  countryCode={audit?.country_code ?? "DEFAULT"}
                  onResult={(d) => {
                    setRealDiag(d as unknown as AuditResult["diagnostic"]);
                    setShowCsvUpload(false);
                  }}
                  onClose={() => setShowCsvUpload(false)}
                />
              )}
            </section>
          )}

        </main>
      )}

      {/* Auth modal — portal-style overlay */}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthenticated={() => {
            setShowAuth(false);
            setShowCsvUpload(true);
          }}
        />
      )}

    </div>
  );
}
