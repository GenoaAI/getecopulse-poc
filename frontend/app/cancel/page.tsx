"use client";

import { useRouter } from "next/navigation";
import { Zap, XCircle, ArrowLeft } from "lucide-react";

export default function CancelPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      {/* Minimal header */}
      <header className="px-6 py-4 border-b border-slate-800">
        <div className="max-w-6xl mx-auto flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#bef264]" />
          <span className="text-base font-bold">GetEcoPulse</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="flex flex-col items-center gap-6 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700
                          flex items-center justify-center">
            <XCircle className="w-8 h-8 text-slate-400" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Paiement annulé</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Votre paiement n&apos;a pas été finalisé. Aucun montant n&apos;a été
              débité. Vous pouvez relancer le processus depuis votre rapport.
            </p>
          </div>

          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl
                       bg-slate-700 text-slate-200 text-sm font-medium
                       hover:bg-slate-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au rapport
          </button>
        </div>
      </main>
    </div>
  );
}
