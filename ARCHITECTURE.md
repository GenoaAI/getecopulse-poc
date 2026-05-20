# 🏛️ GetEcoPulse - Architecture & Technical Manifesto

Ce document définit la stack technologique cible et les règles d'ingénierie strictes pour le projet GetEcoPulse. TOUTE nouvelle ligne de code générée doit s'y conformer.

## 1. Stack Technologique Imposée
Aucune autre technologie majeure ne doit être introduite sans validation explicite.
- **Backend / API :** Python 3.11+ avec **FastAPI**.
- **Hébergement Backend :** **Vercel** (Serverless Functions via `vercel.json`).
- **Base de données & Auth :** **Supabase** (PostgreSQL, Supabase Auth, Supabase Storage). Interaction via le SDK officiel `supabase-py`.
- **Frontend (Cible) :** Next.js (App Router), React, TailwindCSS (déployé sur Vercel).
- **Intelligence Artificielle :** LiteLLM (Modèle cible : Gemini 2.5 Flash).
- **Gestion des configurations :** `pydantic-settings` + `business_config.yaml`.

## 2. Principes de Design (Domain-Driven Design)
- **Séparation stricte :** La logique métier (calculs physiques, économiques, appel IA) doit rester agnostique. Les routes FastAPI ne doivent être que des "passe-plats" qui appellent les classes métiers (ex: `EconomicEngine`).
- **Zéro Hardcodage :** Toute constante (prix, ratio, paramètre de modèle) doit être extraite dans `business_config.yaml`.
- **Secrets :** Tous les secrets (clés API, URL Supabase) sont injectés via `.env` en local, et via les variables d'environnement Vercel en production.

## 3. Contraintes "Serverless" (Vercel)
Puisque le backend Python tournera sur des fonctions Serverless Vercel, ces règles sont absolues :
- **Stateless (Sans état) :** Ne jamais stocker de données en mémoire vive entre deux requêtes.
- **File System Éphémère :** L'écriture sur le disque local (ex: sauvegarder `output/roof.png`) est INTERDITE en production (Vercel ne permet l'écriture que dans le dossier `/tmp` qui est volatile).
- **Gestion des Images :** Les images satellites téléchargées doivent être manipulées en mémoire (`io.BytesIO`) ou uploadées directement sur **Supabase Storage** pour persistance.

## 4. Règle d'interaction pour l'Agent IA (Claude)
- Avant de proposer une modification architecturale, consulte toujours ce fichier.
- Si une tâche demande de stocker de la donnée utilisateur, utilise Supabase.
- Ne propose pas de base de données locale (SQLite) ni de framework alternatif (Flask, Django).