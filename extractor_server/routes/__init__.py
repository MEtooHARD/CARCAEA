"""
音频特征提取路由模块
"""

from fastapi import APIRouter
from .timelines import router as timelines_router
from .tempo_pulse import router as tempo_pulse_router
from .pulse_clarity_timeline import router as pulse_clarity_timeline_router

# 创建聚合路由器
router = APIRouter()
router.include_router(timelines_router)
router.include_router(tempo_pulse_router)
router.include_router(pulse_clarity_timeline_router)

__all__ = ["router", "timelines_router", "tempo_pulse_router", "pulse_clarity_timeline_router"]
