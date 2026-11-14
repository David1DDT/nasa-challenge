"""
SPHEREx All-Sky Stellarium 3D Backend API
==========================================
Flask REST API delivering full-sky 3D star coordinates, photometry, constellations,
and NASA SPHEREx all-sky infrared spectral survey data for 3D Stellarium frontends.
"""

import os
import json
import logging
import math
from datetime import datetime
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("spherex_stellarium")

app = Flask(__name__)
# Enable CORS for all origins (frontend Next.js at localhost:3000, etc.)
CORS(app, resources={r"/*": {"origins": "*"}})

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
ALL_SKY_STARS_PATH = os.path.join(DATA_DIR, "all_sky_stars.json")
DEEP_STARS_PATH = os.path.join(DATA_DIR, "stars.json")
CONSTELLATIONS_PATH = os.path.join(DATA_DIR, "constellations_3d.json")

# In-memory caches
CACHED_ALL_SKY = None
CACHED_DEEP_STARS = None
CACHED_CONSTELLATIONS = None


def load_all_sky_stars():
    global CACHED_ALL_SKY
    if CACHED_ALL_SKY is not None:
        return CACHED_ALL_SKY
    if os.path.exists(ALL_SKY_STARS_PATH):
        try:
            with open(ALL_SKY_STARS_PATH, "r", encoding="utf-8") as f:
                CACHED_ALL_SKY = json.load(f)
            logger.info("Loaded %d all-sky stars from %s", len(CACHED_ALL_SKY.get("stars", [])), ALL_SKY_STARS_PATH)
        except Exception as e:
            logger.error("Error loading %s: %s", ALL_SKY_STARS_PATH, e)
            CACHED_ALL_SKY = {"stars": []}
    else:
        CACHED_ALL_SKY = {"stars": []}
    return CACHED_ALL_SKY


def load_deep_stars():
    global CACHED_DEEP_STARS
    if CACHED_DEEP_STARS is not None:
        return CACHED_DEEP_STARS
    if os.path.exists(DEEP_STARS_PATH):
        try:
            with open(DEEP_STARS_PATH, "r", encoding="utf-8") as f:
                CACHED_DEEP_STARS = json.load(f)
        except Exception as e:
            logger.error("Error loading %s: %s", DEEP_STARS_PATH, e)
            CACHED_DEEP_STARS = {"stars": []}
    else:
        CACHED_DEEP_STARS = {"stars": []}
    return CACHED_DEEP_STARS


def load_constellations():
    global CACHED_CONSTELLATIONS
    if CACHED_CONSTELLATIONS is not None:
        return CACHED_CONSTELLATIONS
    if os.path.exists(CONSTELLATIONS_PATH):
        try:
            with open(CONSTELLATIONS_PATH, "r", encoding="utf-8") as f:
                CACHED_CONSTELLATIONS = json.load(f)
        except Exception as e:
            logger.error("Error loading %s: %s", CONSTELLATIONS_PATH, e)
            CACHED_CONSTELLATIONS = {"constellations": [], "lines": []}
    else:
        CACHED_CONSTELLATIONS = {"constellations": [], "lines": []}
    return CACHED_CONSTELLATIONS


def ra_dec_to_cartesian(ra_deg, dec_deg, radius=1000.0, system="threejs"):
    """
    Converts celestial coordinates (RA, Dec in degrees) to 3D Cartesian coordinates.
    - system='threejs': Y is UP, X/Z in celestial equatorial plane.
    - system='astronomical': Z is North Celestial Pole.
    """
    ra_rad = math.radians(ra_deg)
    dec_rad = math.radians(dec_deg)

    if system == "threejs":
        x = float(radius * math.cos(dec_rad) * math.sin(ra_rad))
        y = float(radius * math.sin(dec_rad))
        z = float(radius * math.cos(dec_rad) * math.cos(ra_rad))
    else:
        x = float(radius * math.cos(dec_rad) * math.cos(ra_rad))
        y = float(radius * math.cos(dec_rad) * math.sin(ra_rad))
        z = float(radius * math.sin(dec_rad))

    return {"x": round(x, 3), "y": round(y, 3), "z": round(z, 3)}


def angular_distance_deg(ra1, dec1, ra2, dec2):
    """Computes angular separation between two points on the celestial sphere in degrees."""
    r1, d1 = math.radians(ra1), math.radians(dec1)
    r2, d2 = math.radians(ra2), math.radians(dec2)
    cos_sep = math.sin(d1) * math.sin(d2) + math.cos(d1) * math.cos(d2) * math.cos(r1 - r2)
    cos_sep = max(-1.0, min(1.0, cos_sep))
    return math.degrees(math.acos(cos_sep))


def generate_celestial_grid(radius=1000.0, step_deg=30):
    """Generates complete celestial grid lines: Celestial Equator, Parallels, Meridians, Ecliptic."""
    grid_lines = []

    # Parallels (Declination lines: -60, -30, 0, +30, +60)
    for dec in range(-60, 61, step_deg):
        points = []
        for ra in range(0, 361, 5):
            pos = ra_dec_to_cartesian(ra, dec, radius=radius, system="threejs")
            points.append([pos["x"], pos["y"], pos["z"]])
        grid_lines.append({
            "type": "equator" if dec == 0 else "parallel",
            "name": "Celestial Equator" if dec == 0 else f"Dec {dec}°",
            "declination": dec,
            "points": points,
            "color": "#3B82F6" if dec == 0 else "#1E293B"
        })

    # Meridians (Right Ascension circles: every 30° / 2h)
    for ra in range(0, 360, step_deg):
        points = []
        for dec in range(-85, 86, 5):
            pos = ra_dec_to_cartesian(ra, dec, radius=radius, system="threejs")
            points.append([pos["x"], pos["y"], pos["z"]])
        grid_lines.append({
            "type": "meridian",
            "name": f"RA {ra / 15.0:.0f}h",
            "ra": ra,
            "points": points,
            "color": "#1E293B"
        })

    # Ecliptic Plane (Earth's orbital plane inclined at 23.44°)
    ecliptic_points = []
    eps_rad = math.radians(23.439281)
    for l_deg in range(0, 361, 4):
        l_rad = math.radians(l_deg)
        # Convert ecliptic (lambda, beta=0) to equatorial (ra, dec)
        sin_dec = math.sin(eps_rad) * math.sin(l_rad)
        dec_rad = math.asin(sin_dec)
        cos_dec = math.cos(dec_rad)
        sin_ra = (math.cos(eps_rad) * math.sin(l_rad)) / (cos_dec if abs(cos_dec) > 1e-7 else 1.0)
        cos_ra = math.cos(l_rad) / (cos_dec if abs(cos_dec) > 1e-7 else 1.0)
        ra_rad = math.atan2(sin_ra, cos_ra)
        ra_deg = math.degrees(ra_rad) % 360.0
        dec_deg = math.degrees(dec_rad)
        pos = ra_dec_to_cartesian(ra_deg, dec_deg, radius=radius, system="threejs")
        ecliptic_points.append([pos["x"], pos["y"], pos["z"]])

    grid_lines.append({
        "type": "ecliptic",
        "name": "Ecliptic (Sun/Planets Path)",
        "points": ecliptic_points,
        "color": "#EAB308"
    })

    return grid_lines


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "name": "SPHEREx All-Sky Stellarium 3D Backend API",
        "version": "2.0.0",
        "description": "Full-sky 3D celestial star catalog, constellations, and NASA SPHEREx infrared survey",
        "coverage": "Entire Celestial Sphere: 360° RA x 180° Dec (All Northern and Southern Hemispheres)",
        "endpoints": {
            "GET /api/health": "Health and loaded dataset counts",
            "GET /api/defaults": "Default inputs, all-sky parameters, camera, and SPHEREx bands",
            "GET /api/stars": "All-sky stars with 3D positions, magnitudes, colors (filters: limit, max_mag, constellation, hemisphere, cone search)",
            "GET /api/stars/<id>": "Detailed metadata, spectral info, and neighboring stars",
            "GET /api/constellations": "All 88 constellations with names and 3D line segments",
            "GET /api/constellations/<id>": "Specific constellation line asterism and member stars",
            "GET /api/scene": "Full ready-to-render 3D Stellarium scene (all-sky stars + 88 constellations + celestial grid)",
            "GET /api/spherex/query": "Query live NASA/IPAC IRSA SIA service for any position in the sky",
            "POST /api/convert/coordinates": "Convert celestial RA/Dec to 3D Cartesian coordinates"
        }
    })


@app.route("/api/health", methods=["GET"])
def health():
    all_sky = load_all_sky_stars()
    const = load_constellations()
    deep = load_deep_stars()
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "mission": "NASA SPHEREx All-Sky Spectral Survey",
        "all_sky_stars_count": len(all_sky.get("stars", [])),
        "constellations_count": len(const.get("constellations", [])),
        "deep_field_stars_count": len(deep.get("stars", [])),
        "coverage": "Complete 360° x 180° Celestial Sphere"
    })


@app.route("/api/defaults", methods=["GET"])
@app.route("/api/config", methods=["GET"])
def get_defaults():
    all_sky = load_all_sky_stars()
    return jsonify({
        "mission": "NASA SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer)",
        "archive": "NASA/IPAC Infrared Science Archive (IRSA)",
        "survey_mode": "All-Sky Survey (Entire Celestial Sphere)",
        "coverage": {
            "ra_range_deg": [0.0, 360.0],
            "dec_range_deg": [-90.0, 90.0],
            "total_constellations": 88
        },
        "default_inputs": {
            "ra_deg": 304.693509,
            "dec_deg": 42.443687,
            "search_radius_deg": 0.5,
            "search_radius_arcsec": 1.0,
            "max_magnitude": 6.0,
            "default_limit": 1500,
            "celestial_sphere_radius": 1000.0,
            "catalogs": ["all_sky", "deep_spherex"]
        },
        "default_camera": {
            "position": [0, 0, 50],
            "target": [0, 0, 0],
            "fov": 60,
            "near": 0.1,
            "far": 10000
        },
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
    Returns stars covering all the sky.
    Query filters:
    - catalog: 'all_sky' (default, 5044 stars across entire sphere) or 'deep_spherex'
    - limit: maximum number of stars (default: 1500, max: 10000, 0 for all)
    - max_mag: maximum visual magnitude (e.g. 3.0 for prominent stars, 6.0 for full naked-eye sky)
    - constellation: filter by constellation code or name (e.g. 'Ori', 'Orion', 'UMa', 'Cyg')
    - hemisphere: 'north', 'south', or 'all'
    - ra, dec, radius: cone search around any celestial coordinate (in degrees)
    - sphere_radius: 3D radius scale (default: 1000.0)
    """
    catalog_type = request.args.get("catalog", "all_sky").lower()
    if catalog_type == "deep_spherex":
        data = load_deep_stars()
    else:
        data = load_all_sky_stars()

    all_stars = data.get("stars", [])

    # Filters
    try:
        limit = int(request.args.get("limit", 1500))
        if limit <= 0:
            limit = len(all_stars)
    except ValueError:
        limit = 1500

    max_mag = request.args.get("max_mag", type=float)
    min_flux = request.args.get("min_flux", type=float)
    constellation = request.args.get("constellation", "").strip().lower()
    hemisphere = request.args.get("hemisphere", "").strip().lower()

    # Cone search
    center_ra = request.args.get("ra", type=float)
    center_dec = request.args.get("dec", type=float)
    radius_deg = request.args.get("radius", type=float)

    # 3D sphere radius
    sphere_radius = request.args.get("sphere_radius", type=float, default=1000.0)
    rescale = (sphere_radius != 1000.0)

    filtered = []
    for star in all_stars:
        if max_mag is not None and star["magnitude"] > max_mag:
            continue
        if min_flux is not None and star.get("flux_mjy_sr", 0) < min_flux:
            continue

        if constellation:
            c_info = star.get("constellation", {})
            c_code = c_info.get("code", "").lower()
            c_name = c_info.get("name", "").lower()
            if constellation not in (c_code, c_name):
                continue

        if hemisphere == "north" and star["dec"] < 0:
            continue
        elif hemisphere == "south" and star["dec"] >= 0:
            continue

        if center_ra is not None and center_dec is not None and radius_deg is not None:
            sep = angular_distance_deg(center_ra, center_dec, star["ra"], star["dec"])
            if sep > radius_deg:
                continue

        if rescale:
            star_copy = dict(star)
            pos_3d = ra_dec_to_cartesian(star["ra"], star["dec"], radius=sphere_radius, system="threejs")
            star_copy["position"] = pos_3d
            filtered.append(star_copy)
        else:
            filtered.append(star)

        if len(filtered) >= limit:
            break

    return jsonify({
        "catalog": catalog_type,
        "coverage": "All Sky (360° x 180°)" if catalog_type == "all_sky" else "SPHEREx Deep Field",
        "count": len(filtered),
        "total_catalog_stars": len(all_stars),
        "sphere_radius": sphere_radius,
        "filters_applied": {
            "limit": limit,
            "max_magnitude": max_mag,
            "constellation": constellation or None,
            "hemisphere": hemisphere or None,
            "cone_search": {"ra": center_ra, "dec": center_dec, "radius_deg": radius_deg} if center_ra is not None else None
        },
        "stars": filtered
    })


@app.route("/api/stars/<star_id>", methods=["GET"])
def get_star_by_id(star_id):
    """Returns details for a star by Hipparcos ID, SPHEREx ID, common name, or HD number."""
    all_sky = load_all_sky_stars().get("stars", [])
    deep = load_deep_stars().get("stars", [])
    target = star_id.upper().strip().replace(" ", "")

    matched = None
    for star in all_sky:
        sid = star.get("id", "").upper().replace(" ", "")
        sname = star.get("name", "").upper().replace(" ", "")
        shd = star.get("hd", "").upper().replace(" ", "")
        if target in (sid, sname, shd, str(star.get("hip_id", ""))):
            matched = star
            break

    if not matched:
        for star in deep:
            sid = star.get("id", "").upper().replace(" ", "")
            sname = star.get("name", "").upper().replace(" ", "")
            if target in (sid, sname):
                matched = star
                break

    if not matched:
        return jsonify({"error": f"Star '{star_id}' not found"}), 404

    # Nearest neighbors across the sky
    ra0, dec0 = matched["ra"], matched["dec"]
    neighbors = []
    for other in all_sky:
        if other["id"] == matched["id"]:
            continue
        dist = angular_distance_deg(ra0, dec0, other["ra"], other["dec"])
        neighbors.append({
            "id": other["id"],
            "name": other["name"],
            "distance_deg": round(dist, 2),
            "magnitude": other["magnitude"],
            "constellation": other.get("constellation", {}).get("name")
        })

    neighbors.sort(key=lambda x: x["distance_deg"])
    top_neighbors = neighbors[:6]

    return jsonify({
        "star": matched,
        "nearest_neighbors": top_neighbors
    })


@app.route("/api/constellations", methods=["GET"])
def get_constellations():
    """Returns all 88 constellations with their names, centers, and 3D line segments."""
    const = load_constellations()
    return jsonify({
        "total_constellations": len(const.get("lines", [])),
        "constellations": const.get("constellations", []),
        "lines": const.get("lines", [])
    })


@app.route("/api/constellations/<cid>", methods=["GET"])
def get_constellation_by_id(cid):
    """Returns lines and member stars for a specific constellation (e.g. 'Ori', 'UMa', 'Cyg')."""
    const = load_constellations()
    all_sky = load_all_sky_stars().get("stars", [])
    target = cid.strip().lower()

    lines = [l for l in const.get("lines", []) if l["id"].lower() == target or l["name"].lower() == target]
    if not lines:
        return jsonify({"error": f"Constellation '{cid}' not found"}), 404

    member_stars = [s for s in all_sky if s.get("constellation", {}).get("code", "").lower() == target or s.get("constellation", {}).get("name", "").lower() == target]

    return jsonify({
        "constellation": lines[0],
        "member_stars_count": len(member_stars),
        "stars": member_stars
    })


@app.route("/api/scene", methods=["GET"])
def get_scene():
    """
    Returns the complete All-Sky Stellarium 3D scene payload:
    - all-sky stars across the entire 360° x 180° sphere
    - all 88 constellation 3D lines
    - complete celestial coordinate grid lines (equator, parallels, meridians, ecliptic)
    - camera configuration
    """
    stars_limit = int(request.args.get("limit", 2500))
    sphere_radius = float(request.args.get("sphere_radius", 1000.0))
    include_constellations = request.args.get("constellations", "true").lower() in ("true", "1")

    all_sky = load_all_sky_stars().get("stars", [])
    stars_subset = all_sky[:stars_limit] if stars_limit > 0 else all_sky

    grid = generate_celestial_grid(radius=sphere_radius)

    const_lines = []
    if include_constellations:
        const_data = load_constellations()
        const_lines = const_data.get("lines", [])

    return jsonify({
        "mission": "NASA SPHEREx All-Sky Stellarium",
        "coverage": "Entire Celestial Sphere (All Sky)",
        "celestial_sphere": {
            "radius": sphere_radius,
            "grid_lines": grid
        },
        "camera": {
            "position": [0, 0, 50],
            "target": [0, 0, 0],
            "fov": 65,
            "near": 0.1,
            "far": 10000
        },
        "constellations_count": len(const_lines),
        "constellation_lines": const_lines,
        "stars_count": len(stars_subset),
        "stars": stars_subset
    })


@app.route("/api/convert/coordinates", methods=["POST"])
def convert_coordinates():
    data = request.get_json(silent=True) or {}
    ra = data.get("ra")
    dec = data.get("dec")
    radius = float(data.get("radius", 1000.0))

    if ra is None or dec is None:
        return jsonify({"error": "Both 'ra' and 'dec' parameters are required"}), 400

    threejs_pos = ra_dec_to_cartesian(float(ra), float(dec), radius=radius, system="threejs")
    astro_pos = ra_dec_to_cartesian(float(ra), float(dec), radius=radius, system="astronomical")

    return jsonify({
        "input": {"ra": float(ra), "dec": float(dec), "radius": radius},
        "position_threejs": threejs_pos,
        "position_astronomical": astro_pos
    })


@app.route("/api/spherex/query", methods=["GET"])
def live_query_spherex():
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
            for row in results[:25]:
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
            "query": {"ra": ra, "dec": dec, "radius_arcsec": radius_arcsec},
            "total_results": len(results) if results is not None else 0,
            "preview_matches": matches
        })
    except Exception as e:
        logger.error("Error in live SPHEREx SIA query: %s", e)
        return jsonify({"error": "Failed to query IRSA SIA service", "details": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("DEBUG", "true").lower() in ("true", "1")
    logger.info("Starting SPHEREx All-Sky Stellarium API on port %d...", port)
    app.run(host="0.0.0.0", port=port, debug=debug)
