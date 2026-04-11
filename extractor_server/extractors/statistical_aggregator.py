"""
統計聚合器：計算全域風險指標與縮圖特徵
根據 Trochidis、Czepiel、Bernardi、Lavezzo 的研究論文
"""

from typing import Dict, Any, List, Optional
import numpy as np
from numpy.typing import NDArray
import librosa


class StatisticalAggregator:
    """
    聚合全曲特徵與縮圖特徵，產生醫療級 HRV 預測所需的特徵集
    """

    def __init__(self, sr: int, hop_length: int = 512):
        """
        Args:
            sr: 採樣率
            hop_length: 特徵提取的 Hop Length
        """
        self.sr = sr
        self.hop_length = hop_length

    def aggregate_for_hrv_prediction(
        self,
        # 全曲特徵（用於全域風險指標）
        global_tempo_bpm: float,
        global_tempo_confidence: float,
        global_mode: float,  # 0-1，0=小調，1=大調
        global_mode_confidence: float,
        global_pulse_clarity: float,  # 0-1
        global_pulse_clarity_confidence: float,
        global_loudness_mean_db: float,
        global_loudness_range_db: float,
        global_f0_mean: float,
        global_f0_range: float,

        # 縮圖層特徵（用於預測值）
        # 使用了 4Hz 重採樣的 timeline 數據
        thumbnail_start_frame: int,
        thumbnail_end_frame: int,

        # 原始 Timeline 數據（用於計算縮圖統計）
        tempo_trajectory: NDArray[np.float32],  # BPM timeline
        tempo_times: NDArray[np.float32],
        mode_strength_timeline: NDArray[np.float32],  # 大調強度 0-1
        mode_times: NDArray[np.float32],
        pulse_clarity_timeline: NDArray[np.float32],  # 0-1
        pulse_clarity_times: NDArray[np.float32],

        # 4Hz 重採樣的三條包絡線（在縮圖區間內）
        thumbnail_music_envelope_4hz: NDArray[np.float32],  # (120 for 30s)
        thumbnail_f0_envelope_4hz: NDArray[np.float32],
        thumbnail_loudness_envelope_4hz: NDArray[np.float32],

        # 驗證用數據
        coherence_with_user_hrv: Optional[float] = None,  # 用戶實測 HRV 與音樂相關係數

    ) -> Dict[str, Any]:
        """
        計算醫療級 HRV 預測的完整特徵集

        包含四個層次的輸出：
        1. Global Risk Features（全曲音樂分析）
        2. Thumbnail Prediction Features（縮圖代表值）
        3. Validation Arrays（4Hz 再驗證）
        4. Metadata（時間戳與置信度）

        返回格式可直接用 Trochidis 預測公式進行 HRV 計算
        """

        # ============================================
        # 第 1 層：全域風險指標 (Global Risk Features)
        # ============================================

        # 調式分析（Bernardi et al. - 關鍵變數）
        mode_category = "Major" if global_mode > 0.5 else "Minor"

        # 脈動清晰度（Pulse Clarity - MIR 標準算法）
        pulse_clarity_global = float(global_pulse_clarity)

        # 速度級別分類
        if global_tempo_bpm < 60:
            tempo_category = "Slow"
            tempo_score = (global_tempo_bpm / 60.0) * 0.5  # 0-0.5 區間
        elif global_tempo_bpm < 100:
            tempo_category = "Moderate"
            tempo_score = 0.5 + ((global_tempo_bpm - 60) /
                                 40.0) * 0.3  # 0.5-0.8 區間
        else:
            tempo_category = "Fast"
            tempo_score = 0.8 + \
                min(((global_tempo_bpm - 100) / 100.0) * 0.2, 0.2)  # 0.8-1.0 區間

        # 動態範圍（響度起伏）
        dynamic_range_normalized = min(
            global_loudness_range_db / 60.0, 1.0)  # 正規化至 0-1

        global_features = {
            "mode": mode_category,
            "mode_score": float(global_mode),
            "pulse_clarity": pulse_clarity_global,
            "tempo_category": tempo_category,
            "tempo_bpm": float(global_tempo_bpm),
            "tempo_score": float(tempo_score),
            "dynamic_range_db": float(global_loudness_range_db),
            "dynamic_range_normalized": float(dynamic_range_normalized),
            "mean_loudness_db": float(global_loudness_mean_db),
            "mean_f0_hz": float(global_f0_mean),
            "f0_range_hz": float(global_f0_range),
        }

        # ============================================
        # 第 2 層：縮圖預測特徵 (Thumbnail Prediction)
        # ============================================

        # 計算縮圖區間內各特徵的平均值
        thumbnail_mode_mean = self._compute_feature_mean_in_range(
            mode_strength_timeline, mode_times,
            thumbnail_start_frame, thumbnail_end_frame
        )

        thumbnail_pulse_clarity_mean = self._compute_feature_mean_in_range(
            pulse_clarity_timeline, pulse_clarity_times,
            thumbnail_start_frame, thumbnail_end_frame
        )

        # Tempo: 直接使用全局 BPM（不使用 max_tempogram 以避免正規化）
        # max_tempogram 是強度值（0-1），代表每個時間點最強BPM的強度，不是BPM值本身
        thumbnail_tempo_mean = global_tempo_bpm

        # 4Hz 包絡線統計
        thumb_music_mean = float(np.nanmean(thumbnail_music_envelope_4hz)) if len(
            thumbnail_music_envelope_4hz) > 0 else 0.0
        thumb_music_std = float(np.nanstd(thumbnail_music_envelope_4hz)) if len(
            thumbnail_music_envelope_4hz) > 0 else 0.0

        # F0 處理：忽略 0 值（無聲區間）
        f0_non_zero = thumbnail_f0_envelope_4hz[thumbnail_f0_envelope_4hz > 0]
        thumb_f0_mean = float(np.nanmean(f0_non_zero)) if len(
            f0_non_zero) > 0 else 0.0

        thumb_loudness_mean = float(np.nanmean(thumbnail_loudness_envelope_4hz)) if len(
            thumbnail_loudness_envelope_4hz) > 0 else 0.0
        loudness_std = float(np.nanstd(thumbnail_loudness_envelope_4hz)) if len(
            thumbnail_loudness_envelope_4hz) > 0 else 0.0
        thumb_loudness_stability = 1.0 / (1.0 + loudness_std)  # 穩定度 0-1

        thumbnail_features = {
            "mode_mean": float(thumbnail_mode_mean),
            "pulse_clarity_mean": float(thumbnail_pulse_clarity_mean),
            "tempo_mean_bpm": float(thumbnail_tempo_mean),
            "music_envelope_mean": thumb_music_mean,
            "music_envelope_std": thumb_music_std,
            "f0_envelope_mean_hz": thumb_f0_mean,
            "loudness_envelope_mean": thumb_loudness_mean,
            "loudness_stability": thumb_loudness_stability,
        }

        # ============================================
        # 第 3 層：即時驗證陣列 (Validation Arrays at 4Hz)
        # ============================================

        # 三條 4Hz 重採樣的包絡線（各 120 點 for 30 秒）
        validation_arrays = {
            "sampling_rate_hz": 4.0,
            "array_length": len(thumbnail_music_envelope_4hz),
            "music_envelope_4hz": thumbnail_music_envelope_4hz.tolist(),
            "f0_envelope_4hz": thumbnail_f0_envelope_4hz.tolist(),
            "loudness_envelope_4hz": thumbnail_loudness_envelope_4hz.tolist(),
        }

        # ============================================
        # 第 4 層：後設資訊 (Metadata)
        # ============================================

        metadata = {
            "global_confidence_avg": float(
                (global_tempo_confidence + global_mode_confidence +
                 global_pulse_clarity_confidence) / 3.0
            ),
            "coherence_with_user_hrv": coherence_with_user_hrv,
            "thumbnail_frame_range": {
                "start": int(thumbnail_start_frame),
                "end": int(thumbnail_end_frame),
            }
        }

        # ============================================
        # 整合完整的 HRV 預測結構
        # ============================================

        return {
            "global_risk_features": global_features,
            "thumbnail_prediction_features": thumbnail_features,
            "validation_arrays": validation_arrays,
            "metadata": metadata,
        }

    def _compute_feature_mean_in_range(
        self,
        values: NDArray[np.float32],
        times: NDArray[np.float32],
        start_frame: int,
        end_frame: int
    ) -> float:
        """
        計算指定幀範圍內的特徵平均值

        Args:
            values: 特徵值陣列
            times: 對應的時間戳
            start_frame: 起始幀
            end_frame: 終止幀（不含）

        Returns:
            該範圍內的平均值
        """

        # 防禦性檢查：確保 values 和 times 都是 1D 數組
        values = np.atleast_1d(np.asarray(values, dtype=np.float32))
        times = np.atleast_1d(np.asarray(times, dtype=np.float32))

        if len(values) == 0 or len(times) == 0:
            return 0.0

        # 轉換幀索引為時間
        start_time = librosa.frames_to_time(
            start_frame, sr=self.sr, hop_length=self.hop_length)
        end_time = librosa.frames_to_time(
            end_frame, sr=self.sr, hop_length=self.hop_length)

        # 找出時間範圍內的索引
        mask = (times >= start_time) & (times < end_time)

        if np.sum(mask) == 0:
            return float(np.mean(values)) if len(values) > 0 else 0.0

        # 確保結果是數組再取 mean
        result_values = values[mask]
        if len(result_values) == 0:
            return 0.0
        return float(np.mean(result_values))
