"""
Build Complete All-Sky Star and Constellation Dataset
====================================================
Fetches the complete all-sky star catalog (Hipparcos/Yale Bright Star, 5,000+ stars),
constellation line asterisms, and star names, generating 3D Cartesian coordinates
for the entire 360° x 180° celestial sphere.
"""

import urllib.request
import json
import math
import os
import numpy as np

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)

BASE_URL = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/"

def fetch_json(filename):
    url = BASE_URL + filename
    print(f"Fetching {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

def bv_to_rgb(bv):
    """
    Converts B-V color index to RGB hex and normalized values.
    Uses standard astronomical blackbody / stellar color mapping.
    """
    try:
        bv = float(bv)
    except (ValueError, TypeError):
        bv = 0.6  # Default solar type

    # Calculate Ballesteros Effective Temperature (K)
    # T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
    t = 4600.0 * (1.0 / (0.92 * bv + 1.7) + 1.0 / (0.92 * bv + 0.62))
    t = max(2000.0, min(t, 40000.0))

    # Spectral class
    if bv < -0.3:
        sp_class = "O"
    elif bv < 0.0:
        sp_class = "B"
    elif bv < 0.3:
        sp_class = "A"
    elif bv < 0.6:
        sp_class = "F"
    elif bv < 0.8:
        sp_class = "G"
    elif bv < 1.4:
        sp_class = "K"
    else:
        sp_class = "M"

    # Accurate color based on B-V
    if bv < -0.15:
        # Deep blue-white (O/early B)
        r, g, b = 155, 180, 255
    elif bv < 0.0:
        # Blue-white (B)
        r, g, b = 175, 200, 255
    elif bv < 0.15:
        # Pure white (A, e.g. Vega)
        r, g, b = 230, 240, 255
    elif bv < 0.4:
        # Yellow-white (F, e.g. Procyon)
        r, g, b = 255, 250, 240
    elif bv < 0.7:
        # Yellow solar (G, e.g. Sun, Capella)
        r, g, b = 255, 235, 180
    elif bv < 1.1:
        # Orange (K, e.g. Arcturus, Aldebaran)
        r, g, b = 255, 185, 110
    else:
        # Red (M, e.g. Betelgeuse, Antares)
        r, g, b = 255, 110, 80

    hex_color = f"#{r:02X}{g:02X}{b:02X}"
    return hex_color, {"r": r, "g": g, "b": b}, [round(r / 255.0, 3), round(g / 255.0, 3), round(b / 255.0, 3)], int(t), sp_class

def ra_dec_to_3d(ra_deg, dec_deg, radius=1000.0):
    ra_rad = math.radians(ra_deg)
    dec_rad = math.radians(dec_deg)

    # Three.js (Y is UP)
    x_3d = radius * math.cos(dec_rad) * math.sin(ra_rad)
    y_3d = radius * math.sin(dec_rad)
    z_3d = radius * math.cos(dec_rad) * math.cos(ra_rad)

    # Astronomical Cartesian (Z is North Celestial Pole)
    x_astro = radius * math.cos(dec_rad) * math.cos(ra_rad)
    y_astro = radius * math.cos(dec_rad) * math.sin(ra_rad)
    z_astro = radius * math.sin(dec_rad)

    return {
        "threejs": {"x": round(x_3d, 3), "y": round(y_3d, 3), "z": round(z_3d, 3)},
        "astronomical": {"x": round(x_astro, 3), "y": round(y_astro, 3), "z": round(z_astro, 3)}
    }

def format_coordinates(ra_deg, dec_deg):
    ra_h = ra_deg / 15.0
    hh = int(ra_h)
    mm = int((ra_h - hh) * 60)
    ss = (ra_h - hh - mm / 60.0) * 3600

    dec_sign = "+" if dec_deg >= 0 else "-"
    dec_abs = abs(dec_deg)
    d_deg = int(dec_abs)
    d_min = int((dec_abs - d_deg) * 60)
    d_sec = (dec_abs - d_deg - d_min / 60.0) * 3600

    return f"{hh:02d}h {mm:02d}m {ss:04.1f}s", f"{dec_sign}{d_deg:02d}° {d_min:02d}' {int(d_sec):02d}\""

def main():
    stars_raw = fetch_json("stars.6.json")
    starnames = fetch_json("starnames.json")
    const_lines_raw = fetch_json("constellations.lines.json")
    const_raw = fetch_json("constellations.json")

    # Constellation map
    const_map = {}
    for f in const_raw.get("features", []):
        cid = f.get("id")
        props = f.get("properties", {})
        coords = f.get("geometry", {}).get("coordinates", [0, 0])
        const_map[cid] = {
            "id": cid,
            "name": props.get("name", cid),
            "english": props.get("en", props.get("name", cid)),
            "center_ra": coords[0],
            "center_dec": coords[1],
            "center_3d": ra_dec_to_3d(coords[0], coords[1], 1000.0)["threejs"]
        }

    # Process all-sky stars
    R = 1000.0
    processed_stars = []
    features = stars_raw.get("features", [])
    print(f"Processing {len(features)} all-sky stars...")

    for f in features:
        hip_id = str(f.get("id"))
        coords = f.get("geometry", {}).get("coordinates", [0.0, 0.0])
        ra = float(coords[0])
        dec = float(coords[1])
        props = f.get("properties", {})
        mag = float(props.get("mag", 6.0))
        bv = props.get("bv", 0.6)

        name_info = starnames.get(hip_id, {})
        common_name = name_info.get("name", "")
        bayer = name_info.get("bayer", "")
        flam = name_info.get("flam", "")
        c_code = name_info.get("c", "")
        hd_code = name_info.get("hd", "")

        const_info = const_map.get(c_code, {})
        const_name = const_info.get("name", c_code)

        # Build primary display name
        if common_name:
            display_name = common_name
        elif bayer and c_code:
            display_name = f"{bayer} {c_code}"
        elif flam and c_code:
            display_name = f"{flam} {c_code}"
        elif hd_code:
            display_name = hd_code
        else:
            display_name = f"HIP {hip_id}"

        # Colors and temperature
        hex_col, rgb_col, rgb_norm, temp_k, sp_class = bv_to_rgb(bv)

        # 3D coordinates
        pos_3d = ra_dec_to_3d(ra, dec, radius=R)

        # Formatted RA/Dec
        ra_hms, dec_dms = format_coordinates(ra, dec)

        # Size for 3D shaders (Sirius mag -1.46 gets ~14.0, mag 6 gets ~1.5)
        # linear/log stretch
        norm_size = max(1.2, min(14.0, round(14.0 - (mag + 1.5) * 1.6, 2)))

        star_obj = {
            "id": f"HIP-{hip_id}",
            "hip_id": int(hip_id) if hip_id.isdigit() else hip_id,
            "name": display_name,
            "common_name": common_name,
            "bayer": bayer,
            "flamsteed": flam,
            "hd": hd_code,
            "constellation": {
                "code": c_code,
                "name": const_name
            },
            "ra": round(ra, 6),
            "dec": round(dec, 6),
            "ra_hms": ra_hms,
            "dec_dms": dec_dms,
            "magnitude": mag,
            "bv_color_index": round(float(bv), 3) if isinstance(bv, (int, float, str)) and str(bv).replace('.','',1).replace('-','',1).isdigit() else 0.6,
            "color": hex_col,
            "color_hex": hex_col,
            "color_rgb": rgb_col,
            "color_rgb_norm": rgb_norm,
            "spectral_class": sp_class,
            "estimated_temp_k": temp_k,
            "size": norm_size,
            "position": pos_3d["threejs"],
            "position_astronomical": pos_3d["astronomical"],
            "spherex": {
                "all_sky_survey_covered": True,
                "observable_bands": [1, 2, 3, 4, 5, 6],
                "wavelength_range_um": [0.75, 5.00],
                "irsa_sia_query": f"https://irsa.ipac.caltech.edu/IBE?table=spherex_dr1&pos={ra},{dec}"
            }
        }
        processed_stars.append(star_obj)

    # Sort by brightness (brightest first)
    processed_stars.sort(key=lambda s: s["magnitude"])

    # Process Constellation Lines for 3D Stellarium rendering
    constellation_lines = []
    for f in const_lines_raw.get("features", []):
        cid = f.get("id")
        const_info = const_map.get(cid, {})
        geom = f.get("geometry", {})
        multiline = geom.get("coordinates", [])

        segments_3d = []
        for line in multiline:
            segment = []
            for pt in line:
                ra_pt, dec_pt = float(pt[0]), float(pt[1])
                pos = ra_dec_to_3d(ra_pt, dec_pt, radius=R)["threejs"]
                segment.append([pos["x"], pos["y"], pos["z"]])
            if len(segment) >= 2:
                segments_3d.append(segment)

        constellation_lines.append({
            "id": cid,
            "name": const_info.get("name", cid),
            "segments_3d": segments_3d,
            "color": "#3B82F6"
        })

    # Save to JSON files
    stars_output = os.path.join(DATA_DIR, "all_sky_stars.json")
    with open(stars_output, "w", encoding="utf-8") as f:
        json.dump({
            "mission": "NASA SPHEREx All-Sky Stellarium",
            "survey": "All-Sky Celestial Sphere (360° x 180°)",
            "coverage": "Entire Celestial Sphere (Dec -90° to +90°, RA 0° to 360°)",
            "total_stars": len(processed_stars),
            "celestial_sphere_radius": R,
            "stars": processed_stars
        }, f, indent=2)
    print(f"Saved {len(processed_stars)} all-sky stars to {stars_output}")

    const_output = os.path.join(DATA_DIR, "constellations_3d.json")
    with open(const_output, "w", encoding="utf-8") as f:
        json.dump({
            "total_constellations": len(constellation_lines),
            "constellations": list(const_map.values()),
            "lines": constellation_lines
        }, f, indent=2)
    print(f"Saved {len(constellation_lines)} constellation lines to {const_output}")

if __name__ == "__main__":
    main()
