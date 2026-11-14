"""
SPHEREx Stellarium 3D Backend API
=================================
Flask REST API delivering 3D celestial star data and SPHEREx infrared
spectral observations for 3D Stellarium frontends (Three.js / WebGL / Next.js).
"""

import os
import json
import logging
from datetime import datetime
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("spherex_stellarium")

app = Flask(__name__)
# Enable CORS for all origins so Next.js frontend (e.g. localhost:3000) can communicate seamlessly
CORS(app, resources={r"/*": {"origins": "*"}})

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
STARS_JSON_PATH = os.path.join(DATA_DIR, "stars.json")

# In-memory star catalog cache
CACHED_CATALOG = None


def load_star_catalog():
    """Loads and caches the SPHEREx star catalog from disk."""
    global CACHED_CATALOG
    if CACHED_CATALOG is not None:
        return CACHED_CATALOG

    if os.path.exists(STARS_JSON_PATH):
        try:
            with open(STARS_JSON_PATH, "r", encoding="utf-8") as f:
                CACHED_CATALOG = json.load(f)
            logger.info("Loaded %d stars from %s", len(CACHED_CATALOG.get("stars", [])), STARS_JSON_PATH)
        except Exception as e:
            logger.error("Failed to parse %s: %s", STARS_JSON_PATH, e)
            CACHED_CATALOG = {"stars": []}
    else:
        logger.warning("Catalog file %s not found. Initializing empty catalog.", STARS_JSON_PATH)
        CACHED_CATALOG = {"stars": []}

    return CACHED_CATALOG


def ra_dec_to_cartesian(ra_deg, dec_deg, radius=1000.0, system="threejs"):
    """
    Converts celestial coordinates (RA, Dec in degrees) to 3D Cartesian (x, y, z).
    - system='threejs': Y is UP, X/Z in celestial plane.
    - system='astronomical': Z is North Celestial Pole, X towards RA=0, Dec=0.
    """
    ra_rad = np.radians(ra_deg)
    dec_rad = np.radians(dec_deg)

    if system == "threejs":
        x = float(radius * np.cos(dec_rad) * np.sin(ra_rad))
        y = float(radius * np.sin(dec_rad))
        z = float(radius * np.cos(dec_rad) * np.cos(ra_rad))
    else:
        x = float(radius * np.cos(dec_rad) * np.cos(ra_rad))
        y = float(radius * np.cos(dec_rad) * np.sin(ra_rad))
        z = float(radius * np.sin(dec_rad))

    return {"x": round(x, 3), "y": round(y, 3), "z": round(z, 3)}


def generate_celestial_grid(radius=1000.0, step_deg=30):
    """Generates 3D line segments for the celestial coordinate grid (equator, parallels, meridians)."""
    grid_lines = []

    # Parallels (Declination lines: -60, -30, 0, 30, 60 deg)
    for dec in range(-60, 61, step_deg):
        points = []
        for ra in range(0, 361, 5):
            pos = ra_dec_to_cartesian(ra, dec, radius=radius, system="threejs")
            points.append([pos["x"], pos["y"], pos["z"]])
        grid_lines.append({
            "type": "equator" if dec == 0 else "parallel",
            "declination": dec,
            "points": points,
            "color": "#4A6FA5" if dec == 0 else "#23334D"
        })

    # Meridians (Right Ascension lines: every 30 deg / 2 hours)
    for ra in range(0, 360, step_deg):
        points = []
        for dec in range(-85, 86, 5):
            pos = ra_dec_to_cartesian(ra, dec, radius=radius, system="threejs")
            points.append([pos["x"], pos["y"], pos["z"]])
        grid_lines.append({
            "type": "meridian",
            "ra": ra,
            "points": points,
            "color": "#23334D"
        })

    return grid_lines


@app.route("/", methods=["GET"])
def index():
    """Root endpoint: overview of API routes."""
    return jsonify({
        "name": "SPHEREx Stellarium 3D Backend API",
        "version": "1.0.0",
        "description": "REST API delivering 3D star coordinates, photometry, and infrared spectral data from NASA SPHEREx",
        "endpoints": {
            "GET /api/health": "Health and uptime status",
            "GET /api/defaults": "Default inputs, coordinates, camera configuration and available bands",
            "GET /api/stars": "Filterable 3D star catalog (params: limit, min_flux, max_mag, sphere_radius, min_ra, max_ra, min_dec, max_dec)",
            "GET /api/stars/<id>": "Detailed data and spectral info for a single star",
            "GET /api/scene": "Full ready-to-render 3D Stellarium scene payload (stars + celestial grid + camera)",
            "GET /api/spherex/query": "Query live NASA/IPAC IRSA SIA for SPHEREx images (params: ra, dec, radius_arcsec)",
            "POST /api/convert/coordinates": "Convert celestial RA/Dec to 3D Cartesian coordinates"
        }
    })


@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint."""
    catalog = load_star_catalog()
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "total_loaded_stars": len(catalog.get("stars", [])),
        "mission": "NASA SPHEREx"
    })


@app.route("/api/defaults", methods=["GET"])
@app.route("/api/config", methods=["GET"])
def get_defaults():
    """
    Returns default configuration and inputs for the Stellarium frontend.
    These are the canonical target inputs from the SPHEREx tutorial.
    """
    catalog = load_star_catalog()
    center = catalog.get("center", {"ra": 304.693509, "dec": 42.443687})
    default_camera = catalog.get("default_camera", {
        "position": [0, 0, 50],
        "target": [0, 0, 0],
        "fov": 60,
        "near": 0.1,
        "far": 10000
    })

    return jsonify({
        "mission": "NASA SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer)",
        "archive": "NASA/IPAC Infrared Science Archive (IRSA)",
        "data_release": catalog.get("data_release", "DR1 / Level-2 Spectral Images"),
        "default_inputs": {
            "ra_deg": center.get("ra", 304.693509),
            "dec_deg": center.get("dec", 42.443687),
            "search_radius_arcsec": 1.0,
            "search_radius_deg": 0.5,
            "collection": ["spherex_dr1", "spherex_qr3"],
            "default_limit": 1000,
            "celestial_sphere_radius": catalog.get("celestial_sphere_radius", 1000.0)
        },
        "default_camera": default_camera,
        "spectral_bands": [
            {"band": 1, "wavelength_range_um": [0.75, 1.20], "label": "Band 1 (0.75 - 1.20 µm)"},
            {"band": 2, "wavelength_range_um": [1.20, 1.88], "label": "Band 2 (1.20 - 1.88 µm)"},
            {"band": 3, "wavelength_range_um": [1.88, 2.42], "label": "Band 3 (1.88 - 2.42 µm)"},
            {"band": 4, "wavelength_range_um": [2.42, 3.82], "label": "Band 4 (2.42 - 3.82 µm)"},
            {"band": 5, "wavelength_range_um": [3.82, 4.42], "label": "Band 5 (3.82 - 4.42 µm)"},
            {"band": 6, "wavelength_range_um": [4.42, 5.00], "label": "Band 6 (4.42 - 5.00 µm)"}
        ]
    })


@app.route("/api/stars", methods=["GET"])
def get_stars():
    """
    Returns stars formatted for 3D visualization.
    Query parameters:
    - limit: maximum number of stars to return (default: 1000, max: 10000)
    - min_flux: minimum flux threshold in MJy/sr
    - max_mag: maximum instrumental magnitude (faintest star)
    - sphere_radius: radius of 3D celestial sphere (default: 1000)
    - min_ra, max_ra, min_dec, max_dec: spatial bounding box filter
    """
    catalog = load_star_catalog()
    all_stars = catalog.get("stars", [])

    # Parse query parameters
    try:
        limit = min(int(request.args.get("limit", 1000)), 10000)
    except ValueError:
        limit = 1000

    min_flux = request.args.get("min_flux", type=float)
    max_mag = request.args.get("max_mag", type=float)
    sphere_radius = request.args.get("sphere_radius", type=float, default=catalog.get("celestial_sphere_radius", 1000.0))
    min_ra = request.args.get("min_ra", type=float)
    max_ra = request.args.get("max_ra", type=float)
    min_dec = request.args.get("min_dec", type=float)
    max_dec = request.args.get("max_dec", type=float)

    filtered = []
    base_radius = catalog.get("celestial_sphere_radius", 1000.0)
    rescale = (sphere_radius != base_radius)

    for star in all_stars:
        # Filter checks
        if min_flux is not None and star["flux_mjy_sr"] < min_flux:
            continue
        if max_mag is not None and star["magnitude"] > max_mag:
            continue
        if min_ra is not None and star["ra"] < min_ra:
            continue
        if max_ra is not None and star["ra"] > max_ra:
            continue
        if min_dec is not None and star["dec"] < min_dec:
            continue
        if max_dec is not None and star["dec"] > max_dec:
            continue

        if rescale:
            # Dynamically recalculate position with custom radius
            pos_3d = ra_dec_to_cartesian(star["ra"], star["dec"], radius=sphere_radius, system="threejs")
            star_copy = dict(star)
            star_copy["position"] = pos_3d
            filtered.append(star_copy)
        else:
            filtered.append(star)

        if len(filtered) >= limit:
            break

    return jsonify({
        "count": len(filtered),
        "total_available": len(all_stars),
        "sphere_radius": sphere_radius,
        "filters_applied": {
            "limit": limit,
            "min_flux": min_flux,
            "max_mag": max_mag,
            "ra_range": [min_ra, max_ra] if min_ra is not None or max_ra is not None else None,
            "dec_range": [min_dec, max_dec] if min_dec is not None or max_dec is not None else None
        },
        "stars": filtered
    })


@app.route("/api/stars/<star_id>", methods=["GET"])
def get_star_by_id(star_id):
    """Returns detailed information for a specific star by ID (e.g. SPX-00001)."""
    catalog = load_star_catalog()
    all_stars = catalog.get("stars", [])

    matched = None
    target_id = star_id.upper().strip()
    for star in all_stars:
        if star["id"].upper() == target_id or star["name"].upper() == target_id:
            matched = star
            break

    if not matched:
        return jsonify({"error": f"Star with ID '{star_id}' not found"}), 404

    # Find 5 nearest neighboring stars
    ra0, dec0 = matched["ra"], matched["dec"]
    neighbors = []
    for other in all_stars:
        if other["id"] == matched["id"]:
            continue
        dist_deg = np.hypot(other["ra"] - ra0, other["dec"] - dec0)
        neighbors.append((dist_deg, other["id"], other["name"], other["magnitude"]))

    neighbors.sort(key=lambda x: x[0])
    top_neighbors = [
        {"id": n[1], "name": n[2], "distance_arcmin": round(n[0] * 60, 2), "magnitude": n[3]}
        for n in neighbors[:5]
    ]

    return jsonify({
        "star": matched,
        "nearest_neighbors": top_neighbors
    })


@app.route("/api/scene", methods=["GET"])
def get_scene():
    """
    Returns a complete, self-contained 3D Stellarium scene payload.
    Includes camera setup, stars, and celestial coordinate grid lines.
    """
    catalog = load_star_catalog()
    stars_limit = min(int(request.args.get("limit", 1500)), 5000)
    sphere_radius = float(request.args.get("sphere_radius", catalog.get("celestial_sphere_radius", 1000.0)))

    # Fetch stars
    all_stars = catalog.get("stars", [])
    stars_subset = all_stars[:stars_limit]

    # Generate celestial orientation grid
    grid = generate_celestial_grid(radius=sphere_radius)

    return jsonify({
        "mission": catalog.get("mission", "NASA SPHEREx"),
        "field_center": catalog.get("center", {"ra": 304.693509, "dec": 42.443687}),
        "camera": catalog.get("default_camera", {
            "position": [0, 0, 50],
            "target": [0, 0, 0],
            "fov": 60,
            "near": 0.1,
            "far": 10000
        }),
        "celestial_sphere": {
            "radius": sphere_radius,
            "grid_lines": grid
        },
        "stars_count": len(stars_subset),
        "stars": stars_subset
    })


@app.route("/api/convert/coordinates", methods=["POST"])
def convert_coordinates():
    """
    Utility endpoint: converts given RA and Dec (deg) to 3D Cartesian coordinates.
    Body JSON:
    { "ra": 304.6935, "dec": 42.4436, "radius": 1000 }
    """
    data = request.get_json(silent=True) or {}
    ra = data.get("ra")
    dec = data.get("dec")
    radius = float(data.get("radius", 1000.0))

    if ra is None or dec is None:
        return jsonify({"error": "Both 'ra' and 'dec' parameters (in degrees) are required"}), 400

    threejs_pos = ra_dec_to_cartesian(float(ra), float(dec), radius=radius, system="threejs")
    astro_pos = ra_dec_to_cartesian(float(ra), float(dec), radius=radius, system="astronomical")

    return jsonify({
        "input": {"ra": float(ra), "dec": float(dec), "radius": radius},
        "position_threejs": threejs_pos,
        "position_astronomical": astro_pos
    })


@app.route("/api/spherex/query", methods=["GET"])
def live_query_spherex():
    """
    Live query to NASA/IPAC IRSA SIA for SPHEREx images around custom coordinates.
    Query parameters:
    - ra: Right Ascension in degrees (default: 304.693508808)
    - dec: Declination in degrees (default: 42.4436872991)
    - radius_arcsec: search radius in arcseconds (default: 1.0)
    """
    ra = request.args.get("ra", default=304.693508808, type=float)
    dec = request.args.get("dec", default=42.4436872991, type=float)
    radius_arcsec = request.args.get("radius_arcsec", default=1.0, type=float)

    try:
        from astropy.coordinates import SkyCoord
        from astropy import units as u
        from astroquery.ipac.irsa import Irsa

        coord = SkyCoord(ra, dec, unit="deg")
        search_radius = radius_arcsec * u.arcsec

        results = Irsa.query_sia(pos=(coord, search_radius), collection=["spherex_dr1", "spherex_qr3"])

        matches = []
        if results is not None and len(results) > 0:
            for row in results[:20]:
                matches.append({
                    "obs_id": str(row.get("obs_id", "")),
                    "access_url": str(row.get("access_url", "")),
                    "format": str(row.get("access_format", "")),
                    "bandpass": str(row.get("energy_bandpassname", "")),
                    "em_min_um": float(row.get("em_min", 0.0)) * 1e6 if row.get("em_min") else None,
                    "em_max_um": float(row.get("em_max", 0.0)) * 1e6 if row.get("em_max") else None,
                    "exptime_sec": float(row.get("t_exptime", 0.0)) if row.get("t_exptime") else None
                })

        return jsonify({
            "query": {
                "ra": ra,
                "dec": dec,
                "radius_arcsec": radius_arcsec
            },
            "total_results": len(results) if results is not None else 0,
            "preview_matches": matches
        })
    except Exception as e:
        logger.error("Error in live SPHEREx SIA query: %s", e)
        return jsonify({
            "error": "Failed to query IRSA SIA service",
            "details": str(e)
        }), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("DEBUG", "true").lower() in ("true", "1")
    logger.info("Starting SPHEREx Stellarium API on port %d...", port)
    app.run(host="0.0.0.0", port=port, debug=debug)
