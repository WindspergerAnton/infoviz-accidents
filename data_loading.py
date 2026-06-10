"""
data_loading.py  –  Group 52, InfoViz SS 2026
Run once: python data_loading.py
Output:
  static/data/accidents_clean.csv       – alle Unfälle mit Features
  static/data/severity_by_region.csv    – Severity Index aggregiert pro Region (für Olenas Karte)
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

# Severity score: slight=1, serious=3, fatal=10 (für Aggregation und Modell)
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
print(f"Saved accidents_clean.csv → {len(df):,} rows")

collisions_only = df.drop_duplicates(subset=["collision_index"])

region_stats = collisions_only.groupby("police_force").agg(
    total_accidents  = ("collision_index", "count"),
    severity_index   = ("severity_score", "sum"),
    fatal_count      = ("collision_severity", lambda x: (x == "Fatal").sum()),
    serious_count    = ("collision_severity", lambda x: (x == "Serious").sum()),
    slight_count     = ("collision_severity", lambda x: (x == "Slight").sum()),
).reset_index()

region_stats["severity_index_per_1000"] = (
    region_stats["severity_index"] / region_stats["total_accidents"] * 1000
).round(2)

out_region = DATA_DIR / "severity_by_region.csv"
region_stats.to_csv(out_region, index=False)

# ── Monthly aggregation for time series ──────────────────────────────
print("Building monthly aggregation...")

df_collisions_only = df.drop_duplicates(subset=["collision_index"]).copy()
df_collisions_only["month"] = df_collisions_only["date"].dt.to_period("M").astype(str)

monthly_stats = df_collisions_only.groupby("month").agg(
    total_accidents = ("collision_index", "count"),
    fatal_count     = ("collision_severity", lambda x: (x == "Fatal").sum()),
    serious_count   = ("collision_severity", lambda x: (x == "Serious").sum()),
    slight_count    = ("collision_severity", lambda x: (x == "Slight").sum()),
    severity_index  = ("severity_score", "sum"),
).reset_index()

monthly_stats = monthly_stats.sort_values("month")
out_monthly = DATA_DIR / "accidents_monthly.csv"
monthly_stats.to_csv(out_monthly, index=False)
print(f"Saved accidents_monthly.csv → {len(monthly_stats)} months")

# ── Region × Month aggregation (for linked choropleth + time series) ─
print("Building region × month aggregation...")

region_monthly = df_collisions_only.groupby(["police_force", "month"]).agg(
    total_accidents = ("collision_index", "count"),
    severity_index  = ("severity_score", "sum"),
    fatal_count     = ("collision_severity", lambda x: (x == "Fatal").sum()),
    serious_count   = ("collision_severity", lambda x: (x == "Serious").sum()),
    slight_count    = ("collision_severity", lambda x: (x == "Slight").sum()),
).reset_index()

region_monthly["severity_index_per_1000"] = (
    region_monthly["severity_index"] / region_monthly["total_accidents"] * 1000
).round(2)

out_rm = DATA_DIR / "region_monthly.csv"
region_monthly.to_csv(out_rm, index=False)
print(f"Saved region_monthly.csv → {len(region_monthly)} rows")

# ── Accident points JSON (for zoomed-in map markers) ─────────────────
print("Building accident points JSON...")

fatal   = collisions_only[collisions_only["collision_severity"] == "Fatal"]
serious = collisions_only[collisions_only["collision_severity"] == "Serious"]
slight  = collisions_only[collisions_only["collision_severity"] == "Slight"].sample(n=5000, random_state=42)

pts = pd.concat([fatal, serious, slight])
pts = pts[["location_easting_osgr", "location_northing_osgr",
           "collision_severity", "date", "speed_limit",
           "weather_conditions", "light_conditions", "road_type",
           "police_force"]].dropna(subset=["location_easting_osgr", "location_northing_osgr"]).copy()

pts.columns = ["easting", "northing", "severity", "date", "speed_limit",
               "weather", "light", "road_type", "police_force"]
pts["date"] = pts["date"].dt.strftime("%Y-%m-%d")

out_pts = DATA_DIR / "accident_points.json"
pts.to_json(out_pts, orient="records")
print(f"Saved accident_points.json → {len(pts)} points ({out_pts.stat().st_size / 1024:.0f} KB)")

# ── Hour × Weekday Heatmap data ──────────────────────────────────────
print("Building hour × weekday heatmap data...")

df_collisions_only["weekday"] = df_collisions_only["date"].dt.day_name()
df_collisions_only["hour"] = df_collisions_only["time"].apply(
    lambda x: pd.to_datetime(x, format="%H:%M", errors="coerce").hour if pd.notna(x) else None
)

heatmap_data = df_collisions_only.dropna(subset=["hour"]).groupby(["hour", "weekday"]).agg(
    total_accidents = ("collision_index", "count"),
    severity_index  = ("severity_score", "sum"),
    fatal_count     = ("collision_severity", lambda x: (x == "Fatal").sum()),
    serious_count   = ("collision_severity", lambda x: (x == "Serious").sum()),
    slight_count    = ("collision_severity", lambda x: (x == "Slight").sum()),
).reset_index()

heatmap_data["severity_index_per_1000"] = (
    heatmap_data["severity_index"] / heatmap_data["total_accidents"] * 1000
).round(2)

weekday_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
heatmap_data["weekday_num"] = heatmap_data["weekday"].apply(lambda x: weekday_order.index(x) if x in weekday_order else -1)
heatmap_data = heatmap_data.sort_values(["hour", "weekday_num"]).drop("weekday_num", axis=1)

out_heatmap = DATA_DIR / "heatmap_hour_weekday.csv"
heatmap_data.to_csv(out_heatmap, index=False)
print(f"Saved heatmap_hour_weekday.csv → {len(heatmap_data)} cells")

# ── Parallel Coordinates data (sample for performance) ──────────────
print("Building parallel coordinates data...")

pc_sample = df_collisions_only.sample(n=min(5000, len(df_collisions_only)), random_state=42).copy()
pc_sample["weekday"] = pc_sample["date"].dt.day_name()
pc_sample["day_of_week_num"] = pc_sample["weekday"].apply(lambda x: weekday_order.index(x) if x in weekday_order else -1)

# Select key numeric and categorical features
pc_data = pc_sample[[
    "hour", "day_of_week_num", "severity_score", "speed_limit",
    "is_dark", "is_bad_weather", "collision_severity", 
    "road_type_simple", "police_force"
]].copy()

pc_data.columns = ["hour", "day_of_week", "severity_score", "speed_limit",
                   "is_dark", "is_bad_weather", "collision_severity",
                   "road_type", "police_force"]

# Fill missing values
pc_data["speed_limit"] = pc_data["speed_limit"].fillna(pc_data["speed_limit"].median())
pc_data["is_dark"] = pc_data["is_dark"].fillna(0)
pc_data["is_bad_weather"] = pc_data["is_bad_weather"].fillna(0)

out_pc = DATA_DIR / "parallel_coordinates.json"
pc_data.to_json(out_pc, orient="records")
print(f"Saved parallel_coordinates.json → {len(pc_data)} records")