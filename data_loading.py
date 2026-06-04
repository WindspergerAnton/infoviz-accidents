"""
data_loading.py  –  Group 52, InfoViz SS 2026
Run once: python data_loading.py
Output:   static/data/accidents_clean.csv
"""

import pandas as pd
from pathlib import Path

DATA_DIR = Path("static/data")

collisions = pd.read_csv(DATA_DIR / "dft-road-casualty-statistics-collision-2023.csv", low_memory=False)
vehicles   = pd.read_csv(DATA_DIR / "dft-road-casualty-statistics-vehicle-2023.csv",   low_memory=False)
casualties = pd.read_csv(DATA_DIR / "dft-road-casualty-statistics-casualty-2023.csv",  low_memory=False)

df = (
    collisions
    .merge(vehicles,   on=["collision_index", "collision_year", "collision_ref_no"], how="left")
    .merge(casualties, on=["collision_index", "collision_year", "collision_ref_no", "vehicle_reference"], how="left")
)

guide = pd.read_excel(
    DATA_DIR / "dft-road-casualty-statistics-road-safety-open-dataset-data-guide-2024.xlsx",
    sheet_name="2024_code_list"
)[["field name", "code/format", "label"]].dropna(subset=["label"])

for field, group in guide.groupby("field name"):
    if field not in df.columns:
        continue
    
    if not pd.api.types.is_numeric_dtype(df[field]):
        continue
    mapping = {int(r["code/format"]): r["label"] for _, r in group.iterrows()
               if str(r["code/format"]).lstrip("-").isdigit()}
    df[field] = df[field].map(lambda x, m=mapping: m.get(int(x), x) if pd.notna(x) else x)

df["date"] = pd.to_datetime(df["date"], dayfirst=True, errors="coerce")
df["hour"] = pd.to_datetime(df["time"], format="%H:%M", errors="coerce").dt.hour

df = df.dropna(subset=["latitude", "longitude"])

severity_map = {"Slight": 1, "Serious": 3, "Fatal": 10}
df["severity_score"] = df["collision_severity"].map(severity_map).fillna(1)

df["is_dark"] = df["light_conditions"].str.lower().str.contains("dark", na=False).astype(int)

good_weather = ["fine no high winds", "fine + high winds"]
df["is_bad_weather"] = (~df["weather_conditions"].str.lower().isin(good_weather)).astype(int)

def simplify_road(val):
    if pd.isna(val): return "Other"
    v = str(val).lower()
    if "motorway" in v: return "Motorway"
    if "a" in v: return "A-Road"
    if "b" in v: return "B-Road"
    return "Minor"

df["road_type_simple"] = df["first_road_class"].apply(simplify_road)

out = DATA_DIR / "accidents_clean.csv"
df.to_csv(out, index=False)
print(f"Saved {len(df):,} rows → {out}")