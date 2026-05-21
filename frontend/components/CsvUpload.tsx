"use client";

import { useState, useRef } from "react";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  /** Building footprint area from OSM — enables EUI-based grade */
  surfaceM2?: number;
  /** ISO-2 country code from geocoding — enables country-specific Scope 2 factor */
  countryCode?: string;
  onResult: (diagnostic: RealDiagnostic) => void;
  onClose: () => void;
}

export default function CsvUpload({ nafCode, surfaceM2, countryCode, onResult, onClose }: Props) {
  const [file, setFile]         = useState<File | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("csv_file", file);
    formData.append("naf_code", nafCode);
    if (surfaceM2)    formData.append("surface_m2",   String(surfaceM2));
    if (countryCode)  formData.append("country_code", countryCode);

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

  return (
    <div className="bg-[#1e293b] border border-[#bef264]/30 rounded-2xl p-6 relative">

      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <h3 className="text-white font-semibold mb-1">
        Importer vos données Enedis
      </h3>
      <p className="text-xs text-slate-400 mb-4">
        Exportez votre courbe de charge depuis{" "}
        <span className="text-[#bef264]">Mon Espace Client Enedis</span>{" "}
        → Gérer ma consommation → Télécharger mes données (format CSV, pas 30 min).
      </p>

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

      {/* Submit */}
      <button
        onClick={handleUpload}
        disabled={!file || loading}
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
    </div>
  );
}
