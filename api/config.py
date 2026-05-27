from pathlib import Path

import yaml
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

_CONFIG_PATH = Path(__file__).parent / "business_config.yaml"


# ---------------------------------------------------------------------------
# YAML section schemas
# ---------------------------------------------------------------------------

class SolarPhysicsConfig(BaseModel):
    usable_surface_ratio: float
    sqm_per_kwp: float
    performance_ratio: float


class FinancialsConfig(BaseModel):
    default_energy_price_kwh: float
    capex_per_kwp_industrial: float


class EnergyProfileConfig(BaseModel):
    kwh_per_m2: int
    night_talon_pct: float
    peak_hours: list[int]    # [start_hour, end_hour] — e.g. [8, 19]
    weekend_factor: float    # fraction of weekday daily consumption on weekend days
    eui_median_global: int   # IEA global median EUI for this sector (kWh/m²/year)


class OverpassConfig(BaseModel):
    api_url: str
    search_radius_m: int
    image_padding_factor: float
    zoom_min: int
    zoom_max: int
    site_area_threshold_m2: int


class ThermalConfig(BaseModel):
    base_loss_by_roof_type: dict[str, float]
    cold_climate_threshold_c: float
    mild_climate_threshold_c: float
    cold_multiplier: float
    mild_multiplier: float


# ---------------------------------------------------------------------------
# Env vars (loaded from .env)
# ---------------------------------------------------------------------------

class _EnvSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    google_maps_api_key: str
    gemini_api_key: str
    mapbox_api_key: str
    supabase_url: str | None = None
    supabase_key: str | None = None
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    # Preferred: predefined Price ID from Stripe dashboard (e.g. "price_1AbcDef...")
    # If set, takes precedence over stripe_price_cents.
    stripe_price_id: str | None = None
    # Fallback: price in euro cents used when stripe_price_id is not set (default 29 €)
    stripe_price_cents: int = 2900
    # Comma-separated list of allowed CORS origins (e.g. "https://getecopulse.vercel.app")
    allowed_origins: str = "http://localhost:3000,http://localhost:3001"


# ---------------------------------------------------------------------------
# Unified Settings — single instance consumed by all modules
# ---------------------------------------------------------------------------

class Settings:
    def __init__(self, config_path: Path = _CONFIG_PATH) -> None:
        env = _EnvSettings()
        self.google_maps_api_key: str = env.google_maps_api_key
        self.gemini_api_key: str = env.gemini_api_key
        self.mapbox_api_key: str = env.mapbox_api_key
        self.supabase_url: str | None = env.supabase_url
        self.supabase_key: str | None = env.supabase_key
        self.stripe_secret_key: str | None = env.stripe_secret_key
        self.stripe_webhook_secret: str | None = env.stripe_webhook_secret
        self.stripe_price_id: str | None = env.stripe_price_id
        self.stripe_price_cents: int = env.stripe_price_cents
        self.allowed_origins: list[str] = [o.strip() for o in env.allowed_origins.split(",") if o.strip()]

        raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        self.solar_physics = SolarPhysicsConfig(**raw["solar_physics"])
        self.financials = FinancialsConfig(**raw["financials"])
        self.energy_profiles: dict[str, EnergyProfileConfig] = {
            k: EnergyProfileConfig(**v) for k, v in raw["energy_profiles"].items()
        }
        self.overpass = OverpassConfig(**raw["overpass"])
        self.thermal = ThermalConfig(**raw["thermal"])
        # Electricity carbon intensity by country (kgCO2/kWh) — IEA 2023
        self.emission_factors: dict[str, float] = raw.get("emission_factors", {"DEFAULT": 0.400})


settings = Settings()
