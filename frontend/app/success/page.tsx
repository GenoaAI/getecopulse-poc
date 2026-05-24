"use client";

/**
 * GetEcoPulse — Stripe success page
 *
 * Verifies the Stripe session, marks the address as purchased in localStorage,
 * then lets the user return to the main page where the audit is restored.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Zap, CheckCircle, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { checkPurchase } from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

/** localStorage key: JSON array of purchased address hashes */
const LS_PURCHASED = "gep_purchased";
/** localStorage key: serialized audit state to restore on return */
const LS_RESTORE   = "gep_restore";

// ── Inner component (uses useSearchParams — must be in Suspense) ─────────────

function SuccessContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const sessionId   = searchParams.get("session_id")   ?? "";
  const addressHash = searchParams.get("address_hash") ?? "";

  const [status,  setStatus]  = useState<"loading" | "ok" | "error">("loading");
  const [address, setAddress] = useState<string>("");

  useEffect(() => {
    if (!sessionId || !addressHash) {
      setStatus("error");
      return;
    }

    checkPurchase(addressHash, sessionId)
      .then((purchased) => {
        if (!purchased) { setStatus("error"); return; }

        // ── Persist purchase in localStorage ──────────────────────────
        const stored  = JSON.parse(localStorage.getItem(LS_PURCHASED) ?? "[]") as string[];
        const updated = Array.from(new Set([...stored, addressHash]));
        localStorage.setItem(LS_PURCHASED, JSON.stringify(updated));

        // ── Move pending audit state to restore slot ───────────────────
        const pendingKey = `gep_pending_${addressHash}`;
        const pending    = localStorage.getItem(pendingKey);
        if (pending) {
          localStorage.setItem(LS_RESTORE, pending);
          localStorage.removeItem(pendingKey);
          // Try to read the address from the saved state for display
          try {
            const parsed = JSON.parse(pending) as { address?: string };
            setAddress(parsed.address ?? "");
          } catch { /* ignore */ }
        }

        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [sessionId, addressHash]);

  // ── Loading ────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="w-12 h-12 text-[#bef264] animate-spin" />
        <p className="text-slate-300">Vérification du paiement…</p>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <h1 className="text-xl font-bold text-white">Vérification impossible</h1>
        <p className="text-slate-400 text-sm">
          Le paiement n&apos;a pas pu être confirmé. Si vous avez bien été débité,
          contactez le support à{" "}
          <a href="mailto:support@getecopulse.fr" className="text-[#bef264] underline">
            support@getecopulse.fr
          </a>{" "}
          en indiquant votre adresse email Stripe.
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-2 px-5 py-2.5 rounded-xl bg-slate-700 text-slate-200
                     hover:bg-slate-600 transition-colors text-sm font-medium"
        >
          Retour à l&apos;accueil
        </button>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-6 text-center max-w-md">
      <div className="w-16 h-16 rounded-full bg-[#bef264]/10 border border-[#bef264]/30
                      flex items-center justify-center">
        <CheckCircle className="w-8 h-8 text-[#bef264]" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Paiement confirmé !</h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          Votre rapport complet est déverrouillé.
          {address && (
            <>
              {" "}L&apos;adresse <span className="text-slate-300 font-medium">{address}</span> est
              mémorisée dans ce navigateur.
            </>
          )}
        </p>
      </div>

      {/* Key features unlocked */}
      <ul className="text-left space-y-2 w-full">
        {[
          "Plan d'action chiffré (§03)",
          "Export PDF vectoriel du rapport complet",
          "Rapport disponible dans ce navigateur sans re-paiement",
        ].map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-slate-300">
            <CheckCircle className="w-4 h-4 text-[#bef264] shrink-0" />
            {item}
          </li>
        ))}
      </ul>

      <button
        onClick={() => router.push("/")}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl
                   bg-[#bef264] text-slate-900 text-sm font-bold
                   hover:bg-[#a3e635] transition-colors"
      >
        Voir mon rapport complet
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuccessPage() {
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
        <Suspense
          fallback={
            <Loader2 className="w-10 h-10 text-[#bef264] animate-spin" />
          }
        >
          <SuccessContent />
        </Suspense>
      </main>
    </div>
  );
}
