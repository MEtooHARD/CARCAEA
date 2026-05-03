"""
Pydantic schemas for the ML server API.
"""

from typing import Any
from pydantic import BaseModel, Field
from config import HRV_TARGETS, FEATURE_NAMES


class HRVDelta(BaseModel):
    hr: float
    rmssd: float
    sdnn: float
    pnn50: float
    lf: float
    hf: float


class TrainingCase(BaseModel):
    feedback_id: int
    features: list[float] = Field(..., min_length=len(FEATURE_NAMES), max_length=len(FEATURE_NAMES))
    delta: HRVDelta


class Hyperparams(BaseModel):
    n_estimators: int = 100
    max_depth: int = 4
    learning_rate: float = 0.1
    subsample: float = 0.8
    colsample_bytree: float = 0.8
    min_child_weight: int = 3


class TrainRequest(BaseModel):
    cases: list[TrainingCase] = Field(..., min_length=1)
    hyperparams: Hyperparams = Field(default_factory=Hyperparams)


class TrainResponse(BaseModel):
    models: dict[str, Any]   # keys: hr, rmssd, sdnn, pnn50, lf, hf — XGBoost JSON
    case_ids: list[int]


class PredictCase(BaseModel):
    features: list[float] = Field(..., min_length=len(FEATURE_NAMES), max_length=len(FEATURE_NAMES))


class PredictRequest(BaseModel):
    models: dict[str, Any]   # same format as TrainResponse.models
    cases: list[PredictCase] = Field(..., min_length=1)


class PredictResponse(BaseModel):
    predictions: list[HRVDelta]


class HealthCheckResponse(BaseModel):
    status: str = "ok"
