import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from config import settings
from satellite_analyzer import BuildingAnalyzer


# ---------------------------------------------------------------------------
# Startup validation
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if required secrets are missing
    assert settings.google_maps_api_key, "GOOGLE_MAPS_API_KEY is not set"
    assert settings.gemini_api_key,      "GEMINI_API_KEY is not set"
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


@app.post("/api/audit")
async def audit_building(payload: AuditRequest):
    """
    Run the full 5-step energy audit pipeline on a building address.
    Returns a structured energy passport with physical data and financial projections.
    """
    analyzer = BuildingAnalyzer()
    try:
        passport = await asyncio.to_thread(
            analyzer.generate_passport,
            payload.address,
            payload.naf_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {exc}")

    return passport
