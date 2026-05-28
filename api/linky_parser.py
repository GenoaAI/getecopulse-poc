"""
Enedis / Linky CSV parser for GetEcoPulse.

Parses the "Courbe de charge" export from the Enedis customer portal
(Mon Espace Client → Gérer ma consommation → Télécharger mes données)
and returns the same structure as consumption_generator.generate_load_profile(),
so the frontend ConsumptionChart receives identical data regardless of source.

Supported Enedis formats
------------------------
Format A — one row = one 30-min measurement (most common, used here):
  Horodatage;Valeur;Statut
  2026-05-01T00:00:00+02:00;39704;Mesure   ← unit W  (power)
  01/01/2024 00:30:00;450;B                ← unit Wh (energy)

Format B — one row = one day, columns = time slots:
  Date;00:30;01:00;...;24:00
  01/01/2024;450;420;...;510

Units handled
-------------
  W   — average power over the 30-min slot → kW = value / 1000
  Wh  — energy consumed in the 30-min slot → kW = value / 1000 / 0.5h
"""

import csv
import io
import re
from collections import defaultdict
from datetime import datetime, date


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _strip_tz(s: str) -> str:
    """Remove ISO 8601 timezone offset (+02:00, -05:30, Z) for strptime compat."""
    return re.sub(r"[+-]\d{2}:\d{2}$", "", s.strip()).replace("Z", "")


def _parse_datetime(s: str) -> datetime | None:
    """Parse a timestamp string — handles ISO 8601 (with or without tz) and French formats."""
    s = s.strip()
    # 1. Try Python's fromisoformat on cleaned string (handles T separator)
    clean = _strip_tz(s)
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S",
                "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M"):
        try:
            return datetime.strptime(clean, fmt)
        except ValueError:
            continue
    return None


def _parse_float(s: str) -> float | None:
    try:
        return float(s.strip().replace(",", ".").replace(" ", ""))
    except ValueError:
        return None


def _slot_index(hour: int, minute: int) -> int:
    """0-based 30-min slot (0 = 00:00, 1 = 00:30, … 47 = 23:30)."""
    return (hour * 2 + minute // 30) % 48


def _day_type(d: date) -> str:
    return "weekend" if d.weekday() >= 5 else "weekday"


# ---------------------------------------------------------------------------
# Metadata extraction
# ---------------------------------------------------------------------------

def _extract_unit(lines: list[str]) -> str:
    """
    Scan the metadata header lines for the measurement unit (W or Wh).
    Returns 'W' or 'Wh'.
    """
    for line in lines:
        parts = [p.strip().upper() for p in line.split(";")]
        for p in parts:
            if p == "WH":
                return "Wh"
            if p == "W":
                return "W"
    return "W"  # Enedis default for courbe de charge


# ---------------------------------------------------------------------------
# Format A parser  (one row = one 30-min measurement)
# ---------------------------------------------------------------------------

def _parse_format_a(
    reader: csv.DictReader,
    unit: str,
) -> dict[str, list[list[float | None]]]:
    """
    Returns {"weekday": [[slot0, slot1, …, slot47], …], "weekend": […]}
    Values are already in kW (converted from W or Wh).
    """
    fn_lower = [f.lower() for f in (reader.fieldnames or [])]

    # Detect timestamp column ("horodatage", "horodate", "date", …)
    ts_col = next(
        (reader.fieldnames[i] for i, f in enumerate(fn_lower)
         if "horodat" in f or (i == 0 and "date" in f)),
        None,
    )
    # Detect value column ("valeur", "value", "wh", "w", …)
    val_col = next(
        (reader.fieldnames[i] for i, f in enumerate(fn_lower)
         if "valeur" in f or ("value" in f and "horodat" not in f) or
            f in ("wh", "w", "puissance")),
        None,
    )

    if not ts_col or not val_col:
        raise ValueError(
            f"Colonnes introuvables. Entêtes détectées : {reader.fieldnames}"
        )

    days: dict[str, dict[date, list]] = {
        "weekday": defaultdict(lambda: [None] * 48),
        "weekend": defaultdict(lambda: [None] * 48),
    }

    for row in reader:
        dt = _parse_datetime(row.get(ts_col, ""))
        v  = _parse_float(row.get(val_col, ""))
        if dt is None or v is None:
            continue

        # Unit conversion → kW
        kw = v / 1000.0 if unit == "W" else v / 1000.0 / 0.5

        d    = dt.date()
        slot = _slot_index(dt.hour, dt.minute)
        days[_day_type(d)][d][slot] = kw

    return {k: list(v.values()) for k, v in days.items()}


# ---------------------------------------------------------------------------
# Format B parser  (one row = one day, columns = time slots)
# ---------------------------------------------------------------------------

def _parse_format_b(
    reader: csv.DictReader,
    unit: str,
) -> dict[str, list[list[float | None]]]:
    fieldnames = reader.fieldnames or []
    date_col   = fieldnames[0]
    time_cols  = fieldnames[1:]

    days: dict[str, dict[date, list]] = {
        "weekday": defaultdict(lambda: [None] * 48),
        "weekend": defaultdict(lambda: [None] * 48),
    }

    for row in reader:
        raw_date = row.get(date_col, "").strip()
        d = None
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                d = datetime.strptime(raw_date, fmt).date()
                break
            except ValueError:
                continue
        if d is None:
            continue

        dtype = _day_type(d)
        for col in time_cols:
            v = _parse_float(row.get(col, ""))
            if v is None:
                continue
            kw = v / 1000.0 if unit == "W" else v / 1000.0 / 0.5
            m  = re.match(r"(\d{1,2})[h:](\d{2})", col.strip())
            if not m:
                continue
            slot = _slot_index(int(m.group(1)), int(m.group(2)))
            days[dtype][d][slot] = kw

    return {k: list(v.values()) for k, v in days.items()}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_linky_csv(file_bytes: bytes) -> dict:
    """
    Parse an Enedis courbe-de-charge CSV export.

    Args:
        file_bytes: raw bytes of the uploaded CSV file.

    Returns the same structure as generate_load_profile():
        {
          "weekday_kw":  list[float],   # 48 avg-kW values, Mon–Fri
          "weekend_kw":  list[float],   # 48 avg-kW values, Sat–Sun
          "labels":      list[str],
          "peak_hours":  [int, int],    # detected from the data
          "source":      "linky",
          "annual_kwh":  float,
          "days_count":  int,
        }
    """
    # Decode
    text = None
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ValueError("Encodage du fichier non reconnu.")

    lines = text.splitlines()

    # Extract unit from metadata (lines before the data header)
    meta_lines = []
    data_start = 0
    for i, line in enumerate(lines):
        if re.search(r"horodat|^date[;\t,]", line, re.IGNORECASE):
            data_start = i
            break
        meta_lines.append(line)

    unit = _extract_unit(meta_lines)

    csv_text  = "\n".join(lines[data_start:])
    delimiter = ";" if csv_text.count(";") >= csv_text.count(",") else ","
    reader    = csv.DictReader(io.StringIO(csv_text), delimiter=delimiter)

    fieldnames = reader.fieldnames or []
    is_format_b = len(fieldnames) > 5 and any(
        re.match(r"\d{1,2}[h:]\d{2}", f.strip()) for f in fieldnames[1:]
    )

    if is_format_b:
        daily_data = _parse_format_b(reader, unit)
    else:
        daily_data = _parse_format_a(reader, unit)

    # Aggregate: average kW per slot across all days of each type
    def _avg_slot(days_list: list[list]) -> list[float]:
        totals = [0.0] * 48
        counts = [0]   * 48
        for day in days_list:
            for s, v in enumerate(day):
                if v is not None:
                    totals[s] += v
                    counts[s] += 1
        return [
            round(totals[s] / counts[s], 1) if counts[s] else 0.0
            for s in range(48)
        ]

    wd_days = daily_data.get("weekday") or []
    we_days = daily_data.get("weekend") or []

    if not wd_days and not we_days:
        raise ValueError("Aucune donnée exploitable trouvée dans le fichier.")

    weekday_kw = _avg_slot(wd_days) if wd_days else [0.0] * 48
    weekend_kw = _avg_slot(we_days) if we_days else weekday_kw

    # Absolute peak power (max single measured slot across all days)
    all_kw = [v for days in [wd_days, we_days] for day in days for v in day if v is not None]
    peak_kw_absolute = round(max(all_kw), 1) if all_kw else 0.0

    # Annual energy extrapolation
    SLOT_H = 0.5
    wd_daily_kwh = sum(weekday_kw) * SLOT_H
    we_daily_kwh = sum(weekend_kw) * SLOT_H
    annual_kwh   = round(wd_daily_kwh * 261 + we_daily_kwh * 104)

    # Detect peak hours (slots ≥ 60 % of weekday max)
    wk_max = max(weekday_kw) if weekday_kw else 0
    if wk_max > 0:
        threshold = wk_max * 0.6
        active    = [i for i, v in enumerate(weekday_kw) if v >= threshold]
        peak_start = active[0]  // 2 if active else 8
        peak_end   = active[-1] // 2 if active else 19
    else:
        peak_start, peak_end = 8, 19

    labels = [f"{i // 2:02d}:{30 * (i % 2):02d}" for i in range(48)]

    return {
        "weekday_kw":       weekday_kw,
        "weekend_kw":       weekend_kw,
        "labels":           labels,
        "peak_hours":       [peak_start, peak_end],
        "source":           "linky",
        "annual_kwh":       annual_kwh,
        "days_count":       len(wd_days) + len(we_days),
        "peak_kw_absolute": peak_kw_absolute,
    }
