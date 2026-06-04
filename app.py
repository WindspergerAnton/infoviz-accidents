from flask import Flask, render_template
import json
from scripts.accidents import load_accidents, compute_models

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['TEMPLATES_AUTO_RELOAD'] = True

@app.route('/accidents')
def accidents():
    df = load_accidents()
    return render_template('accidents.html', rf=json.dumps(compute_models(df)))

if __name__ == '__main__':
    app.run(debug=True)