"""
FastAPI 主应用
"""

import logging
from typing import Any, Callable, Awaitable
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
# from starlette.middleware.base import BaseHTTPMiddleware
from routes import router as extract_router
from schemas import HealthCheckResponse  # , ErrorResponse

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(
    title="Audio Feature Extractor Service",
    description="用于从音频文件提取音乐特征的微服务。每个端点对应一个特征提取功能，无数据持久化，仅进行计算处理。",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# ==================== 中间件 ====================


@app.middleware("http")
async def logging_middleware(request: Request, call_next: Callable[[Request], Awaitable[Any]]) -> Any:
    """请求/响应日志中间件"""
    logger.info(f"{request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"Response status: {response.status_code}")
    return response


# ==================== 路由 ====================

# 包含特征提取路由
app.include_router(extract_router)


# ==================== 健康检查 ====================

@app.get("/health", response_model=HealthCheckResponse, tags=["health"])
async def health_check() -> HealthCheckResponse:
    """
    健康检查端点

    返回服务状态。用于容器和负载均衡器的健康检查。
    """
    return HealthCheckResponse(status="ok")


@app.get("/", tags=["root"])
async def root() -> dict[str, Any]:
    """根路径，返回 API 信息"""
    return {
        "service": "Audio Feature Extractor Service",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "/extract/pulse-clarity": "提取脉动清晰度",
            "/extract/mode": "提取调式 (大调/小调)",
            "/extract/tempo": "提取节奏速度 (BPM)",
            "/extract/loudness": "提取响度与音乐包络线",
            "/extract/f0-envelope": "提取基频包络线"
        }
    }


# ==================== 异常处理 ====================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """全局异常处理器"""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "details": str(exc)
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        workers=1,
        log_level="info"
    )
