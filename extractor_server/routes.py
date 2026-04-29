"""
路由层
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from utils import AudioProcessor
from extractors.master_feature_extractor import MasterFeatureExtractor
from util.timeline_features import (
    extract_loudness_timeline,
    extract_chroma_features,
    align_and_resample_timelines,
    sanitize_json
)
from util.tempo_pulse import extract_tempo_and_pulse
import logging
import traceback
import numpy as np
import math

logger = logging.getLogger(__name__)

# 初始化医疗级特征提取器
master_feature_extractor = MasterFeatureExtractor()


def sanitize_json(obj):
    """
    递归清理 JSON 中的无效浮点值 (NaN, Inf)
    """
    if isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_json(item) for item in obj]
    elif isinstance(obj, (np.ndarray, np.generic)):
        # 转换 numpy 类型为 Python 原生类型
        if isinstance(obj, np.ndarray):
            return [sanitize_json(item) for item in obj.tolist()]
        else:
            val = float(obj)
            if math.isnan(val):
                return 0.0
            elif math.isinf(val):
                return 0.0 if val > 0 else 0.0
            else:
                return val
    elif isinstance(obj, float):
        if math.isnan(obj):
            return 0.0
        elif math.isinf(obj):
            return 0.0
        else:
            return obj
    else:
        return obj


# 创建路由
router = APIRouter(prefix="/extract", tags=["feature extraction"])

# 初始化医疗级特征提取器
master_feature_extractor = MasterFeatureExtractor()


@router.post("/complete")
async def extract_complete(
    file: UploadFile = File(...),
    thumbnail_duration: float = Form(25.0),
    min_duration: float = Form(20.0),
    max_duration: float = Form(30.0),
):
    """
    提取医疗级 HRV 预测特征 (Medical-Grade HRV Prediction)

    完整的四阶段分析管道：
    1. 全曲全局预处理（峰值正规化）
    2. 全曲特征提取（所有 5 个特征）
    3. 基于 SSM 的缩图分割（20-30 秒代表性片段）
    4. 4Hz 重采样与统计聚合

    此端点返回医疗级 JSON，包含：
    - Global Risk Features（调式、节奏、响度动态等）
    - Thumbnail Prediction Features（缩图内的聚合值）
    - Validation Arrays（4Hz 采样的实时验证数据）

    - **file**: WAV、MP3、FLAC 或 OGG 音频文件
    - **thumbnail_duration**: 目标缩图时长（秒），默认 25.0
    - **min_duration**: 最小允许缩图时长（秒），默认 20.0
    - **max_duration**: 最大允许缩图时长（秒），默认 30.0
    - **返回**: 医疗级 HRV 预测数据 (精简格式 < 2 KB)
    """
    try:
        content = await file.read()
        audio_data, sr = await AudioProcessor.load_audio_from_bytes(content)

        # 输出接收到的音频 metadata
        file_size_mb = len(content) / (1024 * 1024)
        num_channels = audio_data.shape[0] if audio_data.ndim > 1 else 1
        duration_sec = len(
            audio_data) / sr if audio_data.ndim == 1 else audio_data.shape[1] / sr
        logger.info(
            f"📨 Received audio: {file.filename} | Size: {file_size_mb:.2f}MB | SR: {sr}Hz | Channels: {num_channels} | Duration: {duration_sec:.2f}s")

        result = await master_feature_extractor.extract_medical_grade_features(
            audio_data,
            sr,
            thumbnail_duration=thumbnail_duration,
            min_duration=min_duration,
            max_duration=max_duration,
        )

        # 获取完整音频时长（秒）及完整音频
        full_audio = np.mean(audio_data, axis=0).astype(
            np.float32) if audio_data.ndim > 1 else audio_data.astype(np.float32)
        full_duration_seconds = len(full_audio) / sr

        # 重新组织返回结构：分离 metadata 和 thumbnail_metadata
        metadata = result.get("metadata", {})
        reorganized_result = {
            "metadata": {
                "filename": file.filename,
                "full_duration_seconds": float(full_duration_seconds),
                "global_confidence_avg": metadata.get("global_confidence_avg", 0.0),
            },
            "thumbnail_metadata": {
                "thumbnail_start_sec": metadata.get("thumbnail_start_sec", 0.0),
                "thumbnail_end_sec": metadata.get("thumbnail_end_sec", 0.0),
                "duration_seconds": metadata.get("duration_seconds", 0.0),
            },
            "global_risk_features": result.get("global_risk_features", {}),
            "thumbnail_prediction_features": result.get("thumbnail_prediction_features", {}),
            "thumbnail_validation_arrays": result.get("thumbnail_validation_arrays", {}),
            "full_features": result.get("full_features", {}),
            "smoothness": result.get("smoothness", {}),
        }

        # 清理 JSON 中的無效浮點值
        reorganized_result = sanitize_json(reorganized_result)

        # 输出最终汇总
        thumb_meta = reorganized_result.get('thumbnail_metadata', {})
        global_feat = reorganized_result.get('global_risk_features', {})
        logger.info(
            f"✅ Extraction complete | Tempo: {global_feat.get('tempo_bpm', 0):.1f}BPM | Mode: {global_feat.get('mode', 'N/A')} | Thumb: {thumb_meta.get('thumbnail_start_sec', 0):.1f}-{thumb_meta.get('thumbnail_end_sec', 0):.1f}s")

        return reorganized_result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error extracting medical-grade features: {str(e)}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"Internal server error: {str(e)}")


# ============================================
# 原始特徵 Timeline 端點
# ============================================

@router.post("/timelines")
async def extract_raw_timelines(
    file: UploadFile = File(...),
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
        import time
        t_start = time.time()
        
        logger.info(f"📊 [Timelines] Processing: {file.filename}")
        
        # [1] 音頻載入
        content = await file.read()
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
                "filename": file.filename,
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


# ============================================
# Tempo 和 Pulse Clarity 端點
# ============================================

@router.post("/tempo_pulse")
async def extract_tempo_pulse(
    file: UploadFile = File(...),
    start_sec: float = Form(None),
    end_sec: float = Form(None),
):
    """
    計算 Tempo（節奏速度）和 Pulse Clarity（節拍清晰度）
    
    基於 Onset Detection Curve：
    - **Tempo**: 曲線中最穩定的週期性 → BPM
    - **Pulse Clarity**: 自相關峰值 → [0, 1] 清晰度指標
    
    流程：
    1. 載入音訊（單聲道，22050 Hz）
    2. 計算 Onset Strength Curve
    3. 提取主導 Tempo (BPM)
    4. 計算自相關自相關找出節拍規律性 → Pulse Clarity
    
    參數：
    - **file**: WAV、MP3、FLAC 或 OGG 音頻檔案
    - **start_sec**: 片段開始時間（秒），None 表示從頭開始
    - **end_sec**: 片段結束時間（秒），None 表示到尾
    
    返回：
    {
      "tempo_bpm": float,              // 每分鐘節拍數
      "tempo_confidence": float,       // [0, 1] 節奏自信度
      "pulse_clarity": float,          // [0, 1] 節拍清晰度
      "duration_sec": float,           // 分析片段長度
      "metadata": {
        "filename": str,
        "start_sec": float,
        "end_sec": float,
        "extraction_time_ms": int
      }
    }
    """
    try:
        import time
        t_start = time.time()
        
        logger.info(f"🎵 [Tempo+Pulse] Processing: {file.filename}")
        
        # 載入音訊
        content = await file.read()
        audio_data, sr = await AudioProcessor.load_audio_from_bytes(content)
        
        logger.info(f"  ├─ Loaded: {len(content) / (1024 * 1024):.2f}MB @ {sr}Hz")
        
        # 提取 Tempo 和 Pulse Clarity
        result = extract_tempo_and_pulse(
            audio_data,
            sr,
            start_sec=start_sec,
            end_sec=end_sec,
            hop_length=512
        )
        
        # 組織返回格式
        response = {
            "tempo_bpm": result["tempo_bpm"],
            "tempo_confidence": result["tempo_confidence"],
            "pulse_clarity": result["pulse_clarity"],
            "duration_sec": result["duration_sec"],
            "metadata": {
                "filename": file.filename,
                "start_sec": start_sec or 0.0,
                "end_sec": end_sec or result["duration_sec"],
                "extraction_time_ms": int((time.time() - t_start) * 1000),
            }
        }
        
        response = sanitize_json(response)
        logger.info(
            f"✅ Extraction complete | "
            f"Tempo: {response['tempo_bpm']:.1f}BPM | "
            f"Pulse: {response['pulse_clarity']:.3f} | "
            f"Time: {response['metadata']['extraction_time_ms']}ms"
        )
        
        return response
        
    except ValueError as e:
        logger.error(f"❌ Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Error extracting tempo/pulse: {str(e)}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
