import os
import base64
import math
import requests
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field
import litellm

from config import settings


# ---------------------------------------------------------------------------
# Pydantic schema — forces the LLM to return structured JSON
# ---------------------------------------------------------------------------

class RoofAnalysis(BaseModel):
    surface_m2: float = Field(description="Estimated main roof surface area in m2")
    azimuth_degrees: int = Field(description="Roof orientation in degrees (0=N, 90=E, 180=S, 270=W)")
    roof_type: str = Field(description="Roof type: flat / gable / hip / shed / complex / unknown")
    obstructions: list[str] = Field(description="Visible obstructions: chimneys, HVAC units, skylights, etc.")
    confidence: str = Field(description="Confidence level: high / medium / low")
    reasoning: str = Field(description="Brief explanation of the estimates")


# ---------------------------------------------------------------------------
# Economic engine
# ---------------------------------------------------------------------------

class EconomicEngine:
    """Translates physical solar output into actionable financial projections."""

    def compute(
        self,
        peak_power_kwp: float,
        annual_production_kwh: float,
        roof_surface_m2: float,
        naf_sector: str,
    ) -> dict:
        fin = settings.financials
        profiles = settings.energy_profiles

        capex_eur = peak_power_kwp * fin.capex_per_kwp_industrial
        annual_savings_eur = annual_production_kwh * fin.default_energy_price_kwh
        roi_years = capex_eur / annual_savings_eur if annual_savings_eur > 0 else None

        profile_kwh_m2 = profiles.get(naf_sector, profiles.get("NAF_BUREAUX", 150))
        theoretical_consumption_kwh = roof_surface_m2 * profile_kwh_m2
        coverage_pct = min(100.0, annual_production_kwh / theoretical_consumption_kwh * 100)

        return {
            "naf_sector": naf_sector,
            "energy_price_eur_kwh": fin.default_energy_price_kwh,
            "capex_eur": round(capex_eur),
            "annual_savings_eur": round(annual_savings_eur),
            "roi_years": round(roi_years, 1) if roi_years is not None else None,
            "theoretical_consumption_kwh_year": round(theoretical_consumption_kwh),
            "solar_coverage_pct": round(coverage_pct, 1),
        }


# ---------------------------------------------------------------------------
# Main analyzer
# ---------------------------------------------------------------------------

class BuildingAnalyzer:
    """
    Geospatial and thermal analysis pipeline for a building from its postal address.
    All physical and financial constants are read from settings (business_config.yaml).
    """

    STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap"
    GEOCODING_URL  = "https://maps.googleapis.com/maps/api/geocode/json"
    OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"

    def __init__(self, output_dir: str = "output") -> None:
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        os.environ["GEMINI_API_KEY"] = settings.gemini_api_key
        self._economy = EconomicEngine()

    # ------------------------------------------------------------------
    # Step 1 — Geocoding
    # ------------------------------------------------------------------

    def get_coordinates(self, address: str) -> dict:
        """Convert a postal address to latitude/longitude via Google Geocoding API."""
        print(f"[1/4] Geocoding: {address}")
        params = {"address": address, "key": settings.google_maps_api_key}
        response = requests.get(self.GEOCODING_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data["status"] != "OK" or not data["results"]:
            raise ValueError(f"Geocoding failed: {data.get('status')} — {data.get('error_message', '')}")

        location = data["results"][0]["geometry"]["location"]
        result = {
            "lat": location["lat"],
            "lon": location["lng"],
            "formatted_address": data["results"][0]["formatted_address"],
        }
        print(f"    -> {result['formatted_address']}  ({result['lat']}, {result['lon']})")
        return result

    # ------------------------------------------------------------------
    # Step 2 — Satellite image
    # ------------------------------------------------------------------

    def fetch_satellite_image(self, lat: float, lon: float) -> Path:
        """Download a high-zoom satellite image centred on the building."""
        print("[2/4] Fetching satellite image...")
        params = {
            "center": f"{lat},{lon}",
            "zoom": 20,
            "size": "640x640",
            "maptype": "satellite",
            "key": settings.google_maps_api_key,
        }
        response = requests.get(self.STATIC_MAP_URL, params=params, timeout=15)
        response.raise_for_status()

        image_path = self.output_dir / f"roof_{lat:.5f}_{lon:.5f}.png"
        image_path.write_bytes(response.content)
        print(f"    -> Saved to {image_path} ({len(response.content) // 1024} KB)")
        return image_path

    # ------------------------------------------------------------------
    # Step 3 — Climate data (Open-Meteo — free, no API key required)
    # ------------------------------------------------------------------

    def fetch_climate_data(self, lat: float, lon: float) -> dict:
        """
        Fetch annual solar irradiance and mean temperature from
        Open-Meteo Historical Weather API (last full calendar year).
        """
        print("[3/4] Fetching climate data from Open-Meteo...")
        end_year = datetime.now().year - 1
        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": f"{end_year}-01-01",
            "end_date": f"{end_year}-12-31",
            "daily": "shortwave_radiation_sum,temperature_2m_max,temperature_2m_min",
            "timezone": "auto",
        }
        response = requests.get(self.OPEN_METEO_URL, params=params, timeout=20)
        response.raise_for_status()
        data = response.json()

        daily = data.get("daily", {})
        radiation = daily.get("shortwave_radiation_sum", [])
        t_max = daily.get("temperature_2m_max", [])
        t_min = daily.get("temperature_2m_min", [])

        # MJ/m2/day -> kWh/m2/year (÷ 3.6)
        dni_annual_kwh = sum(v for v in radiation if v is not None) / 3.6
        t_mean = (
            sum((a + b) / 2 for a, b in zip(t_max, t_min) if a and b) / len(t_max)
            if t_max else 0
        )
        result = {
            "year": end_year,
            "dni_annual_kwh_m2": round(dni_annual_kwh, 1),
            "temperature_mean_c": round(t_mean, 1),
        }
        print(f"    -> DNI: {result['dni_annual_kwh_m2']} kWh/m2/yr  |  T mean: {result['temperature_mean_c']} C")
        return result

    # ------------------------------------------------------------------
    # Step 4 — Vision analysis (LiteLLM + Gemini)
    # ------------------------------------------------------------------

    def analyze_roof_with_vision(self, image_path: Path) -> RoofAnalysis:
        """Send the satellite image to Gemini Vision and extract structured roof data."""
        print("[4/4] Analysing roof with Gemini Vision...")

        with open(image_path, "rb") as f:
            image_b64 = base64.standard_b64encode(f.read()).decode("utf-8")

        system_prompt = (
            "You are a professional building energy auditor specialising in remote roof analysis. "
            "You will be given a satellite image of a building rooftop.\n\n"
            "Your task is to estimate the following ONLY from what is visible in the image:\n"
            "1. surface_m2: The main usable roof surface area in square metres (integer or float).\n"
            "2. azimuth_degrees: Primary roof orientation in degrees (0=North, 90=East, 180=South, 270=West).\n"
            "3. roof_type: One of [flat, gable, hip, shed, complex, unknown].\n"
            "4. obstructions: A JSON list of visible obstructions (chimneys, HVAC units, skylights, antennas, etc.).\n"
            "5. confidence: Your overall confidence level — one of [high, medium, low].\n"
            "6. reasoning: One or two sentences explaining your estimates.\n\n"
            "CRITICAL: Respond ONLY with a valid JSON object matching the schema. "
            "No markdown fences, no extra text, no comments."
        )

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": system_prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                    },
                ],
            }
        ]

        response = litellm.completion(
            model="gemini/gemini-2.5-flash",
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        raw_json = response.choices[0].message.content.strip()
        if raw_json.startswith("```"):
            raw_json = raw_json.split("```")[1]
            if raw_json.startswith("json"):
                raw_json = raw_json[4:]

        parsed = RoofAnalysis.model_validate_json(raw_json)
        print(f"    -> Roof type: {parsed.roof_type}  |  Surface: {parsed.surface_m2} m2  |  Azimuth: {parsed.azimuth_degrees} deg")
        return parsed

    # ------------------------------------------------------------------
    # Step 5 — Passport generation
    # ------------------------------------------------------------------

    def generate_passport(self, address: str, naf_sector: str = "NAF_BUREAUX") -> dict:
        """
        Full pipeline: geocode -> satellite image -> climate data -> vision analysis
        -> energy passport with physical_data and financial_projection blocks.
        All constants sourced from business_config.yaml via settings.
        """
        geo = self.get_coordinates(address)
        lat, lon = geo["lat"], geo["lon"]

        image_path = self.fetch_satellite_image(lat, lon)
        climate    = self.fetch_climate_data(lat, lon)
        roof       = self.analyze_roof_with_vision(image_path)

        # ---- Solar potential — all parameters from settings.solar_physics ----
        sp = settings.solar_physics
        obstruction_factor = max(0.6, 1.0 - 0.05 * len(roof.obstructions))
        orientation_factor = _orientation_factor(roof.azimuth_degrees)

        usable_surface     = roof.surface_m2 * sp.usable_surface_ratio * obstruction_factor
        peak_power_kwp     = (usable_surface / sp.sqm_per_kwp) * orientation_factor
        annual_production_kwh = peak_power_kwp * climate["dni_annual_kwh_m2"] * sp.performance_ratio

        thermal    = _thermal_loss_score(roof.roof_type, climate["temperature_mean_c"])
        financials = self._economy.compute(
            peak_power_kwp=peak_power_kwp,
            annual_production_kwh=annual_production_kwh,
            roof_surface_m2=roof.surface_m2,
            naf_sector=naf_sector,
        )

        return {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "address": geo["formatted_address"],
            "coordinates": {"lat": lat, "lon": lon},
            "physical_data": {
                "climate": climate,
                "roof_analysis": {
                    "surface_m2": roof.surface_m2,
                    "azimuth_degrees": roof.azimuth_degrees,
                    "roof_type": roof.roof_type,
                    "obstructions": roof.obstructions,
                    "confidence": roof.confidence,
                    "reasoning": roof.reasoning,
                },
                "solar_potential": {
                    "usable_surface_m2": round(usable_surface, 1),
                    "peak_power_kwp": round(peak_power_kwp, 2),
                    "annual_production_kwh": round(annual_production_kwh),
                    "orientation_factor": orientation_factor,
                    "obstruction_factor": round(obstruction_factor, 2),
                    "params_used": {
                        "usable_surface_ratio": sp.usable_surface_ratio,
                        "sqm_per_kwp": sp.sqm_per_kwp,
                        "performance_ratio": sp.performance_ratio,
                    },
                },
                "thermal_assessment": thermal,
            },
            "financial_projection": financials,
            "satellite_image_path": str(image_path),
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _orientation_factor(azimuth: int) -> float:
    """Yield factor based on roof orientation vs. South (cosine approximation)."""
    delta = abs(azimuth - 180)
    if delta > 180:
        delta = 360 - delta
    return round(max(0.5, math.cos(math.radians(delta)) * 0.45 + 0.55), 3)


def _thermal_loss_score(roof_type: str, t_mean_c: float) -> dict:
    """Heuristic thermal loss indicator — parameters from settings.thermal."""
    th = settings.thermal
    base_loss = th.base_loss_by_roof_type.get(roof_type, 0.6)

    if t_mean_c < th.cold_climate_threshold_c:
        multiplier = th.cold_multiplier
    elif t_mean_c < th.mild_climate_threshold_c:
        multiplier = th.mild_multiplier
    else:
        multiplier = 1.0

    score = min(1.0, base_loss * multiplier)

    if score >= 0.75:
        level = "HIGH"
        recommendation = "Priority: add 20-30 cm of blown insulation or rigid foam."
    elif score >= 0.5:
        level = "MEDIUM"
        recommendation = "Consider upgrading roof insulation to current RT2020 standards."
    else:
        level = "LOW"
        recommendation = "Roof thermal performance appears satisfactory; verify via on-site audit."

    return {
        "score": round(score, 2),
        "risk_level": level,
        "recommendation": recommendation,
    }
