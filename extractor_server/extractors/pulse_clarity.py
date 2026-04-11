"""
脉动清晰度 (Pulse Clarity) 提取器
"""

from typing import Any, Dict
import numpy as np
from numpy.typing import NDArray
import librosa
from .base import AudioExtractor
from config import PULSE_CLARITY_HOP_LENGTH
import sys
import logging

logger = logging.getLogger(__name__)


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

        logger.info(f"\n[PulseClarity] 📊 TEMPOGRAM 分析開始")
        logger.info(f"[PulseClarity] 🔍 Tempogram shape: {tempogram.shape}")
        logger.info(
            f"[PulseClarity] 🔍 Tempogram value range: [{np.min(tempogram):.6f}, {np.max(tempogram):.6f}]")
        logger.info(
            f"[PulseClarity] 🔍 Tempogram mean: {np.mean(tempogram):.6f}")
        logger.info(
            f"[PulseClarity] 🔍 Tempogram first column (all freqs): {tempogram[:, 0]}")
        logger.info(
            f"[PulseClarity] 🔍 Tempogram first 3 rows, first 5 cols:\n{tempogram[:3, :5]}")
        sys.stdout.flush()

        # ============================================================
        # 🚀 終極修復：PULSE CLARITY 的 MIR 標準算法 (Lartillot et al.)
        # ============================================================
        # 排除 Tempogram 的零延遲 (Lag-0 永遠是 1.0) 與超高頻噪音區段
        # 前 10 個 bin 代表極短延遲 (>250 BPM，非人類音樂節拍)

        IGNORE_BINS = 10
        valid_tempogram = tempogram[IGNORE_BINS:, :]

        logger.info(
            f"\n[PulseClarity] 📊 VALID_TEMPOGRAM (IGNORE_BINS={IGNORE_BINS})")
        logger.info(f"[PulseClarity] Shape: {valid_tempogram.shape}")
        logger.info(
            f"[PulseClarity] Value range: [{np.min(valid_tempogram):.6f}, {np.max(valid_tempogram):.6f}]")
        logger.info(f"[PulseClarity] Mean: {np.mean(valid_tempogram):.6f}")
        logger.info(f"[PulseClarity] First column: {valid_tempogram[:5, 0]}")
        sys.stdout.flush()

        # 對每一個時間點，找出自我相關性的最大值（合理BPM區間內最強的週期性）
        pulse_clarity_timeline = np.max(valid_tempogram, axis=0)

        logger.info(
            f"\n[PulseClarity] 📊 PULSE_CLARITY_TIMELINE (max per frame)")
        logger.info(f"[PulseClarity] Shape: {pulse_clarity_timeline.shape}")
        logger.info(
            f"[PulseClarity] Range: [{np.min(pulse_clarity_timeline):.6f}, {np.max(pulse_clarity_timeline):.6f}]")
        logger.info(
            f"[PulseClarity] Mean (before clipping): {np.mean(pulse_clarity_timeline):.6f}")
        logger.info(
            f"[PulseClarity] First 10 values: {pulse_clarity_timeline[:10]}")
        sys.stdout.flush()

        # 確保數值界於 0 到 1 之間
        pulse_clarity_timeline = np.clip(pulse_clarity_timeline, 0.0, 1.0)

        logger.info(
            f"[PulseClarity] After clipping - Range: [{np.min(pulse_clarity_timeline):.6f}, {np.max(pulse_clarity_timeline):.6f}]")
        sys.stdout.flush()

        # 計算全域平均值（脈動清晰度的總體評估）
        pulse_clarity = float(np.mean(pulse_clarity_timeline))

        logger.info(f"\n[PulseClarity] ✅ FINAL RESULT")
        logger.info(
            f"[PulseClarity]   Global clarity (mean): {pulse_clarity:.6f}")
        logger.info(
            f"[PulseClarity]   Confidence (same): {float(np.mean(pulse_clarity_timeline)):.6f}")
        logger.info(
            f"[PulseClarity]   Timeline length: {len(pulse_clarity_timeline)}")
        logger.info(f"[PulseClarity] 📊 TEMPOGRAM 分析結束\n")
        sys.stdout.flush()

        # 計算時間軸
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

        # 计算整个tempogram的最大值时间线（用于对比）
        max_tempogram_per_frame = np.max(tempogram, axis=0)

        return {
            "pulse_clarity": pulse_clarity,  # 步骤三：全域平均值（用于预测）
            "pulse_clarity_timeline": pulse_clarity_timeline.tolist(),  # 步骤二：时序数据（用于即时验证）
            "confidence": float(np.mean(pulse_clarity_timeline)),
            "onset_strength": onset_strength.tolist(),
            "onset_times": onset_times,
            "max_tempogram": max_tempogram_per_frame.tolist(),
            "tempogram_times": tempogram_times
        }
