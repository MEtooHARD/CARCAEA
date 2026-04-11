"""
基频包络线 (F0 Envelope / Pitch Contour) 提取器
"""

from typing import Any, Dict
import numpy as np
from numpy.typing import NDArray
import librosa
from .base import AudioExtractor
from config import F0_FMIN, F0_FMAX, F0_HOP_LENGTH


class F0EnvelopeExtractor(AudioExtractor):
    """
    基频包络线提取器
    使用 PYIN 或 YIN 算法估计基频的时间轨迹
    """

    async def extract(self, audio_data: NDArray[np.float32], sr: int) -> Dict[str, Any]:
        """
        提取基频包络线

        Returns:
            {
                "f0_values": list (基频 Hz),
                "f0_confidence": list (置信度 0-1),
                "f0_voiced": list (是否有声),
                "times": list,
                "mean_f0": float,
                "f0_range": {"min": float, "max": float}
            }
        """
        self._validate_audio(audio_data)

        try:
            # 使用 librosa.pyin() 进行基频估计
            # pyin = PYIN (Probabilistic YIN)，比 YIN 更準確
            f0, voiced_times, voiced_confidences = librosa.pyin(
                audio_data,
                fmin=F0_FMIN,
                fmax=F0_FMAX,
                hop_length=F0_HOP_LENGTH
            )
        except Exception as e:
            # 如果 pyin 失败，尝试使用 yin
            try:
                f0 = librosa.yin(
                    audio_data,
                    fmin=F0_FMIN,
                    fmax=F0_FMAX,
                    hop_length=F0_HOP_LENGTH
                )
                voiced_times = None
                voiced_confidences = None
            except Exception:
                # 如果两者都失败，返回空结果
                return {
                    "f0_values": [],
                    "f0_confidence": [],
                    "f0_voiced": [],
                    "times": [],
                    "mean_f0": 0.0,
                    "f0_range": {"min": 0.0, "max": 0.0},
                    "voiced_count": 0,
                    "error": str(e)
                }

        # 处理 NaN 值（无声部分）
        voiced_mask = ~np.isnan(f0)

        # ============================================================
        # 🎯 FIX: 底限截斷假象 - 強制排除無效音高
        # ============================================================
        # 1. 使用 voiced_flag 篩選無效發聲區段
        # 2. 強制過濾 <= 80.5 Hz 的底限殘留值

        # 如果使用 PYIN，voiced_times 會是布林陣列（有聲 vs 無聲）
        if isinstance(voiced_times, np.ndarray):
            # voiced_times 是布林或整數陣列，用它來更新 voiced_mask
            pyin_voiced_mask = voiced_times.astype(bool)
            voiced_mask = voiced_mask & pyin_voiced_mask

        # 強制過濾底限殘留：將所有 <= 80.5 Hz 的值標記為無聲
        # 這消除了演算法下限（fmin=80Hz）的舍入誤差
        fmin_threshold = 80.5
        below_fmin = (f0 <= fmin_threshold) & voiced_mask
        voiced_mask[below_fmin] = False

        print(f"[F0Envelope] 🔍 底限篩選統計：")
        print(f"  總幀數: {len(f0)}")
        print(
            f"  PYIN 判定有聲: {np.sum(pyin_voiced_mask if isinstance(voiced_times, np.ndarray) else voiced_mask)}")
        print(f"  低於 {fmin_threshold} Hz: {np.sum(below_fmin)}")
        print(f"  最終有聲幀: {np.sum(voiced_mask)}")

        if isinstance(voiced_times, np.ndarray):
            voiced_list = voiced_mask.astype(int).tolist()
        else:
            voiced_list = voiced_mask.astype(int).tolist()

        if isinstance(voiced_confidences, np.ndarray):
            confidence_list = voiced_confidences.tolist()
        else:
            # 如果没有置信度，用有声标记来估计
            confidence_list = voiced_mask.astype(float).tolist()

        # 计算统计信息（仅基于有声部分）
        if np.any(voiced_mask):
            voiced_f0 = f0[voiced_mask]
            mean_f0 = float(np.mean(voiced_f0))
            min_f0 = float(np.min(voiced_f0))
            max_f0 = float(np.max(voiced_f0))
            voiced_count = int(np.sum(voiced_mask))
        else:
            mean_f0 = 0.0
            min_f0 = 0.0
            max_f0 = 0.0
            voiced_count = 0

        # 时间轴
        times = librosa.frames_to_time(
            np.arange(len(f0)),
            sr=sr,
            hop_length=F0_HOP_LENGTH
        ).tolist()

        # F0 值转换为列表（无声部分设为 None）
        # 已通过 voiced_mask 进行了完整过滤（包括 PYIN 判定和底限剔除）
        f0_list = []
        for i, val in enumerate(f0):
            if voiced_mask[i] and not np.isnan(val):
                f0_list.append(float(val))
            else:
                f0_list.append(None)

        return {
            "f0_values": f0_list,
            "f0_confidence": confidence_list,
            "f0_voiced": voiced_list,
            "times": times,
            "mean_f0": mean_f0,
            "f0_range": {
                "min": min_f0,
                "max": max_f0
            },
            "voiced_count": voiced_count,
            "total_frames": len(f0),
            "voicing_ratio": float(voiced_count / len(f0)) if len(f0) > 0 else 0.0
        }
