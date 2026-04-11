"""
重採樣器：使用三次樣條插值統一時間軸
將多個不同 Hop Size 的特徵統一到 4Hz 採樣率
"""

from typing import List, Tuple
import numpy as np
from numpy.typing import NDArray
from scipy.interpolate import CubicSpline


class Resampler:
    """
    使用三次樣條插值 (Cubic Spline Interpolation) 
    將非均勻採樣的特徵重採樣到統一的 4Hz 時間軸
    """

    TARGET_HZ = 4.0  # 4Hz = 每秒 4 個點

    def __init__(self, duration_seconds: float):
        """
        Args:
            duration_seconds: 重採樣區間的時長（秒），通常為縮圖時長（例如 25 秒）
        """
        self.duration = duration_seconds
        # 建立目標時間軸：[0.0, 0.25, 0.50, 0.75, ..., duration)
        # 重要：移除 +1/TARGET_HZ 以確保長度正確
        # 例：30秒 @ 4Hz = 120個點（0.0, 0.25, ..., 29.75），不是121個
        self.target_times = np.arange(
            0, duration_seconds, 1/self.TARGET_HZ)
        self.target_length = len(self.target_times)

    def resample_envelope(
        self,
        values: NDArray[np.float32],
        original_times: NDArray[np.float32],
        allow_nan: bool = False
    ) -> NDArray[np.float32]:
        """
        使用三次樣條插值重採樣單一特徵時序

        Args:
            values: 原始特徵值 (num_frames,)
            original_times: 原始時間戳 (num_frames,)
            allow_nan: 是否允許輸入中有 NaN 值（F0 無聲區間會是 0 或 NaN）

        Returns:
            重採樣至 4Hz 的特徵值 (target_length,)
        """

        # 處理空輸入
        if len(values) == 0:
            return np.zeros(self.target_length, dtype=np.float32)

        # 移除邊界外的時間點
        valid_mask = (original_times >= 0) & (original_times <= self.duration)
        valid_times = original_times[valid_mask]
        valid_values = values[valid_mask]

        if len(valid_times) == 0:
            return np.zeros(self.target_length, dtype=np.float32)

        # 處理 F0 等可能有無聲區間的特徵（值為 0）
        if allow_nan:
            # F0 的特殊處理：移除 0 值（表示無聲）作為控制點
            non_zero_mask = valid_values != 0.0
            if np.sum(non_zero_mask) > 1:
                cs_times = valid_times[non_zero_mask]
                cs_values = valid_values[non_zero_mask]
            else:
                # 如果沒有足夠的非零點，使用所有點
                cs_times = valid_times
                cs_values = valid_values
        else:
            cs_times = valid_times
            cs_values = valid_values

        # 邊界條件檢查
        if len(cs_times) < 2:
            # 如果只有 1 個或 0 個點，回傳常數填充
            return np.full(self.target_length, float(cs_values[0] if len(cs_values) > 0 else 0.0), dtype=np.float32)

        # 建立三次樣條
        try:
            cs = CubicSpline(cs_times, cs_values, bc_type='natural')
        except Exception:
            # 如果插值失敗，回傳線性插值
            return np.interp(self.target_times, cs_times, cs_values).astype(np.float32)

        # 在目標時間軸上評估樣條
        resampled = cs(self.target_times).astype(np.float32)

        # 確保輸出大小正確
        if len(resampled) != self.target_length:
            resampled = np.interp(self.target_times, self.target_times[:len(
                resampled)], resampled).astype(np.float32)

        return resampled

    def resample_three_envelopes(
        self,
        music_envelope: NDArray[np.float32],
        music_times: NDArray[np.float32],
        f0_envelope: NDArray[np.float32],
        f0_times: NDArray[np.float32],
        loudness_envelope: NDArray[np.float32],
        loudness_times: NDArray[np.float32]
    ) -> Tuple[NDArray[np.float32], NDArray[np.float32], NDArray[np.float32]]:
        """
        同時重採樣三條欄位到 4Hz

        Args:
            music_envelope: 音樂包絡線值
            music_times: 音樂包絡線時間戳
            f0_envelope: 基頻包絡線值
            f0_times: 基頻包絡線時間戳
            loudness_envelope: 響度包絡線值
            loudness_times: 響度包絡線時間戳

        Returns:
            (resampled_music, resampled_f0, resampled_loudness) - 各 (target_length,)
        """

        music_resampled = self.resample_envelope(
            music_envelope, music_times, allow_nan=False)
        f0_resampled = self.resample_envelope(
            f0_envelope, f0_times, allow_nan=True)
        loudness_resampled = self.resample_envelope(
            loudness_envelope, loudness_times, allow_nan=False)

        return music_resampled, f0_resampled, loudness_resampled

    def get_target_times(self) -> NDArray[np.float32]:
        """回傳 4Hz 目標時間軸"""
        return self.target_times.astype(np.float32)
