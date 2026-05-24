# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (FastAPI — `api/`)
```bash
# Run locally (from repo root)
uvicorn api.index:app --reload --port 8000

# Or via the helper script
python run_poc.py

# Syntax-check all API files
python -m py_compile api/index.py api/satellite_analyzer.py api/config.py api/consumption_generator.py api/linky_parser.py api/supabase_client.py

# Quick smoke test (requires .env)
curl http://localhost:8000/health
curl "http://localhost:8000/api/footprint?address=1+rue+de+la+Paix+Paris"
```

### Frontend (Next.js — `frontend/`)
```bash
cd frontend
npm run dev        # dev server on :3000
npm run build      # production build (also runs tsc)
npx tsc --noEmit   # type-check only
```

### Environment variables (`.env` at repo root)
```
GOOGLE_MAPS_API_KEY=...   # used for geocoding (Nominatim fallback)
GEMINI_API_KEY=...         # Gemini 2.5 Flash — Vision + Search grounding
MAPBOX_API_KEY=...         # Satellite images
SUPABASE_URL=...           # optional — no-op when absent
SUPABASE_KEY=...           # optional — service role key
```
Frontend reads `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000`) and `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `frontend/.env.local`.

---

## Architecture

### Monorepo layout
```
/
├── api/                  Python FastAPI (deployed as Vercel Serverless Function)
│   ├── index.py          All routes — the single entrypoint Vercel sees
│   ├── satellite_analyzer.py  Core engine: geocoding, OSM, Mapbox, Gemini Vision
│   ├── consumption_generator.py  Synthetic Linky-style load profiles
│   ├── linky_parser.py   Parse real Enedis CSV exports
│   ├── supabase_client.py  Storage + DB persistence (graceful no-op if unconfigured)
│   ├── config.py         Unified Settings: env vars + business_config.yaml
│   └── business_config.yaml  All numeric constants (prices, ratios, sector profiles)
├── frontend/             Next.js 16 App Router
│   ├── app/page.tsx      Single-page app — entire UI lives here
│   ├── lib/api.ts        Typed fetch wrappers + AuditResult interface
│   ├── lib/pdf-export.ts Client-side PDF export via @react-pdf/renderer
│   ├── lib/supabase.ts   Browser Supabase client (optional)
│   └── components/       AuditPdfDocument, MapView, ConsumptionChart, CsvUpload, AuthModal
├── vercel.json           Routing: /api/* → api/index.py, /* → frontend/
└── requirements.txt      Python deps — Vercel reads this from repo root
```

### Audit pipeline (SSE streaming, `POST /api/audit`)
The audit is a 6-step pipeline streamed as Server-Sent Events so Vercel's serverless timeout is never hit:
1. **Geocoding** — Nominatim with multi-query fallback (`full address → "Name, City" → "Name, Postcode"`)
2. **OSM footprint** — Overpass API → building polygon; Nominatim parcel as fallback
3. **Satellite image** — Mapbox Static Images @2x, zoom computed from nearest significant building bbox (≥150 m²), cap at zoom 18
4. **Climate + Vision IA** — Open-Meteo (irradiance/temp) + Gemini 2.5 Flash on the satellite image (roof type, azimuth, obstructions) — run in parallel
5. **Plausibility check** — Gemini with Google Search grounding to validate building activity vs NAF sector
6. **Passport assembly** — pure computation, no I/O; result serialized and sent in the final SSE event

`satellite_image_data_uri` (base64) is embedded in the response so the PDF renderer never needs a separate CORS fetch.

### Configuration pattern
All tunable constants live in `api/business_config.yaml`. `config.py` validates them with Pydantic and exposes a single `settings` singleton. Never hardcode prices, ratios, or model parameters.

### Serverless constraints (non-negotiable for Vercel)
- **No disk writes** — everything in memory (`bytes`, `BytesIO`). Satellite images are either uploaded to Supabase Storage or returned as base64.
- **Stateless** — each request is independent.
- **`maxDuration: 60`** — the audit pipeline must complete within 60 s.

### Frontend data flow
- `page.tsx` holds all state (`audit`, `diag`, `realDiag`). `diag` = `realDiag ?? audit.diagnostic`.
- SSE parsing is in `lib/api.ts:runAudit()` — progress callbacks update the loading bar.
- Linky CSV → `POST /api/diagnostic/real` → overwrites `diag` with real data, triggers scroll to §02.
- PDF export: `exportAuditPdf()` dynamically imports `@react-pdf/renderer` + `AuditPdfDocument` (kept out of the main bundle).

### PDF generation
`@react-pdf/renderer` only — never html2canvas/jsPDF. `AuditPdfDocument.tsx` uses react-pdf primitives (`View`, `Text`, `Image`, `Svg`). No `"use client"` directive — it has no DOM dependencies. Bold text uses `fontFamily: "Helvetica-Bold"` (not `fontWeight`).

### Supabase usage
- **Storage bucket `satellite-images`**: stores PNG bytes → returns public URL for `satellite_image_url`
- **Table `audits`**: key metrics + `passport_json` (base64 URI is stripped before insert)
- Both are **optional** — `SupabaseManager` is a no-op when env vars are absent.
- Auth: Supabase magic link, managed in `AuthModal.tsx`

### Key constraints from ARCHITECTURE.md
- No SQLite, no Flask/Django, no Google Maps/Places (use Nominatim + Mapbox).
- Stripe (not yet implemented) will gate §03 + PDF behind a one-time payment webhook.
- Legal pages (`/mentions-legales`, `/cgv`) are required before any payment flow goes live.
