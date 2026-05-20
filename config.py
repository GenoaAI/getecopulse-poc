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
    supabase_url: str | None = None
    supabase_key: str | None = None


# ---------------------------------------------------------------------------
# Unified Settings — single instance consumed by all modules
# ---------------------------------------------------------------------------

class Settings:
    def __init__(self, config_path: Path = _CONFIG_PATH) -> None:
        env = _EnvSettings()
        self.google_maps_api_key: str = env.google_maps_api_key
        self.gemini_api_key: str = env.gemini_api_key
        self.supabase_url: str | None = env.supabase_url
        self.supabase_key: str | None = env.supabase_key

        raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        self.solar_physics = SolarPhysicsConfig(**raw["solar_physics"])
        self.financials = FinancialsConfig(**raw["financials"])
        self.energy_profiles: dict[str, int] = raw["energy_profiles"]
        self.overpass = OverpassConfig(**raw["overpass"])
        self.thermal = ThermalConfig(**raw["thermal"])


settings = Settings()
