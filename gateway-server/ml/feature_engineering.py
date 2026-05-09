"""
Favorita — Feature Engineering Pipeline
=========================================
Creates 12 feature categories from preprocessed Favorita data
for LightGBM training.

Usage:
    python feature_engineering.py --input ./processed/favorita_preprocessed.parquet \
                                  --output ./processed/favorita_features.parquet
"""

import argparse
import pandas as pd
import numpy as np
from pathlib import Path


def add_lag_features(df: pd.DataFrame, group_cols: list, target: str = 'unit_sales') -> pd.DataFrame:
    """Add lag features: 7, 14, 28, 365 day lags."""
    print("  → Lag features (7, 14, 28, 365 days)...")
    for lag in [7, 14, 28, 365]:
        col = f'lag_{lag}'
        df[col] = df.groupby(group_cols)[target].shift(lag)
    return df


def add_rolling_features(df: pd.DataFrame, group_cols: list, target: str = 'unit_sales') -> pd.DataFrame:
    """Add rolling statistics: mean and std over 7, 14, 28 day windows."""
    print("  → Rolling statistics (7, 14, 28 day windows)...")
    for window in [7, 14, 28]:
        roll = df.groupby(group_cols)[target].transform(
            lambda x: x.shift(1).rolling(window, min_periods=1)
        )
        # Rolling mean
        df[f'rolling_mean_{window}'] = df.groupby(group_cols)[target].transform(
            lambda x: x.shift(1).rolling(window, min_periods=1).mean()
        )
        # Rolling std
        df[f'rolling_std_{window}'] = df.groupby(group_cols)[target].transform(
            lambda x: x.shift(1).rolling(window, min_periods=1).std()
        )
    return df


def add_expanding_features(df: pd.DataFrame, group_cols: list, target: str = 'unit_sales') -> pd.DataFrame:
    """Add expanding mean (historical average up to current point)."""
    print("  → Expanding mean...")
    df['expanding_mean'] = df.groupby(group_cols)[target].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    return df


def add_promo_features(df: pd.DataFrame, group_cols: list) -> pd.DataFrame:
    """Add promotion-related features: promo duration, promo fatigue, days since promo."""
    print("  → Promotion features...")

    # Promo duration (consecutive promo days)
    df['promo_duration'] = df.groupby(group_cols)['onpromotion'].transform(
        lambda x: x.groupby((x != x.shift()).cumsum()).cumcount() + 1
    ) * df['onpromotion']

    # Rolling promo frequency (last 28 days)
    df['promo_freq_28'] = df.groupby(group_cols)['onpromotion'].transform(
        lambda x: x.shift(1).rolling(28, min_periods=1).mean()
    )

    return df


def add_interaction_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add interaction features: oil × promo, holiday × promo, etc."""
    print("  → Interaction features...")
    df['oil_x_promo'] = df['dcoilwtico'] * df['onpromotion']
    df['holiday_x_promo'] = df['is_holiday'] * df['onpromotion']
    df['weekend_x_promo'] = df['is_weekend'] * df['onpromotion']

    # Oil price change rate
    df['oil_pct_change'] = df['dcoilwtico'].pct_change().fillna(0)

    return df


def add_store_item_stats(df: pd.DataFrame) -> pd.DataFrame:
    """Add hierarchical statistics: per-store avg, per-item avg, per-family avg."""
    print("  → Store/item/family statistics...")

    for group_col, prefix in [('store_nbr', 'store'), ('item_nbr', 'item'), ('family', 'family')]:
        if group_col in df.columns:
            agg = df.groupby(group_col)['unit_sales'].agg(['mean', 'std']).reset_index()
            agg.columns = [group_col, f'{prefix}_avg_sales', f'{prefix}_std_sales']
            df = df.merge(agg, on=group_col, how='left')

    return df


def add_transaction_features(df: pd.DataFrame) -> pd.DataFrame:
    """Transaction volume features."""
    print("  → Transaction volume...")
    if 'transactions' in df.columns:
        df['txn_ratio'] = df['unit_sales'] / (df['transactions'] + 1)
    return df


def add_holiday_distance_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add days to next holiday and days since last holiday."""
    print("  → Holiday distance features...")
    if 'is_holiday' not in df.columns:
        return df

    holiday_dates = sorted(df[df['is_holiday'] == 1]['date'].unique())
    if len(holiday_dates) == 0:
        df['days_to_next_holiday'] = 999
        df['days_since_last_holiday'] = 999
        return df

    holiday_dates_arr = np.array(holiday_dates, dtype='datetime64[D]')
    all_dates = df['date'].values.astype('datetime64[D]')

    # Vectorized: find nearest future and past holiday for each date
    days_to = np.full(len(df), 999, dtype='int32')
    days_since = np.full(len(df), 999, dtype='int32')

    for hd in holiday_dates_arr:
        diff = (hd - all_dates).astype('int32')
        # days_to_next: positive diff, take minimum
        mask_future = (diff >= 0) & (diff < days_to)
        days_to[mask_future] = diff[mask_future]
        # days_since_last: negative diff (past), take minimum absolute
        past_diff = -diff
        mask_past = (past_diff >= 0) & (past_diff < days_since)
        days_since[mask_past] = past_diff[mask_past]

    df['days_to_next_holiday'] = days_to
    df['days_since_last_holiday'] = days_since
    return df


def add_promo_lag_feature(df: pd.DataFrame, group_cols: list) -> pd.DataFrame:
    """Add promo_lag_1: was this item on promotion yesterday?"""
    print("  → Promo lag feature...")
    if 'onpromotion' in df.columns:
        df['promo_lag_1'] = df.groupby(group_cols)['onpromotion'].shift(1).fillna(0).astype('int8')
    return df


def add_price_elasticity_proxy(df: pd.DataFrame) -> pd.DataFrame:
    """Add price elasticity proxy using oil price as external price signal."""
    print("  → Price elasticity proxy...")
    if 'dcoilwtico' in df.columns:
        # Oil price momentum (7-day rolling change)
        df['oil_momentum_7'] = df['dcoilwtico'].pct_change(7).fillna(0)
        # Oil price volatility (7-day rolling std)
        df['oil_volatility_7'] = df['dcoilwtico'].rolling(7, min_periods=1).std().fillna(0)
    return df


def engineer_features(input_path: str, output_path: str):
    """Main feature engineering pipeline."""
    print(f"📂 Loading {input_path}...")
    df = pd.read_parquet(input_path)
    print(f"  ✓ {len(df):,} rows × {len(df.columns)} columns")

    # Sort by store, item, date for correct lag/rolling calculations
    df = df.sort_values(['store_nbr', 'item_nbr', 'date']).reset_index(drop=True)
    group_cols = ['store_nbr', 'item_nbr']

    print("\n🔧 Engineering features (12 categories)...")

    # 1. Lag features
    df = add_lag_features(df, group_cols)

    # 2. Rolling statistics
    df = add_rolling_features(df, group_cols)

    # 3. Expanding features
    df = add_expanding_features(df, group_cols)

    # 4. Promotion features
    df = add_promo_features(df, group_cols)

    # 5. Interaction features
    df = add_interaction_features(df)

    # 6. Store/item hierarchy stats
    df = add_store_item_stats(df)

    # 7. Transaction volume
    df = add_transaction_features(df)

    # 8. Holiday distance features
    df = add_holiday_distance_features(df)

    # 9. Promo lag feature
    df = add_promo_lag_feature(df, group_cols)

    # 10. Price elasticity proxy
    df = add_price_elasticity_proxy(df)

    # 11-15: Calendar features already added in preprocessing
    # (year, month, day_of_week, week_of_year, is_weekend, is_holiday, etc.)

    # Drop rows where lag features are NaN (initial period)
    initial_rows = len(df)
    df = df.dropna(subset=['lag_7'])
    dropped = initial_rows - len(df)
    print(f"\n  ✓ Dropped {dropped:,} initial rows (lag warm-up)")
    print(f"  ✓ Final feature set: {len(df):,} rows × {len(df.columns)} columns")

    # Save
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, engine='pyarrow', index=False)
    size_mb = Path(output_path).stat().st_size / (1024 * 1024)
    print(f"\n💾 Saved to {output_path} ({size_mb:.1f} MB)")
    print("✅ Feature engineering complete!")


def main():
    parser = argparse.ArgumentParser(description='Feature engineering for Favorita data')
    parser.add_argument('--input', type=str,
                        default='./processed/favorita_preprocessed.parquet')
    parser.add_argument('--output', type=str,
                        default='./processed/favorita_features.parquet')
    args = parser.parse_args()

    engineer_features(args.input, args.output)


if __name__ == '__main__':
    main()
