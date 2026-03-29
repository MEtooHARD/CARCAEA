"""
工具函数模块
"""

import io
import numpy as np
import librosa
import soundfile as sf
from config import DEFAULT_SAMPLE_RATE, AUDIO_MONO, MAX_UPLOAD_SIZE


class AudioProcessor:
    """音频处理工具类"""

    @staticmethod
    async def load_audio_from_bytes(
        audio_bytes: bytes,
        sr: int = DEFAULT_SAMPLE_RATE
    ) -> tuple[np.ndarray, int]:
        """
        从字节数据加载音频

        Args:
            audio_bytes: 音频文件的字节内容
            sr: 目标采样率（None 表示保留原采样率）

        Returns:
            (audio_data, sample_rate)
        """
        if len(audio_bytes) == 0:
            raise ValueError("Audio file is empty")

        if len(audio_bytes) > MAX_UPLOAD_SIZE:
            raise ValueError(f"Audio file size exceeds {MAX_UPLOAD_SIZE / 1024 / 1024:.1f}MB limit")

        try:
            # 使用 soundfile 读取
            audio_float, file_sr = sf.read(io.BytesIO(audio_bytes), dtype=np.float32)

            # 如果指定了采样率，则进行重采样
            if sr is not None and sr != file_sr:
                audio_float = librosa.resample(audio_float, orig_sr=file_sr, target_sr=sr)
                file_sr = sr

            # 转换为单声道
            if AUDIO_MONO and audio_float.ndim > 1:
                audio_float = librosa.to_mono(audio_float)

            return audio_float, file_sr

        except Exception as e:
            raise ValueError(f"Failed to load audio: {str(e)}")

    @staticmethod
    def validate_audio_data(audio_data: np.ndarray) -> bool:
        """验证音频数据有效性"""
        if not isinstance(audio_data, np.ndarray):
            return False
        if len(audio_data) == 0:
            return False
        if audio_data.ndim != 1:
            return False
        if np.all(audio_data == 0):
            return False
        return True
