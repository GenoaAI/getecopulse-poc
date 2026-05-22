"""
GetEcoPulse — Proof of Concept runner
Runs the full building analysis pipeline on a fixed industrial address
and prints the resulting energy passport as formatted JSON.
"""

import json
import sys
import os

# Canonical source lives in api/ — add it to the path so imports resolve there
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))

from satellite_analyzer import BuildingAnalyzer

TARGET_ADDRESS = "Sepro Group, 85000 La Roche-sur-Yon, France"
NAF_SECTOR     = "NAF_INDUSTRIE"


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 60)
    print("  GetEcoPulse - Building Energy Passport (PoC)")
    print("=" * 60)
    print(f"  Address : {TARGET_ADDRESS}")
    print(f"  Sector  : {NAF_SECTOR}")
    print("=" * 60 + "\n")

    analyzer = BuildingAnalyzer()

    try:
        passport = analyzer.generate_passport(TARGET_ADDRESS, naf_sector=NAF_SECTOR)
    except Exception as exc:
        print(f"\n[ERROR] Pipeline failed: {exc}", file=sys.stderr)
        raise

    print("\n" + "=" * 60)
    print("  ENERGY PASSPORT")
    print("=" * 60)
    print(json.dumps(passport, indent=2, ensure_ascii=False))

    import os
    os.makedirs("output", exist_ok=True)
    output_file = "output/passport.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(passport, f, indent=2, ensure_ascii=False)
    print(f"\n  Saved to {output_file}")


if __name__ == "__main__":
    main()
