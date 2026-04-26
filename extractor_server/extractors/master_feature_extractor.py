"""
主合成器 (Master Extractor)：協調所有特徵提取與聚合
實作四階段醫療級音樂分析 HRV 預測管道
"""

from .statistical_aggregator import StatisticalAggregator
from .resampler import Resampler
from .thumbnail_segmenter import ThumbnailSegmenter
from .f0_envelope import F0EnvelopeExtractor
from .loudness import LoudnessExtractor
from .pulse_clarity import PulseClarityExtractor
from .mode import ModeExtractor
from .tempo import TempoExtractor
from typing import Dict, Any, Optional
import asyncio
import numpy as np
from numpy.typing import NDArray
import librosa
import logging

logger = logging.getLogger(__name__)


class MasterFeatureExtractor:
    """
    醫療級 HRV 預測的主要協調器

    工作流程：
    Phase 1: 全曲全局預處理（峰值正規化）
    Phase 2: 全曲特徵提取（Tempo, Mode, PulseClarity, Loudness, F0）
    Phase 2.5: 基於 SSM 的縮圖分割
    Phase 3: 4Hz 重採樣與縮圖統計聚合
    Phase 4: 生成醫療級 JSON
    """

    def __init__(self, sr: Optional[int] = None, hop_length: int = 512):
        """
        Args:
            sr: 採樣率（如未提供，會在 extract 時自動設定）
            hop_length: 特徵提取的跳躍長度
        """
        self.sr = sr
        self.hop_length = hop_length

        # 各層提取器（延遲初始化）
        self.tempo_extractor: Optional[TempoExtractor] = None
        self.mode_extractor: Optional[ModeExtractor] = None
        self.pulse_clarity_extractor: Optional[PulseClarityExtractor] = None
        self.loudness_extractor: Optional[LoudnessExtractor] = None
        self.f0_extractor: Optional[F0EnvelopeExtractor] = None
        self.thumbnail_segmenter: Optional[ThumbnailSegmenter] = None
        self.resampler: Optional[Resampler] = None
        self.aggregator: Optional[StatisticalAggregator] = None

    def _init_extractors(self, sr: int) -> None:
        """延遲初始化提取器"""
        if self.sr is None:
            self.sr = sr

        if self.tempo_extractor is None:
            self.tempo_extractor = TempoExtractor()
            self.mode_extractor = ModeExtractor()
            self.pulse_clarity_extractor = PulseClarityExtractor()
            self.loudness_extractor = LoudnessExtractor()
            self.f0_extractor = F0EnvelopeExtractor()
            self.thumbnail_segmenter = ThumbnailSegmenter(sr, self.hop_length)
            self.aggregator = StatisticalAggregator(sr, self.hop_length)

    @staticmethod
    def _crop_and_normalize_timeline(
        timeline: NDArray[np.float32],
        times: NDArray[np.float32],
        thumb_start_time: float,
        thumb_end_time: float,
    ) -> tuple[NDArray[np.float32], NDArray[np.float32]]:
        """
        將時間線裁剪到縮圖範圍並轉換為相對時間（0 開始）

        Returns:
            (cropped_timeline, relative_times)
        """
        if len(times) > 0:
            mask = (times >= thumb_start_time) & (times <= thumb_end_time)
            cropped = timeline[mask]
            relative_times = times[mask] - thumb_start_time
            return cropped, relative_times
        return timeline, times

    async def extract_medical_grade_features(
        self,
        audio_data: NDArray[np.float32],
        sr: int,
        thumbnail_duration: float = 25.0,
        min_duration: float = 20.0,
        max_duration: float = 35.0,
    ) -> Dict[str, Any]:
        """
        完整的四階段醫療級特徵提取管道

        Args:
            audio_data: 音頻資料 (1D numpy array)
            sr: 採樣率
            thumbnail_duration: 目標縮圖時長（秒）
            min_duration: 最小允許縮圖時長
            max_duration: 最大允許縮圖時長

        Returns:
            Dict[str, Any]: 醫療級 HRV 預測所需的完整特徵集
        """

        self._init_extractors(sr)

        print(f"[MasterExtractor] Starting extraction pipeline...")

        # ============================================
        # Phase 1: 全曲全局預處理
        # ============================================
        print(f"[Phase 1] Converting to mono and normalizing...")
        # 轉換為單聲道（如果需要）
        audio_mono = np.mean(audio_data, axis=0).astype(
            np.float32) if audio_data.ndim > 1 else audio_data.astype(np.float32)
        print(
            f"[Phase 1] ✓ Mono audio ready: {len(audio_mono)} samples @ {sr}Hz ({len(audio_mono)/sr:.2f}s)")

        # ============================================
        # Phase 2: 並行提取全曲特徵
        # ============================================
        print(f"[Phase 2] Extracting tempo, mode, pulse clarity, loudness, F0 (5 extractors in parallel)...")
        # 使用 asyncio 並行執行各提取器
        tempo_result, mode_result, pulse_clarity_result, loudness_result, f0_result = await asyncio.gather(
            self.tempo_extractor.extract(audio_mono, sr),
            self.mode_extractor.extract(audio_mono, sr),
            self.pulse_clarity_extractor.extract(audio_mono, sr),
            self.loudness_extractor.extract(audio_mono, sr),
            self.f0_extractor.extract(audio_mono, sr),
        )
        print(f"[Phase 2] ✓ All features extracted")
        print(
            f"  - Tempo: {tempo_result.get('bpm', 0):.1f}BPM (confidence: {tempo_result.get('confidence', 0):.2f})")
        print(
            f"  - Mode: {mode_result.get('mode', 'N/A')} (score: {mode_result.get('confidence', 0):.2f})")
        # 🔍 Pulse Clarity Debug
        pulse_clarity_timeline_raw = pulse_clarity_result.get(
            'pulse_clarity_timeline', [])
        pulse_clarity_value = pulse_clarity_result.get('pulse_clarity', 0.0)
        print(
            f"\n[DEBUG] Full pulse_clarity_result keys: {list(pulse_clarity_result.keys())}")
        print(f"[DEBUG] pulse_clarity value: {pulse_clarity_value}")
        print(
            f"[DEBUG] pulse_clarity_timeline length: {len(pulse_clarity_timeline_raw)}")
        if len(pulse_clarity_timeline_raw) > 5:
            print(f"[DEBUG] First 5 values: {pulse_clarity_timeline_raw[:5]}")
        if len(pulse_clarity_timeline_raw) > 0:
            pc_min = min(pulse_clarity_timeline_raw)
            pc_max = max(pulse_clarity_timeline_raw)
            pc_mean = sum(pulse_clarity_timeline_raw) / \
                len(pulse_clarity_timeline_raw)
            print(
                f"  - Pulse Clarity: {pulse_clarity_value:.4f} | Timeline: min={pc_min:.4f}, max={pc_max:.4f}, mean={pc_mean:.4f}, len={len(pulse_clarity_timeline_raw)}")
        else:
            print(
                f"  - Pulse Clarity: {pulse_clarity_value:.4f} (empty timeline!)")
        print(
            f"  - Loudness: {loudness_result.get('mean_loudness_db', 0):.2f}dB (range: {loudness_result.get('dynamic_range_db', 0):.2f}dB)")
        print(
            f"  - F0 range: {f0_result.get('f0_range', {}).get('min', 0):.1f}-{f0_result.get('f0_range', {}).get('max', 0):.1f}Hz")

        # ============================================
        # Phase 2.5: 基於 SSM 的縮圖分割
        # ============================================
        print(f"[Phase 2.5] Finding representative thumbnail via SSM segmentation...")
        # 提取色度圖用於 SSM 計算
        chroma = librosa.feature.chroma_stft(
            y=audio_mono,
            sr=sr,
            n_fft=2048,
            hop_length=self.hop_length
        )

        # L2-norm 正規化色度圖
        for i in range(chroma.shape[1]):
            frame_norm = np.linalg.norm(chroma[:, i])
            if frame_norm > 0:
                chroma[:, i] = chroma[:, i] / frame_norm

        # 🔋 提取音樂包絡線用於縮圖的能量加權
        music_envelope_for_thumbnail = np.array(loudness_result.get(
            "loudness_rms", []), dtype=np.float32)

        # 使用 SSM 找出最具代表性的片段（加入能量加權）
        thumb_start_time, thumb_end_time, thumb_start_frame, thumb_end_frame = \
            self.thumbnail_segmenter.find_thumbnail(
                chroma,
                music_envelope=music_envelope_for_thumbnail,
                thumbnail_duration=thumbnail_duration,
                min_duration=min_duration,
                max_duration=max_duration
            )

        thumbnail_duration_actual = thumb_end_time - thumb_start_time
        print(
            f"[Phase 2.5] ✓ Thumbnail selected: {thumb_start_time:.1f}s - {thumb_end_time:.1f}s (duration: {thumbnail_duration_actual:.1f}s)")

        # ============================================
        # Phase 3: 4Hz 重採樣與縮圖統計聚合
        # ============================================
        print(
            f"[Phase 3] Resampling envelopes to 4Hz and aggregating thumbnail statistics...")

        # 計算完整曲子的時長
        full_duration = librosa.get_duration(y=audio_mono, sr=sr)
        print(
            f"[Phase 3] Full song duration: {full_duration:.2f}s")

        # 提取 timeline 數據用於聚合
        # 注意：max_tempogram 是強度值（0-1），不是 BPM，所以不應該用它計算 tempo_mean_bpm
        tempo_trajectory = np.array(tempo_result.get(
            "max_tempogram", []), dtype=np.float32)
        tempo_times = np.array(tempo_result.get(
            "tempogram_times", []), dtype=np.float32)
        global_tempo_bpm = tempo_result.get("bpm", 120.0)  # 保存全局BPM值

        mode_timeline = np.array(mode_result.get(
            "major_strength_timeline", []), dtype=np.float32)
        mode_times = np.linspace(0, full_duration,
                                 len(mode_timeline), dtype=np.float32)

        pulse_clarity_timeline = np.array(pulse_clarity_result.get(
            "pulse_clarity_timeline", []), dtype=np.float32)
        pulse_clarity_times = np.array(pulse_clarity_result.get(
            "tempogram_times", []), dtype=np.float32)

        # 提取音乐包络线（线性 RMS，用作音乐强度指标）
        music_envelope_timeline = np.array(loudness_result.get(
            "loudness_rms", []), dtype=np.float32)  # 线性 RMS 作为 music_envelope

        # 提取响度包络线（对数 dB，用作感知响度）
        loudness_timeline = np.array(loudness_result.get(
            "loudness_db", []), dtype=np.float32)  # dB 值作为 loudness_envelope
        loudness_times = np.array(
            loudness_result.get("times", []), dtype=np.float32)

        # 提取 F0 包絡線（注意：F0 有無聲區間應為 0）
        f0_timeline = np.array(f0_result.get(
            "f0_values", []), dtype=np.float32)
        f0_timeline = np.where(f0_timeline == None, 0.0,
                               f0_timeline)  # 將 None 轉換為 0
        f0_times = np.array(f0_result.get("times", []), dtype=np.float32)

        # ===== 為完整曲子重採樣到 4Hz =====
        print(f"[Phase 3] Resampling full song (3 envelopes to 4Hz)...")
        resampler_full = Resampler(full_duration)
        music_full_4hz, f0_full_4hz, loudness_full_4hz = resampler_full.resample_three_envelopes(
            music_envelope_timeline, loudness_times,
            f0_timeline, f0_times,
            loudness_timeline, loudness_times,
        )
        print(
            f"[Phase 3] ✓ Full song resampled: {len(music_full_4hz)} samples @ 4Hz")

        # ===== 計算完整曲子前後 15 秒的平均值 =====
        # 4Hz 意味著每秒 4 個樣本，所以 15 秒 = 60 個樣本
        samples_per_15sec = int(15 * 4)

        # 頭部：前 15 秒
        head_end_idx = min(samples_per_15sec, len(music_full_4hz))
        head_music_arr = music_full_4hz[:head_end_idx]
        head_f0_arr = f0_full_4hz[:head_end_idx]
        head_loudness_arr = loudness_full_4hz[:head_end_idx]

        head_music_mean = float(np.mean(head_music_arr))
        head_f0_mean = float(np.mean(head_f0_arr[head_f0_arr > 0])) if np.any(
            head_f0_arr > 0) else 0.0
        head_loudness_mean = float(np.mean(head_loudness_arr))

        # 尾部：後 15 秒
        tail_start_idx = max(0, len(music_full_4hz) - samples_per_15sec)
        tail_music_arr = music_full_4hz[tail_start_idx:]
        tail_f0_arr = f0_full_4hz[tail_start_idx:]
        tail_loudness_arr = loudness_full_4hz[tail_start_idx:]

        tail_music_mean = float(np.mean(tail_music_arr))
        tail_f0_mean = float(np.mean(tail_f0_arr[tail_f0_arr > 0])) if np.any(
            tail_f0_arr > 0) else 0.0
        tail_loudness_mean = float(np.mean(tail_loudness_arr))

        print(f"[Phase 3] ✓ Smoothness metrics computed")
        print(
            f"  - Head (first 15s): music={head_music_mean:.4f}, f0={head_f0_mean:.1f}Hz, loudness={head_loudness_mean:.2f}dB")
        print(
            f"  - Tail (last 15s): music={tail_music_mean:.4f}, f0={tail_f0_mean:.1f}Hz, loudness={tail_loudness_mean:.2f}dB")

        # ===== 調整時間軸到縮圖相對時間（0 開始） =====
        # 使用辅助函数裁剪并转换时间轴
        music_envelope_thumb, music_times_thumb = self._crop_and_normalize_timeline(
            music_envelope_timeline, loudness_times, thumb_start_time, thumb_end_time)
        loudness_timeline_thumb, loudness_times_thumb = self._crop_and_normalize_timeline(
            loudness_timeline, loudness_times, thumb_start_time, thumb_end_time)
        f0_timeline_thumb, f0_times_thumb = self._crop_and_normalize_timeline(
            f0_timeline, f0_times, thumb_start_time, thumb_end_time)

        # 重採樣三條包絡線到 4Hz（使用縮圖範圍的相對時間）
        print(f"[Phase 3] Resampling thumbnail (3 envelopes to 4Hz)...")
        resampler_thumb = Resampler(thumbnail_duration_actual)
        music_resampled, f0_resampled, loudness_resampled = resampler_thumb.resample_three_envelopes(
            music_envelope_thumb, music_times_thumb,          # 第 1 個：音乐包络线（线性 RMS）
            f0_timeline_thumb, f0_times_thumb,                # 第 2 個：F0 包络线
            loudness_timeline_thumb, loudness_times_thumb,    # 第 3 個：响度包络线（dB）
        )
        print(f"[Phase 3] ✓ Resampling complete")
        print(
            f"  - Thumbnail music envelope: {len(music_resampled)} samples @ 4Hz | Mean: {np.mean(music_resampled):.4f}")
        print(
            f"  - Thumbnail F0 envelope: {len(f0_resampled)} samples @ 4Hz | Mean: {np.mean(f0_resampled[f0_resampled > 0]):.1f}Hz (excluding silence)")
        print(
            f"  - Thumbnail loudness envelope: {len(loudness_resampled)} samples @ 4Hz | Mean: {np.mean(loudness_resampled):.2f}dB")

        # ============================================
        # Phase 4: 生成醫療級 JSON
        # ============================================
        print(f"[Phase 4] Aggregating features and generating final output...")
        # 使用統計聚合器產生最終結果
        hrv_features = self.aggregator.aggregate_for_hrv_prediction(
            # 全曲特徵
            global_tempo_bpm=global_tempo_bpm,
            global_tempo_confidence=tempo_result.get("confidence", 0.0),
            global_mode=mode_result.get("mode", 0.5),
            global_mode_confidence=mode_result.get("confidence", 0.0),
            global_pulse_clarity=pulse_clarity_result.get(
                "pulse_clarity", 0.5),
            global_pulse_clarity_confidence=pulse_clarity_result.get(
                "confidence", 0.0),
            global_loudness_mean_db=loudness_result.get(
                "mean_loudness_db", 0.0),
            global_loudness_range_db=loudness_result.get(
                "dynamic_range_db", 0.0),
            global_f0_mean=f0_result.get("mean_f0", 100.0),
            global_f0_range=f0_result.get("f0_range", {}).get(
                "max", 200.0) - f0_result.get("f0_range", {}).get("min", 50.0),

            # 縮圖層特徵
            thumbnail_start_frame=thumb_start_frame,
            thumbnail_end_frame=thumb_end_frame,

            # Timeline 數據
            tempo_trajectory=tempo_trajectory,
            tempo_times=tempo_times,
            mode_strength_timeline=mode_timeline,
            mode_times=mode_times,
            pulse_clarity_timeline=pulse_clarity_timeline,
            pulse_clarity_times=pulse_clarity_times,

            # 4Hz 重採樣包絡線
            thumbnail_music_envelope_4hz=music_resampled,
            thumbnail_f0_envelope_4hz=f0_resampled,
            thumbnail_loudness_envelope_4hz=loudness_resampled,
        )

        # ============================================
        # 組裝最終回應 (版本 v3.0 - 包含完整曲子 envelope)
        # ============================================
        # 建立 smoothness 物件
        smoothness_features = {
            "head": {
                "f0_mean": head_f0_mean,
                "music_mean": head_music_mean,
                "loudness_mean": head_loudness_mean,
            },
            "tail": {
                "f0_mean": tail_f0_mean,
                "music_mean": tail_music_mean,
                "loudness_mean": tail_loudness_mean,
            }
        }

        # 建立 full_features 物件
        full_features = {
            "f0_envelope_4hz": f0_full_4hz.tolist(),
            "music_envelope_4hz": music_full_4hz.tolist(),
            "loudness_envelope_4hz": loudness_full_4hz.tolist(),
        }

        print(f"[Phase 4] ✓ Aggregation complete")
        print(f"[Pipeline] ✓ Extraction completed successfully\n")

        return {
            "metadata": {
                "thumbnail_start_sec": float(thumb_start_time),
                "thumbnail_end_sec": float(thumb_end_time),
                "duration_seconds": float(thumbnail_duration_actual),
                "global_confidence_avg": hrv_features["metadata"]["global_confidence_avg"],
            },
            "global_risk_features": hrv_features["global_risk_features"],
            "thumbnail_prediction_features": hrv_features["thumbnail_prediction_features"],
            "thumbnail_validation_arrays": hrv_features["validation_arrays"],
            "full_features": full_features,
            "smoothness": smoothness_features,
        }
