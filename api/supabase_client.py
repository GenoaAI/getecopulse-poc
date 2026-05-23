"""
GetEcoPulse — Supabase infrastructure manager
Handles satellite image storage (Storage) and audit persistence (PostgreSQL).

Graceful degradation: if SUPABASE_URL / SUPABASE_KEY are absent from .env,
all methods are no-ops so the pipeline still works in local/test mode.
"""

import uuid
from supabase import create_client, Client

from config import settings


class SupabaseManager:
    """Thin wrapper around the Supabase client — single instance shared by FastAPI."""

    BUCKET = "satellite-images"
    TABLE  = "audits"

    def __init__(self) -> None:
        if settings.supabase_url and settings.supabase_key:
            self._client: Client | None = create_client(
                settings.supabase_url, settings.supabase_key
            )
        else:
            self._client = None

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    @property
    def is_configured(self) -> bool:
        return self._client is not None

    # ------------------------------------------------------------------
    # Storage — satellite images
    # ------------------------------------------------------------------

    def upload_satellite_image(self, image_bytes: bytes, address: str) -> str | None:
        """
        Upload *image_bytes* to the public bucket and return its public URL.
        Returns None (silently) if Supabase is not configured or upload fails.
        """
        if not self.is_configured:
            return None

        filename = f"{uuid.uuid4()}.png"
        try:
            self._client.storage.from_(self.BUCKET).upload(
                path=filename,
                file=image_bytes,
                file_options={"content-type": "image/png"},
            )
            url: str = self._client.storage.from_(self.BUCKET).get_public_url(filename)
            print(f"    [Supabase Storage] Uploaded -> {url}")
            return url
        except Exception as exc:
            print(f"    [WARN] Supabase image upload failed: {exc}")
            return None

    # ------------------------------------------------------------------
    # Database — audit persistence
    # ------------------------------------------------------------------

    def save_audit_to_db(self, passport: dict) -> dict:
        """
        Insert a row in the `audits` table with key metrics + the full passport JSON.
        Returns the inserted row (or {} on failure / not configured).
        """
        if not self.is_configured:
            return {}

        fin       = passport.get("financial_projection", {})
        coords    = passport.get("coordinates", {})
        footprint = passport.get("physical_data", {}).get("footprint", {})

        # Strip the large base64 data URI before storing in Postgres — the image
        # is already persisted via Supabase Storage (satellite_image_url).
        passport_to_store = {k: v for k, v in passport.items() if k != "satellite_image_data_uri"}

        row = {
            "address":             passport.get("address"),
            "naf_code":            fin.get("naf_sector"),
            "latitude":            coords.get("lat"),
            "longitude":           coords.get("lon"),
            "area_m2":             footprint.get("area_m2"),
            "capex_eur":           fin.get("capex_eur"),
            "roi_years":           fin.get("roi_years"),
            "solar_coverage_pct":  fin.get("solar_coverage_pct"),
            "satellite_image_url": passport.get("satellite_image_url"),
            "passport_json":       passport_to_store,
        }

        try:
            result = self._client.table(self.TABLE).insert(row).execute()
            saved  = result.data[0] if result.data else {}
            print(f"    [Supabase DB] Audit saved — id: {saved.get('id', '?')}")
            return saved
        except Exception as exc:
            print(f"    [WARN] Supabase DB insert failed: {exc}")
            return {}


# Singleton — imported by main.py and anywhere else in the app
supabase_manager = SupabaseManager()
