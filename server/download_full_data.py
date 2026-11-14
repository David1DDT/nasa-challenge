"""
SPHEREx Full Dataset Multi-Threaded Downloader (DR1 + QR3)
===========================================================
Downloads all 443 Level 2 FITS files (~25.2 GB) into 'full-data/'
with parallel threads, SSL certificate fix for macOS, resumable
downloads, and live progress reporting.
"""

import os
import sys
import time
import ssl
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.request
from astropy.coordinates import SkyCoord
from astropy import units as u
from astroquery.ipac.irsa import Irsa

# Fix macOS Python SSL certificate verification issue
SSL_CONTEXT = ssl._create_unverified_context()
ssl._create_default_https_context = ssl._create_unverified_context

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEST_DIR = os.path.join(BASE_DIR, "full-data")
MANIFEST_PATH = os.path.join(DEST_DIR, "manifest.json")

os.makedirs(DEST_DIR, exist_ok=True)

def fetch_file_list():
    print("Connecting to NASA/IPAC IRSA SIA for SPHEREx DR1 & QR3...")
    coord = SkyCoord(304.693508808, 42.4436872991, unit='deg')
    res = Irsa.query_sia(pos=(coord, 1 * u.arcsec), collection=['spherex_dr1', 'spherex_qr3'])
    print(f"Retrieved {len(res)} files in survey records.")
    
    file_items = []
    for idx, row in enumerate(res):
        url = row['access_url']
        filename = url.split('/')[-1]
        dest_path = os.path.join(DEST_DIR, filename)
        file_items.append({
            "index": idx + 1,
            "filename": filename,
            "dest_path": dest_path,
            "url": url,
            "band": row.get('energy_bandpassname', 'Unknown'),
            "obs_id": row.get('obs_id', 'Unknown'),
            "t_min": float(row.get('t_min', 0.0)),
            "est_size_kb": float(row.get('access_estsize', 58000)),
        })
    return file_items

def download_single_file(item, retries=3):
    dest_path = item["dest_path"]
    url = item["url"]
    expected_min_bytes = 20 * 1024 * 1024  # at least 20MB
    
    # Check if already downloaded
    if os.path.exists(dest_path) and os.path.getsize(dest_path) >= expected_min_bytes:
        return {"status": "SKIPPED", "item": item, "bytes": os.path.getsize(dest_path)}

    temp_path = dest_path + ".part"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 SPHEREx-Stellarium/1.0"})
            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=60) as resp, open(temp_path, "wb") as f:
                while True:
                    chunk = resp.read(1024 * 512)
                    if not chunk:
                        break
                    f.write(chunk)
            
            # Rename upon successful completion
            os.replace(temp_path, dest_path)
            size = os.path.getsize(dest_path)
            return {"status": "DOWNLOADED", "item": item, "bytes": size}
        except Exception as e:
            if os.path.exists(temp_path):
                try: os.remove(temp_path)
                except: pass
            if attempt < retries - 1:
                time.sleep(2)
            else:
                return {"status": "FAILED", "item": item, "error": str(e), "bytes": 0}

def main():
    items = fetch_file_list()
    total_files = len(items)
    
    # Save manifest
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump({"total_files": total_files, "files": items}, f, indent=2)
    print(f"Saved manifest to {MANIFEST_PATH}")
    
    # Check existing files
    already_done = sum(1 for it in items if os.path.exists(it["dest_path"]) and os.path.getsize(it["dest_path"]) > 20*1024*1024)
    print(f"\nTarget folder: {DEST_DIR}")
    print(f"Total files: {total_files} (~25.2 GB)")
    print(f"Already downloaded: {already_done}/{total_files}\n")

    start_time = time.time()
    downloaded_count = already_done
    bytes_downloaded_session = 0
    
    # 4 parallel download workers for optimal throughput without overwhelming the server
    max_workers = 4
    print(f"Starting parallel download with {max_workers} worker threads...")
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(download_single_file, it): it for it in items}
        
        for future in as_completed(futures):
            res = future.result()
            item = res["item"]
            status = res["status"]
            b = res.get("bytes", 0)
            
            if status == "DOWNLOADED":
                downloaded_count += 1
                bytes_downloaded_session += b
            elif status == "SKIPPED":
                pass
            elif status == "FAILED":
                print(f"\n[FAILED] {item['filename']}: {res.get('error')}")

            elapsed = max(1.0, time.time() - start_time)
            speed_mb = (bytes_downloaded_session / (1024 * 1024)) / elapsed
            percent = (downloaded_count / total_files) * 100
            
            remaining_files = total_files - downloaded_count
            eta_sec = (remaining_files * 58.0) / max(0.5, speed_mb) if speed_mb > 0.1 else 0
            eta_min = eta_sec / 60.0

            sys.stdout.write(
                f"\r[{downloaded_count}/{total_files}] ({percent:5.1f}%) | "
                f"Speed: {speed_mb:4.1f} MB/s | ETA: {eta_min:4.1f} min | "
                f"File: {item['filename'][:35]}..."
            )
            sys.stdout.flush()

    total_time = time.time() - start_time
    print(f"\n\nDownload completed in {total_time/60.0:.2f} minutes!")
    print(f"All files saved in {DEST_DIR}")

if __name__ == "__main__":
    main()
