"""
路由层
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from utils import AudioProcessor
from extractors.master_feature_extractor import MasterFeatureExtractor
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


def sanitize_json(obj):
    """
    遞迴清理 JSON 中的無效值（NaN、Infinity 等）
    """
    import math
    import json

    if isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_json(v) for v in obj]
    elif isinstance(obj, float):
        if math.isnan(obj):
            return 0.0
        elif math.isinf(obj):
            return 999999.0 if obj > 0 else -999999.0
    return obj
