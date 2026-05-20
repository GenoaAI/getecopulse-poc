import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from config import settings
from satellite_analyzer import BuildingAnalyzer
from supabase_client import supabase_manager


# ---------------------------------------------------------------------------
# Startup validation
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if required secrets are missing
    assert settings.google_maps_api_key, "GOOGLE_MAPS_API_KEY is not set"
    assert settings.gemini_api_key,      "GEMINI_API_KEY is not set"
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


@app.post("/api/audit")
async def audit_building(payload: AuditRequest):
    """
    Run the full 5-step energy audit pipeline on a building address.
    Returns a structured energy passport with physical data and financial projections.
    Steps: geocode -> OSM footprint -> satellite image -> climate -> Gemini Vision
    If Supabase is configured: image is uploaded to Storage and passport is persisted to DB.
    """
    analyzer = BuildingAnalyzer()

    # Pass image uploader only when Supabase is ready — stays None otherwise
    uploader = (
        supabase_manager.upload_satellite_image
        if supabase_manager.is_configured
        else None
    )

    try:
        passport = await asyncio.to_thread(
            analyzer.generate_passport,
            payload.address,
            payload.naf_code,
            uploader,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {exc}")

    # Persist passport to Supabase (non-blocking — errors are logged, not raised)
    await asyncio.to_thread(supabase_manager.save_audit_to_db, passport)

    return passport
