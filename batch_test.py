"""
GetEcoPulse — Batch Test Runner
Tests the pipeline on 10 diverse French addresses and produces a quality scorecard.

Usage:
    python batch_test.py --mode footprint   # fast: geocoding + OSM only (~30s)
    python batch_test.py --mode full        # complete pipeline with Gemini Vision (~10 min)
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime

# Canonical source lives in api/ — add it to the path so imports resolve there
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))

from satellite_analyzer import BuildingAnalyzer

# ---------------------------------------------------------------------------
# 10 test cases — 5 regions, 3 NAF sectors, sizes from SME to large industry
# ---------------------------------------------------------------------------
TEST_CASES = [
    {"id":  1, "address": "Michelin, Clermont-Ferrand, France",              "naf": "NAF_INDUSTRIE", "region": "Auvergne"},
    {"id":  2, "address": "Airbus, 31700 Blagnac, France",                   "naf": "NAF_INDUSTRIE", "region": "Occitanie"},
    {"id":  3, "address": "Decathlon, 59650 Villeneuve-d-Ascq, France",      "naf": "NAF_COMMERCE",  "region": "Hauts-de-France"},
    {"id":  4, "address": "Amazon, 77127 Lieusaint, France",                 "naf": "NAF_ENTREPOT",  "region": "Ile-de-France"},
    {"id":  5, "address": "Sanofi, 94250 Gentilly, France",                  "naf": "NAF_INDUSTRIE", "region": "Ile-de-France"},
    {"id":  6, "address": "Schneider Electric, 38050 Grenoble, France",      "naf": "NAF_INDUSTRIE", "region": "Auvergne-Rhone-Alpes"},
    {"id":  7, "address": "Stellantis, 25600 Sochaux, France",               "naf": "NAF_INDUSTRIE", "region": "Bourgogne-Franche-Comte"},
    {"id":  8, "address": "IKEA, 78370 Plaisir, France",                     "naf": "NAF_COMMERCE",  "region": "Ile-de-France"},
    {"id":  9, "address": "Leroy Merlin France, 59712 Lezennes, France",     "naf": "NAF_COMMERCE",  "region": "Hauts-de-France"},
    {"id": 10, "address": "Sepro Group, 85000 La Roche-sur-Yon, France",     "naf": "NAF_INDUSTRIE", "region": "Pays-de-la-Loire"},
]

# ---------------------------------------------------------------------------
# Quality checks
# ---------------------------------------------------------------------------

FRANCE_BBOX = {"lat": (41.0, 51.5), "lon": (-5.5, 9.5)}


def verify_footprint(case: dict, result: dict) -> dict:
    """Quality checks for --mode footprint."""
    geo = result.get("geo", {})
    fp  = result.get("footprint", {})
    err = result.get("error")

    lat = geo.get("lat", 0)
    lon = geo.get("lon", 0)
    area = fp.get("area_m2") or 0
    source = fp.get("source", "fallback")

    checks = {
        "no_error":         err is None,
        "geocoding_ok":     bool(geo.get("formatted_address")),
        "coords_in_france": (FRANCE_BBOX["lat"][0] <= lat <= FRANCE_BBOX["lat"][1]
                             and FRANCE_BBOX["lon"][0] <= lon <= FRANCE_BBOX["lon"][1]),
        "footprint_found":  source in ("osm", "nominatim"),
        "area_plausible":   area > 200,
        "zoom_adapted":     fp.get("zoom", 20) < 20 if source != "fallback" else True,
    }
    passed = sum(checks.values())
    return {"checks": checks, "score": f"{passed}/{len(checks)}", "all_pass": passed == len(checks)}


def verify_full(case: dict, passport: dict) -> dict:
    """Quality checks for --mode full (superset of footprint checks)."""
    fp    = passport.get("physical_data", {}).get("footprint", {})
    roof  = passport.get("physical_data", {}).get("roof_analysis", {})
    solar = passport.get("physical_data", {}).get("solar_potential", {})
    fin   = passport.get("financial_projection", {})

    area_osm    = fp.get("area_m2") or 0
    area_vision = roof.get("surface_m2_vision") or 0
    area_used   = roof.get("surface_m2_used") or 1
    deviation   = abs(area_vision - area_osm) / area_used if area_osm > 0 else 1.0

    roi = fin.get("roi_years")

    checks = {
        "no_error":           True,
        "footprint_found":    fp.get("source") in ("osm", "nominatim"),
        "area_plausible":     area_used > 200,
        "vision_coherent":    deviation < 0.5,         # Vision within 50% of OSM
        "solar_nonzero":      (solar.get("peak_power_kwp") or 0) > 0,
        "roi_realistic":      roi is not None and 1 <= roi <= 30,
        "confidence_ok":      roof.get("confidence") in ("high", "medium"),
    }
    passed = sum(checks.values())
    return {
        "checks": checks,
        "score": f"{passed}/{len(checks)}",
        "all_pass": passed == len(checks),
        "area_deviation_pct": round(deviation * 100, 1),
    }


# ---------------------------------------------------------------------------
# Runners
# ---------------------------------------------------------------------------

def run_footprint_mode(analyzer: BuildingAnalyzer, case: dict) -> dict:
    geo = analyzer.get_coordinates(case["address"])
    fp  = analyzer.fetch_building_footprint(geo["lat"], geo["lon"], address=case["address"])
    return {"geo": geo, "footprint": fp}


def run_full_mode(analyzer: BuildingAnalyzer, case: dict) -> dict:
    return analyzer.generate_passport(case["address"], naf_sector=case["naf"])


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

CHECK_ICONS = {True: "OK", False: "!!"}


def print_summary(results: list, mode: str):
    sep = "-" * 92
    print("\n" + "=" * 92)
    print(f"  BATCH TEST SUMMARY — mode: {mode.upper()}   ({datetime.now().strftime('%Y-%m-%d %H:%M')})")
    print("=" * 92)
    print(f"  {'#':<3} {'Address':<42} {'Region':<22} {'Score':<7} {'Time':>6}s  {'Status'}")
    print(sep)

    total_pass = 0
    for r in results:
        case    = r["case"]
        verdict = r.get("verdict", {})
        score   = verdict.get("score", "0/0")
        ok      = verdict.get("all_pass", False)
        elapsed = r.get("elapsed_s", 0)
        status  = "PASS" if ok else "FAIL"
        if ok:
            total_pass += 1
        print(f"  {case['id']:<3} {case['address'][:41]:<42} {case['region']:<22} {score:<7} {elapsed:>6.1f}  {status}")

    print(sep)
    print(f"  Total: {total_pass}/{len(results)} passed\n")

    # Detail failed checks
    failed = [r for r in results if not r.get("verdict", {}).get("all_pass")]
    if failed:
        print("  FAILED CHECKS DETAIL:")
        for r in failed:
            checks = r.get("verdict", {}).get("checks", {})
            failed_checks = [k for k, v in checks.items() if not v]
            print(f"    #{r['case']['id']} {r['case']['address'][:50]}")
            for c in failed_checks:
                print(f"       !! {c}")
        print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="GetEcoPulse batch tester")
    parser.add_argument("--mode", choices=["footprint", "full"], default="footprint")
    parser.add_argument("--output", default="output/batch_results.json")
    args = parser.parse_args()

    print(f"\n  GetEcoPulse — Batch Test ({args.mode.upper()} mode)")
    print(f"  Running {len(TEST_CASES)} addresses...\n")

    os.makedirs("output", exist_ok=True)
    analyzer = BuildingAnalyzer()
    results  = []

    for case in TEST_CASES:
        print(f"\n--- [{case['id']:02d}/10] {case['address']} ---")
        start = time.time()
        record: dict = {"case": case, "error": None, "data": None, "verdict": {}}

        try:
            if args.mode == "footprint":
                data    = run_footprint_mode(analyzer, case)
                verdict = verify_footprint(case, data)
            else:
                data    = run_full_mode(analyzer, case)
                verdict = verify_full(case, data)

            record["data"]    = data
            record["verdict"] = verdict

        except Exception as exc:
            print(f"  [ERROR] {exc}")
            record["error"]   = str(exc)
            record["verdict"] = {"checks": {"no_error": False}, "score": "0/1", "all_pass": False}

        record["elapsed_s"] = round(time.time() - start, 1)
        results.append(record)

        # Inline status
        v = record["verdict"]
        print(f"  => Score {v.get('score')} in {record['elapsed_s']}s"
              + (" — PASS" if v.get("all_pass") else " — FAIL"))

    print_summary(results, args.mode)

    # Save full results
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)
    print(f"  Full results saved to {args.output}\n")


if __name__ == "__main__":
    main()
