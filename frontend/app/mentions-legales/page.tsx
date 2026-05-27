import Link from "next/link";
import { Zap } from "lucide-react";

export const metadata = {
  title: "Mentions légales — GetEcoPulse",
};

export default function MentionsLegales() {
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
        <div className="max-w-4xl mx-auto prose prose-invert prose-slate max-w-none">
          <h1 className="text-3xl font-bold text-white mb-2">Mentions légales</h1>
          <p className="text-slate-400 text-sm mb-10">Dernière mise à jour : mai 2026</p>

          {/* Éditeur */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              1. Éditeur du site
            </h2>
            <div className="text-slate-300 space-y-2 text-sm leading-relaxed">
              <p>Le site <strong className="text-white">getecopulse.fr</strong> est édité par :</p>
              <ul className="list-none space-y-1 ml-0">
                <li><span className="text-slate-400">Raison sociale :</span> <strong className="text-white">[À compléter — nom ou raison sociale]</strong></li>
                <li><span className="text-slate-400">Forme juridique :</span> [À compléter — SASU, EURL, Auto-entrepreneur…]</li>
                <li><span className="text-slate-400">Capital social :</span> [À compléter]</li>
                <li><span className="text-slate-400">SIREN / SIRET :</span> [À compléter]</li>
                <li><span className="text-slate-400">Siège social :</span> [À compléter — adresse complète]</li>
                <li><span className="text-slate-400">Directeur de la publication :</span> [À compléter — prénom, nom]</li>
                <li><span className="text-slate-400">Contact :</span> <a href="mailto:contact@getecopulse.fr" className="text-[#bef264] hover:underline">contact@getecopulse.fr</a></li>
              </ul>
            </div>
          </section>

          {/* Hébergeur */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              2. Hébergeur
            </h2>
            <div className="text-slate-300 text-sm space-y-1 leading-relaxed">
              <p>Le site est hébergé par :</p>
              <ul className="list-none space-y-1">
                <li><strong className="text-white">Vercel Inc.</strong></li>
                <li>440 N Barranca Ave #4133, Covina, CA 91723, États-Unis</li>
                <li><a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-[#bef264] hover:underline">https://vercel.com</a></li>
              </ul>
              <p className="mt-3">
                Les traitements de données liés à l&apos;hébergement sont régis par la politique de confidentialité de Vercel,
                conforme au RGPD via les clauses contractuelles types (CCT) de la Commission européenne.
              </p>
            </div>
          </section>

          {/* Propriété intellectuelle */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              3. Propriété intellectuelle
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>
                L&apos;ensemble des contenus présents sur le site GetEcoPulse (textes, graphiques, algorithmes
                de diagnostic énergétique, modèles de calcul, interfaces utilisateur) est la propriété exclusive
                de l&apos;éditeur ou de ses partenaires et est protégé par les lois françaises et internationales
                relatives à la propriété intellectuelle.
              </p>
              <p>
                Toute reproduction, représentation, modification ou adaptation, totale ou partielle, de ces
                contenus, par quelque procédé que ce soit, sans l&apos;autorisation préalable et écrite de
                l&apos;éditeur, est strictement interdite et constituerait une contrefaçon sanctionnée
                par les articles L. 335-2 et suivants du Code de la propriété intellectuelle.
              </p>
              <p>
                Les rapports d&apos;audit énergétiques générés par le service sont mis à disposition de
                l&apos;utilisateur qui en a fait l&apos;acquisition pour un usage professionnel interne.
                Toute revente ou diffusion commerciale est interdite.
              </p>
            </div>
          </section>

          {/* Responsabilité */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              4. Limitation de responsabilité
            </h2>
            <div className="text-slate-300 text-sm space-y-3 leading-relaxed">
              <p>
                Les diagnostics et projections financières fournis par GetEcoPulse sont établis sur la base
                de modèles algorithmiques et de données publiques (cadastre, météorologie, photovoltaïque).
                Ils constituent des estimations indicatives et ne sauraient engager la responsabilité de
                l&apos;éditeur en lieu et place d&apos;une étude technique réalisée par un professionnel certifié.
              </p>
              <p>
                L&apos;éditeur ne saurait être tenu responsable des dommages directs ou indirects résultant
                de l&apos;utilisation des informations contenues dans les rapports d&apos;audit.
              </p>
            </div>
          </section>

          {/* Contact */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">
              5. Contact
            </h2>
            <p className="text-slate-300 text-sm">
              Pour toute question relative aux présentes mentions légales :{" "}
              <a href="mailto:contact@getecopulse.fr" className="text-[#bef264] hover:underline">
                contact@getecopulse.fr
              </a>
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
