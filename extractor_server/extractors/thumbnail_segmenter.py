"""
縮圖分割器：基於自相似矩陣 (SSM) 的代表性片段選取
實現 Bartsch & Wakefield (2005) 的音樂縮圖演算法

改進版本：按照 NotebookLM 文獻指導
- 降採樣到 1 Hz（每秒 1 個 frame）
- 使用矩陣運算替代 Python 迴圈
- 對角線相似度 + 閾值過濾
"""

from typing import Tuple
import numpy as np
from numpy.typing import NDArray
import librosa


class ThumbnailSegmenter:
    """
    使用自相似矩陣 (SSM) 找出最具代表性的 20-30 秒片段

    優化方案：
    - 降採樣到 1 Hz（每秒 1 個 frame）
    - 使用矩陣運算尋找最佳片段
    - 對角線相似度 + 閾值過濾
    """

    def __init__(self, sr: int, hop_length: int = 512):
        """
        Args:
            sr: 採樣率
            hop_length: LibROSA hop_length 用於時間對齐
        """
        self.sr = sr
        self.hop_length = hop_length

    def find_thumbnail(
        self,
        chroma: NDArray[np.float32],
        music_envelope: NDArray[np.float32] = None,
        thumbnail_duration: float = 25.0,
        min_duration: float = 20.0,
        max_duration: float = 30.0,
        threshold: float = 0.6
    ) -> Tuple[float, float, int, int]:
        """
        使用 SSM 適應度分數找出最具代表性片段

        Args:
            chroma: L2-norm 正規化的色度圖 (12 x num_frames)
            music_envelope: RMS 能量包絡線（選項），用於能量加權
            thumbnail_duration: 目標縮圖時長（秒），預設 25 秒
            min_duration: 最小允許時長（秒）
            max_duration: 最大允許時長（秒）
            threshold: 相似度閾值（0-1），用於過濾候選片段

        Returns:
            (start_time, end_time, start_frame, end_frame)
        """

        # 驗證色度圖
        if chroma.shape[1] < 2:
            raise ValueError("Chroma features too short to extract thumbnail")

        # ====== STEP 1: 降採樣到 1 Hz ======
        # 計算原始時間分辨率（每幀對應的秒數）
        frames_per_sec = self.sr / self.hop_length

        # 計算需要的降採樣因子
        # 目標：1 Hz (1 frame per second)
        downsample_factor = int(frames_per_sec)

        # 使用 average pooling 進行降採樣
        chroma_downsampled = self._downsample_chroma(chroma, downsample_factor)

        # 現在 chroma_downsampled 的形狀大約是 (12, num_seconds)
        # 例如 309 秒音樂 = (12, 309)

        # ====== STEP 2: 計算自相似矩陣 (SSM) ======
        ssm = self._compute_ssm(chroma_downsampled)

        # ====== STEP 3: 轉換時長為幀數（現在是秒數） ======
        min_duration_frames = int(min_duration)
        max_duration_frames = int(max_duration)
        num_frames = chroma_downsampled.shape[1]

        # 檢查邊界
        max_duration_frames = min(max_duration_frames, num_frames)
        if min_duration_frames > num_frames:
            # 如果歌曲太短，回傳整首歌
            return 0.0, float(num_frames), 0, num_frames

        # ====== STEP 4: 使用矩陣運算尋找最佳片段 ======
        # 🔍 FIX: 能量加權適應度 (Energy-Weighted Fitness)
        # 如果提供了能量包絡線，使用它來加權片段選擇

        # 準備能量包絡線（降採樣到 1 Hz）
        if music_envelope is not None:
            frames_per_sec = self.sr / self.hop_length
            downsample_factor = int(frames_per_sec)

            # 計算降採樣因子下的能量包絡線
            env_len = len(music_envelope)
            env_num_seconds = env_len // downsample_factor
            env_trimmed = music_envelope[:env_num_seconds * downsample_factor]
            env_downsampled = env_trimmed.reshape(
                env_num_seconds, downsample_factor).mean(axis=1)

            # 正規化能量
            env_min = np.min(env_downsampled)
            env_max = np.max(env_downsampled)
            if env_max > env_min:
                env_normalized = (env_downsampled - env_min) / \
                    (env_max - env_min)
            else:
                env_normalized = np.ones(env_num_seconds)

            print(f"[ThumbnailSegmenter] 🔋 能量加權已啟用")
            print(f"  • 能量範圍 (原始): [{env_min:.4f}, {env_max:.4f}]")
            print(f"  • 降採樣秒數: {env_num_seconds}")
        else:
            env_normalized = None
            print(f"[ThumbnailSegmenter] ⚠️  未提供能量包絡線，使用純 SSM 適應度")

        best_score = -1.0
        best_start = 0
        best_end = min_duration_frames

        # 限制候選長度在 [min_duration_frames, max_duration_frames]
        for length in range(min_duration_frames, max_duration_frames + 1):
            # 掃描所有可能的起點
            for start_idx in range(max(0, num_frames - length + 1)):
                end_idx = start_idx + length

                # 提取此片段對應的 SSM 子矩陣
                segment_ssm = ssm[start_idx:end_idx, start_idx:end_idx]

                # 計算對角線相似度（片段內的重複結構）
                diagonal_sim = np.mean(np.diag(segment_ssm))

                # 計算與其他片段的相似度（片段的代表性）
                # 提取此片段與全曲的相似度
                segment_vs_all = ssm[start_idx:end_idx, :]

                # 計算大於閾值的相似度分數和數量
                mask = segment_vs_all > threshold
                score = np.sum(segment_vs_all[mask])  # 大於閾值的相似度總和
                coverage = np.sum(mask)  # 大於閾值的匹配次數

                # 適應度 = Score × Coverage
                if coverage > 0:
                    fitness = score * coverage
                else:
                    fitness = 0.0

                # 追蹤最佳候選（加權考慮對角線相似度）
                combined_fitness = fitness * (0.7) + diagonal_sim * (0.3)

                # 🚀 應用能量加權
                if env_normalized is not None and end_idx <= len(env_normalized):
                    # 計算此片段的平均能量
                    segment_energy = np.mean(env_normalized[start_idx:end_idx])

                    # 最終適應度 = SSM 適應度 × 平均能量
                    final_fitness = combined_fitness * segment_energy

                    # 偶爾打印前幾個候選以便調試
                    if start_idx == 0 and length == min_duration_frames:
                        print(
                            f"[ThumbnailSegmenter] 樣本候選 (開始位置 0, 長度 {length}):")
                        print(f"  • SSM 適應度: {combined_fitness:.4f}")
                        print(f"  • 平均能量: {segment_energy:.4f}")
                        print(f"  • 最終適應度: {final_fitness:.4f}")
                else:
                    final_fitness = combined_fitness

                if final_fitness > best_score:
                    best_score = final_fitness
                    best_start = start_idx
                    best_end = end_idx

        # ====== STEP 5: 轉換回時間單位 ======
        # 現在 best_start 和 best_end 已經是秒數了
        start_time = float(best_start)
        end_time = float(best_end)

        # 如果需要轉回 frame 索引（以原始採樣率計算）
        start_frame = int(best_start * frames_per_sec)
        end_frame = int(best_end * frames_per_sec)

        return start_time, end_time, start_frame, end_frame

    def _downsample_chroma(
        self,
        chroma: NDArray[np.float32],
        downsample_factor: int
    ) -> NDArray[np.float32]:
        """
        將色度特徵降採樣到 1 Hz（每秒 1 個 frame）
        使用 average pooling

        Args:
            chroma: (12, num_frames)
            downsample_factor: 降採樣因子

        Returns:
            降採樣後的色度特徵 (12, num_seconds)
        """
        num_features, num_frames = chroma.shape

        # 計算新的幀數
        num_new_frames = num_frames // downsample_factor

        # 截取能整除的部分
        chroma_trimmed = chroma[:, :num_new_frames * downsample_factor]

        # 重新形狀為 (12, num_new_frames, downsample_factor)
        chroma_reshaped = chroma_trimmed.reshape(
            num_features, num_new_frames, downsample_factor
        )

        # 在最後一個維度上取平均（average pooling）
        chroma_downsampled = np.mean(chroma_reshaped, axis=2)

        # 正規化降採樣後的特徵
        norms = np.linalg.norm(chroma_downsampled, axis=0) + 1e-7
        chroma_downsampled = chroma_downsampled / norms[np.newaxis, :]

        return chroma_downsampled.astype(np.float32)

    def _compute_ssm(self, chroma: NDArray[np.float32]) -> NDArray[np.float32]:
        """
        計算自相似矩陣 (Self-Similarity Matrix)
        使用餘弦相似度作為距離度量 - 向量化版本

        Args:
            chroma: (12, num_frames)

        Returns:
            SSM: (num_frames x num_frames) - 値範圍 [0, 1]
        """
        num_features, num_frames = chroma.shape

        # 計算色度向量的範數
        norms = np.linalg.norm(chroma, axis=0) + 1e-7  # (num_frames,)

        # 正規化色度圖：每一列除以其範數
        chroma_normalized = chroma / norms[np.newaxis, :]  # (12, num_frames)

        # 計算餘弦相似度矩陣：SSM = chroma_normalized^T @ chroma_normalized
        # (num_frames, num_frames)
        ssm = chroma_normalized.T @ chroma_normalized

        # 限制在 [0, 1]
        ssm = np.maximum(ssm, 0.0).astype(np.float32)

        return ssm
