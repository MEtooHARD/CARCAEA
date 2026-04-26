"""
节奏速度 (Tempo / BPM) 提取器
"""

from typing import Any, Dict
import numpy as np
from numpy.typing import NDArray
import librosa
import time
import logging
from .base import AudioExtractor
from config import TEMPO_HOP_LENGTH, TEMPO_START_BPM

logger = logging.getLogger(__name__)


class TempoExtractor(AudioExtractor):
    """
    节奏速度提取器
    通过分析起音曲线中的周期性估算 BPM
    """

    async def extract(self, audio_data: NDArray[np.float32], sr: int) -> Dict[str, Any]:
        """
        提取节奏速度 (BPM)

        Returns:
            {
                "bpm": float,
                "confidence": float (0-1),
                "onset_times": list,
                "tempogram": list,
                "tempogram_times": list
            }
        """
        t_start = time.time()
        logger.info(f"[TempoExtractor] Starting tempo extraction...")
        self._validate_audio(audio_data)

        # 使用 librosa 的 beat_track 直接获取 BPM 和节拍位置
        t_beat = time.time()
        tempo, beats = librosa.beat.beat_track(
            y=audio_data,
            sr=sr,
            hop_length=TEMPO_HOP_LENGTH,
            start_bpm=TEMPO_START_BPM,
            tightness=100  # 控制周期性的紧凑度
        )

        bpm = float(tempo)
        t_beat_done = time.time()
        logger.info(f"  ⏱️  beat_track: {t_beat_done - t_beat:.3f}s")

        # 计算起音强度用于置信度评估
        t_onset = time.time()
        onset_strength = librosa.onset.onset_strength(
            y=audio_data,
            sr=sr,
            hop_length=TEMPO_HOP_LENGTH
        )
        t_onset_done = time.time()
        logger.info(f"  ⏱️  onset_strength: {t_onset_done - t_onset:.3f}s")

        # 计算 Tempogram
        t_tempogram = time.time()
        tempogram = librosa.feature.tempogram(
            y=audio_data,
            sr=sr,
            hop_length=TEMPO_HOP_LENGTH
        )

        # 在真实 BPM 处的 tempogram 强度作为置信度
        if tempogram.shape[0] > 0:
            max_tempogram_strength = np.max(tempogram)
            confidence = float(np.clip(max_tempogram_strength, 0, 1))
        else:
            confidence = 0.0

        # 节拍转换为时间
        beat_times = librosa.frames_to_time(
            beats,
            sr=sr,
            hop_length=TEMPO_HOP_LENGTH
        ).tolist()

        # Tempogram 时间轴
        tempogram_times = librosa.frames_to_time(
            np.arange(tempogram.shape[1]),
            sr=sr,
            hop_length=TEMPO_HOP_LENGTH
        ).tolist()

        return {
            "bpm": bpm,
            "confidence": confidence,
            "beat_times": beat_times,
            "beat_count": int(len(beats)),
            "onset_strength": onset_strength.tolist(),
            "onset_times": librosa.frames_to_time(
                np.arange(len(onset_strength)),
                sr=sr,
                hop_length=TEMPO_HOP_LENGTH
            ).tolist(),
            "max_tempogram": np.max(tempogram, axis=0).tolist() if tempogram.shape[0] > 0 else [],
            "tempogram_times": tempogram_times
        }
        t_total = time.time() - t_start
        logger.info(f"[TempoExtractor] ✓ Completed in {t_total:.3f}s")