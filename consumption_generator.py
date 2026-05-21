"""
Synthetic load-profile generator for GetEcoPulse.

Produces realistic 30-minute consumption curves (Linky-style) from the
NAF-sector parameters defined in business_config.yaml.
Zero hardcoding: every shape parameter comes from settings.

Algorithm
---------
Each 30-min slot i gets a weight:

    weight[i] = night_w × (1 − activity[i]) + peak_w × activity[i]

where activity[i] ∈ [0, 1] smoothly transitions between night (0) and
peak (1) using linear ramps of width RAMP_HOURS around the peak window
boundaries.

Two constraints fix night_w and peak_w:
  • Σ weight[i] = 1                    (normalization)
  • Σ(1−activity[i])×weight[i] = night_talon_pct   (talon constraint)

This gives:
  night_w = night_talon_pct / Σ(1−activity[i])
  peak_w  = (1−night_talon_pct) / Σactivity[i]

The normalized shape is then scaled to match the annual_kwh target, taking
weekday/weekend split into account (≈261 weekdays + 104 weekend days/year).
Gaussian noise (σ = 7 % weekday, 5 % weekend) adds visual realism.
"""

import math
import random

from config import settings

# Approx. working-day split per year (non-leap year)
_N_WEEKDAYS = 261
_N_WEEKEND  = 104
_SLOT_HOURS = 0.5          # each slot = 30 min
_RAMP_HOURS = 1.5          # smooth transition width around peak boundaries


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _activity_factor(slot_index: int, peak_start: float, peak_end: float) -> float:
    """
    Returns a value in [0.0, 1.0] representing how 'active' a slot is.
    Linearly ramps from 0 (night) to 1 (full peak) over RAMP_HOURS.
    """
    h = slot_index / 2.0  # hour of day (0.0 … 23.5)

    # Distance into the ramp on each side
    t_up   = (h - peak_start) / _RAMP_HOURS          # >0 inside or past start
    t_down = (peak_end - h)   / _RAMP_HOURS           # >0 inside or before end

    return max(0.0, min(1.0, t_up, t_down))


def _build_shape(peak_start: float, peak_end: float, night_talon_pct: float) -> list[float]:
    """
    Build a normalized 48-slot weight vector (sum = 1.0).
    """
    N = 48
    acts = [_activity_factor(i, peak_start, peak_end) for i in range(N)]

    sum_act  = sum(acts)
    sum_1act = N - sum_act   # Σ(1 − activity[i])

    # Solve for per-slot base weights
    night_w = night_talon_pct / sum_1act if sum_1act > 0 else 0.0
    peak_w  = (1.0 - night_talon_pct) / sum_act if sum_act > 0 else 1.0 / N

    shape = [night_w * (1.0 - a) + peak_w * a for a in acts]

    # Re-normalize (floating-point safety)
    total = sum(shape)
    return [s / total for s in shape]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_load_profile(
    annual_kwh: float,
    naf_sector: str,
    seed: int = 42,
) -> dict:
    """
    Generate representative 30-minute load profiles (weekday + weekend).
    All shape parameters sourced from business_config.yaml via settings.

    Args:
        annual_kwh:  Total annual energy consumption in kWh.
        naf_sector:  NAF sector key (e.g. 'NAF_INDUSTRIE').
        seed:        Random seed — same address always returns the same curve.

    Returns:
        {
          "weekday_kw":  list[float],   # 48 average-kW values (Mon–Fri)
          "weekend_kw":  list[float],   # 48 average-kW values (Sat–Sun)
          "labels":      list[str],     # ["00:00", "00:30", … "23:30"]
          "peak_hours":  [int, int],    # from config
        }
    """
    rng = random.Random(seed)

    profiles = settings.energy_profiles
    profile  = profiles.get(naf_sector) or profiles["NAF_BUREAUX"]

    peak_start  = float(profile.peak_hours[0])
    peak_end    = float(profile.peak_hours[1])
    night_frac  = profile.night_talon_pct
    weekend_fac = profile.weekend_factor

    # ----------------------------------------------------------------
    # 1. Normalized shape
    # ----------------------------------------------------------------
    shape = _build_shape(peak_start, peak_end, night_frac)

    # ----------------------------------------------------------------
    # 2. Scale to annual energy
    #    annual = wd_daily × N_WD + we_daily × N_WE
    #           = wd_daily × (N_WD + N_WE × weekend_fac)
    # ----------------------------------------------------------------
    weekday_daily_kwh = annual_kwh / (_N_WEEKDAYS + _N_WEEKEND * weekend_fac)
    weekend_daily_kwh = weekday_daily_kwh * weekend_fac

    # Average kW per slot = kWh_per_slot / slot_duration_hours
    weekday_kw = [s * weekday_daily_kwh / _SLOT_HOURS for s in shape]
    weekend_kw = [s * weekend_daily_kwh / _SLOT_HOURS for s in shape]

    # ----------------------------------------------------------------
    # 3. Gaussian noise for visual realism
    # ----------------------------------------------------------------
    weekday_kw = [max(0.0, v * (1.0 + rng.gauss(0, 0.07))) for v in weekday_kw]
    weekend_kw = [max(0.0, v * (1.0 + rng.gauss(0, 0.05))) for v in weekend_kw]

    # ----------------------------------------------------------------
    # 4. Output
    # ----------------------------------------------------------------
    labels = [f"{i // 2:02d}:{30 * (i % 2):02d}" for i in range(48)]

    return {
        "weekday_kw": [round(v, 1) for v in weekday_kw],
        "weekend_kw": [round(v, 1) for v in weekend_kw],
        "labels":     labels,
        "peak_hours": profile.peak_hours,
    }
