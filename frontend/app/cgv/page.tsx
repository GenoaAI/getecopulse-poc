import Link from "next/link";
import { Zap } from "lucide-react";

export const metadata = {
  title: "Conditions Générales de Vente — GetEcoPulse",
};

export default function CGV() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      <header className="px-6 py-4 border-b border-slate-800">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Zap className="w-5 h-5 text-[#bef264]" />
            <span className="text-base font-bold">GetEcoPulse</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2">Conditions Générales de Vente</h1>
          <p className="text-slate-400 text-sm mb-10">Dernière mise à jour : mai 2026 — Applicables aux professionnels (B2B)</p>

          {/* Objet */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              1. Objet
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>
                Les présentes Conditions Générales de Vente (CGV) régissent les relations contractuelles
                entre <strong className="text-white">GetEcoPulse</strong> (ci-après « le Prestataire »)
                et tout professionnel ou entreprise (ci-après « le Client ») souhaitant acquérir un
                rapport d&apos;audit énergétique complet via la plateforme <strong className="text-white">getecopulse.fr</strong>.
              </p>
              <p>
                Le service GetEcoPulse est exclusivement destiné aux professionnels agissant dans le
                cadre de leur activité (gestionnaires de patrimoine immobilier, directeurs de maintenance,
                responsables énergie, etc.). Le service n&apos;est pas destiné aux particuliers consommateurs
                au sens du Code de la consommation.
              </p>
              <p>
                Toute commande implique l&apos;acceptation pleine et entière des présentes CGV.
              </p>
            </div>
          </section>

          {/* Description du service */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              2. Description du service et tunnel d&apos;accès
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>GetEcoPulse propose un service d&apos;audit énergétique automatisé structuré en deux niveaux :</p>
              <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                <div>
                  <p className="font-medium text-white mb-1">🆓 Accès gratuit (sans inscription)</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-400">
                    <li>Modélisation satellite du bâtiment (empreinte OSM, analyse toiture)</li>
                    <li>Diagnostic de consommation synthétique (§01 et §02 estimés)</li>
                    <li>Analyse de la courbe de charge Enedis réelle (import CSV — §02 enrichi)</li>
                  </ul>
                </div>
                <div className="border-t border-slate-700 pt-3">
                  <p className="font-medium text-white mb-1">💳 Accès payant (paiement unique)</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-400">
                    <li>Section 03 — Plan d&apos;action chiffré et scénarios ROI</li>
                    <li>Export du rapport PDF vectoriel complet</li>
                  </ul>
                </div>
              </div>
              <p>
                L&apos;accès payant est déverrouillé immédiatement et définitivement dans le navigateur
                utilisé pour le paiement, sans limite de durée.
              </p>
            </div>
          </section>

          {/* Prix */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              3. Prix et modalités de paiement
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>
                Le prix du rapport complet est indiqué en euros TTC sur la page de commande au moment
                de l&apos;achat. Il peut être modifié à tout moment par le Prestataire ; le prix applicable
                est celui affiché au moment de la commande.
              </p>
              <p>
                Le paiement est effectué en ligne, de manière sécurisée, via la plateforme{" "}
                <strong className="text-white">Stripe</strong>. Les données bancaires du Client sont
                traitées exclusivement par Stripe et ne transitent jamais par les serveurs GetEcoPulse.
                Stripe est certifié PCI DSS niveau 1.
              </p>
              <p>
                Le paiement est exigible en totalité au moment de la commande. Aucun
                échelonnement n&apos;est proposé.
              </p>
            </div>
          </section>

          {/* Modalités d'accès au PDF */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              4. Modalités d&apos;accès au contenu numérique
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>
                Conformément à l&apos;article L. 221-28 du Code de la consommation (inapplicable aux
                professionnels, mentionné ici à titre informatif), la fourniture du contenu numérique
                débute immédiatement après confirmation du paiement.
              </p>
              <p>
                L&apos;accès au rapport PDF et au plan d&apos;action est activé dans le navigateur du Client
                dès réception de la confirmation de paiement Stripe, sans délai supplémentaire.
                L&apos;accès est conservé localement dans le navigateur (via <code className="text-[#bef264] bg-slate-800 px-1 rounded">localStorage</code>)
                et reste disponible sans reconnexion.
              </p>
              <p className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3">
                <strong className="text-amber-400">Important :</strong> L&apos;accès étant mémorisé dans
                le navigateur, il n&apos;est pas transférable entre appareils. En cas de perte d&apos;accès
                (suppression du cache, changement d&apos;appareil), le Client peut contacter le support
                en fournissant son email de confirmation Stripe.
              </p>
            </div>
          </section>

          {/* Absence de droit de rétractation */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              5. Absence de droit de rétractation — Contenu numérique à exécution immédiate
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>
                Le service GetEcoPulse étant exclusivement destiné aux <strong className="text-white">professionnels</strong>,
                les dispositions relatives au droit de rétractation des consommateurs (art. L. 221-18
                et suivants du Code de la consommation) ne sont pas applicables.
              </p>
              <p>
                De plus, la prestation consiste en la fourniture d&apos;un <strong className="text-white">contenu numérique
                non fourni sur support matériel</strong>, dont l&apos;exécution commence immédiatement après
                le paiement, avec l&apos;accord exprès du Client. En conséquence, aucun remboursement
                ne peut être accordé après génération du rapport, sauf défaillance technique imputable
                au Prestataire.
              </p>
            </div>
          </section>

          {/* Responsabilité */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              6. Responsabilité et limites
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>
                Les rapports GetEcoPulse sont des <strong className="text-white">estimations algorithmiques</strong> basées
                sur des données publiques (OSM, Mapbox, Open-Meteo, Enedis). Ils ne constituent pas
                une étude de faisabilité certifiée par un bureau d&apos;études agréé et ne peuvent être
                utilisés comme seul fondement d&apos;une décision d&apos;investissement.
              </p>
              <p>
                La responsabilité du Prestataire est limitée au montant payé par le Client pour la
                commande concernée. Le Prestataire ne saurait être tenu responsable de dommages
                indirects (manque à gagner, perte d&apos;exploitation).
              </p>
            </div>
          </section>

          {/* Droit applicable */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              7. Droit applicable et juridiction
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>
                Les présentes CGV sont soumises au droit français. Tout litige relatif à leur
                interprétation ou exécution sera soumis, à défaut d&apos;accord amiable, à la juridiction
                compétente du ressort du siège social du Prestataire.
              </p>
            </div>
          </section>

          {/* Contact */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              8. Contact
            </h2>
            <p className="text-slate-300 text-sm">
              Pour toute question relative aux présentes CGV ou à une commande :{" "}
              <a href="mailto:support@getecopulse.fr" className="text-[#bef264] hover:underline">
                support@getecopulse.fr
              </a>
            </p>
          </section>
        </div>
      </main>

    </div>
  );
}
