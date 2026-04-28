#!/usr/bin/env python3
"""
生成 HRV 預測數值的二維 heat map
- x 軸: HR (Heart Rate)
- y 軸: RMSSD
- 顏色: LFHF 
"""

import psycopg2
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from matplotlib.colors import Normalize
from matplotlib.cm import ScalarMappable
import warnings

warnings.filterwarnings('ignore')

# 數據庫連接配置
DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'user': 'admin',
    'password': '1234',
    'database': 'arcaea'
}

def fetch_hrv_data():
    """從數據庫抓取 HRV 預測數據"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        query = "SELECT hr, rmssd, lfhf FROM track_hrv_eff_predict;"
        cursor.execute(query)
        data = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        if not data:
            print("❌ 沒有找到數據")
            return None
        
        print(f"✅ 成功抓取 {len(data)} 筆數據")
        return data
    except Exception as e:
        print(f"❌ 數據庫連接失敗: {e}")
        return None

def create_heatmap(data):
    """創建二維 heat map"""
    # 解包數據
    hr_values = np.array([row[0] for row in data])
    rmssd_values = np.array([row[1] for row in data])
    lfhf_values = np.array([row[2] for row in data])
    
    print(f"\n📊 數據統計:")
    print(f"  HR - min: {hr_values.min():.2f}, max: {hr_values.max():.2f}, mean: {hr_values.mean():.2f}")
    print(f"  RMSSD - min: {rmssd_values.min():.2f}, max: {rmssd_values.max():.2f}, mean: {rmssd_values.mean():.2f}")
    print(f"  LFHF - min: {lfhf_values.min():.2f}, max: {lfhf_values.max():.2f}, mean: {lfhf_values.mean():.2f}")
    
    # 創建圖表
    fig, ax = plt.subplots(figsize=(12, 8), dpi=100)
    
    # 創建 scatter 圖，用顏色表示 LFHF
    scatter = ax.scatter(
        hr_values, 
        rmssd_values, 
        c=lfhf_values,
        cmap='coolwarm',
        s=10,
        alpha=0.6,
        edgecolors='none'
    )
    
    ax.set_xlabel('HR (Heart Rate)', fontsize=12, fontweight='bold')
    ax.set_ylabel('RMSSD', fontsize=12, fontweight='bold')
    ax.set_title('HRV Prediction Distribution\n(HR vs RMSSD, colored by LFHF)', 
                 fontsize=14, fontweight='bold', pad=20)
    
    # 添加 colorbar
    cbar = plt.colorbar(scatter, ax=ax, label='LFHF')
    cbar.set_label('LFHF', fontsize=11, fontweight='bold')
    
    # 網格
    ax.grid(True, alpha=0.3, linestyle='--')
    
    # 保存圖表
    output_file = 'hrv_heatmap.png'
    plt.tight_layout()
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"\n✅ 圖表已保存至: {output_file}")
    
    plt.show()

def create_histogram_heatmap(data):
    """創建直方圖熱圖版本（使用 2D 直方圖）"""
    hr_values = np.array([row[0] for row in data])
    rmssd_values = np.array([row[1] for row in data])
    lfhf_values = np.array([row[2] for row in data])
    
    fig, ax = plt.subplots(figsize=(12, 8), dpi=100)
    
    # 創建 2D 直方圖，顏色代表平均 LFHF
    h = ax.hist2d(hr_values, rmssd_values, bins=20, cmap='YlOrRd', weights=lfhf_values)
    
    ax.set_xlabel('HR (Heart Rate)', fontsize=12, fontweight='bold')
    ax.set_ylabel('RMSSD', fontsize=12, fontweight='bold')
    ax.set_title('HRV Prediction 2D Histogram\n(HR vs RMSSD, colored by LFHF density)',
                 fontsize=14, fontweight='bold', pad=20)
    
    # 添加 colorbar
    cbar = plt.colorbar(h[3], ax=ax, label='Average LFHF')
    cbar.set_label('Average LFHF', fontsize=11, fontweight='bold')
    
    # 保存圖表
    output_file = 'hrv_histogram_heatmap.png'
    plt.tight_layout()
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"✅ 直方圖熱圖已保存至: {output_file}")
    
    plt.show()

if __name__ == '__main__':
    print("🎵 開始生成 HRV 分佈熱圖...\n")
    
    # 抓取數據
    data = fetch_hrv_data()
    
    if data is None:
        exit(1)
    
    # 生成兩種版本的熱圖
    print("\n📈 生成 Scatter 熱圖...")
    create_heatmap(data)
    
    print("\n📈 生成 Histogram 熱圖...")
    create_histogram_heatmap(data)
    
    print("\n✅ 完成！")
