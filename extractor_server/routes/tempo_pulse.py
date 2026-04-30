"""
节奏和脉冲清晰度提取端点
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from utils import AudioProcessor
from util.tempo_pulse import extract_tempo_and_pulse
from util.timeline_features import sanitize_json
import logging
import traceback
import time
from typing import Optional
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/extract", tags=["feature extraction"])


@router.post("/tempo_pulse")
async def extract_tempo_pulse(
    file: Optional[UploadFile] = File(None),
    file_path: Optional[str] = Form(None),
    start_sec: float = Form(None),
    end_sec: float = Form(None),
):
    """
    計算 Tempo（節奏速度）和 Pulse Clarity（節拍清晰度）
    
    基於 Onset Detection Curve：
    - **Tempo**: 曲線中最穩定的週期性 → BPM
    - **Pulse Clarity**: 自相關峰值 → [0, 1] 清晰度指標
    
    流程：
    1. 載入音訊（單聲道，22050 Hz）
    2. 計算 Onset Strength Curve
    3. 提取主導 Tempo (BPM)
    4. 計算自相關自相關找出節拍規律性 → Pulse Clarity
    
    參數：
    - **file**: WAV、MP3、FLAC 或 OGG 音頻檔案
    - **start_sec**: 片段開始時間（秒），None 表示從頭開始
    - **end_sec**: 片段結束時間（秒），None 表示到尾
    
    返回：
    {
      "tempo_bpm": float,              // 每分鐘節拍數
      "tempo_confidence": float,       // [0, 1] 節奏自信度
      "pulse_clarity": float,          // [0, 1] 節拍清晰度
      "duration_sec": float,           // 分析片段長度
      "metadata": {
        "filename": str,
        "start_sec": float,
        "end_sec": float,
        "extraction_time_ms": int
      }
    }
    """
    try:
        # 验证参数
        if not file and not file_path:
            raise HTTPException(status_code=400, detail="Either 'file' or 'file_path' must be provided")
        
        t_start = time.time()
        
        # 載入音訊
        if file:
            logger.info(f"🎵 [Tempo+Pulse] Processing: {file.filename}")
            content = await file.read()
            filename = file.filename
        else:
            if not os.path.exists(file_path):
                raise HTTPException(status_code=400, detail=f"File not found: {file_path}")
            logger.info(f"🎵 [Tempo+Pulse] Processing: {file_path}")
            with open(file_path, 'rb') as f:
                content = f.read()
            filename = os.path.basename(file_path)
        
        audio_data, sr = await AudioProcessor.load_audio_from_bytes(content)
        
        logger.info(f"  ├─ Loaded: {len(content) / (1024 * 1024):.2f}MB @ {sr}Hz")
        
        # 提取 Tempo 和 Pulse Clarity
        result = extract_tempo_and_pulse(
            audio_data,
            sr,
            start_sec=start_sec,
            end_sec=end_sec,
            hop_length=512
        )
        
        # 組織返回格式
        response = {
            "tempo_bpm": result["tempo_bpm"],
            "tempo_confidence": result["tempo_confidence"],
            "pulse_clarity": result["pulse_clarity"],
            "duration_sec": result["duration_sec"],
            "metadata": {
                "filename": filename,
                "start_sec": start_sec or 0.0,
                "end_sec": end_sec or result["duration_sec"],
                "extraction_time_ms": int((time.time() - t_start) * 1000),
            }
        }
        
        response = sanitize_json(response)
        logger.info(
            f"✅ Extraction complete | "
            f"Tempo: {response['tempo_bpm']:.1f}BPM | "
            f"Pulse: {response['pulse_clarity']:.3f} | "
            f"Time: {response['metadata']['extraction_time_ms']}ms"
        )
        
        return response
        
    except ValueError as e:
        logger.error(f"❌ Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Error extracting tempo/pulse: {str(e)}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
