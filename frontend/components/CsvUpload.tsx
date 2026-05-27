"use client";

import { useState, useRef } from "react";
import {
  Upload, FileText, Loader2, CheckCircle, AlertCircle, X,
  HelpCircle, FlaskConical, ExternalLink,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import dynamic from "next/dynamic";

// Lazy-load the tutorial to keep the main bundle small
const EnedisTutorial = dynamic(() => import("./EnedisTutorial"), { ssr: false });

interface RealDiagnostic {
  theoretical_annual_consumption_kwh: number;
  night_talon_pct: number;
  estimated_waste_kwh: number;
  opex_savings_eur_per_year: number;
  opex_capex_eur: number;
  opex_roi: string;
  load_profile: {
    weekday_kw: number[];
    weekend_kw: number[];
    labels: string[];
    peak_hours: [number, number];
    source: string;
    annual_kwh: number;
    days_count: number;
  };
  data_source: "linky";
  days_measured: number;
  wasted_tco2e: number;
  grade: string;
  iso_50001_assessment: {
    has_30min_data: boolean;
    has_quantified_baseline: boolean;
  };
}

interface Props {
  nafCode: string;
  surfaceM2?: number;
  countryCode?: string;
  onResult: (diagnostic: RealDiagnostic) => void;
  onClose: () => void;
}

export default function CsvUpload({ nafCode, surfaceM2, countryCode, onResult, onClose }: Props) {
  const [file, setFile]               = useState<File | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const inputRef                      = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  async function handleUpload(overrideFile?: File) {
    const target = overrideFile ?? file;
    if (!target) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("csv_file", target);
    formData.append("naf_code", nafCode);
    if (surfaceM2)   formData.append("surface_m2",   String(surfaceM2));
    if (countryCode) formData.append("country_code", countryCode);

    try {
      const res = await fetch(`${API_BASE}/api/diagnostic/real`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? `Erreur ${res.status}`);
      }
      const data = await res.json() as { diagnostic: RealDiagnostic };
      onResult(data.diagnostic);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  /** Load the bundled demo CSV and immediately trigger the analysis */
  async function handleLoadDemo() {
    setDemoLoading(true);
    setError(null);
    try {
      const res = await fetch("/template_enedis.csv");
      if (!res.ok) throw new Error("Impossible de charger le fichier d'exemple.");
      const blob = await res.blob();
      const demoFile = new File([blob], "demo_courbe_de_charge.csv", { type: "text/csv" });
      setFile(demoFile);
      // Auto-trigger analysis right away
      await handleUpload(demoFile);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement du fichier d'exemple.");
    } finally {
      setDemoLoading(false);
    }
  }

  const isAnalysing = loading || demoLoading;

  return (
    <>
      <div className="bg-[#1e293b] border border-[#bef264]/30 rounded-2xl p-6 relative">

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <h3 className="text-white font-semibold pr-8 mb-1">
          Importer vos données Enedis
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Format CSV courbe de charge, pas 30 min — exporté depuis votre espace client Enedis.
        </p>

        {/* Prominent guide button */}
        <button
          onClick={() => setShowTutorial(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-4
                     bg-blue-950/50 border border-blue-700/40
                     hover:border-blue-500/60 hover:bg-blue-900/40 transition-colors text-left group"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-700/30 flex items-center justify-center shrink-0">
            <HelpCircle className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-300 group-hover:text-blue-200 transition-colors">
              Comment récupérer ma courbe de charge ?
            </p>
            <p className="text-[11px] text-blue-400/60 mt-0.5">
              Guide pas à pas — Enedis Pro &amp; fournisseurs
            </p>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-blue-500/50 shrink-0" />
        </button>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-3
                      cursor-pointer transition-colors
                      ${file
                        ? "border-[#bef264]/50 bg-[#bef264]/5"
                        : "border-slate-600 hover:border-slate-500 bg-slate-800/50"
                      }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
          />
          {file ? (
            <>
              <FileText className="w-8 h-8 text-[#bef264]" />
              <p className="text-sm text-white font-medium">{file.name}</p>
              <p className="text-xs text-slate-400">
                {(file.size / 1024).toFixed(0)} Ko — cliquez pour changer
              </p>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-slate-500" />
              <p className="text-sm text-slate-300">
                Glissez votre fichier CSV ici
              </p>
              <p className="text-xs text-slate-500">ou cliquez pour parcourir</p>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-900/20 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Primary CTA */}
        <button
          onClick={() => handleUpload()}
          disabled={!file || isAnalysing}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5
                     rounded-lg bg-[#bef264] text-slate-900 text-sm font-semibold
                     hover:bg-[#a3e635] transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…</>
          ) : (
            <><CheckCircle className="w-4 h-4" /> Analyser mes vraies données</>
          )}
        </button>

        {/* Demo CTA — anti-friction */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-700" />
          <span className="text-[10px] text-slate-600 uppercase tracking-widest">ou</span>
          <div className="flex-1 h-px bg-slate-700" />
        </div>
        <button
          onClick={handleLoadDemo}
          disabled={isAnalysing}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5
                     rounded-lg border border-slate-600 bg-slate-800/50 text-slate-300
                     text-sm hover:border-slate-500 hover:text-white transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {demoLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Chargement de l&apos;exemple…</>
          ) : (
            <><FlaskConical className="w-4 h-4 text-blue-400" /> Tester avec un fichier d&apos;exemple</>
          )}
        </button>
        <p className="mt-1.5 text-center text-[10px] text-slate-600">
          Données industrielles simulées — 91 jours · pas 30 min
        </p>
      </div>

      {/* Tutorial slide-over */}
      {showTutorial && (
        <EnedisTutorial onClose={() => setShowTutorial(false)} />
      )}
    </>
  );
}
