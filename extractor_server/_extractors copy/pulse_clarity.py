"""
脉动清晰度 (Pulse Clarity) 提取器
"""

from typing import Any, Dict
import numpy as np
from numpy.typing import NDArray
import librosa
from .base import AudioExtractor
from config import PULSE_CLARITY_HOP_LENGTH


class PulseClarityExtractor(AudioExtractor):
    """
    脉动清晰度提取器
    通过分析起音检测曲线计算脉动规律的显著程度
    """

    async def extract(self, audio_data: NDArray[np.float32], sr: int) -> Dict[str, Any]:
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
                "pulse_clarity_timeline": [],
                "confidence": 0.0,
                "onset_strength": [],
                "onset_times": [],
                "max_tempogram": [],
                "tempogram_times": []
            }

        # 计算 Tempogram（通过 CQT 分解）
        # Tempogram 衡量不同时间尺度上的周期性
        tempogram = librosa.feature.tempogram(
            y=audio_data,
            sr=sr,
            hop_length=PULSE_CLARITY_HOP_LENGTH
        )

        # 脉动清晰度 = 最强周期性的相对强度
        # 取 tempogram 在每个时间帧的最大值
        max_tempogram_per_frame = np.max(tempogram, axis=0)

        # Min-Max 正规化（文献标准：保留相对动态）
        # 公式：PC_norm = (PC - Min) / (Max - Min)
        # 这样最强的拍子映射到 1，最弱的映射到 0，所有相对强弱变化都被保留
        min_val = np.min(max_tempogram_per_frame)
        max_val = np.max(max_tempogram_per_frame)

        if max_val - min_val > 1e-7:
            pulse_clarity_timeline = (
                max_tempogram_per_frame - min_val) / (max_val - min_val)
        else:
            pulse_clarity_timeline = np.zeros_like(max_tempogram_per_frame)

        # 步骤三：计算全域平均值（用于预测）
        pulse_clarity = float(np.mean(pulse_clarity_timeline))

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
            "pulse_clarity": pulse_clarity,  # 步骤三：全域平均值（用于预测）
            "pulse_clarity_timeline": pulse_clarity_timeline.tolist(),  # 步骤二：时序数据（用于即时验证）
            "confidence": float(np.mean(pulse_clarity_timeline)),
            "onset_strength": onset_strength.tolist(),
            "onset_times": onset_times,
            "max_tempogram": max_tempogram_per_frame.tolist(),
            "tempogram_times": tempogram_times
        }
