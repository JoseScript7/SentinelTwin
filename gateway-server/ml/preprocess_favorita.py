"""
Favorita Grocery Sales — Data Preprocessing Pipeline
=====================================================
Downloads, merges, and preprocesses the Kaggle Favorita dataset.

Usage:
    python preprocess_favorita.py --data-dir ./data --output-dir ./processed

Prerequisites:
    pip install pandas numpy pyarrow
    Download Favorita dataset CSVs into ./data/
"""

import os
import argparse
import pandas as pd
import numpy as np
from pathlib import Path


def load_and_merge(data_dir: str) -> pd.DataFrame:
    """
    Load and merge all Favorita CSV files into a single DataFrame.
    Expected files: train.csv, stores.csv, items.csv, transactions.csv,
                    holidays_events.csv, oil.csv
    """
    print("📂 Loading Favorita dataset...")

    # Core sales data
    train = pd.read_csv(os.path.join(data_dir, 'train.csv'),
                        parse_dates=['date'],
                        dtype={'store_nbr': 'int16', 'item_nbr': 'int32',
                               'unit_sales': 'float32', 'onpromotion': 'bool'})
    print(f"  ✓ train.csv: {len(train):,} rows")

    # Store metadata
    stores = pd.read_csv(os.path.join(data_dir, 'stores.csv'))
    print(f"  ✓ stores.csv: {len(stores)} stores")

    # Item metadata
    items = pd.read_csv(os.path.join(data_dir, 'items.csv'))
    print(f"  ✓ items.csv: {len(items)} items")

    # Transactions
    transactions = pd.read_csv(os.path.join(data_dir, 'transactions.csv'),
                                parse_dates=['date'])
    print(f"  ✓ transactions.csv: {len(transactions):,} rows")

    # Holidays
    holidays = pd.read_csv(os.path.join(data_dir, 'holidays_events.csv'),
                           parse_dates=['date'])
    print(f"  ✓ holidays_events.csv: {len(holidays)} events")

    # Oil prices
    oil = pd.read_csv(os.path.join(data_dir, 'oil.csv'), parse_dates=['date'])
    oil['dcoilwtico'] = oil['dcoilwtico'].ffill()  # Forward fill missing prices
    print(f"  ✓ oil.csv: {len(oil)} price records")

    # ─── Merge ──────────────────────────────────────────────────────
    print("\n🔗 Merging datasets...")
    df = train.merge(stores, on='store_nbr', how='left')
    df = df.merge(items, on='item_nbr', how='left')
    df = df.merge(transactions, on=['date', 'store_nbr'], how='left')
    df = df.merge(oil, on='date', how='left')

    # Holiday flag (national + regional)
    holiday_dates = set(holidays[holidays['transferred'] == False]['date'])
    df['is_holiday'] = df['date'].isin(holiday_dates).astype('int8')

    print(f"  ✓ Merged: {len(df):,} rows × {len(df.columns)} columns")
    return df


def preprocess(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean and preprocess the merged DataFrame.
    """
    print("\n🧹 Preprocessing...")

    # Handle negative unit_sales (returns) — set to 0 for demand modeling
    neg_count = (df['unit_sales'] < 0).sum()
    df['unit_sales'] = df['unit_sales'].clip(lower=0)
    print(f"  ✓ Clipped {neg_count:,} negative sales (returns) to 0")

    # Log-transform sales (log1p to handle zeros)
    df['log_sales'] = np.log1p(df['unit_sales'])

    # Forward-fill oil prices
    df['dcoilwtico'] = df['dcoilwtico'].ffill().bfill()

    # Flag stores that were closed (zero sales for all items on a date)
    store_date_sales = df.groupby(['store_nbr', 'date'])['unit_sales'].sum()
    closed = store_date_sales[store_date_sales == 0].index
    df['store_closed'] = df.set_index(['store_nbr', 'date']).index.isin(closed)
    df['store_closed'] = df['store_closed'].astype('int8')
    print(f"  ✓ Flagged {df['store_closed'].sum():,} closed-store records")

    # Encode categoricals
    for col in ['city', 'state', 'type', 'cluster', 'family', 'class']:
        if col in df.columns:
            df[col + '_encoded'] = df[col].astype('category').cat.codes

    # Date features
    df['year'] = df['date'].dt.year
    df['month'] = df['date'].dt.month
    df['day_of_week'] = df['date'].dt.dayofweek
    df['week_of_year'] = df['date'].dt.isocalendar().week.astype('int16')
    df['day_of_month'] = df['date'].dt.day
    df['is_weekend'] = (df['day_of_week'] >= 5).astype('int8')
    df['is_month_start'] = df['date'].dt.is_month_start.astype('int8')
    df['is_month_end'] = df['date'].dt.is_month_end.astype('int8')

    # Fill missing onpromotion
    df['onpromotion'] = df['onpromotion'].fillna(False).astype('int8')

    # Fill missing transactions
    df['transactions'] = df['transactions'].fillna(0)

    print(f"  ✓ Final: {len(df):,} rows × {len(df.columns)} columns")
    return df


def save(df: pd.DataFrame, output_dir: str):
    """Save preprocessed data as Parquet for fast loading."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    out_path = os.path.join(output_dir, 'favorita_preprocessed.parquet')
    df.to_parquet(out_path, engine='pyarrow', index=False)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"\n💾 Saved to {out_path} ({size_mb:.1f} MB)")


def main():
    parser = argparse.ArgumentParser(description='Preprocess Favorita Grocery Sales data')
    parser.add_argument('--data-dir', type=str, default='./data',
                        help='Directory containing raw Favorita CSV files')
    parser.add_argument('--output-dir', type=str, default='./processed',
                        help='Directory to save preprocessed Parquet file')
    args = parser.parse_args()

    df = load_and_merge(args.data_dir)
    df = preprocess(df)
    save(df, args.output_dir)
    print("\n✅ Preprocessing complete!")


if __name__ == '__main__':
    main()
