"""
路由层
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from utils import AudioProcessor
from extractors.pulse_clarity import PulseClarityExtractor
from extractors.mode import ModeExtractor
from extractors.tempo import TempoExtractor
from extractors.loudness import LoudnessExtractor
from extractors.f0_envelope import F0EnvelopeExtractor
from schemas import (
    PulseClarityResponse,
    ModeResponse,
    TempoResponse,
    LoudnessResponse,
    F0EnvelopeResponse,
    ErrorResponse
)
import logging

logger = logging.getLogger(__name__)

# 创建路由
router = APIRouter(prefix="/extract", tags=["feature extraction"])

# 初始化提取器
pulse_clarity_extractor = PulseClarityExtractor()
mode_extractor = ModeExtractor()
tempo_extractor = TempoExtractor()
loudness_extractor = LoudnessExtractor()
f0_envelope_extractor = F0EnvelopeExtractor()


@router.post("/pulse-clarity", response_model=PulseClarityResponse)
async def extract_pulse_clarity(file: UploadFile = File(...)):
    """
    提取脉动清晰度 (Pulse Clarity)

    通过分析起音检测曲线，估算节拍的强度与规律脉动的显著程度。

    - **file**: WAV、MP3、FLAC 或 OGG 音频文件
    - **返回**: 脉动清晰度值 (0-1) 及相关信息
    """
    try:
        content = await file.read()
        audio_data, sr = await AudioProcessor.load_audio_from_bytes(content)
        result = await pulse_clarity_extractor.extract(audio_data, sr)
        return PulseClarityResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error extracting pulse clarity: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/mode", response_model=ModeResponse)
async def extract_mode(file: UploadFile = File(...)):
    """
    提取调式 (Mode: 大调/小调)

    通过色度图与大小调模板的交叉相关计算，判断音乐的调式。

    - **file**: WAV、MP3、FLAC 或 OGG 音频文件
    - **返回**: 调式值 (0=小调, 1=大调) 及相关信息
    """
    try:
        content = await file.read()
        audio_data, sr = await AudioProcessor.load_audio_from_bytes(content)
        result = await mode_extractor.extract(audio_data, sr)
        return ModeResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error extracting mode: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/tempo", response_model=TempoResponse)
async def extract_tempo(file: UploadFile = File(...)):
    """
    提取节奏速度 (Tempo / BPM)

    通过分析起音曲线中的周期性估算音乐的 BPM。

    - **file**: WAV、MP3、FLAC 或 OGG 音频文件
    - **返回**: BPM 值及节拍信息
    """
    try:
        content = await file.read()
        audio_data, sr = await AudioProcessor.load_audio_from_bytes(content)
        result = await tempo_extractor.extract(audio_data, sr)
        return TempoResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error extracting tempo: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/loudness", response_model=LoudnessResponse)
async def extract_loudness(file: UploadFile = File(...)):
    """
    提取响度与音乐包络线 (Loudness / Music Envelope)

    计算 RMS 能量并应用低通滤波以获得平滑的音量包络线。

    - **file**: WAV、MP3、FLAC 或 OGG 音频文件
    - **返回**: RMS 能量、包络线及相关统计信息
    """
    try:
        content = await file.read()
        audio_data, sr = await AudioProcessor.load_audio_from_bytes(content)
        result = await loudness_extractor.extract(audio_data, sr)
        return LoudnessResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error extracting loudness: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/f0-envelope", response_model=F0EnvelopeResponse)
async def extract_f0_envelope(file: UploadFile = File(...)):
    """
    提取基频包络线 (F0 Envelope / Pitch Contour)

    使用 PYIN 算法估计基频的时间轨迹，用于分析旋律起伏。

    - **file**: WAV、MP3、FLAC 或 OGG 音频文件
    - **返回**: 基频值、置信度及有声/无声标记
    """
    try:
        content = await file.read()
        audio_data, sr = await AudioProcessor.load_audio_from_bytes(content)
        result = await f0_envelope_extractor.extract(audio_data, sr)
        return F0EnvelopeResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error extracting f0 envelope: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
