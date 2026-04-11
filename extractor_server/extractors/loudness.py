"""
响度与音乐包络线 (Loudness / Music Envelope) 提取器
"""

import numpy as np
from numpy.typing import NDArray
import librosa
from scipy import signal
from scipy import stats
from typing import cast, Tuple, Any, Dict
from .base import AudioExtractor
from config import LOUDNESS_HOP_LENGTH, LOUDNESS_FILTER_ORDER, LOUDNESS_CUTOFF_FREQ


class LoudnessExtractor(AudioExtractor):
    """
    响度与音乐包络线提取器
    通过计算 RMS 能量并应用低通滤波来获取平滑的音量包络线
    """

    async def extract(self, audio_data: NDArray[np.float32], sr: int) -> Dict[str, Any]:
        """
        提取响度与音乐包络线

        Returns:
            {
                "loudness_rms": list (每帧 RMS 能量),
                "loudness_envelope": list (低通滤波后的平滑包络），
                "loudness_db": list (dB 单位),
                "mean_loudness_db": float,
                "peak_loudness_db": float,
                "times": list
            }
        """
        self._validate_audio(audio_data)

        # 计算 RMS 能量
        rms = librosa.feature.rms(
            y=audio_data,
            hop_length=LOUDNESS_HOP_LENGTH
        )[0]  # (n_frames,)

        if len(rms) == 0:
            return {
                "loudness_rms": [],
                "loudness_envelope": [],
                "loudness_db": [],
                "mean_loudness_db": 0.0,
                "peak_loudness_db": 0.0,
                "times": []
            }

        # 转换为 dB 单位 (相对于最大可能值)
        loudness_db = 20 * np.log10(np.maximum(rms, 1e-5))
        loudness_db = loudness_db - np.max(loudness_db)  # 归一化到最大值为 0 dB

        # 低通滤波以获得平滑的包络线
        # 设计 Butterworth 低通滤波器
        nyquist_freq = sr / (2 * LOUDNESS_HOP_LENGTH)  # 时间域中的奈奎斯特频率

        if nyquist_freq == 0:
            envelope = rms
            envelope_db = loudness_db
        else:
            # 归一化截止频率 (0 < wn < 1)
            normalized_cutoff = min(LOUDNESS_CUTOFF_FREQ / nyquist_freq, 0.99)

            if normalized_cutoff > 0:
                b_coeff, a_coeff = cast(Tuple[np.ndarray, np.ndarray], signal.butter(
                    LOUDNESS_FILTER_ORDER,
                    normalized_cutoff,
                    btype='low',
                    output='ba'
                ))
                envelope = signal.filtfilt(b_coeff, a_coeff, rms)
                envelope_db = signal.filtfilt(b_coeff, a_coeff, loudness_db)
            else:
                envelope = rms
                envelope_db = loudness_db

        # 计算统计信息
        mean_loudness_db = float(np.mean(loudness_db))
        peak_loudness_db = float(np.max(loudness_db))
        min_loudness_db = float(np.min(loudness_db))
        mode_loudness_db = float(stats.mode(
            loudness_db, keepdims=True).mode[0])

        # 时间轴
        times = librosa.frames_to_time(
            np.arange(len(rms)),
            sr=sr,
            hop_length=LOUDNESS_HOP_LENGTH
        ).tolist()

        return {
            "loudness_rms": rms.tolist(),
            "loudness_db": loudness_db.tolist(),
            "loudness_envelope": envelope.tolist(),
            "loudness_envelope_db": envelope_db.tolist(),
            "mean_loudness_db": mean_loudness_db,
            "mode_loudness_db": mode_loudness_db,
            "peak_loudness_db": peak_loudness_db,
            "min_loudness_db": min_loudness_db,
            "dynamic_range_db": peak_loudness_db - min_loudness_db,
            "times": times
        }
