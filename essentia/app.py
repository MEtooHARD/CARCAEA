from dataclasses import dataclass
from enum import Enum
from fastapi import FastAPI, HTTPException, UploadFile, File, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Tuple, Callable, Awaitable
import essentia.standard as es
import numpy as np
import asyncio
import io
import logging
import json
from pathlib import Path

# 導入模型配置
from models_config import (
    AVAILABLE_MODELS,
    get_model_config,
    get_essentia_model_loader,
    # list_extractors,
    # list_classifiers
)

"""
from essentia.standard import MonoLoader, TensorflowPredictMAEST

audio = MonoLoader(filename="audio.wav", sampleRate=16000, resampleQuality=4)()
model = TensorflowPredictMAEST(graphFilename="discogs-maest-30s-pw-ts-2.pb", output="PartitionedCall/Identity_7")
embeddings = model(audio)
"""

"""
from essentia.standard import MonoLoader, TensorflowPredictMusiCNN, TensorflowPredict2D

audio = MonoLoader(filename="audio.wav", sampleRate=16000, resampleQuality=4)()
embedding_model = TensorflowPredictMusiCNN(graphFilename="msd-musicnn-1.pb", output="model/dense/BiasAdd")
embeddings = embedding_model(audio)

model = TensorflowPredict2D(graphFilename="emomusic-msd-musicnn-2.pb", output="model/Identity")
predictions = model(embeddings)
"""

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Essentia Audio Feature Extractor & Classifier",
    description="Two-stage audio processing: extraction (audio→embedding) and classification (embedding→labels)",
    version="2.0.0"
)

# 路徑配置
WEIGHTS_DIR = Path("/app/weights")

# 模型快取（lazy loading）
model_cache: Dict[str, Any] = {}

# 請求隊列（處理 TensorFlow global memory 限制）
request_queue: "asyncio.Queue[Tuple[Callable[[], Awaitable[Any]], asyncio.Future[Any]]]" = asyncio.Queue()
processing_task: Optional[asyncio.Task[None]] = None

# ==================== 模型管理 ====================


def scan_available_models() -> Dict[str, List[str] | int]:
    """掃描可用的模型檔案"""
    models = []

    # 掃描 weights 目錄
    if WEIGHTS_DIR.exists():
        for pb_file in WEIGHTS_DIR.glob("*.pb"):
            model_name = pb_file.stem  # 去掉 .pb
            models.append(model_name)

    return {
        "models": sorted(models),
        "total": len(models)
    }


def load_model(model_name: str) -> Dict[str, Any]:
    """載入模型 (lazy loading) - 根據 models_config.py 的配置"""
    if model_name in model_cache:
        return model_cache[model_name]

    model_path = WEIGHTS_DIR / f"{model_name}.pb"

    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")

    try:
        # 從配置獲取模型信息
        cfg = get_model_config(model_name)
        model_class, output_layer = get_essentia_model_loader(model_name)

        # 根據配置加載模型
        model = model_class(
            graphFilename=str(model_path),
            output=output_layer
        )

        model_cache[model_name] = {
            "model": model,
            "config": cfg
        }

        logger.info(f"Loaded model: {model_name} (type: {cfg.model_type}, output: {output_layer})")
        return model_cache[model_name]

    except Exception as e:
        logger.error(f"Failed to load model {model_name}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to load model: {str(e)}")

# ==================== 請求隊列處理 ====================


async def process_queue() -> None:
    """處理請求隊列（確保 TensorFlow 順序執行）"""
    while True:
        try:
            task_func, result_future = await request_queue.get()

            try:
                result = await task_func()
                result_future.set_result(result)
            except Exception as e:
                result_future.set_exception(e)
            finally:
                request_queue.task_done()

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Queue processing error: {e}")


async def enqueue_task(task_func: Callable[[], Awaitable[Any]]) -> Any:
    """將任務加入隊列並等待結果"""
    loop = asyncio.get_event_loop()
    result_future: asyncio.Future[Any] = loop.create_future()

    await request_queue.put((task_func, result_future))

    return await result_future


@app.on_event("startup")
async def startup_event() -> None:
    """啟動時初始化隊列處理"""
    global processing_task
    processing_task = asyncio.create_task(process_queue())
    logger.info("Request queue processor started")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    """關閉時清理資源"""
    global processing_task
    if processing_task:
        processing_task.cancel()
        try:
            await processing_task
        except asyncio.CancelledError:
            pass
    logger.info("Request queue processor stopped")

# ==================== API 端點 ====================


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """健康檢查"""
    return {
        "status": "ok",
        "service": "essentia_worker",
        "queue_size": request_queue.qsize(),
        "cached_models": len(model_cache)
    }


@app.get("/models")
async def list_models() -> Dict[str, Any]:
    """列出所有可用的模型及其詳細信息"""
    extractors = []
    classifiers = []
    
    for name, cfg in AVAILABLE_MODELS.items():
        model_info = {
            "name": cfg.name,
            "type": cfg.model_type,
            "output_layer": cfg.output_layer,
            "description": cfg.description,
        }
        
        if cfg.purpose == "feature_extractor":
            extractors.append(model_info)
        else:
            classifiers.append(model_info)
    
    return {
        "extractors": extractors,
        "classifiers": classifiers,
        "total": len(AVAILABLE_MODELS)
    }


class ExtractRequest(BaseModel):
    """Extraction 請求參數"""
    model: str


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    model: str = Body(..., embed=True)
) -> JSONResponse:
    """
    提取音訊的 embedding

    入參：
    - file: 音訊檔案（支援常見格式）
    - model: 模型名稱（如 "audioset-vggish-3"）

    出參：
    - embedding: float array
    - shape: embedding 維度
    """
    try:
        # 1. 讀取音訊檔案
        contents = await file.read()

        if not contents:
            raise HTTPException(status_code=400, detail="Empty file")

        logger.info(
            f"Extract request: file={file.filename}, model={model}, size={len(contents)} bytes")

        # 2. 加入隊列處理
        async def extract_task() -> Dict[str, Any]:
            # 載入模型
            model_info = load_model(model)
            processor = model_info["model"]
            cfg = model_info["config"]

            # 用 MonoLoader 載入音訊（使用配置中的採樣率）
            with io.BytesIO(contents) as audio_buffer:
                # 儲存暫存檔案（Essentia 需要檔案路徑）
                import tempfile
                with tempfile.NamedTemporaryFile(delete=False, suffix=".audio") as tmp:
                    tmp.write(contents)
                    tmp_path = tmp.name

                try:
                    audio = es.MonoLoader(
                        filename=tmp_path,
                        sampleRate=cfg.sample_rate,
                        resampleQuality=4
                    )()

                    # 提取特徵
                    embedding = processor(audio)

                    return {
                        "embedding": embedding.tolist(),
                        "shape": list(embedding.shape),
                        "model": model,
                        "model_type": cfg.model_type,
                        "audio_duration": float(len(audio) / cfg.sample_rate)
                    }
                finally:
                    import os
                    os.unlink(tmp_path)

        result = await enqueue_task(extract_task)
        return JSONResponse(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Extraction failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class ProcessRequest(BaseModel):
    """模型處理請求參數"""
    data: List[float]
    model: str


@app.post("/process")
async def process(request: ProcessRequest) -> JSONResponse:
    """
    通用的模型處理端點

    入參：
    - data: float array（輸入特徵或 embedding）
    - model: 模型名稱

    出參：
    - output: float array（模型輸出）
    - shape: 輸出維度
    """
    try:
        logger.info(
            f"Process request: model={request.model}, input_size={len(request.data)}")

        # 加入隊列處理
        async def process_task() -> Dict[str, Any]:
            # 載入模型
            model_info = load_model(request.model)
            processor = model_info["model"]
            cfg = model_info["config"]

            # 將輸入轉為 numpy array
            input_array = np.array(request.data, dtype=np.float32)

            # 執行處理
            output = processor(input_array)

            return {
                "output": output.tolist(),
                "shape": list(output.shape),
                "model": request.model,
                "model_type": cfg.model_type,
                "purpose": cfg.purpose
            }

        result = await enqueue_task(process_task)
        return JSONResponse(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Processing failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
