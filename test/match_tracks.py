#!/usr/bin/env python3
"""
腳本功能：
1. 解析 CSV 檔，提取 track_id (song_id)
2. 遞歸掃描目錄下所有 .mp3 檔
3. 匹配 track_id 和 mp3 檔名
4. 輸出結果為 JSON 並統計
"""

import csv
import json
import os
from pathlib import Path
from collections import defaultdict

def load_track_ids(csv_path):
    """從 CSV 檔讀取 track_id"""
    track_ids = []
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row and 'song_id' in row:
                    track_ids.append(row['song_id'])
        print(f"✓ 已讀取 CSV，取得 {len(track_ids)} 個 track_id")
        return track_ids
    except Exception as e:
        print(f"✗ 讀取 CSV 失敗: {e}")
        return []

def find_mp3_files(root_dir):
    """遞歸掃描目錄下所有 .mp3 檔"""
    mp3_files = {}  # {檔名不含副檔名: 完整路徑}
    try:
        for root, dirs, files in os.walk(root_dir):
            for file in files:
                if file.lower().endswith('.mp3'):
                    # 提取檔名（不含副檔名）
                    basename = os.path.splitext(file)[0]
                    full_path = os.path.join(root, file)
                    mp3_files[basename] = full_path
        print(f"✓ 已掃描目錄，找到 {len(mp3_files)} 個 .mp3 檔")
        return mp3_files
    except Exception as e:
        print(f"✗ 掃描目錄失敗: {e}")
        return {}

def match_tracks(track_ids, mp3_files):
    """匹配 track_id 和 mp3 檔"""
    matched = []
    for track_id in track_ids:
        if track_id in mp3_files:
            matched.append({
                'track_id': track_id,
                'file_path': mp3_files[track_id]
            })
    return matched

def main():
    # 設定路徑
    csv_path = '/home/me2hard/Code/CARCAEA/test/2. original_song_audio.csv'
    media_dir = '/media/me2hard/EnderChest1/mtg_jamendo/'
    output_json = '/home/me2hard/Code/CARCAEA/test/matched_tracks.json'
    
    print("=" * 60)
    print("Track 匹配工具")
    print("=" * 60)
    
    # 檢查路徑
    if not os.path.exists(csv_path):
        print(f"✗ CSV 檔不存在: {csv_path}")
        return
    
    if not os.path.exists(media_dir):
        print(f"✗ 媒體目錄不存在: {media_dir}")
        return
    
    # 讀取 track_id
    track_ids = load_track_ids(csv_path)
    if not track_ids:
        print("✗ 未能讀取任何 track_id")
        return
    
    # 掃描 mp3 檔
    mp3_files = find_mp3_files(media_dir)
    if not mp3_files:
        print("✗ 未找到任何 .mp3 檔")
        return
    
    # 匹配
    print("\n進行匹配中...")
    matched = match_tracks(track_ids, mp3_files)
    
    # 生成統計結果
    result = {
        'summary': {
            'total_track_ids': len(track_ids),
            'total_mp3_files': len(mp3_files),
            'matched_count': len(matched)
        },
        'matched_tracks': matched
    }
    
    # 輸出 JSON
    try:
        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\n✓ 結果已輸出到: {output_json}")
    except Exception as e:
        print(f"✗ 輸出 JSON 失敗: {e}")
        return
    
    # 統計
    print("\n" + "=" * 60)
    print("統計結果")
    print("=" * 60)
    print(f"Track ID 總數:     {result['summary']['total_track_ids']}")
    print(f"MP3 檔案總數:      {result['summary']['total_mp3_files']}")
    print(f"匹配成功數:        {result['summary']['matched_count']}")
    print(f"匹配率:            {result['summary']['matched_count']/result['summary']['total_track_ids']*100:.2f}%")
    print("=" * 60)

if __name__ == '__main__':
    main()
