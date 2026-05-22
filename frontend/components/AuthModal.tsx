"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { X, Mail, Loader2, CheckCircle } from "lucide-react";

interface Props {
  onClose: () => void;
  onAuthenticated: () => void;
}

export default function AuthModal({ onClose, onAuthenticated }: Props) {
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const supabase = createClient();

  async function handleMagicLink() {
    if (!email.trim() || !supabase) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // After clicking the email link, user lands back on this page
        emailRedirectTo: window.location.href,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  async function handleGoogle() {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success, browser redirects — no further action needed
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1e293b] border border-slate-700 rounded-2xl w-full max-w-md p-6 relative">

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white mb-1">
            Accéder à l&apos;analyse réelle
          </h2>
          <p className="text-sm text-slate-400">
            Créez un compte gratuit pour importer vos données Enedis
            et obtenir un diagnostic précis à l&apos;euro près.
          </p>
        </div>

        {sent ? (
          /* Confirmation state */
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle className="w-10 h-10 text-[#bef264]" />
            <p className="text-white font-semibold">Vérifiez votre email</p>
            <p className="text-sm text-slate-400">
              Un lien de connexion a été envoyé à{" "}
              <span className="text-[#bef264]">{email}</span>.
              <br />Cliquez dessus pour continuer.
            </p>
          </div>
        ) : (
          <>
            {/* Google OAuth */}
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg
                         bg-white hover:bg-gray-100 text-gray-800 text-sm font-medium
                         transition-colors disabled:opacity-50 mb-4"
            >
              {/* Google logo SVG */}
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuer avec Google
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="text-xs text-slate-500">ou</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>

            {/* Magic link */}
            <div className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleMagicLink()}
                  placeholder="votre@email.com"
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700
                             text-sm text-white placeholder:text-slate-500
                             focus:outline-none focus:ring-1 focus:ring-[#bef264]/50"
                />
              </div>
              <button
                onClick={handleMagicLink}
                disabled={loading || !email.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                           bg-[#bef264] text-slate-900 text-sm font-semibold
                           hover:bg-[#a3e635] transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Mail className="w-4 h-4" />}
                Recevoir un lien de connexion
              </button>
            </div>

            {error && (
              <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
            )}

            <p className="mt-4 text-[10px] text-slate-500 text-center">
              En créant un compte, vous acceptez que vos données d&apos;audit
              soient sauvegardées pour votre historique.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
