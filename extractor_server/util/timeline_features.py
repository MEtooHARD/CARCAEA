"""
原始特徵 Timeline 提取管線
低級特徵提取 (Loudness, Chroma) + 時間軸對齊 + 重採樣
"""

import numpy as np
import librosa
import math
from numpy.typing import NDArray
from scipy import signal
from config import LOUDNESS_HOP_LENGTH, LOUDNESS_FILTER_ORDER, LOUDNESS_CUTOFF_FREQ


def sanitize_json(obj):
    """
    遞迴清理 JSON 中的無效值（NaN、Infinity 等）
    
    Args:
        obj: 待清理的物件（dict, list, float 等）
    
    Returns:
        清理後的物件，所有 NaN/Inf 值被替換為 0.0
    """
    if isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_json(item) for item in obj]
    elif isinstance(obj, (np.ndarray, np.generic)):
        # 轉換 numpy 類型為 Python 原生類型
        if isinstance(obj, np.ndarray):
            return [sanitize_json(item) for item in obj.tolist()]
        else:
            val = float(obj)
            if math.isnan(val):
                return 0.0
            elif math.isinf(val):
                return 0.0 if val > 0 else 0.0
            else:
                return val
    elif isinstance(obj, float):
        if math.isnan(obj):
            return 0.0
        elif math.isinf(obj):
            return 0.0
        else:
            return obj
    else:
        return obj


async def extract_loudness_timeline(audio_mono: NDArray[np.float32], sr: int, hop_length: int = 512):
    """
    【步驟 1】提取響度 Timeline（對數 dB）
    
    處理流程：
    - librosa.feature.rms() → 原始 RMS（線性值）
    - 轉換 dB + Butterworth 低通濾波 → 平滑響度（dB）
    - 計算時間軸（frames → 秒）
    
    Args:
        audio_mono: 單聲道音訊，shape (n_samples,)
        sr: 採樣率 (Hz)
        hop_length: FFT hop length（預設 512）
    
    Returns:
        loudness: dB 值，shape (n_frames,)，dtype float32
        times: 秒數，shape (n_frames,)，dtype float32
        hop_length: 用於時間軸計算
    """
    # 計算 RMS 能量
    rms = librosa.feature.rms(y=audio_mono, hop_length=hop_length)[0]
    
    if len(rms) == 0:
        raise ValueError("No audio frames extracted from loudness calculation")
    
    # 轉換為 dB 單位 (相對於最大值)
    loudness_db = 20 * np.log10(np.maximum(rms, 1e-5))
    loudness_db = loudness_db - np.max(loudness_db)  # 歸一化到最大值為 0 dB
    
    # 低通濾波以獲得平滑的包絡線
    nyquist_freq = sr / (2 * hop_length)
    if nyquist_freq > 0:
        normalized_cutoff = min(LOUDNESS_CUTOFF_FREQ / nyquist_freq, 0.99)
        if normalized_cutoff > 0:
            b_coeff, a_coeff = signal.butter(
                LOUDNESS_FILTER_ORDER,
                normalized_cutoff,
                btype='low',
                output='ba'
            )
            loudness_db = signal.filtfilt(b_coeff, a_coeff, loudness_db)
    
    # 計算時間軸
    times = librosa.frames_to_time(
        np.arange(len(rms)),
        sr=sr,
        hop_length=hop_length
    )
    
    return loudness_db.astype(np.float32), times.astype(np.float32), hop_length


async def extract_chroma_features(audio_mono: NDArray[np.float32], sr: int, hop_length: int = 512):
    """
    【步驟 2】提取 Chroma 矩陣 + Chroma 通量
    
    處理流程：
    - librosa.feature.chroma_cqt() → 原始 12 維 chroma 矩陣
    - 歸一化（L2 norm）
    - 計算相鄰幀的歐氏距離 → Chroma Flux
    
    Args:
        audio_mono: 單聲道音訊，shape (n_samples,)
        sr: 採樣率 (Hz)
        hop_length: FFT hop length（預設 512）
    
    Returns:
        chroma_matrix: shape (n_frames, 12)，每行是一個時刻的 12D 向量，dtype float32
        chroma_flux: shape (n_frames,)，相鄰幀距離，dtype float32
        times: shape (n_frames,)，dtype float32
        hop_length: 用於時間軸計算
    """
    # 提取 Chroma 特徵
    chroma = librosa.feature.chroma_cqt(
        y=audio_mono,
        sr=sr,
        hop_length=hop_length,
        bins_per_octave=12,
        n_octaves=7
    )  # shape (12, n_frames)
    
    # 歸一化 (L2 norm)
    chroma_norm = np.sqrt(np.sum(chroma ** 2, axis=0, keepdims=True))
    chroma_norm = np.maximum(chroma_norm, 1e-10)
    chroma = chroma / chroma_norm  # shape (12, n_frames)
    
    # 轉置為 (n_frames, 12) 供 JSON 序列化
    chroma_matrix = chroma.T.astype(np.float32)  # shape (n_frames, 12)
    
    # 計算 Chroma Flux（相鄰幀的歐氏距離）
    frame_diffs = np.diff(chroma, axis=1)  # shape (12, n_frames-1)
    chroma_flux = np.sqrt(np.sum(frame_diffs ** 2, axis=0))  # shape (n_frames-1,)
    chroma_flux = np.insert(chroma_flux, 0, 0.0)  # 在前插入 0，shape (n_frames,)
    chroma_flux = chroma_flux.astype(np.float32)
    
    # 計算時間軸
    times = librosa.frames_to_time(
        np.arange(chroma.shape[1]),
        sr=sr,
        hop_length=hop_length
    )
    
    return chroma_matrix, chroma_flux, times.astype(np.float32), hop_length


async def align_and_resample_timelines(
    loudness: NDArray[np.float32],
    chroma_matrix: NDArray[np.float32],
    chroma_flux: NDArray[np.float32],
    times: NDArray[np.float32],
    sr: int,
    hop_length: int,
    target_hz: float = 4.0
):
    """
    【步驟 3-4】時間軸對齊 + 重採樣到 4Hz
    
    對齊流程：
    1. 所有特徵已使用相同 hop_length → 幀數相同
    2. 計算有效時長（基於幀數和採樣率）
    3. 使用三次樣條插值重採樣到 4Hz
    
    Args:
        loudness: shape (n_frames,)
        chroma_matrix: shape (n_frames, 12)
        chroma_flux: shape (n_frames,)
        times: shape (n_frames,)，時間軸（秒）
        sr: 採樣率
        hop_length: 原始特徵的 hop length
        target_hz: 目標採樣率（預設 4.0Hz）
    
    Returns:
        dict: 包含所有 4Hz 採樣的 timeline
              - loudness: shape (n_points,)
              - chroma_matrix: shape (n_points, 12)
              - chroma_flux: shape (n_points,)
              - duration_sec: 時長（秒）
              - n_points: 時間點數
              - target_hz: 目標採樣率
    """
    from extractors.resampler import Resampler
    
    # 驗證長度一致性
    n_frames = len(loudness)
    assert len(chroma_matrix) == n_frames, "Chroma matrix length mismatch"
    assert len(chroma_flux) == n_frames, "Chroma flux length mismatch"
    assert len(times) == n_frames, "Times array length mismatch"
    
    # 計算時長（秒）
    duration_sec = float(times[-1])
    
    # 初始化重採樣器
    resampler = Resampler(duration_seconds=duration_sec)
    
    # 重採樣各個 timeline
    loudness_4hz = resampler.resample_envelope(loudness, times)
    chroma_flux_4hz = resampler.resample_envelope(chroma_flux, times)
    
    # Chroma 矩陣重採樣（逐個維度）
    chroma_matrix_4hz = []
    for dim in range(chroma_matrix.shape[1]):  # 12 個維度
        chroma_dim = chroma_matrix[:, dim]
        chroma_dim_4hz = resampler.resample_envelope(chroma_dim, times)
        chroma_matrix_4hz.append(chroma_dim_4hz)
    
    # 轉置回 (n_points, 12)
    chroma_matrix_4hz = np.array(chroma_matrix_4hz, dtype=np.float32).T
    
    return {
        "loudness": loudness_4hz,
        "chroma_matrix": chroma_matrix_4hz,  # shape (n_points, 12)
        "chroma_flux": chroma_flux_4hz,
        "duration_sec": duration_sec,
        "n_points": len(loudness_4hz),
        "target_hz": target_hz
    }
