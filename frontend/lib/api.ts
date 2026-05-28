import type { FeatureCollection } from "geojson";

// Empty string = relative URL — works on Vercel (same domain) and locally when
// NEXT_PUBLIC_API_URL is set (e.g. http://localhost:8000 in .env.local).
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditResult {
  generated_at: string;
  address: string;
  coordinates: { lat: number; lon: number };
  physical_data: {
    footprint: {
      source: string;
      area_m2: number | null;
      site_area_m2?: number | null;
      building_count?: number | null;
      centroid: { lat: number; lon: number };
      zoom_used: number;
    };
    climate: {
      year: number;
      dni_annual_kwh_m2: number;
      temperature_mean_c: number;
    };
    roof_analysis: {
      surface_m2_vision: number;
      surface_m2_used: number;
      azimuth_degrees: number;
      roof_type: string;
      obstructions: string[];
      confidence: string;
      reasoning: string;
    };
    solar_potential: {
      usable_surface_m2: number;
      peak_power_kwp: number;
      annual_production_kwh: number;
      orientation_factor: number;
      obstruction_factor: number;
    };
    thermal_assessment: {
      score: number;
      risk_level: string;
      recommendation: string;
    };
  };
  financial_projection: {
    naf_sector: string;
    energy_price_eur_kwh: number;
    capex_eur: number;
    annual_savings_eur: number;
    roi_years: number | null;
    theoretical_consumption_kwh_year: number;
    solar_coverage_pct: number;
  };
  diagnostic: {
    theoretical_annual_consumption_kwh: number;
    night_talon_pct: number;
    estimated_waste_kwh: number;
    opex_savings_eur_per_year: number;
    opex_capex_eur: number;
    opex_roi: string;
    load_profile: {
      weekday_kw: number[];
      weekend_kw: number[];
      labels: string[];
      peak_hours: [number, number];
      /** Absolute max power across all measured slots (kW) — from Linky data only */
      peak_kw_absolute?: number;
    };
    /** GHG Protocol Scope 2 — tonnes CO2e wasted per year */
    wasted_tco2e: number;
    /** GetEcoPulse Grade A–F vs IEA global sector median */
    grade: string;
    /** ISO 50001 pre-assessment flags */
    iso_50001_assessment: {
      has_30min_data: boolean;
      has_quantified_baseline: boolean;
    };
    /** Quick Win — power subscription optimisation (only when puissance_souscrite_kva provided) */
    power_optimization?: {
      puissance_souscrite_kva: number;
      pic_puissance_reelle_kva: number;
      sur_capacite_kva: number;
      puissance_recommandee_kva: number;
      economie_abonnement_estimee_eur: number;
      is_over_dimensioned: boolean;
    } | null;
  };
  plausibility_check?: {
    /** Activity / business type found via Google Search */
    activity_type: string;
    /** "high" | "medium" | "low" | "N/A" */
    surface_plausibility: string;
    /** "high" | "medium" | "low" | "N/A" */
    confidence: string;
    reasoning: string;
    /** OSM footprint used for cross-validation */
    surface_osm_m2: number | null;
    /** Vision AI roof estimate */
    surface_vision_m2: number;
    /** Vision / OSM ratio (null when OSM unavailable) */
    coherence_ratio: number | null;
    /** Human-readable coherence flag (✅ or ⚠️) */
    coherence_flag: string;
  };
  country_code?: string;
  satellite_image_url: string | null;
  /** Base64 data URI of the satellite image — sent by the backend to avoid CORS on PDF export. */
  satellite_image_data_uri?: string | null;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Run the audit pipeline via the SSE streaming endpoint.
 * Calls `onProgress(step, total, status)` at each pipeline step,
 * then resolves with the final AuditResult.
 *
 * This approach keeps the Vercel serverless connection alive:
 * each progress event resets the TTFB/inactivity timer.
 */
export async function runAudit(
  address: string,
  nafCode: string,
  onProgress?: (step: number, total: number, status: string) => void,
): Promise<AuditResult> {
  const res = await fetch(`${API_BASE}/api/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, naf_code: nafCode }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `Erreur HTTP ${res.status}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE packets are separated by double newlines
    const packets = buffer.split("\n\n");
    buffer = packets.pop() ?? "";   // keep incomplete last chunk

    for (const packet of packets) {
      const line = packet.trim();
      if (!line.startsWith("data: ")) continue;

      const payload = JSON.parse(line.slice(6)) as {
        step?: number;
        total?: number;
        status?: string;
        result?: AuditResult;
        error?: string;
      };

      if (payload.error) {
        throw new Error(payload.error);
      }

      if (payload.result) {
        return payload.result;
      }

      if (onProgress && payload.step != null && payload.total != null && payload.status) {
        onProgress(payload.step, payload.total, payload.status);
      }
    }
  }

  throw new Error("Le stream s'est terminé sans résultat.");
}

export async function fetchFootprint(
  address: string
): Promise<FeatureCollection> {
  const res = await fetch(
    `${API_BASE}/api/footprint?address=${encodeURIComponent(address)}`
  );
  if (!res.ok) throw new Error(`Footprint HTTP ${res.status}`);
  return res.json() as Promise<FeatureCollection>;
}

// ---------------------------------------------------------------------------
// Stripe helpers
// ---------------------------------------------------------------------------

/**
 * SHA-256 of the normalized address (lowercase + trim).
 * Must match the server-side computation in index.py.
 */
export async function computeAddressHash(address: string): Promise<string> {
  const normalized = address.toLowerCase().trim();
  const data       = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Create a Stripe Checkout session and return the redirect URL. */
export async function createCheckoutSession(
  address:     string,
  nafCode:     string,
  addressHash: string,
  origin:      string,
): Promise<{ url: string; session_id: string }> {
  const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      address,
      naf_code:     nafCode,
      address_hash: addressHash,
      origin,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail ?? `Erreur HTTP ${res.status}`
    );
  }
  return res.json();
}

/**
 * Check whether the given address has already been purchased.
 * Pass sessionId right after a Stripe redirect for direct verification
 * (bypasses the webhook/DB race condition).
 */
export async function checkPurchase(
  addressHash: string,
  sessionId?:  string,
): Promise<boolean> {
  const params = new URLSearchParams({ address_hash: addressHash });
  if (sessionId) params.set("session_id", sessionId);
  const res = await fetch(`${API_BASE}/api/check-purchase?${params}`);
  if (!res.ok) return false;
  const data = (await res.json()) as { purchased: boolean };
  return data.purchased;
}
