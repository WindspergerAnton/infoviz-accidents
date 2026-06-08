# InfoVis VU 2026 – Exercise 2
**Group 52** – Olena Karaim, Anton Windsperger, Müller Julian

Road accident severity prediction and visualization based on the UK STATS19 dataset.

---

## Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
pip install openpyxl
```

### 2. Download the data
Download the following files from the [DfT Road Safety Open Data portal](https://www.gov.uk/government/statistical-data-sets/road-safety-open-data) and place them in `static/data/`:

| File | Description |
|------|-------------|
| `dft-road-casualty-statistics-collision-2023.csv` | Collision records |
| `dft-road-casualty-statistics-vehicle-2023.csv` | Vehicle records |
| `dft-road-casualty-statistics-casualty-2023.csv` | Casualty records |
| `dft-road-casualty-statistics-road-safety-open-dataset-data-guide-2024.xlsx` | Code mappings |

### 3. Run data preprocessing (once)
```bash
python data_loading.py
```
This generates:
- `static/data/accidents_clean.csv` – all collisions with decoded labels and features
- `static/data/severity_by_region.csv` – severity index per police force region (overall)
- `static/data/accidents_monthly.csv` – national monthly accident totals
- `static/data/region_monthly.csv` – per-region per-month breakdown (used for linked views)
- `static/data/accident_points.json` – individual accident markers (all fatal + serious, 5k sampled slight)

### 4. Start the app
```bash
python app.py
```
- **Model Comparison:** `http://127.0.0.1:5000/accidents`
- **Interactive Map:** `http://127.0.0.1:5000/map`

---

## Pages

### `/accidents` – Model Comparison
Compares severity prediction models (Random Forest, Logistic Regression, Gradient Boosting, MLP). Shows per-class metrics, F1 scores, and a prediction error map for the best model.

### `/map` – Interactive Choropleth Map with Linked Time Series
An interactive D3.js visualization with two coordinated views:

- **Choropleth map**: shows severity index per 1,000 accidents for each UK police force region, colored on a yellow-to-red scale. Hover for per-region statistics. The GeoJSON (`uk-police.json`) uses EPSG:27700 (British National Grid) coordinates, rendered with `d3.geoIdentity().reflectY(true).fitSize(...)`.
- **Zoom & individual markers**: scroll wheel to zoom, drag to pan, or click a region to auto-zoom. At zoom level ≥ 2.5×, individual accident dots appear (red = fatal, orange = serious, green = slight) with tooltips showing date, severity, speed limit, weather, lighting, and road type. A "Back to overview" button or double-click resets the view.
- **Time series chart**: monthly total and fatal accident counts with a **brush selector** — drag horizontally to select a time range.
- **Linked views**: brushing the time series filters the `region_monthly.csv` data by selected months, re-aggregates per region using `d3.rollup()`, recolors all map paths with a 300ms transition, and updates both hover tooltips and the stats panel. Clearing the brush resets to overall totals.

#### Map interactions
| Action | Effect |
|---|---|
| Scroll wheel on map | Zoom in/out (1×–12×) |
| Drag on map | Pan |
| Click a region | Auto-zoom to fit that region |
| "← Back to overview" button | Reset to full UK view |
| Double-click | Reset to full UK view |
| Hover region (overview) | Tooltip with accident counts and severity index |
| Hover dot (zoomed) | Tooltip with date, severity, speed, weather, light, road type |
| Brush on time series | Recolors map + updates tooltips for selected months |

#### Data flow
1. Flask loads 3 CSVs and passes them as JSON to the Jinja template
2. `choropleth.js` draws the map and exposes `updateChoroplethByMonths(selectedMonths)`
3. `timeseries.js` draws the chart; the brush callback converts pixel range → date range → month strings, then calls `updateChoroplethByMonths()`
4. The shared `currentDataMap` variable ensures hover tooltips always reflect the active time selection
5. `accident_points.json` (30k points: all fatal + serious, sampled slight) is lazy-loaded on first zoom-in

---

## Project Structure
```
app.py                  – Flask routes (/accidents, /map)
data_loading.py         – Preprocessing, run once
scripts/
  accidents.py          – Model training (RF, LR, GB, MLP)
static/
  data/                 – CSV files and GeoJSON (not tracked, see Setup)
  js/
    choropleth.js       – Choropleth map (D3 + GeoJSON)
    timeseries.js       – Time series chart with brush selector
  styles/
    style.css           – Shared styles
templates/
  accidents.html        – Model comparison page
  map.html              – Interactive map page
```
