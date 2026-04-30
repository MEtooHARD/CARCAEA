"""
原始特征时间线提取端点
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from utils import AudioProcessor
from util.timeline_features import (
    extract_loudness_timeline,
    extract_chroma_features,
    align_and_resample_timelines,
    sanitize_json
)
import logging
import traceback
import numpy as np
import time
from typing import Optional
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/extract", tags=["feature extraction"])


@router.post("/timelines")
async def extract_raw_timelines(
    file: Optional[UploadFile] = File(None),
    file_path: Optional[str] = Form(None),
):
    """
    提取原始特徵 Timeline （低級特徵，用於後續應用）
    
    端點流程：
    [1] 音頻加載 → 單聲道，sr=22050Hz
    [2] 並行特徵提取：
        - Loudness: dB 單位的平滑響度
        - Chroma: 12 維色度矩陣 + 色度通量（EDM 動態指標）
    [3] 時間軸對齐（所有特徵使用相同 hop_length=512）
    [4] 重採樣到 4Hz（立方樣條插值）
    
    返回 JSON 結構：
    {
      "timelines": {
        "loudness": [...],          // dB，shape (n_points,)
        "chroma_matrix": [          // shape (n_points, 12)，每點是 12D 向量
          [c0, c1, ..., c11],       // 時刻 0 的 12 個音級能量
          [c0, c1, ..., c11],       // 時刻 1
          ...
        ],
        "chroma_flux": [...]        // 通量，shape (n_points,)
      },
      "metadata": {
        "duration_sec": float,
        "sample_rate_hz": int,
        "target_hz": float (4.0),
        "total_points": int,
        "hop_length": int
      }
    }
    """
    try:
        # 验证参数
        if not file and not file_path:
            raise HTTPException(status_code=400, detail="Either 'file' or 'file_path' must be provided")
        
        t_start = time.time()
        
        # [1] 音頻載入
        if file:
            logger.info(f"📊 [Timelines] Processing: {file.filename}")
            content = await file.read()
            filename = file.filename
        else:
            if not os.path.exists(file_path):
                raise HTTPException(status_code=400, detail=f"File not found: {file_path}")
            logger.info(f"📊 [Timelines] Processing: {file_path}")
            with open(file_path, 'rb') as f:
                content = f.read()
            filename = os.path.basename(file_path)
        
        audio_data, sr = await AudioProcessor.load_audio_from_bytes(content)
        
        # 轉為單聲道
        if audio_data.ndim > 1:
            audio_mono = np.mean(audio_data, axis=0).astype(np.float32)
        else:
            audio_mono = audio_data.astype(np.float32)
        
        duration_samples = len(audio_mono)
        duration_sec = duration_samples / sr
        logger.info(f"  ├─ Audio loaded: {duration_sec:.2f}s @ {sr}Hz")
        
        # [2] 並行提取特徵
        loudness, times, hop_loudness = await extract_loudness_timeline(audio_mono, sr, hop_length=512)
        chroma_matrix, chroma_flux, times_chroma, hop_chroma = await extract_chroma_features(audio_mono, sr, hop_length=512)
        logger.info(f"  ├─ Features extracted | Loudness frames: {len(loudness)} | Chroma frames: {chroma_matrix.shape[0]}")
        
        # [3-4] 時間軸對齐 + 重採樣
        result = await align_and_resample_timelines(
            loudness, chroma_matrix, chroma_flux, times,
            sr, hop_loudness, target_hz=4.0
        )
        logger.info(f"  └─ Resampled to 4Hz: {result['n_points']} points")
        
        # 組織返回格式
        response = {
            "timelines": {
                "loudness": result["loudness"].tolist(),
                "chroma_matrix": result["chroma_matrix"].tolist(),  # JSON 序列化
                "chroma_flux": result["chroma_flux"].tolist(),
            },
            "metadata": {
                "filename": filename,
                "duration_sec": float(result["duration_sec"]),
                "sample_rate_hz": int(sr),
                "target_hz": float(result["target_hz"]),
                "total_points": int(result["n_points"]),
                "hop_length_source": int(hop_loudness),
                "extraction_time_ms": int((time.time() - t_start) * 1000),
            }
        }
        
        response = sanitize_json(response)
        logger.info(f"✅ Timelines extraction complete ({response['metadata']['extraction_time_ms']}ms)")
        
        return response
        
    except ValueError as e:
        logger.error(f"❌ Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Error extracting timelines: {str(e)}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
