"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { checkPurchase } from "@/lib/api";

const LS_PURCHASED = "gep_purchased";
const LS_RESTORE   = "gep_restore";

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const addressHash = searchParams.get("address_hash");

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!sessionId || !addressHash) {
      setStatus("error");
      setErrorMsg("Paramètres de session manquants.");
      return;
    }

    let isMounted = true;

    async function verify() {
      try {
        const isPaid = await checkPurchase(addressHash!, sessionId!);
        if (!isMounted) return;

        if (isPaid) {
          // 1. Mark as purchased in local storage
          const stored = JSON.parse(localStorage.getItem(LS_PURCHASED) ?? "[]") as string[];
          if (!stored.includes(addressHash!)) {
            stored.push(addressHash!);
            localStorage.setItem(LS_PURCHASED, JSON.stringify(stored));
          }

          // 2. Try to restore previous session state
          const pendingKey = `gep_pending_${addressHash}`;
          const pendingData = localStorage.getItem(pendingKey);
          if (pendingData) {
            localStorage.setItem(LS_RESTORE, pendingData);
            localStorage.removeItem(pendingKey);
          }

          setStatus("success");

          // 3. Redirect back to homepage where the state will be restored
          setTimeout(() => {
            router.push("/");
          }, 2000);
        } else {
          setStatus("error");
          setErrorMsg("La session de paiement n'a pas pu être validée comme payée.");
        }
      } catch (err) {
        if (!isMounted) return;
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Erreur de connexion avec le serveur.");
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [sessionId, addressHash, router]);

  if (status === "verifying") {
    return (
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-12 h-12 text-[#bef264] animate-spin" />
        <h1 className="text-xl font-semibold">Validation de votre paiement...</h1>
        <p className="text-sm text-slate-400">Veuillez ne pas fermer cette page.</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <XCircle className="w-16 h-16 text-red-500" />
        <h1 className="text-xl font-bold text-red-500">Erreur de paiement</h1>
        <p className="text-sm text-slate-300">{errorMsg}</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
        >
          Retour à l'accueil
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <CheckCircle2 className="w-16 h-16 text-[#bef264]" />
      <h1 className="text-2xl font-bold text-white">Merci pour votre achat !</h1>
      <p className="text-sm text-slate-300">Votre paiement a été validé avec succès.</p>
      <p className="text-xs text-slate-400 mt-2">Redirection vers votre audit déverrouillé...</p>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center p-6">
      <Suspense fallback={
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-[#bef264] animate-spin" />
          <h1 className="text-xl font-semibold">Chargement...</h1>
        </div>
      }>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
