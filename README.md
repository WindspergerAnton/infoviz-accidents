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
This generates `static/data/accidents_clean.csv` and `static/data/severity_by_region.csv`.

### 4. Start the app
```bash
python app.py
```
Open `http://127.0.0.1:5000/accidents` in your browser.

---

## Project Structure
```
app.py                  – Flask routes
data_loading.py         – Preprocessing, run once
scripts/
  accidents.py          – Model training (RF, LR, GB, MLP)
static/data/            – CSV files (not tracked, see Setup)
templates/
  accidents.html        – Visualization page
```
