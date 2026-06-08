from flask import Flask, render_template
import json
import pandas as pd
from pathlib import Path
from scripts.accidents import load_accidents, compute_models, load_results

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['TEMPLATES_AUTO_RELOAD'] = True

DATA_DIR = Path("static/data")

@app.route('/accidents')
def accidents():
    # df = load_accidents()
    # return render_template('accidents.html', rf=json.dumps(compute_models(df)))
    rf = load_results()
    return render_template('accidents.html', rf=json.dumps(rf))


@app.route('/map')
def map_view():
    region_df = pd.read_csv(DATA_DIR / "severity_by_region.csv")
    region_data = region_df.to_dict(orient='records')
    
    monthly_df = pd.read_csv(DATA_DIR / "accidents_monthly.csv")
    monthly_data = monthly_df.to_dict(orient='records')

    region_monthly_df = pd.read_csv(DATA_DIR / "region_monthly.csv")
    region_monthly_data = region_monthly_df.to_dict(orient='records')
    
    return render_template(
        'map.html',
        region_data=json.dumps(region_data),
        monthly_data=json.dumps(monthly_data),
        region_monthly_data=json.dumps(region_monthly_data)
    )

if __name__ == '__main__':
    app.run(debug=True)