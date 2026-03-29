"""数据模型"""

from pydantic import BaseModel
from typing import List, Optional


# ==================== 响应模型 ====================

class HealthCheckResponse(BaseModel):
    """健康检查响应"""
    status: str = "ok"


class ErrorResponse(BaseModel):
    """错误响应"""
    error: str
    details: Optional[str] = None


# ==================== 脉动清晰度 ====================

class PulseClarityResponse(BaseModel):
    """脉动清晰度响应"""
    pulse_clarity: float  # 0-1
    confidence: float  # 0-1
    onset_strength: List[float]
    onset_times: List[float]
    max_tempogram: List[float]
    tempogram_times: List[float]


# ==================== 调式 ====================

class ModeResponse(BaseModel):
    """调式响应"""
    mode: float  # 0-1, 0=小调, 1=大调
    mode_label: str  # "major" 或 "minor"
    confidence: float
    major_strength: float
    minor_strength: float
    chroma_mean: List[float]  # 12-dim
    chroma: List[List[float]]
    times: List[float]


# ==================== 节奏速度 ====================

class TempoResponse(BaseModel):
    """节奏速度响应"""
    bpm: float
    confidence: float
    beat_times: List[float]
    beat_count: int
    onset_strength: List[float]
    onset_times: List[float]
    max_tempogram: List[float]
    tempogram_times: List[float]


# ==================== 响度 ====================

class LoudnessResponse(BaseModel):
    """响度与包络线响应"""
    loudness_rms: List[float]
    loudness_db: List[float]
    loudness_envelope: List[float]
    loudness_envelope_db: List[float]
    mean_loudness_db: float
    peak_loudness_db: float
    min_loudness_db: float
    dynamic_range_db: float
    times: List[float]


# ==================== 基频包络线 ====================

class F0Range(BaseModel):
    """F0 范围"""
    min: float
    max: float


class F0EnvelopeResponse(BaseModel):
    """基频包络线响应"""
    f0_values: List[Optional[float]]  # None 表示无声部分
    f0_confidence: List[float]
    f0_voiced: List[int]  # 0 或 1
    times: List[float]
    mean_f0: float
    f0_range: F0Range
    voiced_count: int
    total_frames: int
    voicing_ratio: float
