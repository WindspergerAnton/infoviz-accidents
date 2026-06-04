import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import f1_score, confusion_matrix, classification_report

FEATURES = ['speed_limit', 'hour', 'is_dark', 'is_bad_weather']

MODELS = {
    'Random Forest': RandomForestClassifier(
        n_estimators=200, max_depth=10, random_state=0, n_jobs=-1
    ),
    'Logistic Regression': LogisticRegression(
        class_weight='balanced', max_iter=1000, random_state=0
    ),
    'Gradient Boosting': GradientBoostingClassifier(
        n_estimators=200, max_depth=5, random_state=0
    ),
    'Neural Network': MLPClassifier(
        hidden_layer_sizes=(64, 32), max_iter=300, random_state=0
    ),
}

def load_accidents():
    df = pd.read_csv('static/data/accidents_clean.csv', low_memory=False)
    df['date'] = pd.to_datetime(df['date'], errors='coerce')
    return df

def compute_models(df):
    target = 'collision_severity'
    model_df = df[FEATURES + [target, 'latitude', 'longitude']].dropna()

    X = model_df[FEATURES]
    y = model_df[target]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=0)
    classes = sorted(y.unique())

    results = []
    best_f1 = -1
    best_error_map = []

    for name, clf in MODELS.items():
        clf.fit(X_train, y_train)
        y_pred = clf.predict(X_test)

        f1 = round(f1_score(y_test, y_pred, average='weighted'), 4)
        cm = confusion_matrix(y_test, y_pred, labels=classes).tolist()

        # per-class precision / recall / f1
        report = classification_report(y_test, y_pred, labels=classes, output_dict=True, zero_division=0)
        per_class = {c: {
            'precision': round(report[c]['precision'], 3),
            'recall':    round(report[c]['recall'],    3),
            'f1':        round(report[c]['f1-score'],  3),
        } for c in classes}

        if f1 > best_f1:
            best_f1 = f1
            locs = model_df.loc[X_test.index, ['latitude', 'longitude']].copy()
            locs['correct'] = (y_pred == y_test.values).astype(int)
            locs = locs.dropna(subset=['latitude', 'longitude'])
            best_error_map = locs[['latitude', 'longitude', 'correct']].to_dict(orient='records')

        results.append({
            'name': name,
            'f1': f1,
            'confusion_matrix': cm,
            'per_class': per_class,
        })

    return {
        'models': results,
        'classes': classes,
        'error_map': best_error_map,
    }