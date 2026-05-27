"use client";

import { useEffect } from "react";
import { X, LogIn, FolderOpen, FileDown, ExternalLink, Download } from "lucide-react";

interface Props {
  onClose: () => void;
}

const STEPS = [
  {
    num: "01",
    icon: LogIn,
    title: "Connectez-vous au portail",
    body: (
      <>
        Rendez-vous sur votre espace client Enedis ou votre fournisseur d&apos;énergie.
        <div className="mt-3 flex flex-col gap-2">
          <a
            href="https://mon-compte-client.enedis.fr/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[#bef264] hover:underline text-xs"
          >
            Mon Compte Client Enedis <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href="https://datahub.enedis.fr/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[#bef264] hover:underline text-xs"
          >
            Portail Data Enedis (Pro) <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <p className="mt-2 text-slate-500 text-xs italic">
          Votre fournisseur (EDF, TotalEnergies, Engie…) peut aussi proposer cet export
          dans son espace client.
        </p>
      </>
    ),
  },
  {
    num: "02",
    icon: FolderOpen,
    title: "Accédez à vos données de consommation",
    body: (
      <>
        Une fois connecté, naviguez vers :
        <ol className="mt-2 space-y-1.5 list-none">
          {[
            "Gérer ma consommation",
            "Mes données de consommation",
            "Courbe de charge / Données de comptage",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-slate-500 text-xs italic">
          L&apos;emplacement exact varie selon votre portail. Cherchez les mots clés
          &laquo;&nbsp;courbe de charge&nbsp;&raquo; ou &laquo;&nbsp;données de comptage&nbsp;&raquo;.
        </p>
      </>
    ),
  },
  {
    num: "03",
    icon: FileDown,
    title: "Exportez votre courbe de charge",
    body: (
      <>
        Sélectionnez les paramètres suivants avant l&apos;export :
        <div className="mt-3 space-y-2">
          {[
            { label: "Type", value: "Courbe de charge (pas 30 min)" },
            { label: "Période", value: "12 derniers mois (minimum)" },
            { label: "Format", value: "CSV" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 w-16 shrink-0">{label}</span>
              <span className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-[#bef264] font-mono">
                {value}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 bg-yellow-900/20 border border-yellow-500/20 rounded-lg px-3 py-2">
          <p className="text-xs text-yellow-300/80">
            ⚠️ N&apos;utilisez pas l&apos;export &laquo;&nbsp;Index&nbsp;&raquo; ou
            &laquo;&nbsp;Consommation journalière&nbsp;&raquo; — seule la{" "}
            <strong>courbe de charge à pas 30 min</strong> contient les données
            nécessaires à l&apos;analyse.
          </p>
        </div>
      </>
    ),
  },
];

export default function EnedisTutorial({ onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <aside
        className="fixed top-0 right-0 h-full w-full max-w-md z-50
                   bg-[#0f172a] border-l border-slate-700
                   flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-800">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
              Guide d&apos;extraction
            </p>
            <h2 className="text-base font-bold text-white leading-snug">
              Comment récupérer votre<br />Courbe de Charge ?
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors ml-4 mt-0.5 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {STEPS.map(({ num, icon: Icon, title, body }) => (
            <div key={num} className="flex gap-4">
              {/* Step number + connector */}
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-[#bef264]/10 border border-[#bef264]/30
                                flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-[#bef264]" />
                </div>
                {num !== "03" && (
                  <div className="w-px flex-1 bg-slate-700/60 mt-2 mb-1" />
                )}
              </div>
              {/* Content */}
              <div className="pb-2 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono text-[#bef264]/60">{num}</span>
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                </div>
                <div className="text-sm text-slate-400 leading-relaxed">{body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer — download template */}
        <div className="px-6 py-5 border-t border-slate-800 bg-[#0f172a]">
          <p className="text-xs text-slate-500 mb-3">
            Pas encore de fichier Enedis ? Testez l&apos;analyse avec notre fichier d&apos;exemple.
          </p>
          <a
            href="/template_enedis.csv"
            download="template_enedis.csv"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg
                       bg-slate-800 border border-slate-700 text-slate-300 text-sm
                       hover:bg-slate-700 hover:text-white transition-colors"
          >
            <Download className="w-4 h-4 text-[#bef264]" />
            Télécharger le fichier d&apos;exemple (.csv)
          </a>
        </div>
      </aside>
    </>
  );
}
