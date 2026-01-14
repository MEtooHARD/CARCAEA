from fastapi import FastAPI, HTTPException, UploadFile, File, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import essentia.standard as es
import numpy as np
import asyncio
import io
import logging
import json
from pathlib import Path
from collections import defaultdict

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
METADATA_DIR = Path("/app/metadata")

# 模型快取（lazy loading）
extractor_cache: Dict[str, Any] = {}
classifier_cache: Dict[str, Any] = {}

# 請求隊列（處理 TensorFlow global memory 限制）
request_queue: asyncio.Queue = asyncio.Queue()
processing_task: Optional[asyncio.Task] = None

# ==================== 模型管理 ====================

class ModelInfo(BaseModel):
    """模型資訊"""
    name: str
    type: str
    description: str
    algorithm: str
    sample_rate: int
    output_shape: List[int]

def scan_available_models() -> Dict[str, List[str]]:
    """掃描可用的模型檔案"""
    extractors = []
    classifiers = []
    
    # 掃描 weights 目錄
    if WEIGHTS_DIR.exists():
        for pb_file in WEIGHTS_DIR.glob("*.pb"):
            model_name = pb_file.stem  # 去掉 .pb
            
            # 檢查是否有對應的 metadata
            metadata_file = METADATA_DIR / f"{model_name}.json"
            if metadata_file.exists():
                try:
                    with open(metadata_file, 'r') as f:
                        metadata = json.load(f)
                        model_type = metadata.get("type", "")
                        
                        if "embedding" in model_type.lower() or "extractor" in model_type.lower():
                            extractors.append(model_name)
                        else:
                            classifiers.append(model_name)
                except Exception as e:
                    logger.warning(f"Failed to read metadata for {model_name}: {e}")
            else:
                logger.warning(f"No metadata found for {model_name}")
    
    return {
        "extractors": sorted(extractors),
        "classifiers": sorted(classifiers)
    }

def load_extractor_model(model_name: str):
    """載入 embedding extractor 模型（lazy loading）"""
    if model_name in extractor_cache:
        return extractor_cache[model_name]
    
    model_path = WEIGHTS_DIR / f"{model_name}.pb"
    metadata_path = METADATA_DIR / f"{model_name}.json"
    
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")
    
    if not metadata_path.exists():
        raise FileNotFoundError(f"Metadata file not found: {metadata_path}")
    
    try:
        # 讀取 metadata
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        algorithm = metadata.get("inference", {}).get("algorithm", "")
        sample_rate = metadata.get("inference", {}).get("sample_rate", 16000)
        
        # 根據 algorithm 載入對應的模型
        if "VGGish" in algorithm:
            output_layer = metadata["schema"]["outputs"][0]["name"]
            model = es.TensorflowPredictVGGish(
                graphFilename=str(model_path),
                output=output_layer
            )
        elif "EffnetDiscogs" in algorithm or "Effnet" in algorithm:
            output_layer = metadata["schema"]["outputs"][0]["name"]
            model = es.TensorflowPredictEffnetDiscogs(
                graphFilename=str(model_path),
                output=output_layer
            )
        elif "MusiCNN" in algorithm:
            output_layer = metadata["schema"]["outputs"][0]["name"]
            model = es.TensorflowPredictMusiCNN(
                graphFilename=str(model_path),
                output=output_layer
            )
        else:
            raise ValueError(f"Unsupported algorithm: {algorithm}")
        
        extractor_cache[model_name] = {
            "model": model,
            "metadata": metadata,
            "sample_rate": sample_rate
        }
        
        logger.info(f"Loaded extractor model: {model_name}")
        return extractor_cache[model_name]
    
    except Exception as e:
        logger.error(f"Failed to load extractor {model_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")

def load_classifier_model(model_name: str):
    """載入 classifier 模型（lazy loading）"""
    if model_name in classifier_cache:
        return classifier_cache[model_name]
    
    model_path = WEIGHTS_DIR / f"{model_name}.pb"
    metadata_path = METADATA_DIR / f"{model_name}.json"
    
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")
    
    if not metadata_path.exists():
        raise FileNotFoundError(f"Metadata file not found: {metadata_path}")
    
    try:
        # 讀取 metadata
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        output_layer = metadata["schema"]["outputs"][0]["name"]
        
        # 使用通用的 TensorflowPredict2D
        model = es.TensorflowPredict2D(
            graphFilename=str(model_path),
            output=output_layer
        )
        
        classifier_cache[model_name] = {
            "model": model,
            "metadata": metadata
        }
        
        logger.info(f"Loaded classifier model: {model_name}")
        return classifier_cache[model_name]
    
    except Exception as e:
        logger.error(f"Failed to load classifier {model_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")

# ==================== 請求隊列處理 ====================

async def process_queue():
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

async def enqueue_task(task_func):
    """將任務加入隊列並等待結果"""
    loop = asyncio.get_event_loop()
    result_future = loop.create_future()
    
    await request_queue.put((task_func, result_future))
    
    return await result_future

@app.on_event("startup")
async def startup_event():
    """啟動時初始化隊列處理"""
    global processing_task
    processing_task = asyncio.create_task(process_queue())
    logger.info("Request queue processor started")

@app.on_event("shutdown")
async def shutdown_event():
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
async def health_check():
    """健康檢查"""
    return {
        "status": "ok",
        "service": "essentia_extractor",
        "queue_size": request_queue.qsize(),
        "cached_extractors": len(extractor_cache),
        "cached_classifiers": len(classifier_cache)
    }

@app.get("/models")
async def list_models():
    """列出所有可用的模型"""
    models = scan_available_models()
    return {
        "extractors": models["extractors"],
        "classifiers": models["classifiers"],
        "total": len(models["extractors"]) + len(models["classifiers"])
    }

class ExtractRequest(BaseModel):
    """Extraction 請求參數"""
    model: str

@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    model: str = Body(..., embed=True)
):
    """
    提取音訊的 embedding
    
    入參：
    - file: 音訊檔案（支援常見格式）
    - model: extractor 模型名稱（如 "audioset-vggish-3"）
    
    出參：
    - embedding: float array
    - shape: embedding 維度
    """
    try:
        # 1. 讀取音訊檔案
        contents = await file.read()
        
        if not contents:
            raise HTTPException(status_code=400, detail="Empty file")
        
        logger.info(f"Extract request: file={file.filename}, model={model}, size={len(contents)} bytes")
        
        # 2. 加入隊列處理
        async def extract_task():
            # 載入模型
            model_info = load_extractor_model(model)
            extractor = model_info["model"]
            sample_rate = model_info["sample_rate"]
            
            # 用 MonoLoader 載入音訊
            with io.BytesIO(contents) as audio_buffer:
                # 儲存暫存檔案（Essentia 需要檔案路徑）
                import tempfile
                with tempfile.NamedTemporaryFile(delete=False, suffix=".audio") as tmp:
                    tmp.write(contents)
                    tmp_path = tmp.name
                
                try:
                    audio = es.MonoLoader(
                        filename=tmp_path,
                        sampleRate=sample_rate,
                        resampleQuality=4
                    )()
                    
                    # 提取 embedding
                    embedding = extractor(audio)
                    
                    return {
                        "embedding": embedding.tolist(),
                        "shape": list(embedding.shape),
                        "model": model,
                        "sample_rate": sample_rate,
                        "audio_duration": float(len(audio) / sample_rate)
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

class ClassifyRequest(BaseModel):
    """Classification 請求參數"""
    embedding: List[float]
    model: str

@app.post("/classify")
async def classify(request: ClassifyRequest):
    """
    對 embedding 進行分類
    
    入參：
    - embedding: float array（來自 /extract）
    - model: classifier 模型名稱（如 "genre_discogs400-discogs-maest-30s-pw-ts-1"）
    
    出參：
    - predictions: float array（分類分數）
    - shape: 輸出維度
    """
    try:
        logger.info(f"Classify request: model={request.model}, embedding_size={len(request.embedding)}")
        
        # 加入隊列處理
        async def classify_task():
            # 載入模型
            model_info = load_classifier_model(request.model)
            classifier = model_info["model"]
            
            # 將 embedding 轉為 numpy array
            embedding_array = np.array(request.embedding, dtype=np.float32)
            
            # 執行分類
            predictions = classifier(embedding_array)
            
            return {
                "predictions": predictions.tolist(),
                "shape": list(predictions.shape),
                "model": request.model
            }
        
        result = await enqueue_task(classify_task)
        return JSONResponse(result)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Classification failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
