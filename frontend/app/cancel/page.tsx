"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";

export default function CancelPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/");
    }, 4000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <XCircle className="w-16 h-16 text-yellow-500" />
        <h1 className="text-xl font-bold text-white">Paiement annulé</h1>
        <p className="text-sm text-slate-300">
          La transaction a été annulée. Aucun montant ne vous a été débité.
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
        >
          Retour à l'accueil
        </button>
        <p className="text-[10px] text-slate-500 mt-2">
          Redirection automatique vers l'accueil...
        </p>
      </div>
    </div>
  );
}
