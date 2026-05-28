import sys
import os

# Vercel's runtime adds the project root to sys.path, not api/ subdirectory.
# Insert api/'s own directory so sibling modules (config, satellite_analyzer, …)
# resolve correctly both on Vercel and in local dev.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import asyncio
import base64
import json
import math
from contextlib import asynccontextmanager

import hashlib

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Stripe — optional, no-op when not installed or secret key absent
try:
    import stripe as _stripe
    _STRIPE_AVAILABLE = True
except ImportError:
    _stripe = None          # type: ignore[assignment]
    _STRIPE_AVAILABLE = False

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

# Origins driven by ALLOWED_ORIGINS env var (comma-separated list).
# Default = localhost dev servers; set to your Vercel URL in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
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
            else:
                # Fallback to direct Mapbox URL when Supabase is not configured
                satellite_url = (
                    f"https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static"
                    f"/{footprint['centroid_lon']},{footprint['centroid_lat']},{footprint['zoom']}"
                    f"/640x640@2x"
                    f"?access_token={settings.mapbox_api_key}"
                )

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

            satellite_data_uri = f"data:image/png;base64,{base64.b64encode(image_bytes).decode('utf-8')}"

            passport = analyzer._assemble_passport(
                geo, footprint, climate, roof, satellite_url, payload.naf_code, plausibility, satellite_data_uri
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


COUT_MOYEN_KVA = 20.0  # €/kVA/an — estimation conservative B2B réseau


@app.post("/api/diagnostic/real")
async def real_diagnostic(
    naf_code:                str   = Form("NAF_BUREAUX"),
    country_code:            str   = Form("DEFAULT"),
    surface_m2:              float = Form(0.0),
    puissance_souscrite_kva: float = Form(0.0),
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

    # ── Power subscription optimisation (Quick Win) ────────────────────────
    # Enedis courbe de charge is in W (active power) → kW after parser.
    # kVA ≈ kW assumes PF ≈ 1 (conservative; avoids overestimating savings).
    pic_kva = load_profile.get("peak_kw_absolute", 0.0)
    # Round recommended power up to nearest 10 kVA with +10% safety margin
    recommandee_kva = (
        int(math.ceil(pic_kva * 1.10 / 10) * 10) if pic_kva > 0 else None
    )
    power_optimization = None
    if puissance_souscrite_kva > 0 and pic_kva > 0:
        # sur_capacite and economy are based on recommended (not raw peak)
        # so the CTA is always coherent: "lower to X kVA" only when X < subscribed
        sur_capacite = round(max(0.0, puissance_souscrite_kva - (recommandee_kva or 0)), 1)
        economie_eur = round(sur_capacite * COUT_MOYEN_KVA)
        power_optimization = {
            "puissance_souscrite_kva":        puissance_souscrite_kva,
            "pic_puissance_reelle_kva":        round(pic_kva, 1),
            "sur_capacite_kva":                sur_capacite,
            "puissance_recommandee_kva":       recommandee_kva,
            "economie_abonnement_estimee_eur": economie_eur,
            "is_over_dimensioned":             puissance_souscrite_kva > (recommandee_kva or 0),
        }

    return {                                                          # noqa: E501 (kept for readability)
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
            "power_optimization":        power_optimization,
        }
    }


# ---------------------------------------------------------------------------
# Stripe — payment routes
# ---------------------------------------------------------------------------

class CheckoutRequest(BaseModel):
    address:      str = Field(..., min_length=5)
    naf_code:     str = Field("NAF_BUREAUX")
    address_hash: str = Field(..., min_length=64, max_length=64, description="SHA-256 hex of normalized address")
    origin:       str = Field(..., description="window.location.origin for absolute callback URLs")


def _stripe_configured() -> "_stripe":  # type: ignore[return]
    """Return the configured stripe module or raise 503."""
    if not _STRIPE_AVAILABLE or not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Paiement non configuré sur ce serveur.")
    _stripe.api_key = settings.stripe_secret_key  # type: ignore[union-attr]
    return _stripe  # type: ignore[return-value]


@app.post("/api/create-checkout-session")
async def create_checkout_session(payload: CheckoutRequest):
    """
    Create a Stripe Checkout session for a one-time report purchase.
    Returns {"url": "https://checkout.stripe.com/...", "session_id": "cs_..."}
    """
    stripe = _stripe_configured()

    # Server-side hash verification — prevents hash spoofing
    expected = hashlib.sha256(payload.address.lower().strip().encode()).hexdigest()
    if payload.address_hash != expected:
        raise HTTPException(status_code=400, detail="address_hash invalide.")

    short_addr = payload.address[:200]

    # Use a predefined Stripe Price ID when available (preferred — avoids creating
    # throwaway Price objects on every call). Falls back to inline price_data for
    # local dev without a Stripe dashboard setup.
    if settings.stripe_price_id:
        line_items = [{"price": settings.stripe_price_id, "quantity": 1}]
    else:
        line_items = [{
            "price_data": {
                "currency":     "eur",
                "unit_amount":  settings.stripe_price_cents,
                "product_data": {
                    "name":        "Rapport Énergétique GetEcoPulse",
                    "description": f"Audit complet — {short_addr}",
                },
            },
            "quantity": 1,
        }]

    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=line_items,
        metadata={
            "address_hash": payload.address_hash,
            "address":      short_addr,
            "naf_code":     payload.naf_code,
        },
        success_url=(
            f"{payload.origin}/success"
            f"?session_id={{CHECKOUT_SESSION_ID}}"
            f"&address_hash={payload.address_hash}"
        ),
        cancel_url=f"{payload.origin}/cancel",
    )
    return {"url": session.url, "session_id": session.id}


@app.post("/api/webhooks/stripe")
async def stripe_webhook(request: Request):
    """
    Stripe webhook endpoint — validates the signature and records the purchase.
    Must be registered in the Stripe dashboard pointing to this URL.
    """
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook secret non configuré.")
    stripe = _stripe_configured()

    body      = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            body, sig_header, settings.stripe_webhook_secret
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Payload invalide.")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Signature invalide.")

    if event["type"] == "checkout.session.completed":
        session      = event["data"]["object"]
        address_hash = session["metadata"].get("address_hash", "")
        supabase_manager.save_purchase(
            address_hash      = address_hash,
            session_id        = session["id"],
            amount_paid_cents = session.get("amount_total") or settings.stripe_price_cents,
            currency          = session.get("currency", "eur"),
        )

    return {"received": True}


@app.get("/api/check-purchase")
async def check_purchase(
    address_hash: str          = Query("",   description="SHA-256 hex of normalized address"),
    session_id:   str | None   = Query(None, description="Stripe session ID — enables direct Stripe verification"),
):
    """
    Check whether a given address has been purchased.

    When session_id is supplied (immediately after Stripe redirect) the endpoint
    verifies the session directly with Stripe — bypassing the webhook/DB race condition.
    It also persists the purchase to Supabase if not already recorded.
    """
    # ── Direct Stripe verification (avoids webhook race condition) ────────
    if session_id and _STRIPE_AVAILABLE and settings.stripe_secret_key:
        stripe = _stripe_configured()
        try:
            session = await asyncio.to_thread(
                stripe.checkout.Session.retrieve, session_id
            )
            if session.payment_status == "paid":
                session_hash = session.metadata.get("address_hash", address_hash)
                # Persist idempotently — webhook may have arrived already
                await asyncio.to_thread(
                    supabase_manager.save_purchase,
                    session_hash,
                    session_id,
                    session.amount_total or settings.stripe_price_cents,
                    session.currency or "eur",
                )
                return {"purchased": True, "address_hash": session_hash}
        except Exception as exc:
            print(f"[WARN] Stripe session retrieve failed: {exc}")

    # ── Fallback: DB lookup by address hash ───────────────────────────────
    if address_hash:
        purchased = await asyncio.to_thread(supabase_manager.check_purchase, address_hash)
        return {"purchased": purchased}

    return {"purchased": False}
