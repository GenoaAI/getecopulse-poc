# 🏛️ GetEcoPulse - Architecture & Technical Manifesto

Ce document définit la stack technologique cible et les règles d'ingénierie strictes pour le projet GetEcoPulse. TOUTE nouvelle ligne de code générée doit s'y conformer.

## 1. Stack Technologique Imposée
Aucune autre technologie majeure ne doit être introduite sans validation explicite.
- **Backend / API :** Python 3.11+ avec **FastAPI**.
- **Hébergement Backend :** **Vercel** (Serverless Functions via `vercel.json`).
- **Base de données & Auth :** **Supabase** (PostgreSQL, Supabase Auth, Supabase Storage). Interaction via le SDK officiel `supabase-py`.
- **Frontend (Cible) :** Next.js (App Router), React, TailwindCSS (déployé sur Vercel).
- **Génération Documentaire (PDF) :** `@react-pdf/renderer` (Génération vectorielle strictement exécutée côté client).
- **Paiement & Monétisation :** **Stripe** (Stripe.js côté client + Webhooks côté serveur).
- **Intelligence Artificielle / Vision :** SDK officiel `google-genai` (Modèle cible : Gemini 2.5 Flash).
- **Automatisation & Support Client :** Orchestrateur No-Code (Make / n8n) couplé à l'API Gmail et Gemini.
- **Cartographie & Géolocalisation :** Nominatim / OpenStreetMap pour le géocodage et les emprises au sol, Mapbox Static Images API pour l'imagerie satellite (Google Maps et Google Places sont exclus).
- **Gestion des configurations :** `pydantic-settings` + `business_config.yaml`.

## 2. Principes de Design (Domain-Driven Design)
- **Séparation stricte :** La logique métier (calculs physiques, économiques, appel IA) doit rester agnostique. Les routes FastAPI ne doivent être que des "passe-plats" qui appellent les classes métiers (ex: `EconomicEngine`).
- **Zéro Hardcodage :** Toute constante (prix, ratio, paramètre de modèle) doit être extraite dans `business_config.yaml`.
- **Secrets :** Tous les secrets (clés API, URL Supabase, Webhook Secrets Stripe) sont injectés via `.env` en local, et via les variables d'environnement Vercel en production.

## 3. Topologie des Modules Clés
- **Tunnel de Paiement & Délivrance :**
  - Le frontend gère la session Stripe Checkout pour verrouiller le téléchargement du PDF complet et de la Section 3.
  - Le backend expose une route sécurisée `POST /api/webhooks/stripe` pour écouter les événements de paiement, valider la signature cryptographique, et débloquer les droits d'accès dans Supabase.
- **Conformité & Légal :** Hébergement de routes statiques dans le frontend Next.js (`/mentions-legales`, `/cgv`) pour respecter les obligations commerciales.
- **Support Automatisé (Human-in-the-loop) :** L'adresse de support déclenche un webhook externe (Make/n8n) qui soumet le corps de l'e-mail à Gemini pour analyse du contexte. Le système génère une réponse type et l'injecte dans le dossier "Brouillons" (Drafts) de la messagerie. **Aucun e-mail n'est envoyé automatiquement au client sans une validation humaine (1 clic).**

## 4. Contraintes "Serverless" (Vercel)
Puisque le backend Python tournera sur des fonctions Serverless Vercel, ces règles sont absolues :
- **Stateless (Sans état) :** Ne jamais stocker de données en mémoire vive entre deux requêtes.
- **File System Éphémère :** L'écriture sur le disque local (ex: sauvegarder `output/roof.png`) est INTERDITE en production (Vercel ne permet l'écriture que dans le dossier `/tmp` qui est volatile).
- **Gestion des Images :** Les images satellites téléchargées doivent être manipulées en mémoire (`io.BytesIO`) ou uploadées directement sur **Supabase Storage** pour persistance.

## 5. Règle d'interaction pour l'Agent IA (Claude / Gemini)
- Avant de proposer une modification architecturale, consulte toujours ce fichier.
- Si une tâche demande de stocker de la donnée utilisateur, utilise Supabase.
- Ne propose pas de base de données locale (SQLite) ni de framework alternatif (Flask, Django).
- Pour toute génération PDF, utilise exclusivement l'approche "Document as Code" avec les primitives de `@react-pdf/renderer`.