"""
Favorita — LightGBM Model Training + Walk-Forward Validation
=============================================================
Trains LightGBM on engineered features with 16-fold walk-forward CV.
Exports forecast + P10/P50/P90 intervals as JSON for dashboard consumption.

Usage:
    python train_model.py --input ./processed/favorita_features.parquet \
                          --output ./forecasts/forecast_output.json
Prerequisites:
    pip install lightgbm pandas numpy scikit-learn
"""

import argparse
import json
import pandas as pd
import numpy as np
from pathlib import Path

try:
    import lightgbm as lgb
    HAS_LGB = True
except ImportError:
    HAS_LGB = False
    print("⚠ LightGBM not installed. Install with: pip install lightgbm")

from sklearn.metrics import mean_absolute_error, mean_squared_error


# ─── Feature Columns ────────────────────────────────────────────────
FEATURE_COLS = [
    # Lag features
    'lag_7', 'lag_14', 'lag_28', 'lag_365',
    # Rolling stats
    'rolling_mean_7', 'rolling_mean_14', 'rolling_mean_28',
    'rolling_std_7', 'rolling_std_14', 'rolling_std_28',
    # Expanding
    'expanding_mean',
    # Promotion
    'onpromotion', 'promo_duration', 'promo_freq_28',
    # Interactions
    'oil_x_promo', 'holiday_x_promo', 'weekend_x_promo', 'oil_pct_change',
    # Calendar
    'year', 'month', 'day_of_week', 'week_of_year', 'day_of_month',
    'is_weekend', 'is_month_start', 'is_month_end', 'is_holiday',
    # Hierarchy
    'store_nbr', 'item_nbr',
    'type_encoded', 'cluster', 'family_encoded', 'class_encoded',
    'store_avg_sales', 'store_std_sales',
    'item_avg_sales', 'item_std_sales',
    'family_avg_sales', 'family_std_sales',
    # External
    'dcoilwtico', 'transactions',
    # Store state
    'store_closed',
    # Holiday distance
    'days_to_next_holiday', 'days_since_last_holiday',
    # Promo lag
    'promo_lag_1',
    # Price elasticity proxy
    'oil_momentum_7', 'oil_volatility_7'
]

TARGET = 'log_sales'  # log1p(unit_sales)

LGB_PARAMS = {
    'objective': 'regression',
    'metric': 'rmse',
    'boosting_type': 'gbdt',
    'learning_rate': 0.05,
    'num_leaves': 127,
    'max_depth': 8,
    'min_child_samples': 20,
    'feature_fraction': 0.8,
    'bagging_fraction': 0.8,
    'bagging_freq': 5,
    'reg_alpha': 0.1,
    'reg_lambda': 0.1,
    'verbose': -1,
    'n_jobs': -1
}


def walk_forward_cv(df: pd.DataFrame, n_folds: int = 16) -> dict:
    """
    Walk-forward cross-validation.
    Each fold trains on all data before the validation window
    and validates on the next window.
    """
    print(f"\n🔄 Walk-forward CV ({n_folds} folds)...")

    dates = sorted(df['date'].unique())
    fold_size = len(dates) // (n_folds + 1)
    results = []

    for fold_idx in range(n_folds):
        train_end_idx = (fold_idx + 1) * fold_size
        val_start_idx = train_end_idx
        val_end_idx = min(val_start_idx + fold_size, len(dates))

        if val_end_idx <= val_start_idx:
            break

        train_dates = dates[:train_end_idx]
        val_dates = dates[val_start_idx:val_end_idx]

        train_mask = df['date'].isin(train_dates)
        val_mask = df['date'].isin(val_dates)

        # Filter to available features
        available_features = [c for c in FEATURE_COLS if c in df.columns]

        X_train = df.loc[train_mask, available_features]
        y_train = df.loc[train_mask, TARGET]
        X_val = df.loc[val_mask, available_features]
        y_val = df.loc[val_mask, TARGET]

        if len(X_train) == 0 or len(X_val) == 0:
            continue

        if HAS_LGB:
            train_data = lgb.Dataset(X_train, label=y_train)
            val_data = lgb.Dataset(X_val, label=y_val, reference=train_data)

            model = lgb.train(
                LGB_PARAMS,
                train_data,
                num_boost_round=500,
                valid_sets=[val_data],
                callbacks=[lgb.early_stopping(50), lgb.log_evaluation(0)]
            )

            y_pred = model.predict(X_val)
        else:
            # Fallback: simple mean prediction
            y_pred = np.full(len(X_val), y_train.mean())

        # Convert back from log space
        y_actual = np.expm1(y_val.values)
        y_forecast = np.expm1(y_pred)
        y_forecast = np.maximum(y_forecast, 0)

        mae = mean_absolute_error(y_actual, y_forecast)
        rmse = np.sqrt(mean_squared_error(y_actual, y_forecast))
        mape = np.mean(np.abs((y_actual - y_forecast) / (y_actual + 1))) * 100

        results.append({
            'fold': fold_idx + 1,
            'train_size': len(X_train),
            'val_size': len(X_val),
            'mae': round(mae, 2),
            'rmse': round(rmse, 2),
            'mape': round(mape, 2),
            'wrmsse': round(rmse / (np.std(y_actual) + 1e-8), 4)
        })

        print(f"  Fold {fold_idx + 1:2d}: MAE={mae:.2f}, RMSE={rmse:.2f}, MAPE={mape:.1f}%  "
              f"(train={len(X_train):,}, val={len(X_val):,})")

    avg_mae = np.mean([r['mae'] for r in results])
    avg_rmse = np.mean([r['rmse'] for r in results])
    avg_mape = np.mean([r['mape'] for r in results])
    avg_wrmsse = np.mean([r['wrmsse'] for r in results])

    print(f"\n  📊 Average: MAE={avg_mae:.2f}, RMSE={avg_rmse:.2f}, MAPE={avg_mape:.1f}%, WRMSSE={avg_wrmsse:.4f}")

    return {
        'folds': results,
        'avg_mae': round(avg_mae, 2),
        'avg_rmse': round(avg_rmse, 2),
        'avg_mape': round(avg_mape, 2),
        'avg_wrmsse': round(avg_wrmsse, 4)
    }


def train_final_model(df: pd.DataFrame) -> tuple:
    """Train final model on all data and generate forecasts with prediction intervals."""
    print("\n🏋️ Training final model on all data...")

    available_features = [c for c in FEATURE_COLS if c in df.columns]
    X = df[available_features]
    y = df[TARGET]

    if HAS_LGB:
        train_data = lgb.Dataset(X, label=y)
        model = lgb.train(LGB_PARAMS, train_data, num_boost_round=500)

        # Feature importance
        importance = dict(zip(available_features, model.feature_importance('gain')))
        total_imp = sum(importance.values())
        importance = {k: round(v / total_imp * 100, 2) for k, v in
                      sorted(importance.items(), key=lambda x: -x[1])[:20]}

        # Residuals for prediction intervals
        y_pred = model.predict(X)
        residuals = y.values - y_pred
        residual_std = float(np.std(residuals))

        print(f"  ✓ Model trained: {model.num_trees()} trees")
        print(f"  ✓ Residual σ: {residual_std:.4f} (log space)")
        print(f"  ✓ Top features: {list(importance.keys())[:5]}")

        return model, importance, residual_std
    else:
        print("  ⚠ LightGBM not available — returning placeholder model")
        return None, {}, 0.5


def generate_forecasts(model, df: pd.DataFrame, residual_std: float, n_weeks: int = 8) -> list:
    """
    Generate per-SKU weekly forecasts with P10/P50/P90 intervals.
    Groups by (store_nbr, item_nbr) and forecasts the next n_weeks.
    """
    print(f"\n📈 Generating {n_weeks}-week forecasts...")

    available_features = [c for c in FEATURE_COLS if c in df.columns]
    forecasts = []
    groups = df.groupby(['store_nbr', 'item_nbr'])

    for (store, item), group in list(groups)[:100]:  # Top 100 for demo
        last_row = group.iloc[-1]
        avg_sales = float(np.expm1(group[TARGET].mean()))

        weekly_forecasts = []
        for week in range(n_weeks):
            if model is not None:
                pred_log = float(model.predict(last_row[available_features].values.reshape(1, -1))[0])
            else:
                pred_log = float(last_row[TARGET]) if TARGET in last_row else 0

            p50 = float(np.expm1(pred_log))
            p10 = float(np.expm1(pred_log - 1.28 * residual_std))
            p90 = float(np.expm1(pred_log + 1.28 * residual_std))

            weekly_forecasts.append({
                'week': week + 1,
                'p10': round(max(0, p10), 1),
                'p50': round(max(0, p50), 1),
                'p90': round(max(0, p90), 1)
            })

        forecasts.append({
            'store_nbr': int(store),
            'item_nbr': int(item),
            'family': str(last_row.get('family', 'Unknown')),
            'avg_historical_sales': round(avg_sales, 1),
            'forecasts': weekly_forecasts
        })

    print(f"  ✓ Generated forecasts for {len(forecasts)} store-item pairs")
    return forecasts


def main():
    parser = argparse.ArgumentParser(description='Train LightGBM on Favorita features')
    parser.add_argument('--input', type=str,
                        default='./processed/favorita_features.parquet')
    parser.add_argument('--output', type=str,
                        default='./forecasts/forecast_output.json')
    parser.add_argument('--cv-folds', type=int, default=16)
    args = parser.parse_args()

    # Load data
    print(f"📂 Loading {args.input}...")
    df = pd.read_parquet(args.input)
    print(f"  ✓ {len(df):,} rows × {len(df.columns)} columns")

    # Walk-forward CV
    cv_results = walk_forward_cv(df, n_folds=args.cv_folds)

    # Train final model
    model, importance, residual_std = train_final_model(df)

    # Generate forecasts
    forecasts = generate_forecasts(model, df, residual_std)

    # Save output
    output_dir = Path(args.output).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    output = {
        'meta': {
            'model': 'LightGBM',
            'features_used': len(FEATURE_COLS),
            'training_rows': len(df),
            'generated_at': pd.Timestamp.now().isoformat()
        },
        'validation': cv_results,
        'feature_importance': importance,
        'forecasts': forecasts
    }

    with open(args.output, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n💾 Output saved to {args.output}")
    print("✅ Training complete!")


if __name__ == '__main__':
    main()
