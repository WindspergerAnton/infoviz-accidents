import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import f1_score, confusion_matrix, classification_report
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight

# ── Features ───────────────────────────────────────────────────────────────────
# Numerische Features direkt verwendbar
NUMERIC_FEATURES = ['speed_limit', 'hour', 'is_dark', 'is_bad_weather', 'number_of_vehicles']

# Kategorische Features werden per LabelEncoder in Zahlen umgewandelt
CATEGORICAL_FEATURES = ['road_type_simple', 'urban_or_rural_area', 'junction_detail']

ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

def load_accidents():
    df = pd.read_csv('static/data/accidents_clean.csv', low_memory=False)
    df['date'] = pd.to_datetime(df['date'], errors='coerce')
    return df

def prepare_features(df):
    """
    Bereitet X und y vor:
    - Kategorische Spalten werden mit LabelEncoder in Integers umgewandelt
    - Zeilen mit fehlenden Werten werden entfernt
    """
    target = 'collision_severity'
    model_df = df[ALL_FEATURES + [target, 'latitude', 'longitude']].dropna().copy()

    # Kategorische Features enkodieren
    for col in CATEGORICAL_FEATURES:
        le = LabelEncoder()
        model_df[col] = le.fit_transform(model_df[col].astype(str))

    X = model_df[ALL_FEATURES]
    y = model_df[target]
    return X, y, model_df

def compute_models(df):
    target = 'collision_severity'
    X, y, model_df = prepare_features(df)

    # 80/20 Split, reproduzierbar mit random_state=0
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=0)
    classes = sorted(y.unique())

    # sample_weight für balanced Training (funktioniert bei allen Modellen)
    # gleicht das Klassenungleichgewicht aus (Slight >> Serious >> Fatal)
    sample_weights = compute_sample_weight('balanced', y_train)

    # Modelle – höhere Komplexität als vorher für bessere Performance
    models = {
        'Random Forest': RandomForestClassifier(
            n_estimators=300, max_depth=15, random_state=0, n_jobs=-1
        ),
        'Logistic Regression': LogisticRegression(
            class_weight='balanced', max_iter=1000, random_state=0
        ),
        'Gradient Boosting': GradientBoostingClassifier(
            n_estimators=200, max_depth=5, learning_rate=0.05, random_state=0
        ),
        'Neural Network': MLPClassifier(
            hidden_layer_sizes=(128, 64, 32), max_iter=300, random_state=0
        ),
    }

    results = []
    best_f1 = -1
    best_error_map = []

    for name, clf in models.items():
        print(f"Training {name}...", flush=True)
        if name == 'Logistic Regression':
            clf.fit(X_train, y_train)
        else:
            clf.fit(X_train, y_train, sample_weight=sample_weights)
        print(f"  {name} done.", flush=True)

        y_pred = clf.predict(X_test)

        f1 = round(f1_score(y_test, y_pred, average='weighted'), 4)
        cm = confusion_matrix(y_test, y_pred, labels=classes).tolist()

        # Precision / Recall / F1 pro Klasse
        report = classification_report(y_test, y_pred, labels=classes, output_dict=True, zero_division=0)
        per_class = {c: {
            'precision': round(report[c]['precision'], 3),
            'recall':    round(report[c]['recall'],    3),
            'f1':        round(report[c]['f1-score'],  3),
        } for c in classes}

        # Error-Map nur vom besten Modell (spart Payload)
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