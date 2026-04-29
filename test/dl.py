import requests
import csv
import os
import json
from tqdm import tqdm
import time

# ================== 請修改這裡 ==================
CLIENT_ID = "b7731e42"   # ←←← 一定要改
CSV_FILE = "song_list.csv"              # 你的 song_id,link CSV 檔名
SAVE_DIR = "hku956_audio"               # 下載後存放的資料夾
FORCE_REDOWNLOAD = False                # 是否強制重新下載（True = 即使檔案存在也重新下載；False = 跳過已存在的檔案）
# ================================================

os.makedirs(SAVE_DIR, exist_ok=True)

def download_track(song_id):
    url = f"https://api.jamendo.com/v3.0/tracks/?client_id={CLIENT_ID}&id={song_id}&format=json"
    filename = f"{song_id}.mp3"
    save_path = os.path.join(SAVE_DIR, filename)
    
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        if not data.get("results"):
            print(f"[{song_id}] No results")
            return False
            
        track = data["results"][0]
        audiodownload = track.get("audiodownload")
        allowed = track.get("audiodownload_allowed", False)
        
        if not allowed or not audiodownload:
            print(f"[{song_id}] Download not allowed")
            # 可改用 stream 的 audio 欄位，但品質較差
            return False
        
        # 下載檔案
        print(f"Downloading {song_id} ...")
        audio_resp = requests.get(audiodownload, stream=True, timeout=60)
        audio_resp.raise_for_status()
        
        with open(save_path, "wb") as f:
            for chunk in audio_resp.iter_content(chunk_size=8192):
                f.write(chunk)
                
        print(f"[{song_id}] Saved → {filename}")
        return True
        
    except Exception as e:
        print(f"[{song_id}] Error: {e}")
        return False

# 讀取 CSV 並下載
with open(CSV_FILE, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    song_ids = [row["song_id"] for row in reader]

print(f"總共發現 {len(song_ids)} 首音樂，開始下載...\n")
print(f"重新下載模式: {'ON (強制重新下載)' if FORCE_REDOWNLOAD else 'OFF (跳過已存在的檔案)'}\n")

success = 0
skipped = 0
failed_ids = []  # 記錄下載失敗的 id
for song_id in tqdm(song_ids):
    filename = f"{song_id}.mp3"
    save_path = os.path.join(SAVE_DIR, filename)
    
    # 檢查檔案是否已存在
    if os.path.exists(save_path) and not FORCE_REDOWNLOAD:
        skipped += 1
    elif download_track(song_id):
        success += 1
    else:
        failed_ids.append(song_id)
    time.sleep(0.5)   # 避免被 Jamendo 擋（禮貌間隔）

print(f"\n下載完成！成功 {success}/{len(song_ids)} 首")
if skipped > 0:
    print(f"跳過已存在 {skipped} 首")

# 輸出失敗統計和詳細列表
failed_count = len(failed_ids)
print(f"失敗 {failed_count} 首\n")

if failed_ids:
    # 輸出失敗 id 的 JSON 檔
    failed_output = {
        'total_failed': failed_count,
        'failed_ids': failed_ids
    }
    
    json_file = os.path.join(SAVE_DIR, "failed_downloads.json")
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(failed_output, f, ensure_ascii=False, indent=2)
    print(f"✓ 失敗列表已儲存到: {json_file}")
    
    # 也輸出一份 CSV 格式供參考
    csv_file = os.path.join(SAVE_DIR, "failed_downloads.csv")
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['song_id'])
        for song_id in failed_ids:
            writer.writerow([song_id])
    print(f"✓ 失敗列表已儲存到: {csv_file}")
    
    print(f"\n失敗的 song_id 清單：")
    print(failed_ids)
else:
    print("✓ 所有歌曲都下載成功！")