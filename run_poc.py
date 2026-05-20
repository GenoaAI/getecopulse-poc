"""
GetEcoPulse — Proof of Concept runner
Runs the full building analysis pipeline on a fixed industrial address
and prints the resulting energy passport as formatted JSON.
"""

import json
import sys
from satellite_analyzer import BuildingAnalyzer

TARGET_ADDRESS = "15 rue des Freres Lumieres, 69680 Chassieu, France"
NAF_SECTOR     = "NAF_INDUSTRIE"


def main():
    print("=" * 60)
    print("  GetEcoPulse - Building Energy Passport (PoC)")
    print("=" * 60)
    print(f"  Address : {TARGET_ADDRESS}")
    print(f"  Sector  : {NAF_SECTOR}")
    print("=" * 60 + "\n")

    analyzer = BuildingAnalyzer(output_dir="output")

    try:
        passport = analyzer.generate_passport(TARGET_ADDRESS, naf_sector=NAF_SECTOR)
    except Exception as exc:
        print(f"\n[ERROR] Pipeline failed: {exc}", file=sys.stderr)
        raise

    print("\n" + "=" * 60)
    print("  ENERGY PASSPORT")
    print("=" * 60)
    print(json.dumps(passport, indent=2, ensure_ascii=False))

    output_file = "output/passport.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(passport, f, indent=2, ensure_ascii=False)
    print(f"\n  Saved to {output_file}")


if __name__ == "__main__":
    main()
