"""
GetEcoPulse — Local dev entry point
Thin launcher: imports the FastAPI app from api/index.py.

Usage:
    uvicorn main:app --reload --port 8000

The canonical source is api/index.py — edit there, not here.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))

from index import app  # noqa: F401  (re-exported for uvicorn)
