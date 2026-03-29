"""
脉动清晰度 (Pulse Clarity) 提取器
"""

import numpy as np
import librosa
from .base import AudioExtractor
from config import PULSE_CLARITY_HOP_LENGTH


class PulseClarityExtractor(AudioExtractor):
    """
    脉动清晰度提取器
    通过分析起音检测曲线计算脉动规律的显著程度
    """

    async def extract(self, audio_data: np.ndarray, sr: int) -> dict:
        """
        提取脉动清晰度

        Returns:
            {
                "pulse_clarity": float (0-1),
                "onset_strength": list,
                "tempogram": list,
                "tempo_estimate": float (BPM)
            }
        """
        self._validate_audio(audio_data)

        # 计算起音强度
        onset_strength = librosa.onset.onset_strength(
            y=audio_data, 
            sr=sr, 
            hop_length=PULSE_CLARITY_HOP_LENGTH
        )

        if len(onset_strength) == 0:
            return {
                "pulse_clarity": 0.0,
                "confidence": 0.0,
                "onset_strength": [],
                "onset_times": []
            }

        # 计算 Tempogram（通过 CQT 分解）
        # Tempogram 衡量不同时间尺度上的周期性
        tempogram = librosa.feature.tempogram(
            y=audio_data,
            sr=sr,
            hop_length=PULSE_CLARITY_HOP_LENGTH
        )

        # 脉动清晰度 = 最强周期性的相对强度
        # 取 tempogram 在每个时间帧的最大值，然后计算其均值和标准差
        max_tempogram_per_frame = np.max(tempogram, axis=0)
        pulse_clarity = float(np.std(max_tempogram_per_frame) / (np.mean(max_tempogram_per_frame) + 1e-7))
        
        # 归一化到 [0, 1]
        pulse_clarity = np.clip(pulse_clarity, 0, 1)

        # 计算时间轴
        hop_length = PULSE_CLARITY_HOP_LENGTH
        onset_times = librosa.frames_to_time(
            np.arange(len(onset_strength)),
            sr=sr,
            hop_length=hop_length
        ).tolist()

        tempogram_times = librosa.frames_to_time(
            np.arange(tempogram.shape[1]),
            sr=sr,
            hop_length=hop_length
        ).tolist()

        return {
            "pulse_clarity": pulse_clarity,
            "confidence": float(np.mean(max_tempogram_per_frame)),
            "onset_strength": onset_strength.tolist(),
            "onset_times": onset_times,
            "max_tempogram": max_tempogram_per_frame.tolist(),
            "tempogram_times": tempogram_times
        }
