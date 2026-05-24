# 🏛️ GetEcoPulse — Architecture & Manifeste Technique

Ce document définit la stack technologique cible, les règles d'ingénierie et les choix stratégiques du projet GetEcoPulse. **Toute nouvelle ligne de code générée doit s'y conformer.** En cas de conflit avec une instruction ad hoc, ce document a priorité.

---

## 1. Stack Technologique Imposée

Aucune autre technologie majeure ne doit être introduite sans validation explicite.

| Couche | Technologie | Contrainte |
|---|---|---|
| **Backend / API** | Python 3.11+ · FastAPI | Routes = passe-plats vers classes métiers |
| **Hébergement** | Vercel (Serverless Functions) | Stateless, `maxDuration: 60s`, zéro écriture disque |
| **Base de données & Auth** | Supabase (PostgreSQL + Auth + Storage) | SDK `supabase-py` uniquement |
| **Frontend** | Next.js 16 (App Router) · React 19 · TailwindCSS | Déployé sur Vercel |
| **PDF** | `@react-pdf/renderer` | Vectoriel, côté client uniquement, jamais html2canvas |
| **Paiement & Monétisation** | Stripe (Checkout + Webhooks) | `STRIPE_SECRET_KEY` + `STRIPE_PRICE_ID` côté serveur ; `NEXT_PUBLIC_AUDIT_PRICE` côté client |
| **IA / Vision** | `google-genai` SDK · Gemini 2.5 Flash | Vision satellite + Search grounding plausibilité |
| **Cartographie** | Nominatim/OSM (géocodage + reverse) · Mapbox Static Images | Google Maps/Places formellement exclus |
| **Géolocalisation mobile** | API native `navigator.geolocation` + reverse-geocoding Nominatim | Pas de SDK tiers |
| **Automatisation Support** | Make / n8n · API Gmail · `google-genai` | Human-in-the-loop strict — aucun envoi auto |
| **Configuration** | `pydantic-settings` + `api/business_config.yaml` | Zéro constante hardcodée dans le code |

---

## 2. Principes de Design

### Séparation des responsabilités
Les routes FastAPI sont de simples passe-plats. La logique métier (calculs physiques, économiques, appels IA) réside dans des classes dédiées (`BuildingAnalyzer`, `EconomicEngine`). Un changement de framework ne doit pas nécessiter de réécriture métier.

### Zéro Hardcodage
Toute constante numérique (prix, ratio physique, paramètre de modèle, seuil sectoriel) est extraite dans `api/business_config.yaml` et validée par Pydantic. Les secrets et valeurs d'environnement passent exclusivement par `.env` en local et par les variables d'environnement Vercel en production.

### Secrets
`.env` (local) et variables Vercel (prod). Les clés Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`) et Supabase ne doivent jamais apparaître dans le code ou les commits.

---

## 3. Contraintes Serverless Vercel (non négociables)

- **Stateless :** Aucune donnée en mémoire entre deux requêtes.
- **Système de fichiers éphémère :** L'écriture sur disque est interdite (sauf `/tmp`, volatile). Les images satellite sont manipulées en `bytes`/`BytesIO` et uploadées sur Supabase Storage.
- **Timeout :** `maxDuration: 60s`. Le pipeline SSE contourne la limite TTFB en émettant un événement à chaque étape.
- **Import `stripe` lazy :** Le module `stripe` est importé via `try/except` en tête de `index.py` ; les routes vérifient `settings.stripe_secret_key` avant tout appel SDK pour permettre un démarrage sans clé configurée.

---

## 4. Topologie des Modules Clés

### Pipeline d'Audit (SSE streaming, `POST /api/audit`)
6 étapes séquentielles émises en Server-Sent Events :
1. Géocodage Nominatim (avec fallback multi-requêtes : adresse complète → "Nom, Ville" → "Nom, CP")
2. Empreinte OSM (Overpass API → polygone bâtiment ; Nominatim parcel en fallback)
3. Image satellite Mapbox @2x (zoom calculé sur le bâtiment le plus proche ≥ 150 m², cap à 18)
4. Données climatiques Open-Meteo + Vision IA Gemini (parallèles)
5. Vérification de plausibilité Gemini + Search grounding
6. Assemblage du passport + `satellite_image_data_uri` (base64 embarqué pour éviter le CORS PDF)

### Tunnel de Paiement Stripe
- `POST /api/create-checkout-session` : vérifie le hash SHA-256 de l'adresse côté serveur, crée la session Stripe avec `metadata.address_hash`.
- `POST /api/webhooks/stripe` : valide la signature HMAC, persiste dans la table Supabase `purchases` (upsert idempotent sur `stripe_session_id`).
- `GET /api/check-purchase` : vérifie d'abord la session directement auprès de Stripe (contourne la race condition webhook/redirect), puis fallback sur lookup DB.
- **Restauration post-redirect :** avant la redirection vers Stripe, l'état de l'audit est sérialisé dans `localStorage` (`gep_pending_{hash}`). La page `/success` le transfère vers `gep_restore`. La page principale le restaure au montage.

### Support Automatisé (Human-in-the-loop)
L'adresse `support@getecopulse.fr` déclenche un webhook Make/n8n → Gemini analyse le contexte → le système injecte un brouillon de réponse dans Gmail Drafts. **Aucun e-mail n'est envoyé sans validation humaine (1 clic).**

### Conformité Légale
Routes statiques Next.js obligatoires avant toute mise en vente : `/mentions-legales`, `/cgv`, `/politique-confidentialite`. Footer avec les 3 liens dans `layout.tsx`.

---

## 5. Modèle de Monétisation & Tarification

### Philosophie Freemium — La Preuve par le Talon

Le tunnel utilisateur est **strictement séquentiel**. Le paywall ne peut jamais apparaître avant que les trois étapes gratuites aient été restituées.

#### Tunnel — séquençage non négociable

| Étape | Contenu | Accès |
|---|---|---|
| **1** | Modélisation satellite (empreinte OSM, image, analyse toiture) | 🆓 GRATUIT |
| **2** | Diagnostic de consommation synthétique (§01 + §02 estimés) | 🆓 GRATUIT |
| **3** | Analyse de la courbe de charge Enedis réelle (upload CSV → §02 réel, talon de nuit mesuré) | 🆓 GRATUIT |
| ⬇ | **— PAYWALL — paiement unique Stripe —** | |
| **4** | Plan d'action chiffré — Section 03 (scénarios ROI, effacement OPEX) | 💳 PAYANT |
| **5** | Export du rapport PDF vectoriel complet | 💳 PAYANT |

#### Règles absolues de séquençage

- **L'upload Enedis (étape 3) est gratuit et inconditionnellement accessible.** Il enrichit §02 avec les données réelles mais n'ouvre aucun accès payant.
- **Le paywall se positionne exclusivement entre l'étape 3 et l'étape 4.** Un utilisateur qui vient d'importer ses données voit ses résultats réels (§02) avant que le verrou §03 ne lui soit présenté.
- **§03 et le PDF sont les seuls éléments verrouillés.** Tout le reste — audit satellite, diagnostic synthétique, analyse Enedis — est toujours libre d'accès.
- **L'upload CSV n'est jamais une clé d'accès à §03.** Seul le paiement Stripe confirme l'achat.

### Zéro Hardcodage du Prix — Règle Absolue
Le montant affiché ne doit **jamais** être hardcodé dans le code source.

| Contexte | Variable |
|---|---|
| Frontend (affichage bouton) | `NEXT_PUBLIC_AUDIT_PRICE` (ex: `"99"`) |
| Backend (création session Stripe) | `STRIPE_PRICE_ID` (ID d'un Price Stripe prédéfini) **ou** `STRIPE_PRICE_CENTS` (montant en centimes) |

Toute modification de prix se fait exclusivement via les variables d'environnement Vercel, sans redéploiement du code.

### Table Supabase requise
```sql
CREATE TABLE purchases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_hash      text NOT NULL,
  stripe_session_id text NOT NULL UNIQUE,
  amount_paid_cents int  NOT NULL,
  currency          text NOT NULL DEFAULT 'eur',
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

---

## 6. UX Mobile, Géolocalisation & Micro-Onboarding B2B

### Géolocalisation "Terrain"
L'interface intègre un bouton **"Me localiser"** utilisant l'API native `navigator.geolocation`. Le résultat (`lat`, `lon`) est transmis à Nominatim en reverse-geocoding pour obtenir l'adresse postale. Cible : un directeur de maintenance qui lance l'audit directement depuis son smartphone, debout devant le bâtiment.

**Contraintes d'implémentation :**
- Fallback silencieux si la géolocalisation est refusée ou indisponible (l'input manuel reste prioritaire).
- Le bouton est désactivé en contexte non-HTTPS (API navigateur requiert un contexte sécurisé).
- Appel Nominatim reverse : `https://nominatim.openstreetmap.org/reverse?lat=…&lon=…&format=json`.

### Micro-Onboarding B2B — Upload Enedis
L'interface d'upload de la courbe de charge intègre :
- Un guide contextuel ("Où trouver ma courbe de charge ?") avec liens directs vers les portails Enedis Pro et Fournisseurs.
- Un fichier CSV d'exemple téléchargeable (`template_courbe_de_charge.csv`) hébergé dans `/public/` pour réduire la friction à l'adoption.
- Une validation préalable du format avant upload (colonnes attendues, encodage, plage de dates).

---

## 7. Modèle d'Apport d'Affaires (Lead Generation B2B)

### Interdiction Publicitaire
Le modèle publicitaire (display, programmatique, affiliation non-qualifiée) est **formellement interdit**. Il compromettrait l'impartialité du diagnostic et la confiance B2B.

### Pipeline de Partenariat Qualifié
Le rapport se conclut par une mise en relation opt-in. Le flux technique :
1. L'utilisateur clique **"Obtenir 3 devis d'installateurs"** (consentement explicite à chaque action).
2. Un webhook transmet les métriques clés anonymisées aux partenaires installateurs/intégrateurs sélectionnés :
   - Surface toiture disponible (m²)
   - Puissance PV potentielle (kWp)
   - Talon de nuit quantifié (MWh/an, €/an économisables)
   - Secteur NAF et pays
3. GetEcoPulse facture au partenaire un **lead qualifié** à la performance (coût par lead).

**Contraintes d'implémentation :**
- Aucune donnée personnelle (adresse postale, email) n'est transmise sans consentement explicite séparé.
- Le webhook de lead est une route backend dédiée (`POST /api/leads/submit`) distincte du pipeline d'audit.
- Les partenaires sont configurés dans Supabase (table `partners`) — jamais hardcodés.

---

## 8. Règles d'Interaction pour l'Agent IA

1. Consulter ce fichier avant toute proposition de modification architecturale.
2. Stocker toute donnée utilisateur dans Supabase — jamais en local (SQLite interdit).
3. Ne pas proposer Flask, Django, ni aucun framework alternatif à FastAPI.
4. Toute génération PDF utilise exclusivement `@react-pdf/renderer` (primitives `Document`, `Page`, `View`, `Text`, `Image`, `Svg`).
5. Le prix du rapport ne doit jamais apparaître en dur dans le code — utiliser `NEXT_PUBLIC_AUDIT_PRICE` et `STRIPE_PRICE_ID`/`STRIPE_PRICE_CENTS`.
6. Tout nouveau endpoint Stripe doit vérifier `settings.stripe_secret_key` avant d'initialiser le SDK.
7. Les images satellite restent en mémoire (`bytes`) — aucune écriture disque même dans `/tmp`.
