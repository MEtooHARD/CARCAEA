"""
基础提取器抽象类
"""

from abc import ABC, abstractmethod
from typing import Any, Dict
import numpy as np
from numpy.typing import NDArray


class AudioExtractor(ABC):
    """所有特征提取器的基类"""

    @abstractmethod
    async def extract(self, audio_data: NDArray[np.float32], sr: int) -> Dict[str, Any]:
        """
        从音频数据中提取特征

        Args:
            audio_data: numpy 数组，音频时间序列
            sr: 采样率

        Returns:
            包含提取特征的字典
        """
        pass

    def _validate_audio(self, audio_data: NDArray[np.float32]) -> None:
        """验证音频数据"""
        if not isinstance(audio_data, np.ndarray):
            raise ValueError(f"Expected numpy array, got {type(audio_data)}")
        if len(audio_data) == 0:
            raise ValueError("Audio data is empty")
        if audio_data.ndim != 1:
            raise ValueError(
                f"Expected 1D audio array, got {audio_data.ndim}D")
