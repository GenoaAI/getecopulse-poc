import sys
import os

# Vercel's runtime adds the project root to sys.path, not api/ subdirectory.
# Insert api/'s own directory so sibling modules (config, satellite_analyzer, …)
# resolve correctly both on Vercel and in local dev.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from fastapi.middleware.cors import CORSMiddleware

from config import settings
from satellite_analyzer import BuildingAnalyzer
from supabase_client import supabase_manager
from linky_parser import parse_linky_csv
from satellite_analyzer import compute_grade


# ---------------------------------------------------------------------------
# Startup validation
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if required secrets are missing
    assert settings.google_maps_api_key, "GOOGLE_MAPS_API_KEY is not set"
    assert settings.gemini_api_key,      "GEMINI_API_KEY is not set"
    assert settings.mapbox_api_key,      "MAPBOX_API_KEY is not set"
    # Warn (not crash) if Supabase is not configured
    if supabase_manager.is_configured:
        print("[Supabase] Storage + DB configured — audits will be persisted.")
    else:
        print("[WARN] SUPABASE_URL / SUPABASE_KEY not set — running without persistence.")
    yield


app = FastAPI(
    title="GetEcoPulse API",
    description="Automated building energy audit from a postal address.",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow the Next.js dev server — restrict to Vercel URL in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class AuditRequest(BaseModel):
    address: str = Field(..., min_length=5, description="Full postal address to audit")
    naf_code: str = Field("NAF_BUREAUX", description="NAF sector code for energy profile")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "version": app.version}


@app.get("/api/footprint")
async def get_footprint(address: str):
    """
    Return a GeoJSON FeatureCollection with the OSM building polygon
    and the geocoded address point. Paste the response into geojson.io to visualize.
    """
    analyzer = BuildingAnalyzer()
    try:
        geojson = await asyncio.to_thread(analyzer.get_building_geojson, address)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Footprint error: {exc}")
    return geojson


def _sse(data: dict) -> str:
    """Format a dict as a Server-Sent Event packet."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/audit")
async def audit_building(payload: AuditRequest):
    """
    SSE streaming audit pipeline — yields a progress event at each of the 5 steps,
    then a final event containing the full passport JSON.

    This keeps the Vercel serverless connection alive by sending data every few seconds
    (TTFB / inter-packet timeout = 10 s on Hobby tier, bypassed by the stream).

    Event format:
        data: {"step": 1, "total": 5, "status": "..."}         ← progress
        data: {"step": 5, "total": 5, "status": "done", "result": {...}}  ← final
        data: {"error": "..."}                                  ← on failure
    """
    analyzer = BuildingAnalyzer()
    uploader = (
        supabase_manager.upload_satellite_image
        if supabase_manager.is_configured
        else None
    )

    async def event_stream():
        try:
            # ── Step 1 — Geocoding ────────────────────────────────────────
            yield _sse({"step": 1, "total": 6, "status": "Géocodage de l'adresse…"})
            geo = await asyncio.to_thread(analyzer.get_coordinates, payload.address)
            lat, lon = geo["lat"], geo["lon"]

            # ── Step 2 — OSM building footprint ───────────────────────────
            yield _sse({"step": 2, "total": 6, "status": "Extraction du polygone bâtiment (OSM)…"})
            footprint = await asyncio.to_thread(
                analyzer.fetch_building_footprint, lat, lon, payload.address
            )

            # ── Step 3 — Satellite image ──────────────────────────────────
            yield _sse({"step": 3, "total": 6, "status": "Récupération de l'image satellite…"})
            image_bytes = await asyncio.to_thread(
                analyzer.fetch_satellite_image,
                footprint["centroid_lat"], footprint["centroid_lon"], footprint["zoom"],
            )
            satellite_url: str | None = None
            if uploader is not None:
                satellite_url = await asyncio.to_thread(uploader, image_bytes, payload.address)

            # ── Step 4 — Climate + Vision IA (heaviest step) ─────────────
            yield _sse({"step": 4, "total": 6, "status": "Analyse climatique et Vision IA…"})
            climate, roof = await asyncio.gather(
                asyncio.to_thread(analyzer.fetch_climate_data, lat, lon),
                asyncio.to_thread(analyzer.analyze_roof_with_vision, image_bytes),
            )

            # ── Step 5 — Business context (Vision IA + web search) ──────
            yield _sse({"step": 5, "total": 6, "status": "Vérification du contexte métier…"})
            plausibility = await asyncio.to_thread(
                analyzer._check_plausibility,
                payload.address,
                payload.naf_code,
                footprint.get("area_m2"),
            )

            # ── Step 6 — Compute & return full passport ───────────────────
            yield _sse({"step": 6, "total": 6, "status": "Calcul du bilan énergétique…"})
            passport = analyzer._assemble_passport(
                geo, footprint, climate, roof, satellite_url, payload.naf_code, plausibility
            )

            # Persist to Supabase (fire-and-forget, non-blocking)
            asyncio.create_task(
                asyncio.to_thread(supabase_manager.save_audit_to_db, passport)
            )

            yield _sse({"step": 6, "total": 6, "status": "done", "result": passport})

        except ValueError as exc:
            yield _sse({"error": str(exc)})
        except Exception as exc:
            yield _sse({"error": f"Pipeline error: {exc}"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache, no-transform",
            "X-Accel-Buffering": "no",   # disable nginx/proxy buffering
            "Connection":       "keep-alive",
        },
    )


@app.post("/api/diagnostic/real")
async def real_diagnostic(
    naf_code:     str   = Form("NAF_BUREAUX"),
    country_code: str   = Form("DEFAULT"),
    surface_m2:   float = Form(0.0),
    csv_file: UploadFile = File(...),
):
    """
    Parse a real Linky/Enedis CSV and return an updated diagnostic section.
    Does NOT re-run the satellite/Vision pipeline — only the consumption data changes.
    The frontend merges this response into the existing audit result.

    Optional form fields:
        country_code  ISO-2 code for Scope 2 emission factor (defaults to "DEFAULT")
        surface_m2    Building footprint area for EUI-based grade (defaults to 0 → N/A)
    """
    file_bytes = await csv_file.read()

    try:
        load_profile = await asyncio.to_thread(parse_linky_csv, file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parsing error: {exc}")

    annual_kwh = load_profile["annual_kwh"]
    fin        = settings.financials
    profiles   = settings.energy_profiles
    profile    = profiles.get(naf_code) or profiles["NAF_BUREAUX"]

    # ── Real night talon from measured load profile ───────────────────────
    peak_start, peak_end = load_profile["peak_hours"]
    weekday_kw  = load_profile["weekday_kw"]
    night_slots = [i for i in range(48) if not (peak_start <= i / 2 < peak_end)]

    total_energy = sum(weekday_kw) * 0.5
    night_energy = sum(weekday_kw[i] for i in night_slots) * 0.5
    real_night_pct = (
        night_energy / total_energy if total_energy > 0
        else profile.night_talon_pct
    )

    waste_kwh    = round(annual_kwh * real_night_pct)
    opex_savings = round(waste_kwh * fin.default_energy_price_kwh)

    # ── GHG Protocol Scope 2 ─────────────────────────────────────────────
    ef = settings.emission_factors.get(
        country_code.upper(),
        settings.emission_factors.get("DEFAULT", 0.400),
    )
    wasted_tco2e = round(waste_kwh * ef / 1000, 2)

    # ── GetEcoPulse Grade (requires surface_m2) ───────────────────────────
    if surface_m2 > 0:
        eui       = annual_kwh / surface_m2
        eui_ratio = eui / profile.eui_median_global
        grade     = compute_grade(eui_ratio)
    else:
        grade = "N/A"

    # ── ISO 50001 pre-assessment — Linky = 30-min data available ─────────
    iso_50001_assessment = {
        "has_30min_data":          True,
        "has_quantified_baseline": True,
    }

    return {
        "diagnostic": {
            "theoretical_annual_consumption_kwh": annual_kwh,
            "night_talon_pct":           round(real_night_pct, 3),
            "estimated_waste_kwh":       waste_kwh,
            "opex_savings_eur_per_year": opex_savings,
            "opex_capex_eur":            0,
            "opex_roi":                  "Immédiat",
            "load_profile":              load_profile,
            "data_source":               "linky",
            "days_measured":             load_profile["days_count"],
            "wasted_tco2e":              wasted_tco2e,
            "grade":                     grade,
            "iso_50001_assessment":      iso_50001_assessment,
        }
    }
