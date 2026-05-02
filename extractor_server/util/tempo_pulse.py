"""
Tempo 和 Pulse Clarity 計算模組

基於 Onset Detection Curve 計算：
- Tempo: 曲線中的週期性 → BPM
- Pulse Clarity: 自相關峰值 → [0, 1] 清晰度指標
"""

import numpy as np
import librosa
from scipy import signal
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# 核心計算函數
# ============================================================================

def compute_onset_strength(audio: np.ndarray, sr: int, hop_length: int = 512) -> np.ndarray:
    """
    計算 Onset Strength Curve（起始強度曲線）
    
    Args:
        audio: 單聲道音訊 [samples]
        sr: 採樣率 (Hz)
        hop_length: hop 長度 (samples)
    
    Returns:
        onset_env: Onset Strength Curve [frames]
    """
    onset_env = librosa.onset.onset_strength(y=audio, sr=sr, hop_length=hop_length)
    return onset_env


def extract_tempo(onset_env: np.ndarray, sr: int, hop_length: int = 512) -> tuple[float, float]:
    """
    從 Onset Strength Curve 提取 Tempo
    
    Args:
        onset_env: Onset Strength Curve [frames]
        sr: 採樣率 (Hz)
        hop_length: hop 長度 (samples)
    
    Returns:
        (tempo_bpm, tempo_confidence): BPM 和其自信度權重 [0, 1]
    """
    try:
        # librosa.feature.tempo() 返回單個 BPM 值
        tempo_bpm = librosa.feature.tempo(onset_envelope=onset_env, sr=sr, hop_length=hop_length)
        
        # 確保是標量
        if isinstance(tempo_bpm, np.ndarray):
            tempo_bpm = float(tempo_bpm[0]) if len(tempo_bpm) > 0 else 0.0
        else:
            tempo_bpm = float(tempo_bpm)
        
        # 計算置信度：基於 onset_env 的自相關峰值
        # 標準化
        onset_normalized = onset_env / (np.max(np.abs(onset_env)) + 1e-10)
        autocorr = np.correlate(onset_normalized, onset_normalized, mode='full')
        center = len(autocorr) // 2
        autocorr_positive = autocorr[center:]
        autocorr_normalized = autocorr_positive / (autocorr_positive[0] + 1e-10)
        
        # 尋找對應的週期
        if tempo_bpm > 0:
            frame_rate = sr / hop_length
            period_frames = int(60 * frame_rate / tempo_bpm)
            
            if 0 < period_frames < len(autocorr_normalized):
                tempo_confidence = float(autocorr_normalized[period_frames])
            else:
                tempo_confidence = float(np.max(autocorr_normalized[1:]) if len(autocorr_normalized) > 1 else 0.0)
        else:
            tempo_confidence = 0.0
        
        return float(tempo_bpm), float(np.clip(tempo_confidence, 0.0, 1.0))
        
    except Exception as e:
        logger.error(f"Error extracting tempo: {str(e)}")
        return 0.0, 0.0


def compute_pulse_clarity(onset_env: np.ndarray, sr: int, hop_length: int = 512) -> float:
    """
    計算 Pulse Clarity（節拍清晰度）
    
    基於自相關運算：
    - 對 onset_env 做自相關
    - 提取主週期對應的峰值
    - 歸一化為 [0, 1]
    
    Args:
        onset_env: Onset Strength Curve [frames]
        sr: 採樣率 (Hz)
        hop_length: hop 長度 (samples)
    
    Returns:
        pulse_clarity: [0, 1] 清晰度指標
    """
    # 標準化 onset_env
    onset_env = onset_env / (np.max(np.abs(onset_env)) + 1e-10)
    
    # 計算自相關（只需要正延遲，lag >= 1）
    autocorr = np.correlate(onset_env, onset_env, mode='full')
    
    # 提取正延遲部分
    center = len(autocorr) // 2
    autocorr_positive = autocorr[center:]  # lag = 0, 1, 2, ...
    
    # 正規化：autcorr[0] 是最大值
    autocorr_normalized = autocorr_positive / (autocorr_positive[0] + 1e-10)
    
    # 尋找主週期峰值（跳過 lag=0）
    # 合理的週期範圍：30 ~ 300 BPM @ 4Hz (hop_length=512, sr=22050)
    # Frame rate = sr / hop_length = 22050 / 512 ≈ 43 frames/sec
    # 30 BPM = 0.5 Hz → 周期 = 2 sec = 86 frames
    # 300 BPM = 5 Hz → 周期 = 0.2 sec = 8.6 frames
    
    frame_rate = sr / hop_length
    min_period_frames = int(frame_rate * 60 / 300)  # 300 BPM 對應的最小週期
    max_period_frames = int(frame_rate * 60 / 30)   # 30 BPM 對應的最大週期
    
    if max_period_frames >= len(autocorr_normalized):
        max_period_frames = len(autocorr_normalized) - 1
    
    # 在有效週期範圍內搜尋峰值
    search_range = autocorr_normalized[min_period_frames:max_period_frames + 1]
    
    if len(search_range) == 0:
        return 0.0
    
    pulse_clarity = float(np.max(search_range))
    
    return np.clip(pulse_clarity, 0.0, 1.0)


def extract_tempo_and_pulse(
    audio: np.ndarray,
    sr: int,
    start_sec: float = None,
    end_sec: float = None,
    hop_length: int = 512
) -> dict:
    """
    完整流程：計算 Tempo 和 Pulse Clarity
    
    Args:
        audio: 單聲道音訊 [samples] 或 多聲道 [channels, samples]
        sr: 採樣率 (Hz)
        start_sec: 開始時間 (秒)，None 表示從頭開始
        end_sec: 結束時間 (秒)，None 表示到尾
        hop_length: hop 長度 (samples)
    
    Returns:
        {
            'tempo_bpm': float,
            'tempo_confidence': float [0, 1],
            'pulse_clarity': float [0, 1],
            'duration_sec': float,
            'hop_length': int
        }
    """
    # 轉單聲道
    if audio.ndim > 1:
        audio_mono = np.mean(audio, axis=0).astype(np.float32)
    else:
        audio_mono = audio.astype(np.float32)
    
    # 截取時間段
    if start_sec is not None or end_sec is not None:
        start_sample = int((start_sec or 0) * sr)
        end_sample = int((end_sec or len(audio_mono) / sr) * sr)
        end_sample = min(end_sample, len(audio_mono))
        audio_segment = audio_mono[start_sample:end_sample]
        duration_sec = (end_sample - start_sample) / sr
    else:
        audio_segment = audio_mono
        duration_sec = len(audio_mono) / sr
    
    logger.debug(f"Extracted segment: {duration_sec:.2f}s")
    
    # [1] 计算 Onset Strength Curve
    onset_env = compute_onset_strength(audio_segment, sr, hop_length)
    logger.debug(f"Onset curve length: {len(onset_env)} frames")
    
    # [2] 提取 Tempo
    tempo_bpm, tempo_confidence = extract_tempo(onset_env, sr, hop_length)
    logger.debug(f"Tempo: {tempo_bpm:.1f} BPM (confidence: {tempo_confidence:.3f})")
    
    # [3] 计算 Pulse Clarity
    pulse_clarity = compute_pulse_clarity(onset_env, sr, hop_length)
    logger.debug(f"Pulse Clarity: {pulse_clarity:.3f}")
    
    return {
        'tempo_bpm': float(tempo_bpm),
        'tempo_confidence': float(tempo_confidence),
        'pulse_clarity': float(pulse_clarity),
        'duration_sec': float(duration_sec),
        'hop_length': int(hop_length)
    }
