import Link from "next/link";
import { Zap } from "lucide-react";

export const metadata = {
  title: "Politique de confidentialité — GetEcoPulse",
};

export default function PolitiqueConfidentialite() {
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
          <h1 className="text-3xl font-bold text-white mb-2">Politique de confidentialité</h1>
          <p className="text-slate-400 text-sm mb-10">Dernière mise à jour : mai 2026 — Conforme au RGPD (UE 2016/679)</p>

          {/* Responsable */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              1. Responsable du traitement
            </h2>
            <div className="text-slate-300 text-sm space-y-2 leading-relaxed">
              <p>
                Le responsable du traitement des données à caractère personnel collectées via
                GetEcoPulse est l&apos;éditeur du site, dont les coordonnées figurent dans les{" "}
                <Link href="/mentions-legales" className="text-[#bef264] hover:underline">mentions légales</Link>.
              </p>
              <p>Contact DPO / responsable RGPD : <a href="mailto:privacy@getecopulse.fr" className="text-[#bef264] hover:underline">privacy@getecopulse.fr</a></p>
            </div>
          </section>

          {/* Données collectées */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              2. Données collectées et traitements
            </h2>
            <div className="text-slate-300 text-sm space-y-6 leading-relaxed">

              {/* Adresse postale */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <p className="font-medium text-white mb-2">2.1 Adresse postale du bâtiment audité</p>
                <ul className="space-y-1 text-slate-400">
                  <li><span className="text-slate-300">Finalité :</span> géocodage, récupération de l&apos;empreinte OSM, image satellite et données climatiques</li>
                  <li><span className="text-slate-300">Base légale :</span> exécution du contrat (art. 6.1.b RGPD)</li>
                  <li><span className="text-slate-300">Durée :</span> traitée en mémoire vive pour la durée de la requête, puis purgée (architecture stateless Vercel). Un hash SHA-256 irréversible est conservé en base Supabase à des fins de vérification de paiement.</li>
                  <li><span className="text-slate-300">Destinataires :</span> Nominatim/OSM (géocodage, sans compte), Mapbox (image satellite), Open-Meteo (météo)</li>
                </ul>
              </div>

              {/* Données Enedis */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <p className="font-medium text-white mb-2">2.2 Courbe de charge Enedis (upload CSV — optionnel)</p>
                <ul className="space-y-1 text-slate-400">
                  <li><span className="text-slate-300">Finalité :</span> enrichissement du diagnostic de consommation réelle (§02)</li>
                  <li><span className="text-slate-300">Base légale :</span> consentement explicite par l&apos;acte d&apos;upload (art. 6.1.a RGPD)</li>
                  <li>
                    <span className="text-slate-300">Durée :</span>{" "}
                    <strong className="text-[#bef264]">traitement éphémère strict</strong> — le fichier CSV est analysé en mémoire
                    vive côté serveur et n&apos;est jamais persisté sur disque ni en base de données.
                    Le traitement est complété et les données purgées dans le même cycle de requête.
                  </li>
                  <li><span className="text-slate-300">Destinataires :</span> aucun tiers — traitement intégralement côté serveur GetEcoPulse</li>
                </ul>
              </div>

              {/* Géolocalisation */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <p className="font-medium text-white mb-2">2.3 Géolocalisation GPS (optionnelle — bouton &quot;Me localiser&quot;)</p>
                <ul className="space-y-1 text-slate-400">
                  <li><span className="text-slate-300">Finalité :</span> pré-remplissage de l&apos;adresse du bâtiment depuis la position terrain</li>
                  <li><span className="text-slate-300">Base légale :</span> consentement explicite via la permission navigateur (art. 6.1.a RGPD)</li>
                  <li><span className="text-slate-300">Durée :</span> coordonnées GPS utilisées une seule fois pour le reverse-geocoding Nominatim, non mémorisées</li>
                  <li><span className="text-slate-300">Destinataires :</span> Nominatim/OSM (reverse-geocoding, sans compte utilisateur)</li>
                </ul>
              </div>

              {/* Paiement */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <p className="font-medium text-white mb-2">2.4 Données de paiement (achat du rapport complet)</p>
                <ul className="space-y-1 text-slate-400">
                  <li><span className="text-slate-300">Finalité :</span> traitement du paiement et vérification d&apos;achat</li>
                  <li><span className="text-slate-300">Base légale :</span> exécution du contrat (art. 6.1.b RGPD) et obligation légale comptable (art. 6.1.c)</li>
                  <li><span className="text-slate-300">Données bancaires :</span> traitées exclusivement par <strong className="text-white">Stripe Inc.</strong> (certifié PCI DSS niveau 1) — GetEcoPulse ne voit jamais les numéros de carte</li>
                  <li><span className="text-slate-300">Données conservées par GetEcoPulse :</span> hash SHA-256 de l&apos;adresse + identifiant de session Stripe + montant + date — durée 5 ans (obligation comptable)</li>
                </ul>
              </div>

            </div>
          </section>

          {/* Cookies */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              3. Cookies et stockage local
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>
                GetEcoPulse n&apos;utilise <strong className="text-white">aucun cookie de tracking,
                publicitaire ou analytique</strong>.
              </p>
              <p>
                Le service utilise uniquement le <strong className="text-white">localStorage</strong> du
                navigateur pour :
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 ml-2">
                <li>Mémoriser l&apos;état de l&apos;audit en cours (clé <code className="text-[#bef264] bg-slate-800 px-1 rounded">gep_pending_*</code>)</li>
                <li>Mémoriser les adresses dont le rapport a été acheté (clé <code className="text-[#bef264] bg-slate-800 px-1 rounded">gep_purchased</code>) afin d&apos;éviter un double paiement</li>
              </ul>
              <p>
                Ces données restent sur l&apos;appareil de l&apos;utilisateur et ne sont jamais
                transmises à des tiers. Elles peuvent être supprimées à tout moment en effaçant
                le cache du navigateur.
              </p>
            </div>
          </section>

          {/* Transferts hors UE */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              4. Transferts de données hors UE
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>Certains sous-traitants sont établis hors de l&apos;Union européenne :</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 ml-2">
                <li><strong className="text-slate-300">Vercel Inc.</strong> (hébergement, États-Unis) — encadré par les CCT de la Commission européenne</li>
                <li><strong className="text-slate-300">Stripe Inc.</strong> (paiement, États-Unis) — encadré par les CCT et certification PCI DSS</li>
                <li><strong className="text-slate-300">Google (Gemini API)</strong> (IA Vision, États-Unis) — encadré par les CCT ; les images satellite analysées ne contiennent pas de données personnelles identifiantes</li>
              </ul>
            </div>
          </section>

          {/* Droits */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              5. Vos droits RGPD
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>Conformément au RGPD et à la loi Informatique et Libertés, vous disposez des droits suivants :</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 ml-2">
                <li><strong className="text-slate-300">Droit d&apos;accès</strong> (art. 15 RGPD)</li>
                <li><strong className="text-slate-300">Droit de rectification</strong> (art. 16 RGPD)</li>
                <li><strong className="text-slate-300">Droit à l&apos;effacement</strong> (art. 17 RGPD)</li>
                <li><strong className="text-slate-300">Droit à la limitation du traitement</strong> (art. 18 RGPD)</li>
                <li><strong className="text-slate-300">Droit à la portabilité</strong> (art. 20 RGPD)</li>
                <li><strong className="text-slate-300">Droit d&apos;opposition</strong> (art. 21 RGPD)</li>
              </ul>
              <p>
                Pour exercer ces droits :{" "}
                <a href="mailto:privacy@getecopulse.fr" className="text-[#bef264] hover:underline">privacy@getecopulse.fr</a>.
                En cas de réclamation non résolue, vous pouvez saisir la{" "}
                <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-[#bef264] hover:underline">
                  CNIL
                </a>.
              </p>
            </div>
          </section>

          {/* Modifications */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              6. Modifications de la politique
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Le Prestataire se réserve le droit de modifier la présente politique à tout moment.
              La date de mise à jour figurant en haut de page fait foi. Les modifications substantielles
              seront signalées sur la page d&apos;accueil.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-800 px-6 py-6 text-center text-xs text-slate-500">
        <p>
          © 2026 GetEcoPulse —{" "}
          <Link href="/mentions-legales" className="hover:text-slate-300 transition-colors">Mentions légales</Link>
          {" · "}
          <Link href="/cgv" className="hover:text-slate-300 transition-colors">CGV</Link>
          {" · "}
          <Link href="/politique-confidentialite" className="hover:text-slate-300 transition-colors">Politique de confidentialité</Link>
        </p>
      </footer>
    </div>
  );
}
