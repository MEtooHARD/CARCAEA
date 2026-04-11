#!/usr/bin/env python3
"""直接測試 /extract/complete 功能，獲取完整錯誤信息"""

import asyncio
import sys
from utils import AudioProcessor
from extractors.master_feature_extractor import MasterFeatureExtractor


async def test_extract():
    """測試醫療級特徵提取"""

    # 加載 MP3 檔案
    print("[Test] Loading 1100.mp3...")
    with open("1100.mp3", "rb") as f:
        audio_bytes = f.read()

    print(f"[Test] Loaded {len(audio_bytes) / 1024 / 1024:.1f}MB")

    # 使用 AudioProcessor 加載音頻
    print("[Test] Processing audio...")
    try:
        audio_data, sr = await AudioProcessor.load_audio_from_bytes(audio_bytes)
        print(
            f"[Test] Audio: {len(audio_data)} samples, {sr}Hz, duration={len(audio_data)/sr:.2f}s")
    except Exception as e:
        print(f"[Test] Error loading audio: {e}")
        return

    # 使用 MasterFeatureExtractor
    print("[Test] Starting medical-grade HRV extraction...")
    try:
        extractor = MasterFeatureExtractor()
        result = await extractor.extract_medical_grade_features(
            audio_data,
            sr,
            thumbnail_duration=25.0,
            min_duration=20.0,
            max_duration=30.0,
        )
        print("[Test] ✓ Extraction successful!")
        print(f"[Test] Result keys: {result.keys()}")

    except Exception as e:
        print(f"[Test] ✗ Error during extraction: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_extract())
