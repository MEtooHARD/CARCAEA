"""
调式 (Mode: 大调/小调) 提取器
"""

import numpy as np
import librosa
from .base import AudioExtractor
from config import MODE_CHROMA_TYPE, MODE_N_FFT, MODE_HOP_LENGTH


class ModeExtractor(AudioExtractor):
    """
    调式提取器
    通过色度图与大小调模板的交叉相关计算，返回 0(小调) 到 1(大调) 的连续值
    """

    # 12 个音级的大调和小调模板（基于 Krumhansl 的音乐理论）
    MAJOR_PROFILE = np.array([1.0, 0.0, 0.89, 0.0, 0.84, 1.0, 0.0, 1.0, 0.0, 0.79, 0.0, 0.86])
    MINOR_PROFILE = np.array([1.0, 0.0, 0.51, 1.0, 0.0, 0.84, 0.0, 1.0, 0.45, 0.0, 0.65, 0.0])

    async def extract(self, audio_data: np.ndarray, sr: int) -> dict:
        """
        提取调式

        Returns:
            {
                "mode": float (0-1, 0=小调, 1=大调),
                "confidence": float (0-1),
                "major_strength": float,
                "minor_strength": float,
                "chroma": list (12-dim per frame)
            }
        """
        self._validate_audio(audio_data)

        # 提取色度图 (Chroma features)
        if MODE_CHROMA_TYPE.lower() == "cqt":
            chroma = librosa.feature.chroma_cqt(
                y=audio_data, 
                sr=sr, 
                hop_length=MODE_HOP_LENGTH
            )
        else:  # stft
            chroma = librosa.feature.chroma_stft(
                y=audio_data, 
                sr=sr, 
                n_fft=MODE_N_FFT, 
                hop_length=MODE_HOP_LENGTH
            )

        if chroma.shape[1] == 0:
            return {
                "mode": 0.5,
                "confidence": 0.0,
                "mode_label": "unknown",
                "major_strength": 0.0,
                "minor_strength": 0.0,
                "chroma": []
            }

        # 计算平均色度向量
        chroma_mean = np.mean(chroma, axis=1)  # (12,)

        # 标准化色度向量
        chroma_mean = chroma_mean / (np.sum(chroma_mean) + 1e-7)

        # 与大调模板的相似度 (内积)
        major_strength = float(np.dot(chroma_mean, self.MAJOR_PROFILE))
        
        # 与小调模板的相似度
        minor_strength = float(np.dot(chroma_mean, self.MINOR_PROFILE))

        # 计算调式：1 = 完全大调, 0 = 完全小调
        total = major_strength + minor_strength
        mode_score = major_strength / (total + 1e-7) if total > 0 else 0.5

        # 置信度：两者强度差异越大，置信度越高
        confidence = float(abs(major_strength - minor_strength) / (total + 1e-7))

        # 时间轴
        times = librosa.frames_to_time(
            np.arange(chroma.shape[1]),
            sr=sr,
            hop_length=MODE_HOP_LENGTH
        ).tolist()

        mode_label = "major" if mode_score > 0.5 else "minor"

        return {
            "mode": mode_score,
            "mode_label": mode_label,
            "confidence": confidence,
            "major_strength": major_strength,
            "minor_strength": minor_strength,
            "chroma_mean": chroma_mean.tolist(),
            "chroma": chroma.tolist(),
            "times": times
        }
