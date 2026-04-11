"""
调式 (Mode: 大调/小调) 提取器
"""

from typing import Any, Dict
import numpy as np
from numpy.typing import NDArray
import librosa
from .base import AudioExtractor
from config import MODE_CHROMA_TYPE, MODE_N_FFT, MODE_HOP_LENGTH


class ModeExtractor(AudioExtractor):
    """
    调式提取器
    通过色度图与大小调模板的交叉相关计算，返回 0(小调) 到 1(大调) 的连续值
    """

    # 12 个音级的大调和小调模板（基于 Krumhansl 的音乐理论）
    MAJOR_PROFILE = np.array(
        [1.0, 0.0, 0.89, 0.0, 0.84, 1.0, 0.0, 1.0, 0.0, 0.79, 0.0, 0.86])
    MINOR_PROFILE = np.array(
        [1.0, 0.0, 0.51, 1.0, 0.0, 0.84, 0.0, 1.0, 0.45, 0.0, 0.65, 0.0])

    async def extract(self, audio_data: NDArray[np.float32], sr: int) -> Dict[str, Any]:
        """
        提取调式

        Returns:
            {
                "mode": float (0-1, 0=小调, 1=大调),
                "mode_label": str ("major" 或 "minor"),
                "confidence": float (0-1),
                "major_strength": float (全域平均),
                "minor_strength": float (全域平均),
                "major_strength_timeline": list[float] (每帧 0-1),
                "mean_major_strength": float (所有帧的平均),
                "chroma_mean": list (12-dim),
                "chroma": list (12-dim per frame),
                "times": list (时间戳)
            }
        """
        self._validate_audio(audio_data)

        # 提取色度图 (Chroma features)
        if MODE_CHROMA_TYPE.lower() == "cqt":
            chroma = librosa.feature.chroma_cqt(  # type: ignore
                y=audio_data,
                sr=sr,
                hop_length=MODE_HOP_LENGTH
            )
        else:  # stft
            chroma = librosa.feature.chroma_stft(  # type: ignore
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
                "major_strength_timeline": [],
                "mean_major_strength": 0.0,
                "chroma": []
            }

        # 计算平均色度向量
        chroma_mean = np.mean(chroma, axis=1)  # type: ignore  # (12,)

        # L2-norm 正规化色度向量（文献标准：消除音量干扰）
        # 确保无论小声弹奏还是大声弹奏，同样的和弦具有相同权重
        norm_val = np.linalg.norm(chroma_mean)
        chroma_mean = chroma_mean / (norm_val + 1e-7)

        # 与大调模板的相似度 (内积) - 全域平均
        major_strength = float(np.dot(chroma_mean, self.MAJOR_PROFILE))

        # 与小调模板的相似度 - 全域平均
        minor_strength = float(np.dot(chroma_mean, self.MINOR_PROFILE))

        # 计算调式：1 = 完全大调, 0 = 完全小调
        total = major_strength + minor_strength
        mode_score = major_strength / (total + 1e-7) if total > 0 else 0.5

        # 置信度：两者强度差异越大，置信度越高
        confidence = float(
            abs(major_strength - minor_strength) / (total + 1e-7))

        # 计算每帧的 major_strength_timeline（0-1 的归一化分数）
        major_strength_timeline = []
        for frame_idx in range(chroma.shape[1]):
            frame_chroma = chroma[:, frame_idx]  # type: ignore
            # L2-norm 正规化
            frame_norm = np.linalg.norm(frame_chroma)
            frame_chroma_normalized = frame_chroma / (frame_norm + 1e-7)

            # 与模板的相似度
            frame_major = float(
                np.dot(frame_chroma_normalized, self.MAJOR_PROFILE))
            frame_minor = float(
                np.dot(frame_chroma_normalized, self.MINOR_PROFILE))

            # 归一化到 0-1
            frame_total = frame_major + frame_minor
            frame_major_strength = frame_major / \
                (frame_total + 1e-7) if frame_total > 0 else 0.5
            major_strength_timeline.append(frame_major_strength)

        # 时间轴
        times = librosa.frames_to_time(  # type: ignore
            np.arange(chroma.shape[1]),
            sr=sr,
            hop_length=MODE_HOP_LENGTH
        ).tolist()

        mode_label = "major" if mode_score > 0.5 else "minor"
        mean_major_strength = float(np.mean(major_strength_timeline))

        return {
            "mode": mode_score,
            "mode_label": mode_label,
            "confidence": confidence,
            "major_strength": major_strength,
            "minor_strength": minor_strength,
            "major_strength_timeline": major_strength_timeline,
            "mean_major_strength": mean_major_strength,
            "chroma_mean": chroma_mean.tolist(),
            "chroma": chroma.tolist(),
            "times": times
        }
