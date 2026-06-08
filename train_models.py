"""
train_models.py - Train models ONCE and save results to disk.

Run with: python train_models.py
This takes 20-40 minutes. 
Run it once when setting up the project for the first time 
or you want to retrain with different models or new features
"""
from scripts.accidents import load_accidents, compute_models, save_results

if __name__ == '__main__':
    print("=" * 60)
    print("Training all models")
    print("=" * 60)
    
    print("\n[1/3] Loading data...")
    df = load_accidents()
    print(f"  Loaded {len(df):,} rows")
    
    print("\n[2/3] Training models...")
    results = compute_models(df)
    
    print("\n[3/3] Saving results...")
    save_results(results)
    
    # Summary
    print("\n" + "=" * 60)
    print("DONE - Summary:")
    print("=" * 60)
    best = max(results['models'], key=lambda m: m['f1'])
    for m in results['models']:
        marker = " ★" if m['name'] == best['name'] else ""
        print(f"  {m['name']}: F1 = {m['f1']}{marker}")
    print("=" * 60)