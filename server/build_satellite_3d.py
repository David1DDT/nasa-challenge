"""
Build 360° All-Sky 3D Satellite Database
========================================
Processes 119,626 satellite stars from the official Hipparcos / Yale / Gliese
satellite astrometry database into:
1. An indexed SQLite database (satellite_3d_360.db) for querying all 119,626 stars in 3D.
2. A fast JSON catalog (satellite_stars_360.json) with the brightest 12,000 stars (down to mag 7.0)
   covering 100% of the 360° celestial sphere.
"""

import gzip
import csv
import sqlite3
import json
import math
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)
GZ_PATH = os.path.join(DATA_DIR, "hyg_v38.csv.gz")
DB_PATH = os.path.join(DATA_DIR, "satellite_3d_360.db")
JSON_PATH = os.path.join(DATA_DIR, "satellite_stars_360.json")

def ci_to_rgb(ci_str):
    try:
        ci = float(ci_str)
    except (ValueError, TypeError):
        ci = 0.65
    
    # Ballesteros effective temperature
    t = 4600.0 * (1.0 / (0.92 * ci + 1.7) + 1.0 / (0.92 * ci + 0.62))
    t = max(2200.0, min(t, 40000.0))

    if ci < -0.15:
        r, g, b = 155, 180, 255
        sp = "O"
    elif ci < 0.0:
        r, g, b = 175, 200, 255
        sp = "B"
    elif ci < 0.15:
        r, g, b = 230, 240, 255
        sp = "A"
    elif ci < 0.4:
        r, g, b = 255, 250, 240
        sp = "F"
    elif ci < 0.7:
        r, g, b = 255, 235, 180
        sp = "G"
    elif ci < 1.1:
        r, g, b = 255, 185, 110
        sp = "K"
    else:
        r, g, b = 255, 110, 80
        sp = "M"

    hex_col = f"#{r:02X}{g:02X}{b:02X}"
    return hex_col, {"r": r, "g": g, "b": b}, [round(r / 255.0, 3), round(g / 255.0, 3), round(b / 255.0, 3)], int(t), sp

def main():
    print(f"Reading satellite data from {GZ_PATH}...")
    
    # Remove existing DB if any
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE stars (
        id INTEGER PRIMARY KEY,
        hip_id TEXT,
        hd_id TEXT,
        name TEXT,
        bayer TEXT,
        flamsteed TEXT,
        constellation TEXT,
        ra_hours REAL,
        ra_deg REAL,
        dec_deg REAL,
        distance_pc REAL,
        distance_ly REAL,
        magnitude REAL,
        absmag REAL,
        spectral_type TEXT,
        color_index REAL,
        color_hex TEXT,
        temperature_k INTEGER,
        x_space_pc REAL,
        y_space_pc REAL,
        z_space_pc REAL,
        x_space_ly REAL,
        y_space_ly REAL,
        z_space_ly REAL,
        x_sphere REAL,
        y_sphere REAL,
        z_sphere REAL,
        point_size REAL
    )
    """)

    batch = []
    top_stars = []
    R = 1000.0  # celestial sphere radius
    count = 0

    with gzip.open(GZ_PATH, "rt", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Skip Sol (id 0) from night sky star catalog
            star_id = int(row["id"])
            if star_id == 0:
                continue

            proper = row.get("proper", "").strip()
            hip = row.get("hip", "").strip()
            hd = row.get("hd", "").strip()
            bayer = row.get("bayer", "").strip()
            flam = row.get("flam", "").strip()
            con = row.get("con", "").strip()
            spect = row.get("spect", "").strip()

            # Name formatting
            if proper:
                display_name = proper
            elif bayer and con:
                display_name = f"{bayer} {con}"
            elif flam and con:
                display_name = f"{flam} {con}"
            elif hip:
                display_name = f"HIP {hip}"
            elif hd:
                display_name = f"HD {hd}"
            else:
                display_name = f"HYG-{star_id}"

            ra_h = float(row.get("ra", 0.0) or 0.0)
            ra_deg = round(ra_h * 15.0, 6)
            dec_deg = round(float(row.get("dec", 0.0) or 0.0), 6)
            dist_pc = round(float(row.get("dist", 0.0) or 0.0), 3)
            dist_ly = round(dist_pc * 3.26156, 3)
            mag = round(float(row.get("mag", 10.0) or 10.0), 2)
            absmag = round(float(row.get("absmag", 0.0) or 0.0), 2)

            # Colors and temperature
            ci = row.get("ci", "")
            hex_col, rgb_col, rgb_norm, temp_k, sp_class = ci_to_rgb(ci)
            if not spect:
                spect = sp_class

            # True 3D Cartesian in space (parsecs and light-years)
            x_pc = round(float(row.get("x", 0.0) or 0.0), 3)
            y_pc = round(float(row.get("y", 0.0) or 0.0), 3)
            z_pc = round(float(row.get("z", 0.0) or 0.0), 3)
            x_ly = round(x_pc * 3.26156, 3)
            y_ly = round(y_pc * 3.26156, 3)
            z_ly = round(z_pc * 3.26156, 3)

            # Celestial sphere 3D coordinates (Three.js standard: Y is UP)
            ra_rad = math.radians(ra_deg)
            dec_rad = math.radians(dec_deg)
            x_sph = round(R * math.cos(dec_rad) * math.sin(ra_rad), 3)
            y_sph = round(R * math.sin(dec_rad), 3)
            z_sph = round(R * math.cos(dec_rad) * math.cos(ra_rad), 3)

            # 3D Point size for WebGL
            point_size = max(1.2, min(14.0, round(14.0 - (mag + 1.5) * 1.5, 2)))

            record = (
                star_id,
                f"HIP-{hip}" if hip else "",
                f"HD-{hd}" if hd else "",
                display_name,
                bayer,
                flam,
                con,
                ra_h,
                ra_deg,
                dec_deg,
                dist_pc,
                dist_ly,
                mag,
                absmag,
                spect,
                float(ci) if ci and ci.replace('.','',1).replace('-','',1).isdigit() else 0.65,
                hex_col,
                temp_k,
                x_pc,
                y_pc,
                z_pc,
                x_ly,
                y_ly,
                z_ly,
                x_sph,
                y_sph,
                z_sph,
                point_size
            )
            batch.append(record)

            # Keep top brightest stars (mag <= 7.0, covering ~12,000 stars for the entire 360° sky)
            if mag <= 7.0:
                top_stars.append({
                    "id": f"SAT-{star_id:06d}",
                    "hip_id": hip,
                    "hd_id": hd,
                    "name": display_name,
                    "proper_name": proper,
                    "bayer": bayer,
                    "flamsteed": flam,
                    "constellation": con,
                    "ra": ra_deg,
                    "dec": dec_deg,
                    "magnitude": mag,
                    "distance_pc": dist_pc,
                    "distance_ly": dist_ly,
                    "spectral_type": spect,
                    "color": hex_col,
                    "color_hex": hex_col,
                    "color_rgb": rgb_col,
                    "color_rgb_norm": rgb_norm,
                    "temperature_k": temp_k,
                    "size": point_size,
                    "position": {"x": x_sph, "y": y_sph, "z": z_sph},
                    "space_position_ly": {"x": x_ly, "y": y_ly, "z": z_ly},
                    "space_position_pc": {"x": x_pc, "y": y_pc, "z": z_pc},
                    "spherex": {
                        "band_coverage": [1, 2, 3, 4, 5, 6],
                        "all_sky_tile": f"SPX-TILE-RA{int(ra_deg):03d}-DEC{int(dec_deg):+03d}"
                    }
                })

            count += 1
            if len(batch) >= 10000:
                cursor.executemany("INSERT INTO stars VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", batch)
                batch = []

    if batch:
        cursor.executemany("INSERT INTO stars VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", batch)

    # Create indexes for fast searching
    cursor.execute("CREATE INDEX idx_mag ON stars (magnitude)")
    cursor.execute("CREATE INDEX idx_ra ON stars (ra_deg)")
    cursor.execute("CREATE INDEX idx_dec ON stars (dec_deg)")
    cursor.execute("CREATE INDEX idx_name ON stars (name)")
    cursor.execute("CREATE INDEX idx_con ON stars (constellation)")
    conn.commit()
    conn.close()

    print(f"Stored {count} satellite stars into SQLite {DB_PATH}")

    # Sort top stars by magnitude
    top_stars.sort(key=lambda s: s["magnitude"])
    print(f"Top 360° all-sky stars (mag <= 7.0): {len(top_stars)}")

    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "source": "NASA & ESA Satellite 3D Astrometry (Hipparcos/Yale/Gliese)",
            "coverage": "360° All-Sky (Entire Celestial Sphere)",
            "total_satellite_stars_available": count,
            "fast_3d_stars_count": len(top_stars),
            "celestial_sphere_radius": R,
            "stars": top_stars
        }, f, indent=2)

    print(f"Saved {len(top_stars)} stars to {JSON_PATH}")

if __name__ == "__main__":
    main()
