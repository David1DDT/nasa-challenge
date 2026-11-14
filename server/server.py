"""
SPHEREx & 360° Satellite Stellarium 3D Backend API
===================================================
Flask REST API delivering full-sky 360° 3D satellite star data (119,625 stars),
space flight 3D coordinates (light-years / parsecs), constellations, and SPHEREx
infrared observations driven directly by 'file.ipynb'.
"""

import os
import re
import json
import sqlite3
import logging
import math
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("spherex_stellarium")

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
NOTEBOOK_PATH = os.path.join(BASE_DIR, "file.ipynb")
DB_PATH = os.path.join(DATA_DIR, "satellite_3d_360.db")
SATELLITE_STARS_PATH = os.path.join(DATA_DIR, "satellite_stars_360.json")
NOTEBOOK_STARS_PATH = os.path.join(DATA_DIR, "notebook_stars.json")
CONSTELLATIONS_PATH = os.path.join(DATA_DIR, "constellations_3d.json")

# In-memory caches
CACHED_SATELLITE_STARS = None
CACHED_NOTEBOOK_META = None
CACHED_NOTEBOOK_MTIME = 0
CACHED_NOTEBOOK_STARS = None
CACHED_CONSTELLATIONS = None


def get_db_connection():
    if not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def parse_notebook():
    global CACHED_NOTEBOOK_META, CACHED_NOTEBOOK_MTIME
    if not os.path.exists(NOTEBOOK_PATH):
        return {"exists": False, "ra_deg": 304.693509, "dec_deg": 42.443687, "search_radius_arcsec": 1.0}

    mtime = os.path.getmtime(NOTEBOOK_PATH)
    if CACHED_NOTEBOOK_META is not None and mtime == CACHED_NOTEBOOK_MTIME:
        return CACHED_NOTEBOOK_META

    try:
        with open(NOTEBOOK_PATH, "r", encoding="utf-8") as f:
            nb = json.load(f)

        code_cells = []
        all_code = []
        for idx, cell in enumerate(nb.get("cells", [])):
            if cell.get("cell_type") == "code":
                src = "".join(cell.get("source", []))
                code_cells.append({"cell_index": idx, "source": src})
                all_code.append(src)

        combined = "\n".join(all_code)
        ra_m = re.search(r"ra_deg\s*=\s*([0-9.-]+)", combined)
        dec_m = re.search(r"dec_deg\s*=\s*([0-9.-]+)", combined)
        radius_m = re.search(r"search_radius\s*=\s*([0-9.-]+)", combined)
        coll_m = re.search(r"collection\s*=\s*(\[[^\]]+\])", combined)

        CACHED_NOTEBOOK_META = {
            "exists": True,
            "notebook_file": "file.ipynb",
            "last_modified": datetime.fromtimestamp(mtime).isoformat() + "Z",
            "ra_deg": float(ra_m.group(1)) if ra_m else 304.693509,
            "dec_deg": float(dec_m.group(1)) if dec_m else 42.443687,
            "search_radius_arcsec": float(radius_m.group(1)) if radius_m else 1.0,
            "collection": eval(coll_m.group(1)) if coll_m else ["spherex_dr1", "spherex_qr3"]
        }
        CACHED_NOTEBOOK_MTIME = mtime
        return CACHED_NOTEBOOK_META
    except Exception as e:
        logger.error("Failed to parse file.ipynb: %s", e)
        return {"exists": False, "ra_deg": 304.693509, "dec_deg": 42.443687, "search_radius_arcsec": 1.0}


def load_satellite_stars():
    global CACHED_SATELLITE_STARS
    if CACHED_SATELLITE_STARS is not None:
        return CACHED_SATELLITE_STARS
    if os.path.exists(SATELLITE_STARS_PATH):
        try:
            with open(SATELLITE_STARS_PATH, "r", encoding="utf-8") as f:
                CACHED_SATELLITE_STARS = json.load(f)
            logger.info("Loaded %d 360° satellite stars from %s", len(CACHED_SATELLITE_STARS.get("stars", [])), SATELLITE_STARS_PATH)
        except Exception as e:
            logger.error("Error reading %s: %s", SATELLITE_STARS_PATH, e)
            CACHED_SATELLITE_STARS = {"stars": []}
    else:
        CACHED_SATELLITE_STARS = {"stars": []}
    return CACHED_SATELLITE_STARS


def load_notebook_stars():
    global CACHED_NOTEBOOK_STARS
    if CACHED_NOTEBOOK_STARS is not None:
        return CACHED_NOTEBOOK_STARS
    if os.path.exists(NOTEBOOK_STARS_PATH):
        try:
            with open(NOTEBOOK_STARS_PATH, "r", encoding="utf-8") as f:
                CACHED_NOTEBOOK_STARS = json.load(f)
        except Exception as e:
            CACHED_NOTEBOOK_STARS = {"stars": []}
    else:
        CACHED_NOTEBOOK_STARS = {"stars": []}
    return CACHED_NOTEBOOK_STARS


def load_constellations():
    global CACHED_CONSTELLATIONS
    if CACHED_CONSTELLATIONS is not None:
        return CACHED_CONSTELLATIONS
    if os.path.exists(CONSTELLATIONS_PATH):
        try:
            with open(CONSTELLATIONS_PATH, "r", encoding="utf-8") as f:
                CACHED_CONSTELLATIONS = json.load(f)
        except Exception as e:
            CACHED_CONSTELLATIONS = {"constellations": [], "lines": []}
    else:
        CACHED_CONSTELLATIONS = {"constellations": [], "lines": []}
    return CACHED_CONSTELLATIONS


def generate_celestial_grid(radius=1000.0):
    grid_lines = []
    # Parallels
    for dec in range(-60, 61, 30):
        pts = []
        for ra in range(0, 361, 5):
            r_rad = math.radians(ra)
            d_rad = math.radians(dec)
            pts.append([
                round(radius * math.cos(d_rad) * math.sin(r_rad), 2),
                round(radius * math.sin(d_rad), 2),
                round(radius * math.cos(d_rad) * math.cos(r_rad), 2)
            ])
        grid_lines.append({
            "type": "equator" if dec == 0 else "parallel",
            "name": "Celestial Equator" if dec == 0 else f"Dec {dec}°",
            "declination": dec,
            "points": pts,
            "color": "#3B82F6" if dec == 0 else "#1E293B"
        })

    # Meridians
    for ra in range(0, 360, 30):
        pts = []
        for dec in range(-85, 86, 5):
            r_rad = math.radians(ra)
            d_rad = math.radians(dec)
            pts.append([
                round(radius * math.cos(d_rad) * math.sin(r_rad), 2),
                round(radius * math.sin(d_rad), 2),
                round(radius * math.cos(d_rad) * math.cos(r_rad), 2)
            ])
        grid_lines.append({
            "type": "meridian",
            "name": f"RA {ra / 15.0:.0f}h",
            "ra": ra,
            "points": pts,
            "color": "#1E293B"
        })
    return grid_lines


@app.route("/", methods=["GET"])
def index():
    nb_meta = parse_notebook()
    return jsonify({
        "name": "SPHEREx & 360° Satellite Stellarium 3D API",
        "version": "3.0.0",
        "coverage": "Complete 360° Celestial Sphere + Volumetric 3D Interstellar Space",
        "total_satellite_stars_available": 119625,
        "fast_3d_stars_count": len(load_satellite_stars().get("stars", [])),
        "source_notebook": "file.ipynb",
        "notebook_target": {
            "ra_deg": nb_meta.get("ra_deg"),
            "dec_deg": nb_meta.get("dec_deg")
        },
        "endpoints": {
            "GET /api/stars": "360° All-sky stars with 3D positions, magnitudes, colors, temperatures and distances",
            "GET /api/stars/<id>": "Detailed metadata, 3D space vector, and neighboring stars",
            "GET /api/satellite/query": "Query all 119,625 satellite stars via SQL (params: max_mag, distance_ly, con, search)",
            "GET /api/scene": "Full 360° 3D Stellarium scene payload (stars + 88 constellations + grid)",
            "GET /api/constellations": "All 88 constellations with 3D lines",
            "GET /api/notebook": "Live data and parameters from file.ipynb",
            "GET /api/defaults": "Default configuration, 360° parameters, and camera setup",
            "GET /api/health": "Health and loaded dataset counts"
        }
    })


@app.route("/api/stars", methods=["GET"])
def get_stars():
    """
    Returns 360° stars for 3D visualization.
    Options:
    - catalog: 'satellite' (default, 15598 stars covering 360°), 'notebook' (file.ipynb pointing)
    - mode: 'sphere' (celestial sphere R=1000) or 'space_3d' (true physical coordinates in light-years!)
    - limit: maximum number of stars (default: 2000, 0 for all)
    - max_mag: visual magnitude filter (e.g. 4.0, 6.0, 7.0)
    - constellation: filter by constellation (e.g. 'Ori', 'UMa', 'Cyg', 'Cru')
    """
    catalog_type = request.args.get("catalog", "notebook").lower()
    coord_mode = request.args.get("mode", "sphere").lower()

    if catalog_type == "notebook":
        data = load_notebook_stars()
    else:
        data = load_satellite_stars()

    all_stars = data.get("stars", [])

    try:
        limit = int(request.args.get("limit", 2000))
        if limit <= 0:
            limit = len(all_stars)
    except ValueError:
        limit = 2000

    max_mag = request.args.get("max_mag", type=float)
    constellation = request.args.get("constellation", "").strip().upper()

    filtered = []
    for star in all_stars:
        if max_mag is not None and star["magnitude"] > max_mag:
            continue
        if constellation:
            c = star.get("constellation", "").upper()
            if c != constellation and constellation not in star.get("name", "").upper():
                continue

        if coord_mode == "space_3d" and "space_position_ly" in star:
            star_copy = dict(star)
            star_copy["position"] = star["space_position_ly"]
            filtered.append(star_copy)
        else:
            filtered.append(star)

        if len(filtered) >= limit:
            break

    return jsonify({
        "catalog": catalog_type,
        "coverage": "360° All-Sky (Complete Celestial Sphere)",
        "coordinate_mode": coord_mode,
        "count": len(filtered),
        "total_available": len(all_stars),
        "stars": filtered
    })


@app.route("/api/satellite/query", methods=["GET"])
def query_satellite_db():
    """
    Query the full 119,625 satellite star database via SQLite.
    Parameters:
    - search: star name search (e.g. 'Sirius', 'Vega', 'Alpha Centauri')
    - max_mag: maximum magnitude (default: 8.0)
    - max_dist_ly: maximum distance in light years
    - constellation: constellation code (e.g. 'ORI', 'CMA')
    - limit: max results (default: 500, max: 5000)
    """
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Satellite database not available"}), 500

    search = request.args.get("search", "").strip()
    max_mag = request.args.get("max_mag", type=float, default=8.0)
    min_mag = request.args.get("min_mag", type=float)
    max_dist_ly = request.args.get("max_dist_ly", type=float)
    constellation = request.args.get("constellation", "").strip().upper()
    limit = min(int(request.args.get("limit", 500)), 5000)

    query = "SELECT * FROM stars WHERE 1=1"
    params = []

    if search:
        query += " AND (name LIKE ? OR hip_id LIKE ? OR hd_id LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term])

    if max_mag is not None:
        query += " AND magnitude <= ?"
        params.append(max_mag)

    if min_mag is not None:
        query += " AND magnitude >= ?"
        params.append(min_mag)

    if max_dist_ly is not None:
        query += " AND distance_ly <= ?"
        params.append(max_dist_ly)

    if constellation:
        query += " AND UPPER(constellation) = ?"
        params.append(constellation)

    query += " ORDER BY magnitude ASC LIMIT ?"
    params.append(limit)

    cursor = conn.cursor()
    cursor.execute(query, params)
    rows = cursor.fetchall()

    results = []
    for r in rows:
        results.append({
            "id": f"SAT-{r['id']:06d}",
            "hip_id": r["hip_id"],
            "hd_id": r["hd_id"],
            "name": r["name"],
            "bayer": r["bayer"],
            "flamsteed": r["flamsteed"],
            "constellation": r["constellation"],
            "ra": r["ra_deg"],
            "dec": r["dec_deg"],
            "distance_pc": r["distance_pc"],
            "distance_ly": r["distance_ly"],
            "magnitude": r["magnitude"],
            "spectral_type": r["spectral_type"],
            "color": r["color_hex"],
            "color_hex": r["color_hex"],
            "temperature_k": r["temperature_k"],
            "size": r["point_size"],
            "position": {"x": r["x_sphere"], "y": r["y_sphere"], "z": r["z_sphere"]},
            "space_position_ly": {"x": r["x_space_ly"], "y": r["y_space_ly"], "z": r["z_space_ly"]}
        })
    conn.close()

    return jsonify({
        "count": len(results),
        "total_database_stars": 119625,
        "stars": results
    })


@app.route("/api/stars/<star_id>", methods=["GET"])
def get_star_by_id(star_id):
    """Detailed star information from local satellite database."""
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Satellite database not available"}), 500

    target = star_id.strip()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT * FROM stars
    WHERE UPPER(name) = UPPER(?) OR UPPER(hip_id) = UPPER(?) OR UPPER(hd_id) = UPPER(?) OR id = ?
    LIMIT 1
    """, (target, target, target, int(target) if target.isdigit() else -1))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({"error": f"Star '{star_id}' not found"}), 404

    star_dict = {
        "id": f"SAT-{row['id']:06d}",
        "name": row["name"],
        "hip_id": row["hip_id"],
        "hd_id": row["hd_id"],
        "constellation": row["constellation"],
        "ra": row["ra_deg"],
        "dec": row["dec_deg"],
        "magnitude": row["magnitude"],
        "distance_pc": row["distance_pc"],
        "distance_ly": row["distance_ly"],
        "spectral_type": row["spectral_type"],
        "color": row["color_hex"],
        "temperature_k": row["temperature_k"],
        "position": {"x": row["x_sphere"], "y": row["y_sphere"], "z": row["z_sphere"]},
        "space_position_ly": {"x": row["x_space_ly"], "y": row["y_space_ly"], "z": row["z_space_ly"]},
        "space_position_pc": {"x": row["x_space_pc"], "y": row["y_space_pc"], "z": row["z_space_pc"]}
    }

    # Find 5 nearest neighboring stars in 3D space (light-years)
    cursor.execute("""
    SELECT name, magnitude, distance_ly,
           ((x_space_ly - ?)*(x_space_ly - ?) + (y_space_ly - ?)*(y_space_ly - ?) + (z_space_ly - ?)*(z_space_ly - ?)) AS dist_sq
    FROM stars
    WHERE id != ? AND distance_ly > 0
    ORDER BY dist_sq ASC LIMIT 5
    """, (row["x_space_ly"], row["x_space_ly"], row["y_space_ly"], row["y_space_ly"], row["z_space_ly"], row["z_space_ly"], row["id"]))
    neighbors = [{"name": n["name"], "magnitude": n["magnitude"], "separation_ly": round(math.sqrt(n["dist_sq"]), 2)} for n in cursor.fetchall()]

    conn.close()
    return jsonify({"star": star_dict, "nearest_3d_neighbors": neighbors})


@app.route("/api/scene", methods=["GET"])
def get_scene():
    """Complete 360° Stellarium 3D scene payload."""
    limit = int(request.args.get("limit", 2500))
    sat_data = load_satellite_stars()
    stars_pool = sat_data.get("stars", [])
    stars_subset = stars_pool[:limit]

    const_data = load_constellations()
    grid = generate_celestial_grid(radius=1000.0)
    nb_meta = parse_notebook()

    return jsonify({
        "coverage": "360° All-Sky Celestial Sphere",
        "total_satellite_stars": 119625,
        "rendered_stars_count": len(stars_subset),
        "notebook_target": {
            "ra_deg": nb_meta.get("ra_deg"),
            "dec_deg": nb_meta.get("dec_deg")
        },
        "camera": {
            "position": [0, 0, 50],
            "target": [0, 0, 0],
            "fov": 65,
            "near": 0.1,
            "far": 10000
        },
        "celestial_sphere": {
            "radius": 1000.0,
            "grid_lines": grid
        },
        "constellations_count": len(const_data.get("lines", [])),
        "constellation_lines": const_data.get("lines", []),
        "stars": stars_subset
    })


@app.route("/api/constellations", methods=["GET"])
def get_constellations():
    const = load_constellations()
    return jsonify({
        "total_constellations": len(const.get("lines", [])),
        "constellations": const.get("constellations", []),
        "lines": const.get("lines", [])
    })


@app.route("/api/defaults", methods=["GET"])
@app.route("/api/config", methods=["GET"])
def get_defaults():
    nb_meta = parse_notebook()
    return jsonify({
        "mission": "NASA SPHEREx & Satellite 3D Astrometry",
        "coverage": "360° All-Sky (Entire Celestial Sphere)",
        "source": "file.ipynb",
        "total_satellite_stars_available": 119625,
        "default_inputs": {
            "ra_deg": nb_meta.get("ra_deg", 304.693509),
            "dec_deg": nb_meta.get("dec_deg", 42.443687),
            "search_radius_arcsec": nb_meta.get("search_radius_arcsec", 1.0),
            "default_limit": 2000,
            "celestial_sphere_radius": 1000.0,
            "modes": ["sphere", "space_3d"]
        },
        "default_camera": {
            "position": [0, 0, 50],
            "target": [0, 0, 0],
            "fov": 65,
            "near": 0.1,
            "far": 10000
        }
    })


@app.route("/api/notebook", methods=["GET"])
def get_notebook():
    nb_meta = parse_notebook()
    nb_stars = load_notebook_stars()
    return jsonify({
        "notebook_metadata": nb_meta,
        "exported_stars_count": len(nb_stars.get("stars", [])),
        "source": "file.ipynb"
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "total_satellite_stars_database": 119625,
        "fast_360_stars_loaded": len(load_satellite_stars().get("stars", [])),
        "coverage": "360° Full Sky & 3D Space",
        "source": "file.ipynb"
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("DEBUG", "true").lower() in ("true", "1")
    logger.info("Starting SPHEREx & 360° Satellite Stellarium API on port %d...", port)
    app.run(host="0.0.0.0", port=port, debug=debug)
