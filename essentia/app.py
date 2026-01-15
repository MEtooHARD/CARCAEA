import asyncio
import logging
from pathlib import Path
from typing import (Any, Awaitable, Callable, Dict, Final, List, Optional,
                    Tuple, Type)

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from Operation import BaseOperation, EmoMusicMSDMusicNN2, MSDMusicNN1, ExtractorOperation, ClassifierOperation
from pydantic import BaseModel

# Separate operation tuples for extractors and classifiers
extractors: Final[Tuple[Type[ExtractorOperation], ...]] = (
    MSDMusicNN1,
)

classifiers: Final[Tuple[Type[ClassifierOperation], ...]] = (
    EmoMusicMSDMusicNN2,
)


def get_extractor_by_name(name: str) -> Type[ExtractorOperation]:
    """Lookup an extractor operation by its name."""
    for op_class in extractors:
        if op_class.name == name:
            return op_class
    
    available = [op.name for op in extractors]
    raise HTTPException(
        status_code=404,
        detail=f"Extractor '{name}' not found. Available: {available}"
    )


def get_classifier_by_name(name: str) -> Type[ClassifierOperation]:
    """Lookup a classifier operation by its name."""
    for op_class in classifiers:
        if op_class.name == name:
            return op_class
    
    available = [op.name for op in classifiers]
    raise HTTPException(
        status_code=404,
        detail=f"Classifier '{name}' not found. Available: {available}"
    )


def self_check() -> None:
    """Check if all required operations have accessible .pb files."""
    all_operations = list(extractors) + list(classifiers)
    
    for op_class in all_operations:
        try:
            logger.info(f"Checking operation '{op_class.name}': {op_class.graphFilename}")
            graph_path = Path(op_class.graphFilename)
            
            if graph_path.exists():
                logger.info(f"✓ Operation '{op_class.name}' file is accessible")
            else:
                raise FileNotFoundError(f"Graph file not found: {graph_path}")
        except Exception as e:
            logger.error(f"Failed to check operation {op_class.__name__}: {e}")
            raise  # Fail fast on startup


# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Essentia Audio Feature Extractor & Classifier",
    description="Two-stage audio processing: extraction (audio→embedding) and classification (embedding→labels)",
    version="2.0.0"
)

# Add validation error handler to debug 422 errors
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    logger.error(f"[VALIDATION_ERROR] Request validation failed")
    # Only log first 5 errors to avoid spam
    for error in exc.errors()[:5]:
        logger.error(f"  - {error['loc']}: {error['msg']}")
    if len(exc.errors()) > 5:
        logger.error(f"  ... and {len(exc.errors()) - 5} more validation errors")
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc.errors()[:5])},
    )

# 請求隊列（處理 TensorFlow global memory 限制）
request_queue: "asyncio.Queue[Tuple[Callable[[], Awaitable[Any]], asyncio.Future[Any]]]" = asyncio.Queue()
processing_task: Optional[asyncio.Task[None]] = None

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
    self_check()  # Check all .pb files exist
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
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "essentia_worker",
        "queue_size": request_queue.qsize(),
        "extractors": len(extractors),
        "classifiers": len(classifiers)
    }


@app.get("/models")
async def list_models() -> Dict[str, Any]:
    """List all available operations"""
    return {
        "extractors": [op.name for op in extractors],
        "classifiers": [op.name for op in classifiers]
    }


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    operation: str = Form(...)
) -> JSONResponse:
    """
    Extract audio embedding using an ExtractorOperation
    
    Args:
        file: Audio file (multipart/form-data)
        operation: Extractor operation name (e.g., "msd-musicnn-1") - as form field
    
    Returns:
        JSON with embedding (float array) and metadata
    """
    try:
        logger.info(f"[EXTRACT] Received request")
        logger.info(f"[EXTRACT] File: {file.filename if file else 'None'}, operation param: {operation}")
        
        # Read audio file
        contents = await file.read()
        if not contents:
            logger.error("[EXTRACT] File is empty")
            raise HTTPException(status_code=400, detail="Empty file")

        logger.info(f"[EXTRACT] File read successfully: {file.filename}, size={len(contents)} bytes, operation={operation}")

        # Queue processing
        async def extract_task() -> Dict[str, Any]:
            logger.info(f"[EXTRACT_TASK] Starting extraction for operation: {operation}")
            
            # Get extractor operation
            op_class = get_extractor_by_name(operation)
            logger.info(f"[EXTRACT_TASK] Got extractor class: {op_class.__name__}")
            
            # Run extraction
            logger.info(f"[EXTRACT_TASK] Running extraction...")
            embedding = op_class.run(contents)
            logger.info(f"[EXTRACT_TASK] Extraction complete, shape: {embedding.shape}")
            
            return {
                "embedding": embedding.tolist(),
                "shape": list(embedding.shape),
                "operation": operation
            }

        logger.info(f"[EXTRACT] Enqueueing task...")
        result = await enqueue_task(extract_task)
        logger.info(f"[EXTRACT] Task complete, returning result")
        return JSONResponse(result)

    except HTTPException as he:
        logger.error(f"[EXTRACT] HTTP Exception: {he.detail}")
        raise
    except Exception as e:
        logger.error(f"[EXTRACT] Extraction failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class ClassifyRequest(BaseModel):
    """Classification request parameters"""
    embedding: List[float]
    operation: str


@app.post("/classify")
async def classify(request: ClassifyRequest) -> JSONResponse:
    """
    Classify an embedding using a ClassifierOperation
    
    Args:
        embedding: Float array (input embedding)
        operation: Classifier operation name (e.g., "emomusic-msd-musicnn-2")
    
    Returns:
        JSON with predictions (float array) and metadata
    """
    try:
        logger.info(f"[CLASSIFY] Received request: operation={request.operation}, input_size={len(request.embedding)}")

        # Queue processing
        async def classify_task() -> Dict[str, Any]:
            logger.info(f"[CLASSIFY_TASK] Starting classification for operation: {request.operation}")
            
            # Get classifier operation
            op_class = get_classifier_by_name(request.operation)
            logger.info(f"[CLASSIFY_TASK] Got classifier class: {op_class.__name__}")
            
            # Convert input to numpy array
            input_array = np.array(request.embedding, dtype=np.float32)
            logger.info(f"[CLASSIFY_TASK] Input array shape: {input_array.shape}")
            
            # Run classification
            logger.info(f"[CLASSIFY_TASK] Running classification...")
            predictions = op_class.run(input_array)
            logger.info(f"[CLASSIFY_TASK] Classification complete, shape: {predictions.shape}")
            
            return {
                "predictions": predictions.tolist(),
                "shape": list(predictions.shape),
                "operation": request.operation
            }

        logger.info(f"[CLASSIFY] Enqueueing task...")
        result = await enqueue_task(classify_task)
        logger.info(f"[CLASSIFY] Task complete, returning result")
        return JSONResponse(result)

    except HTTPException as he:
        logger.error(f"[CLASSIFY] HTTP Exception: {he.detail}")
        raise
    except Exception as e:
        logger.error(f"[CLASSIFY] Classification failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
