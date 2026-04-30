"""
路由聚合层
所有子路由在 routes/ 目录中管理
"""

from routes import timelines_router, tempo_pulse_router

# 导出所有路由器供 app.py 使用
__all__ = ["timelines_router", "tempo_pulse_router"]

