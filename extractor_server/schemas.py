"""数据模型"""

from pydantic import BaseModel
from typing import List, Optional


# ==================== 基础响应模型 ====================

class HealthCheckResponse(BaseModel):
    """健康检查响应"""
    status: str = "ok"


class ErrorResponse(BaseModel):
    """错误响应"""
    error: str
    details: Optional[str] = None


# ==================== 医疗级 HRV 预测 ====================

class GlobalRiskFeatures(BaseModel):
    """全局风险指标"""
    mode: str  # "Major" 或 "Minor"
    mode_score: float  # 0-1
    pulse_clarity: float  # 脉动清晰度 (Pulse Clarity) 0-1
    tempo_category: str  # "Slow", "Moderate", "Fast"
    tempo_bpm: float
    tempo_score: float
    dynamic_range_db: float
    dynamic_range_normalized: float  # 0-1
    mean_loudness_db: float
    mean_f0_hz: float
    f0_range_hz: float


class ThumbnailPredictionFeatures(BaseModel):
    """缩图预测特征"""
    mode_mean: float  # 0-1
    pulse_clarity_mean: float  # 0-1
    tempo_mean_bpm: float
    music_envelope_mean: float
    music_envelope_std: float
    f0_envelope_mean_hz: float
    loudness_envelope_mean: float
    loudness_stability: float  # 0-1


class ValidationArrays(BaseModel):
    """即时验证数组 (4Hz)"""
    music_envelope_4hz: List[float]  # 120 点 for 30 秒
    f0_envelope_4hz: List[float]
    loudness_envelope_4hz: List[float]
    sampling_rate_hz: float  # 4.0
    array_length: int


class ThumbnailSegmentationInfo(BaseModel):
    """缩图分割信息"""
    method: str  # "SSM-based (Bartsch & Wakefield 2005)"
    start_time_seconds: float
    end_time_seconds: float
    duration_seconds: float
    start_frame: int
    end_frame: int


class MedicalGradeHRVOutput(BaseModel):
    """医疗级 HRV 预测完整输出"""
    phase_1_global_preprocessing: dict
    phase_2_global_features: dict
    phase_2_5_thumbnail_segmentation: ThumbnailSegmentationInfo
    phase_3_4_medical_grade_output: dict
