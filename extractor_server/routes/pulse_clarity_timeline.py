"""
脉冲清晰度时间线提取端点（滑动窗口）
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


@router.post("/pulse_clarity_timeline")
async def extract_pulse_clarity_timeline(
    file: Optional[UploadFile] = File(None),
    file_path: Optional[str] = Form(None),
    window_size: float = Form(...),  # 窗口大小（秒）
    hop_length: float = Form(...),   # 步长（秒）
):
    """
    提取全曲 Pulse Clarity 和 Tempo 的时间线（滑动窗口）
    
    使用固定大小的滑动窗口扫描整个音频，计算每个窗口内的：
    - **Pulse Clarity**: 节拍规律性指标 [0, 1]
    - **Tempo**: 该窗口的主导节奏 (BPM)
    
    流程：
    1. 载入音频（单声道，22050 Hz）
    2. 计算窗口数量：num_windows = ceil((duration - window_size) / hop_length) + 1
    3. 对每个窗口调用 extract_tempo_and_pulse()
    4. 收集所有窗口的 pulse_clarity 和 tempo_bpm
    
    参数：
    - **file**: WAV、MP3、FLAC 或 OGG 音频文件
    - **file_path**: 文件系统中的音频文件路径
    - **window_size**: 滑动窗口大小（秒），例如 5.0
    - **hop_length**: 步长（秒），例如 1.0
    
    返回：
    {
      "pulse_clarity_timeline": [float, float, ...],  // [0, 1] 清晰度数组
      "tempo_timeline": [float, float, ...],          // BPM 数组
      "tempo_confidence_timeline": [float, float, ...], // [0, 1] 置信度数组
      "window_size_sec": float,
      "hop_length_sec": float,
      "duration_sec": float,
      "num_windows": int,
      "metadata": {
        "filename": str,
        "extraction_time_ms": int
      }
    }
    """
    try:
        # 验证参数
        if not file and not file_path:
            raise HTTPException(status_code=400, detail="Either 'file' or 'file_path' must be provided")
        
        if window_size <= 0:
            raise HTTPException(status_code=400, detail="window_size must be > 0")
        if hop_length <= 0:
            raise HTTPException(status_code=400, detail="hop_length must be > 0")
        
        t_start = time.time()
        
        # 载入音频
        if file:
            logger.info(f"🎵 [Pulse Timeline] Processing: {file.filename}")
            content = await file.read()
            filename = file.filename
        else:
            if not os.path.exists(file_path):
                raise HTTPException(status_code=400, detail=f"File not found: {file_path}")
            logger.info(f"🎵 [Pulse Timeline] Processing: {file_path}")
            with open(file_path, 'rb') as f:
                content = f.read()
            filename = os.path.basename(file_path)
        
        audio_data, sr = await AudioProcessor.load_audio_from_bytes(content)
        
        logger.info(f"  ├─ Loaded: {len(content) / (1024 * 1024):.2f}MB @ {sr}Hz")
        
        # 计算总时长
        duration_sec = len(audio_data) / sr
        logger.info(f"  ├─ Duration: {duration_sec:.2f}s | Window: {window_size}s | Step: {hop_length}s")
        
        # 计算窗口数量
        num_windows = 0
        current_time = 0.0
        
        pulse_clarity_timeline = []
        tempo_timeline = []
        tempo_confidence_timeline = []
        
        # 滑动窗口处理
        while current_time < duration_sec:
            start_sec = current_time
            end_sec = min(current_time + window_size, duration_sec)
            
            # 如果最后一个窗口太短，跳过
            if end_sec - start_sec < window_size * 0.5:
                break
            
            try:
                result = extract_tempo_and_pulse(
                    audio_data,
                    sr,
                    start_sec=start_sec,
                    end_sec=end_sec,
                    hop_length=512
                )
                
                pulse_clarity_timeline.append(result["pulse_clarity"])
                tempo_timeline.append(result["tempo_bpm"])
                tempo_confidence_timeline.append(result["tempo_confidence"])
                
                num_windows += 1
                
            except Exception as e:
                logger.warning(f"  ⚠️  Failed to process window {start_sec:.2f}s - {end_sec:.2f}s: {str(e)}")
                # 继续处理下一个窗口
            
            current_time += hop_length
        
        # 组织返回格式
        response = {
            "pulse_clarity_timeline": pulse_clarity_timeline,
            "tempo_timeline": tempo_timeline,
            "tempo_confidence_timeline": tempo_confidence_timeline,
            "window_size_sec": window_size,
            "hop_length_sec": hop_length,
            "duration_sec": duration_sec,
            "num_windows": num_windows,
            "metadata": {
                "filename": filename,
                "extraction_time_ms": int((time.time() - t_start) * 1000),
            }
        }
        
        response = sanitize_json(response)
        logger.info(
            f"✅ Timeline extraction complete | "
            f"Windows: {num_windows} | "
            f"Avg Pulse: {sum(pulse_clarity_timeline) / len(pulse_clarity_timeline) if pulse_clarity_timeline else 0:.3f} | "
            f"Time: {response['metadata']['extraction_time_ms']}ms"
        )
        
        return response
        
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"❌ Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Error extracting pulse clarity timeline: {str(e)}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
