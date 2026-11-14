# SPHEREx Stellarium 3D Backend API

Flask REST API providing 3D star data, coordinates, photometry, and infrared spectral information from NASA SPHEREx observations for 3D Stellarium / Three.js visualizers.

---

## 🚀 How to Run

### 1. Install dependencies
```bash
cd server
pip install -r requirements.txt
```
*(or using uv: `uv run python server.py`)*

### 2. Start the server
```bash
python server.py
```
By default, the server runs on **`http://localhost:5001`** (with CORS enabled for all origins, including `http://localhost:3000`).

---

## 📡 API Endpoints

### 1. Default Inputs & Config
- **`GET /api/defaults`** (or `/api/config`)
  Returns default inputs, canonical field coordinates ($\text{RA} = 304.693^\circ, \text{Dec} = 42.444^\circ$), 3D camera settings, and SPHEREx infrared spectral bands (Bands 1 to 6).

### 2. 3D Stars List
- **`GET /api/stars`**
  Returns stars formatted for 3D rendering.
  - **Query Parameters**:
    - `limit`: Number of stars to return (default: `1000`, max: `10000`)
    - `min_flux`: Minimum flux filter ($\text{MJy/sr}$)
    - `max_mag`: Maximum instrumental magnitude filter
    - `sphere_radius`: Radius of the 3D celestial sphere (default: `1000.0`)
    - `min_ra`, `max_ra`, `min_dec`, `max_dec`: Bounding box filters
  - **3D Star Object structure**:
    ```json
    {
      "id": "SPX-00001",
      "name": "SPHEREx Source 1",
      "ra": 305.548727,
      "dec": 40.248873,
      "position": {
        "x": -620.993,
        "y": 646.109,
        "z": 443.747
      },
      "position_astronomical": {
        "x": 443.747,
        "y": -620.993,
        "z": 646.109
      },
      "magnitude": 8.72,
      "flux_mjy_sr": 5146.148,
      "size": 12.0,
      "color": "#FFE6B0",
      "spectral": {
        "wavelength_um": 0.9882,
        "bandwidth_um": 0.026,
        "detector": 1,
        "obs_id": "2025W18_1B_0074_2"
      }
    }
    ```

### 3. Full 3D Stellarium Scene
- **`GET /api/scene?limit=1500&sphere_radius=1000`**
  Returns a ready-to-render 3D scene payload:
  - `camera`: Default camera position, target, and FOV
  - `celestial_sphere`: Coordinate grid lines (equator, parallels, meridians) with 3D points
  - `stars`: Array of 3D star objects

### 4. Single Star Details
- **`GET /api/stars/<star_id>`** (e.g. `/api/stars/SPX-00001`)
  Returns full metadata for the star and its 5 nearest neighboring stars.

### 5. Coordinate Converter
- **`POST /api/convert/coordinates`**
  Converts any $(\text{RA}, \text{Dec})$ in degrees to 3D Cartesian coordinates $(x, y, z)$.
  ```json
  { "ra": 304.6935, "dec": 42.4436, "radius": 1000 }
  ```

### 6. Live NASA/IPAC IRSA Query
- **`GET /api/spherex/query?ra=304.6935&dec=42.4436&radius_arcsec=1.0`**
  Performs a live SIA query to NASA/IPAC IRSA for matching SPHEREx observations.
