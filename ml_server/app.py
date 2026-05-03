"""
FastAPI application entry point for the ML server.
"""

import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from routes import router
from schemas import HealthCheckResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CARCAEA ML Server",
    description="XGBoost training and inference service for HRV delta prediction.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    logger.info(f"{request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"Response status: {response.status_code}")
    return response


app.include_router(router)


@app.get("/health", response_model=HealthCheckResponse, tags=["health"])
async def health():
    return HealthCheckResponse(status="ok")
