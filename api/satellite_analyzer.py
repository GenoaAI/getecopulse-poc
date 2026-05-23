import os
import math
import requests
from datetime import datetime

from pydantic import BaseModel, Field

from config import settings
from consumption_generator import generate_load_profile

# Optional — google-genai for Search-grounded plausibility check
try:
    from google import genai as _google_genai
    from google.genai import types as _google_types
    _GOOGLE_GENAI_AVAILABLE = True
except ImportError:
    _GOOGLE_GENAI_AVAILABLE = False


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


class PlausibilityCheck(BaseModel):
    activity_type: str = Field(description="Type of activity or business at this address")
    surface_plausibility: str = Field(description="Plausibility of OSM footprint for this activity: high / medium / low")
    confidence: str = Field(description="Confidence in the assessment: high / medium / low")
    reasoning: str = Field(description="One concise sentence explaining the assessment")


# ---------------------------------------------------------------------------
# GetEcoPulse Grade — public so main.py can reuse it for the Linky endpoint
# ---------------------------------------------------------------------------

def compute_grade(eui_ratio: float) -> str:
    """
    Map EUI ratio (actual_eui / sector_global_median) to GetEcoPulse grade A–F.
    Ratio < 1 means the building is more efficient than the global median.
    """
    if eui_ratio < 0.70: return "A"
    if eui_ratio < 0.90: return "B"
    if eui_ratio < 1.10: return "C"
    if eui_ratio < 1.40: return "D"
    if eui_ratio < 2.00: return "E"
    return "F"


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

        profile = profiles.get(naf_sector) or profiles["NAF_BUREAUX"]
        theoretical_consumption_kwh = roof_surface_m2 * profile.kwh_per_m2
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

    def compute_diagnostic(
        self,
        surface_m2: float,
        naf_sector: str,
        country_code: str = "DEFAULT",
        actual_kwh: float | None = None,
        data_source: str = "synthetic",
    ) -> dict:
        """
        Estimate the 'talon de nuit' and compute credibility KPIs.
        All parameters sourced from business_config.yaml (zero hardcoding).

        Args:
            surface_m2:    Roof / building area used for consumption estimation.
            naf_sector:    Sector key (NAF_BUREAUX, NAF_INDUSTRIE, …).
            country_code:  ISO-2 country code for Scope 2 emission factor lookup.
            actual_kwh:    Real annual consumption from Linky data (overrides theoretical).
            data_source:   "synthetic" or "linky" — drives ISO 50001 flags.
        """
        fin      = settings.financials
        profiles = settings.energy_profiles
        profile  = profiles.get(naf_sector) or profiles["NAF_BUREAUX"]

        theoretical_kwh  = surface_m2 * profile.kwh_per_m2
        annual_kwh       = actual_kwh if actual_kwh is not None else theoretical_kwh
        waste_kwh        = annual_kwh * profile.night_talon_pct
        opex_savings_eur = waste_kwh * fin.default_energy_price_kwh

        load_profile = generate_load_profile(
            annual_kwh=annual_kwh,
            naf_sector=naf_sector,
        )

        # ── GHG Protocol Scope 2 ──────────────────────────────────────────
        ef = settings.emission_factors.get(
            country_code.upper(),
            settings.emission_factors.get("DEFAULT", 0.400),
        )
        wasted_tco2e = round(waste_kwh * ef / 1000, 2)

        # ── GetEcoPulse Grade ─────────────────────────────────────────────
        eui       = annual_kwh / surface_m2 if surface_m2 > 0 else float(profile.kwh_per_m2)
        eui_ratio = eui / profile.eui_median_global
        grade     = compute_grade(eui_ratio)

        # ── ISO 50001 pre-assessment ──────────────────────────────────────
        has_real_data = (data_source == "linky")
        iso_50001_assessment = {
            "has_30min_data":        has_real_data,
            "has_quantified_baseline": has_real_data,
        }

        return {
            "theoretical_annual_consumption_kwh": round(annual_kwh),
            "night_talon_pct":           profile.night_talon_pct,
            "estimated_waste_kwh":       round(waste_kwh),
            "opex_savings_eur_per_year": round(opex_savings_eur),
            "opex_capex_eur":            0,
            "opex_roi":                  "Immédiat",
            "load_profile":              load_profile,
            "wasted_tco2e":              wasted_tco2e,
            "grade":                     grade,
            "iso_50001_assessment":      iso_50001_assessment,
        }


# ---------------------------------------------------------------------------
# Main analyzer
# ---------------------------------------------------------------------------

class BuildingAnalyzer:
    """
    Geospatial and thermal analysis pipeline for a building from its postal address.
    All physical and financial constants are read from settings (business_config.yaml).
    """

    MAPBOX_STATIC_URL = "https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static"
    GEOCODING_URL     = "https://maps.googleapis.com/maps/api/geocode/json"
    OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"

    def __init__(self) -> None:
        os.environ["GEMINI_API_KEY"] = settings.gemini_api_key
        self._economy = EconomicEngine()

    # ------------------------------------------------------------------
    # Step 1 — Geocoding
    # ------------------------------------------------------------------

    def get_coordinates(self, address: str) -> dict:
        """Convert a postal address to latitude/longitude via Google Geocoding API."""
        print(f"[1/6] Geocoding: {address}")
        params = {"address": address, "key": settings.google_maps_api_key}
        response = requests.get(self.GEOCODING_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data["status"] != "OK" or not data["results"]:
            raise ValueError(f"Geocoding failed: {data.get('status')} — {data.get('error_message', '')}")

        location = data["results"][0]["geometry"]["location"]

        # Extract ISO-2 country code from address_components
        country_code = "DEFAULT"
        for comp in data["results"][0].get("address_components", []):
            if "country" in comp.get("types", []):
                country_code = comp["short_name"].upper()
                break

        result = {
            "lat": location["lat"],
            "lon": location["lng"],
            "formatted_address": data["results"][0]["formatted_address"],
            "country_code": country_code,
        }
        print(f"    -> {result['formatted_address']}  ({result['lat']}, {result['lon']})  [{country_code}]")
        return result

    # ------------------------------------------------------------------
    # Step 2 — Building footprint (OpenStreetMap Overpass)
    # ------------------------------------------------------------------

    def fetch_building_footprint(self, lat: float, lon: float, address: str = "") -> dict:
        """
        Fetch the building polygon for the given location.
        Strategy (in order):
          1. Nominatim — search by address, returns the OSM polygon directly (most reliable)
          2. Overpass  — query buildings in radius, select the one containing the point
          3. Fallback  — return geocoded point with zoom=20 (no polygon)
        """
        print("[2/5] Fetching building footprint from OSM...")
        ov = settings.overpass
        FALLBACK = {
            "source": "fallback",
            "area_m2": None,
            "centroid_lat": lat,
            "centroid_lon": lon,
            "zoom": 20,
            "bbox": None,
            "polygon_coords": [],
        }

        # ------------------------------------------------------------------
        # Strategy 1 — Nominatim: geocoder returns the OSM polygon directly
        # ------------------------------------------------------------------
        if address:
            result = self._footprint_from_nominatim(address, lat, lon, ov)
            if result:
                return result

        # ------------------------------------------------------------------
        # Strategy 2 — Overpass: find buildings in radius, pick the best one
        # ------------------------------------------------------------------
        result = self._footprint_from_overpass(lat, lon, ov)
        if result:
            return result

        print("    [WARN] No building polygon found — using geocoded point as fallback")
        return FALLBACK

    def _footprint_from_nominatim(self, address: str, lat: float, lon: float, ov) -> dict | None:
        """Query Nominatim for the address and return its polygon if available."""
        NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
        headers = {"User-Agent": "GetEcoPulse/1.0 (energy audit PoC; contact@getecopulse.fr)"}
        params  = {"q": address, "format": "geojson", "polygon_geojson": 1, "limit": 5}
        try:
            resp = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=15)
            resp.raise_for_status()
            features = resp.json().get("features", [])
        except Exception as exc:
            print(f"    [WARN] Nominatim request failed: {exc}")
            return None

        for feat in features:
            geom = feat.get("geometry", {})
            if geom.get("type") == "Polygon":
                coords = geom["coordinates"][0]          # outer ring [[lon,lat], ...]
                nodes_latlon = [(c[1], c[0]) for c in coords]
                result = self._build_footprint_result(nodes_latlon, coords, ov, source="nominatim")
                return self._maybe_refine_with_buildings(result, nodes_latlon, ov, geo_lat=lat, geo_lon=lon)
            if geom.get("type") == "MultiPolygon":
                # pick the largest ring
                all_rings = [ring for poly in geom["coordinates"] for ring in poly]
                best_ring = max(all_rings, key=lambda r: _polygon_area_m2([(c[1], c[0]) for c in r]))
                nodes_latlon = [(c[1], c[0]) for c in best_ring]
                result = self._build_footprint_result(nodes_latlon, best_ring, ov, source="nominatim")
                return self._maybe_refine_with_buildings(result, nodes_latlon, ov, geo_lat=lat, geo_lon=lon)

        print("    [INFO] Nominatim returned no polygon — trying Overpass")
        return None

    def _footprint_from_overpass(self, lat: float, lon: float, ov) -> dict | None:
        """Query Overpass for building ways near the point and pick the best one."""
        query = (
            f"[out:json][timeout:15];"
            f"way[\"building\"](around:{ov.search_radius_m},{lat},{lon});"
            f"out geom;"
        )
        headers = {
            "User-Agent": "GetEcoPulse/1.0 (energy audit PoC; contact@getecopulse.fr)",
            "Accept": "application/json",
        }
        try:
            resp = requests.get(ov.api_url, params={"data": query}, headers=headers, timeout=20)
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
        except Exception as exc:
            print(f"    [WARN] Overpass request failed: {exc}")
            return None

        if not elements:
            return None

        def _elem_area(e):
            return _polygon_area_m2([(n["lat"], n["lon"]) for n in e["geometry"]])

        # Priority: building that contains the geocoded point; else largest
        containing = [e for e in elements
                      if _point_in_polygon(lat, lon,
                                           [(n["lat"], n["lon"]) for n in e["geometry"]])]
        if containing:
            best = max(containing, key=_elem_area)
            print(f"    [Overpass] {len(containing)} building(s) contain the point — using largest")
        else:
            best = max(elements, key=_elem_area)
            print(f"    [Overpass] Point outside all buildings — using largest of {len(elements)}")

        nodes_latlon   = [(n["lat"], n["lon"]) for n in best["geometry"]]
        polygon_coords = [[n["lon"], n["lat"]] for n in best["geometry"]]
        return self._build_footprint_result(nodes_latlon, polygon_coords, ov, source="osm")

    def _maybe_refine_with_buildings(
        self,
        base_result: dict,
        site_polygon: list[tuple[float, float]],
        ov,
        geo_lat: float | None = None,
        geo_lon: float | None = None,
    ) -> dict:
        """
        If the Nominatim parcel is larger than the threshold, replace its area_m2
        with the sum of individual building footprints found by Overpass inside the
        site boundary.  The satellite image is then re-centred and re-zoomed on the
        NEAREST building to the geocoded address point — not the combined bbox of all
        buildings (which can span hundreds of metres in an industrial zone).
        """
        if not base_result.get("bbox"):
            return base_result
        parcel_area = base_result["area_m2"] or 0
        if parcel_area <= ov.site_area_threshold_m2:
            return base_result

        print(f"    [INFO] Large parcel ({parcel_area:.0f} m2 > threshold {ov.site_area_threshold_m2} m2)"
              " — querying individual buildings via Overpass...")
        buildings = self._query_buildings_in_bbox(base_result["bbox"], site_polygon, ov)

        if not buildings:
            print("    [WARN] No individual buildings found — keeping parcel area as estimate")
            return base_result

        total_roof = sum(b["area_m2"] for b in buildings)
        print(f"    [Overpass] {len(buildings)} building(s) inside site — total roof: {total_roof:.0f} m2")

        base_result["area_m2"]        = round(total_roof, 1)
        base_result["site_area_m2"]   = round(parcel_area, 1)
        base_result["building_count"] = len(buildings)
        base_result["buildings"]      = buildings

        # Re-centre and re-zoom on the NEAREST building to the geocoded address point.
        # Using the combined bbox of ALL buildings would span the entire industrial zone
        # and produce a far-too-wide satellite image.
        ref_lat = geo_lat if geo_lat is not None else base_result["centroid_lat"]
        ref_lon = geo_lon if geo_lon is not None else base_result["centroid_lon"]

        def _bld_centroid(b: dict) -> tuple[float, float]:
            lats = [n[0] for n in b["nodes_latlon"]]
            lons = [n[1] for n in b["nodes_latlon"]]
            return sum(lats) / len(lats), sum(lons) / len(lons)

        nearest = min(buildings, key=lambda b: _point_distance(ref_lat, ref_lon, *_bld_centroid(b)))
        n_lats  = [n[0] for n in nearest["nodes_latlon"]]
        n_lons  = [n[1] for n in nearest["nodes_latlon"]]
        c_lat, c_lon = _bld_centroid(nearest)
        near_bbox = {
            "min_lat": min(n_lats), "max_lat": max(n_lats),
            "min_lon": min(n_lons), "max_lon": max(n_lons),
        }
        zoom = _optimal_zoom(c_lat, near_bbox, ov.image_padding_factor, ov.zoom_min, ov.zoom_max)
        base_result["centroid_lat"] = round(c_lat, 7)
        base_result["centroid_lon"] = round(c_lon, 7)
        base_result["zoom"]         = zoom
        print(f"    [refine] nearest building -> zoom: {zoom}  centroid: ({c_lat:.5f}, {c_lon:.5f})")

        return base_result

    def _query_buildings_in_bbox(
        self,
        bbox: dict,
        site_polygon: list[tuple[float, float]],
        ov,
    ) -> list[dict]:
        """
        Query Overpass for all way["building"] elements inside *bbox*,
        then keep only those whose centroid lies within *site_polygon*
        (point-in-polygon guard against buildings that touch the bbox edge).
        Returns a list of {nodes_latlon, polygon_coords, area_m2} dicts.
        """
        s, w, n, e = bbox["min_lat"], bbox["min_lon"], bbox["max_lat"], bbox["max_lon"]
        query = f"[out:json][timeout:30];way[\"building\"]({s},{w},{n},{e});out geom;"
        headers = {
            "User-Agent": "GetEcoPulse/1.0 (energy audit PoC; contact@getecopulse.fr)",
            "Accept": "application/json",
        }
        try:
            resp = requests.get(ov.api_url, params={"data": query}, headers=headers, timeout=35)
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
        except Exception as exc:
            print(f"    [WARN] Overpass bbox query failed: {exc}")
            return []

        results = []
        for elem in elements:
            if not elem.get("geometry"):
                continue
            nodes = [(n["lat"], n["lon"]) for n in elem["geometry"]]
            if len(nodes) < 3:
                continue
            # Centroid of this building
            c_lat = sum(n[0] for n in nodes) / len(nodes)
            c_lon = sum(n[1] for n in nodes) / len(nodes)
            # Keep only buildings whose centroid is inside the Nominatim site polygon
            if not _point_in_polygon(c_lat, c_lon, site_polygon):
                continue
            area = _polygon_area_m2(nodes)
            if area < 50:   # ignore sheds, bike shelters, etc.
                continue
            results.append({
                "nodes_latlon":   nodes,
                "polygon_coords": [[pt["lon"], pt["lat"]] for pt in elem["geometry"]],
                "area_m2":        round(area, 1),
            })
        return results

    def _build_footprint_result(
        self,
        nodes_latlon: list[tuple[float, float]],
        polygon_coords: list,   # [[lon, lat], ...] for GeoJSON
        ov,
        source: str,
    ) -> dict:
        """Compute area, centroid, bbox and zoom from polygon nodes."""
        area_m2   = _polygon_area_m2(nodes_latlon)
        c_lat     = sum(n[0] for n in nodes_latlon) / len(nodes_latlon)
        c_lon     = sum(n[1] for n in nodes_latlon) / len(nodes_latlon)
        lats      = [n[0] for n in nodes_latlon]
        lons      = [n[1] for n in nodes_latlon]
        bbox      = {"min_lat": min(lats), "max_lat": max(lats),
                     "min_lon": min(lons), "max_lon": max(lons)}
        zoom      = _optimal_zoom(c_lat, bbox, ov.image_padding_factor, ov.zoom_min, ov.zoom_max)
        result    = {
            "source": source,
            "area_m2": round(area_m2, 1),
            "centroid_lat": round(c_lat, 7),
            "centroid_lon": round(c_lon, 7),
            "zoom": zoom,
            "bbox": bbox,
            "polygon_coords": polygon_coords,
        }
        print(f"    [{source}] area: {result['area_m2']} m2  |  zoom: {zoom}  |  centroid: ({c_lat:.5f}, {c_lon:.5f})")
        return result

    # ------------------------------------------------------------------
    # Step 5 — Business context plausibility check (Gemini + Google Search)
    # ------------------------------------------------------------------

    def _check_plausibility(
        self,
        address: str,
        naf_sector: str,
        osm_area_m2: float | None,
    ) -> dict:
        """
        Use Gemini with Google Search grounding to evaluate the business context
        at the address and plausibility of the measured OSM footprint.
        Non-fatal — always returns a dict (fallback on any error).
        """
        print("[5/6] Checking business context via Gemini + Google Search…")
        if not _GOOGLE_GENAI_AVAILABLE:
            print("    [WARN] google-genai not installed — skipping plausibility check")
            return {
                "activity_type": "N/A",
                "surface_plausibility": "N/A",
                "confidence": "low",
                "reasoning": "google-genai package not available.",
            }
        try:
            client = _google_genai.Client(api_key=settings.gemini_api_key)
            area_str = f"{osm_area_m2:.0f} m²" if osm_area_m2 else "unknown"

            prompt = (
                "Tu es un auditeur énergétique bâtiment chargé de vérifier un résultat d'audit.\n\n"
                f"Adresse : {address}\n"
                f"Secteur NAF : {naf_sector}\n"
                f"Emprise bâtimentaire mesurée (OSM) : {area_str}\n\n"
                "Recherche des informations sur cette adresse/entreprise, puis réponds :\n"
                "1. Quel type d'activité ou d'entreprise est situé à cette adresse ?\n"
                f"2. Une emprise bâtimentaire de {area_str} est-elle plausible pour cette activité ?\n"
                "3. Ton niveau de confiance dans cette évaluation.\n\n"
                "IMPORTANT : Réponds UNIQUEMENT en français pour 'activity_type' et 'reasoning'.\n"
                "Réponds UNIQUEMENT avec un objet JSON valide — sans markdown, sans texte hors JSON :\n"
                '{"activity_type": "...", "surface_plausibility": "high|medium|low", '
                '"confidence": "high|medium|low", "reasoning": "une phrase concise en français"}'
            )

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=_google_types.GenerateContentConfig(
                    tools=[_google_types.Tool(google_search=_google_types.GoogleSearch())],
                    temperature=0.1,
                ),
            )

            raw = response.text.strip()
            # Strip markdown fences if present
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            # Extract the first JSON object (handles trailing grounding citations)
            import re as _re
            m = _re.search(r"\{[^{}]*\}", raw, _re.DOTALL)
            if m:
                raw = m.group(0)

            result = PlausibilityCheck.model_validate_json(raw.strip())
            print(
                f"    -> {result.activity_type}"
                f"  |  Plausibility: {result.surface_plausibility}"
                f"  |  Confidence: {result.confidence}"
            )
            return result.model_dump()

        except Exception as exc:
            print(f"    [WARN] Plausibility check failed: {exc}")
            return {
                "activity_type": "N/A",
                "surface_plausibility": "N/A",
                "confidence": "low",
                "reasoning": f"Vérification non disponible : {exc}",
            }

    # ------------------------------------------------------------------
    # GeoJSON export (used by /api/footprint)
    # ------------------------------------------------------------------

    def get_building_geojson(self, address: str) -> dict:
        """
        Return a GeoJSON FeatureCollection with:
          - the building polygon from OSM (if found)
          - the geocoded address point
        """
        geo      = self.get_coordinates(address)
        footprint = self.fetch_building_footprint(geo["lat"], geo["lon"], address=address)

        features = []
        buildings = footprint.get("buildings", [])

        if buildings:
            # Large-site mode: site boundary (Nominatim parcel) + individual buildings (Overpass)
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [footprint["polygon_coords"]],
                },
                "properties": {
                    "label": "site_boundary",
                    "site_area_m2": footprint.get("site_area_m2"),
                    "building_count": footprint.get("building_count"),
                    "total_roof_m2": footprint["area_m2"],
                    "source": "nominatim",
                    "zoom_recommended": footprint["zoom"],
                },
            })
            for i, bld in enumerate(buildings, start=1):
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [bld["polygon_coords"]],
                    },
                    "properties": {
                        "label": f"building_{i}",
                        "area_m2": bld["area_m2"],
                        "source": "overpass",
                    },
                })
        elif footprint["source"] in ("osm", "nominatim"):
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [footprint["polygon_coords"]],
                },
                "properties": {
                    "area_m2": footprint["area_m2"],
                    "source": footprint["source"],
                    "zoom_recommended": footprint["zoom"],
                },
            })

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [geo["lon"], geo["lat"]],
            },
            "properties": {
                "label": "geocoded_point",
                "address": geo["formatted_address"],
            },
        })

        return {
            "type": "FeatureCollection",
            "features": features,
        }

    # ------------------------------------------------------------------
    # Step 3 — Satellite image
    # ------------------------------------------------------------------

    def fetch_satellite_image(self, lat: float, lon: float, zoom: int = 20) -> bytes:
        """
        Download a satellite image centred on the building and return raw bytes (no disk write).
        Uses Mapbox Static Images API — Google Maps Static is unavailable for EEA accounts.
        Mapbox coordinate order: lon,lat (reversed vs Google's lat,lon).
        Note: @2x shows the same geographic area as @1x at the same zoom level (Mapbox docs),
        just at 2× pixel density. No zoom correction needed.
        """
        print(f"[3/5] Fetching satellite image via Mapbox (zoom={zoom})...")
        # Mapbox URL format: /lon,lat,zoom/WxH@2x?access_token=...
        url = (
            f"{self.MAPBOX_STATIC_URL}"
            f"/{lon},{lat},{zoom}"
            f"/640x640@2x"
            f"?access_token={settings.mapbox_api_key}"
        )
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        print(f"    -> {len(response.content) // 1024} KB in memory")
        return response.content

    # ------------------------------------------------------------------
    # Step 3 — Climate data (Open-Meteo — free, no API key required)
    # ------------------------------------------------------------------

    def fetch_climate_data(self, lat: float, lon: float) -> dict:
        """
        Fetch annual solar irradiance and mean temperature from
        Open-Meteo Historical Weather API (last full calendar year).
        """
        print("[4/5] Fetching climate data from Open-Meteo...")
        end_year = datetime.now().year - 1
        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": f"{end_year}-01-01",
            "end_date": f"{end_year}-12-31",
            "daily": "shortwave_radiation_sum,temperature_2m_max,temperature_2m_min",
            "timezone": "auto",
        }
        try:
            response = requests.get(self.OPEN_METEO_URL, params=params, timeout=8)
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
        except Exception as exc:
            print(f"    [WARN] Climate API failed: {exc} — using default national averages.")
            # Default fallback values for France
            result = {
                "year": end_year,
                "dni_annual_kwh_m2": 1150.0,
                "temperature_mean_c": 12.5,
            }
        print(f"    -> DNI: {result['dni_annual_kwh_m2']} kWh/m2/yr  |  T mean: {result['temperature_mean_c']} C")
        return result

    # ------------------------------------------------------------------
    # Step 4 — Vision analysis (LiteLLM + Gemini)
    # ------------------------------------------------------------------

    def analyze_roof_with_vision(self, image_bytes: bytes) -> RoofAnalysis:
        """Send satellite image bytes to Gemini Vision and extract structured roof data."""
        print("[4/6] Analysing roof with Gemini Vision...")

        prompt = (
            "Tu es un auditeur énergétique bâtiment spécialisé dans l'analyse de toitures par télédétection. "
            "Tu vas recevoir une image satellite d'une toiture de bâtiment.\n\n"
            "Ton rôle est d'estimer les éléments suivants à partir de ce qui est visible dans l'image :\n"
            "1. surface_m2 : Surface utile principale de la toiture en mètres carrés (entier ou décimal).\n"
            "2. azimuth_degrees : Orientation principale de la toiture en degrés (0=Nord, 90=Est, 180=Sud, 270=Ouest).\n"
            "3. roof_type : Un parmi [flat, gable, hip, shed, complex, unknown] — garde ces valeurs exactes en anglais.\n"
            "4. obstructions : Liste JSON des obstructions visibles (cheminées, unités CVC, lanterneaux, antennes, etc.) — en français.\n"
            "5. confidence : Ton niveau de confiance global — un parmi [high, medium, low].\n"
            "6. reasoning : Une ou deux phrases expliquant tes estimations — OBLIGATOIREMENT EN FRANÇAIS.\n\n"
            "CRITIQUE : Réponds UNIQUEMENT avec un objet JSON valide correspondant au schéma. "
            "Pas de balises markdown, pas de texte hors JSON, pas de commentaires."
        )

        client = _google_genai.Client(api_key=settings.gemini_api_key)
        image_part = _google_types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")

        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[image_part, prompt],
                    config=_google_types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1,
                    ),
                )
                raw_json = response.text.strip()
                if raw_json.startswith("```"):
                    raw_json = raw_json.split("```")[1]
                    if raw_json.startswith("json"):
                        raw_json = raw_json[4:]
                parsed = RoofAnalysis.model_validate_json(raw_json)
                print(f"    -> Roof type: {parsed.roof_type}  |  Surface: {parsed.surface_m2} m2  |  Azimuth: {parsed.azimuth_degrees} deg")
                return parsed
            except Exception as exc:
                last_exc = exc
                print(f"    [WARN] Vision attempt {attempt + 1} failed: {exc}")

        raise RuntimeError(f"Gemini Vision failed after 3 attempts: {last_exc}")

    # ------------------------------------------------------------------
    # Step 5 — Final assembly (shared by blocking + streaming paths)
    # ------------------------------------------------------------------

    def _assemble_passport(
        self,
        geo: dict,
        footprint: dict,
        climate: dict,
        roof: RoofAnalysis,
        satellite_url: str | None,
        naf_sector: str,
        plausibility: dict | None = None,
        satellite_data_uri: str | None = None,
    ) -> dict:
        """
        Pure computation — no I/O.
        Assembles the full passport dict from the outputs of the pipeline steps.
        Called by both generate_passport() and the SSE streaming endpoint.
        """
        surface_ref = footprint["area_m2"] if footprint["area_m2"] else roof.surface_m2

        sp = settings.solar_physics
        obstruction_factor    = max(0.6, 1.0 - 0.05 * len(roof.obstructions))
        orientation_factor    = _orientation_factor(roof.azimuth_degrees)
        usable_surface        = surface_ref * sp.usable_surface_ratio * obstruction_factor
        peak_power_kwp        = (usable_surface / sp.sqm_per_kwp) * orientation_factor
        annual_production_kwh = peak_power_kwp * climate["dni_annual_kwh_m2"] * sp.performance_ratio

        thermal    = _thermal_loss_score(roof.roof_type, climate["temperature_mean_c"])
        financials = self._economy.compute(
            peak_power_kwp=peak_power_kwp,
            annual_production_kwh=annual_production_kwh,
            roof_surface_m2=surface_ref,
            naf_sector=naf_sector,
        )
        country_code = geo.get("country_code", "DEFAULT")
        diagnostic   = self._economy.compute_diagnostic(
            surface_ref, naf_sector, country_code=country_code
        )

        # ── Coherence ratio: Vision AI estimate vs OSM footprint ─────────────
        osm_area = footprint["area_m2"]
        vis_area = roof.surface_m2
        coherence_ratio = round(vis_area / osm_area, 2) if osm_area else None

        if coherence_ratio is None:
            coherence_flag = "N/A — surface OSM non disponible"
        elif coherence_ratio < 0.40:
            coherence_flag = (
                "⚠️ Vision bien en dessous OSM "
                "— bâtiment multi-nefs ou multi-étages probable"
            )
        elif coherence_ratio > 2.50:
            coherence_flag = (
                "⚠️ Vision bien au-dessus OSM "
                "— erreur de polygone OSM possible"
            )
        else:
            coherence_flag = "✅ Cohérence OSM / Vision satisfaisante"

        return {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "address":      geo["formatted_address"],
            "coordinates":  {"lat": geo["lat"], "lon": geo["lon"]},
            "country_code": country_code,
            "physical_data": {
                "footprint": {
                    "source":         footprint["source"],
                    "area_m2":        footprint["area_m2"],
                    "site_area_m2":   footprint.get("site_area_m2"),
                    "building_count": footprint.get("building_count"),
                    "centroid": {
                        "lat": footprint["centroid_lat"],
                        "lon": footprint["centroid_lon"],
                    },
                    "zoom_used": footprint["zoom"] - 1,  # actual Mapbox fetch zoom (computed - 1 for @2x)
                },
                "climate": climate,
                "roof_analysis": {
                    "surface_m2_vision": roof.surface_m2,
                    "surface_m2_used":   surface_ref,
                    "azimuth_degrees":   roof.azimuth_degrees,
                    "roof_type":         roof.roof_type,
                    "obstructions":      roof.obstructions,
                    "confidence":        roof.confidence,
                    "reasoning":         roof.reasoning,
                },
                "solar_potential": {
                    "usable_surface_m2":    round(usable_surface, 1),
                    "peak_power_kwp":       round(peak_power_kwp, 2),
                    "annual_production_kwh": round(annual_production_kwh),
                    "orientation_factor":   orientation_factor,
                    "obstruction_factor":   round(obstruction_factor, 2),
                    "params_used": {
                        "usable_surface_ratio": sp.usable_surface_ratio,
                        "sqm_per_kwp":          sp.sqm_per_kwp,
                        "performance_ratio":    sp.performance_ratio,
                    },
                },
                "thermal_assessment": thermal,
            },
            "plausibility_check": {
                **(plausibility or {
                    "activity_type": "N/A",
                    "surface_plausibility": "N/A",
                    "confidence": "N/A",
                    "reasoning": "Non effectué",
                }),
                "surface_osm_m2":    footprint["area_m2"],
                "surface_vision_m2": roof.surface_m2,
                "coherence_ratio":   coherence_ratio,
                "coherence_flag":    coherence_flag,
            },
            "financial_projection": financials,
            "diagnostic":           diagnostic,
            "satellite_image_url":  satellite_url,
            "satellite_image_data_uri": satellite_data_uri,
        }

    # ------------------------------------------------------------------
    # Step 5 — Passport generation (blocking, for local/non-Vercel use)
    # ------------------------------------------------------------------

    def generate_passport(
        self,
        address: str,
        naf_sector: str = "NAF_BUREAUX",
        image_uploader=None,
    ) -> dict:
        """
        Full blocking pipeline (5 steps):
          geocode → OSM footprint → satellite image → climate → vision → assemble
        Kept for backward-compatibility and local dev use.
        On Vercel, prefer the /api/audit SSE streaming endpoint.
        """
        print("[1/5] Geocoding...")
        geo      = self.get_coordinates(address)
        lat, lon = geo["lat"], geo["lon"]

        footprint   = self.fetch_building_footprint(lat, lon, address=address)
        image_bytes = self.fetch_satellite_image(
            footprint["centroid_lat"], footprint["centroid_lon"], footprint["zoom"]
        )

        satellite_url: str | None = None
        if image_uploader is not None:
            satellite_url = image_uploader(image_bytes, address)

        climate = self.fetch_climate_data(lat, lon)
        roof    = self.analyze_roof_with_vision(image_bytes)

        import base64
        satellite_data_uri = f"data:image/png;base64,{base64.b64encode(image_bytes).decode('utf-8')}"

        return self._assemble_passport(
            geo, footprint, climate, roof, satellite_url, naf_sector, plausibility, satellite_data_uri
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_EARTH_RADIUS_M = 6_378_137.0


def _polygon_centroid(geometry: list) -> tuple[float, float]:
    lats = [n["lat"] for n in geometry]
    lons = [n["lon"] for n in geometry]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def _polygon_area_m2(nodes: list[tuple[float, float]]) -> float:
    """
    Shoelace formula on lat/lon nodes projected to relative metres.
    Coordinates are shifted to the first node to avoid floating-point
    cancellation when working with absolute lat/lon values.
    """
    if len(nodes) < 3:
        return 0.0
    lat0, lon0 = nodes[0]
    # metres per degree at this latitude
    lat_m = math.radians(1) * _EARTH_RADIUS_M           # ~111 320 m/°
    lon_m = lat_m * math.cos(math.radians(lat0))         # ~75 000 m/° at 47°N
    # Relative coordinates in metres (eliminates catastrophic cancellation)
    xs = [(n[1] - lon0) * lon_m for n in nodes]
    ys = [(n[0] - lat0) * lat_m for n in nodes]
    n = len(xs)
    area = abs(sum(xs[i] * ys[(i + 1) % n] - xs[(i + 1) % n] * ys[i] for i in range(n))) / 2
    return area


def _point_in_polygon(lat_p: float, lon_p: float, nodes: list[tuple[float, float]]) -> bool:
    """
    Ray casting algorithm — returns True if (lat_p, lon_p) is inside the polygon.
    nodes: list of (lat, lon) tuples.
    """
    inside = False
    j = len(nodes) - 1
    for i, (lat_i, lon_i) in enumerate(nodes):
        lat_j, lon_j = nodes[j]
        if ((lon_i > lon_p) != (lon_j > lon_p)) and (
            lat_p < (lat_j - lat_i) * (lon_p - lon_i) / (lon_j - lon_i) + lat_i
        ):
            inside = not inside
        j = i
    return inside


def _point_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Euclidean distance in degrees (good enough for nearby-building selection)."""
    return math.hypot(lat1 - lat2, lon1 - lon2)


def _optimal_zoom(lat: float, bbox: dict, padding: float, z_min: int, z_max: int) -> int:
    """Compute the highest zoom that fits the bounding box in a 640px image."""
    lat_span_m = (bbox["max_lat"] - bbox["min_lat"]) * math.radians(1) * _EARTH_RADIUS_M
    lon_span_m = (bbox["max_lon"] - bbox["min_lon"]) * math.radians(1) * _EARTH_RADIUS_M * math.cos(math.radians(lat))
    required_m = max(lat_span_m, lon_span_m) * padding
    if required_m <= 0:
        return z_max
    # metres_per_pixel = 2π * R * cos(lat) / (256 * 2^zoom)
    # 640 * metres_per_pixel >= required_m  →  zoom = log2(2π*R*cos*640 / (256*required))
    zoom_f = math.log2(2 * math.pi * _EARTH_RADIUS_M * math.cos(math.radians(lat)) * 640 / (256 * required_m))
    return max(z_min, min(z_max, math.floor(zoom_f)))


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
