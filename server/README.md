# SPHEREx All-Sky Stellarium 3D Backend API

Flask REST API delivering **complete all-sky** 3D star coordinates, photometry, constellations, and NASA SPHEREx infrared spectral survey data for 3D Stellarium / Three.js visualizers.

---

## 🌌 Complete Sky Coverage (360° x 180°)

The backend covers the **entire celestial sphere**:
- **5,044 All-Sky Stars**: Complete Hipparcos / Yale Bright Star catalog covering down to visual magnitude 6.0 across both Northern and Southern hemispheres ($\delta \in [-90^\circ, +90^\circ]$, $\alpha \in [0^\circ, 360^\circ]$).
- **All 88 Constellations**: 3D line segments for all 88 modern IAU constellations (Orion, Ursa Major, Cassiopeia, Crux, Scorpius, etc.).
- **Celestial Reference Sphere**: 3D grid lines for the Celestial Equator, Parallels, Meridians, and the Ecliptic plane.
- **Deep SPHEREx Field**: 3,500 high-resolution infrared sources from SPHEREx Level-2 images (`DR1`).
- **3D Coordinate Systems**: Both Three.js ($Y$-up) and Astronomical Cartesian coordinates.
- **True Physical Colors & Temperatures**: Derived from standard astronomical $B-V$ color indices and infrared wavelengths.

---

## 🚀 How to Run

### 1. Install dependencies
```bash
cd server
pip install -r requirements.txt
```

### 2. Start the server
```bash
python server.py
```
*(Runs on `http://localhost:5001` with CORS enabled).*

---

## 📡 API Endpoints

### 1. All-Sky Stars
- **`GET /api/stars`**
  - **Query Parameters**:
    - `limit`: Number of stars to return (e.g. `1500`, default: `1500`, `0` for all 5,044)
    - `max_mag`: Magnitude threshold (e.g. `max_mag=3.0` for bright stars, `max_mag=6.0` for full naked-eye sky)
    - `constellation`: Filter by constellation (e.g. `constellation=Ori`, `constellation=UMa`, `constellation=Cyg`)
    - `hemisphere`: `north` or `south`
    - `ra`, `dec`, `radius`: Cone search in degrees around any celestial point
    - `catalog`: `all_sky` (default) or `deep_spherex`
    - `sphere_radius`: Radius of the 3D celestial sphere (default: `1000.0`)

### 2. All 88 Constellations
- **`GET /api/constellations`**
  Returns 3D line segments (`segments_3d`) and center coordinates for all 88 constellations.
- **`GET /api/constellations/<id>`**
  Returns line geometry and member stars for a specific constellation (e.g. `/api/constellations/Ori`).

### 3. Complete 3D Stellarium Scene
- **`GET /api/scene?limit=2500`**
  Returns a ready-to-render 3D scene containing all-sky stars, 88 constellation lines, celestial equator/meridian grid, and camera configuration.

### 4. Specific Star Query
- **`GET /api/stars/<star_id>`**
  Search by common name (`Sirius`, `Vega`, `Betelgeuse`, `Polaris`), Hipparcos ID (`HIP-32349`), or SPHEREx ID (`SPX-00001`).

### 5. Default Inputs & System Configuration
- **`GET /api/defaults`** (or `/api/config`)
  Returns all-sky boundaries, default camera setup, and SPHEREx 6 infrared spectral bands.

### 6. Live NASA/IPAC IRSA SIA Query
- **`GET /api/spherex/query?ra=304.6935&dec=42.4436&radius_arcsec=1.0`**
  Live query to NASA/IPAC IRSA for SPHEREx images at any sky position.
