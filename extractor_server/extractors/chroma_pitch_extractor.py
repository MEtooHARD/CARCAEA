"""
Chroma 基礎音級與色度通量提取器
用 Argmax 替代 pYIN，解決 EDM/重金屬無法偵測的問題
"""

from typing import Dict, Tuple
import numpy as np
from numpy.typing import NDArray
import librosa
import logging

logger = logging.getLogger(__name__)


class ChromaPitchExtractor:
    """
    從 Chroma 矩陣提取主導音級（Dominant Pitch Class）與色度通量（Chroma Flux）
    
    核心概念：
    1. Dominant Pitch Class：每幀能量最大的音級（0-11，對應 C 到 B）
       - 轉換為 1-12 供下游使用（對齊傳統 MIDI pitch class 編碼）
    2. Chroma Flux：相鄰幀的色度向量歐氏距離
       - 反映和弦/旋律變化的劇烈程度
       - 更適合 EDM 的複雜琶音與快速轉調
    """

    def __init__(self, sr: int = 22050, hop_length: int = 512):
        """
        Args:
            sr: 採樣率
            hop_length: Chroma 的 hop length
        """
        self.sr = sr
        self.hop_length = hop_length

    def extract_dominant_pitch_class(
        self,
        chroma_matrix: NDArray[np.float32],
    ) -> Tuple[NDArray[np.float32], NDArray[np.float32]]:
        """
        從 Chroma 矩陣提取主導音級（Dominant Pitch Class）
        
        Args:
            chroma_matrix: Shape (12, num_frames) 的歸一化色度特徵
                          每行代表一個音級（C, C#, D, ..., B）
        
        Returns:
            dominant_pitch_class: Shape (num_frames,) 
                                 值域 [1, 12]，1=C, 2=C#, ..., 12=B
            max_energy: Shape (num_frames,) 
                       每幀的能量（該幀 Chroma 的最大值）
        
        演算法：
        1. 取每幀能量最大的音級索引 (argmax) → [0, 11]
        2. 將 0-11 轉換為 1-12（+1）
        3. 返回主導音級與能量用於後續過濾
        """
        if chroma_matrix.shape[0] != 12:
            raise ValueError(f"Expected chroma_matrix with 12 rows, got {chroma_matrix.shape[0]}")
        
        # 計算每幀的最大能量
        max_energy = np.max(chroma_matrix, axis=0)  # Shape (num_frames,)
        
        # 取得每幀能量最大的音級索引（0-11）
        dominant_indices = np.argmax(chroma_matrix, axis=0)  # Shape (num_frames,)
        
        # 轉換為 1-12 編碼
        dominant_pitch_class = (dominant_indices + 1).astype(np.float32)
        
        return dominant_pitch_class, max_energy

    def extract_chroma_flux(
        self,
        chroma_matrix: NDArray[np.float32],
    ) -> NDArray[np.float32]:
        """
        計算色度通量（Chroma Flux）：相鄰幀的色度向量歐氏距離
        
        Args:
            chroma_matrix: Shape (12, num_frames) 的歸一化色度特徵
        
        Returns:
            chroma_flux: Shape (num_frames,) 的色度通量
                        反映該瞬間和弦/旋律變化的劇烈程度
        
        數學定義：
        flux[t] = ||chroma[:, t] - chroma[:, t-1]||_2
                = sqrt(sum((chroma[i, t] - chroma[i, t-1])^2 for i in 0..11))
        
        特性：
        - 值域 [0, sqrt(2)]（若 Chroma 已歸一化到 [0,1]）
        - 高通量 = 快速琶音、轉調、或和弦進行
        - 低通量 = 靜止的持續音符
        
        生理意義：
        - 高通量 → 認知負荷 ↑ → 交感神經活化 ↑ → LF/HF ↑
        - 對應「緊張」感，完美捕捉 EDM 的動態特徵
        """
        num_frames = chroma_matrix.shape[1]
        
        # 計算相鄰幀的差異
        frame_diffs = np.diff(chroma_matrix, axis=1)  # Shape (12, num_frames-1)
        
        # 計算歐氏距離（L2 norm）
        chroma_flux = np.sqrt(np.sum(frame_diffs ** 2, axis=0))  # Shape (num_frames-1,)
        
        # 補齊長度（在最前面插入 0，因為 diff 會少一幀）
        chroma_flux = np.insert(chroma_flux, 0, 0.0)  # Shape (num_frames,)
        
        return chroma_flux.astype(np.float32)

    def apply_energy_threshold(
        self,
        pitch_class: NDArray[np.float32],
        max_energy: NDArray[np.float32],
        threshold: float = 0.01,
    ) -> NDArray[np.float32]:
        """
        應用能量閾值，將低能量幀設為 0.0（靜音）
        
        Args:
            pitch_class: 主導音級，Shape (num_frames,)，值域 [1, 12]
            max_energy: 每幀的最大能量，Shape (num_frames,)，值域 [0, 1]（假設已歸一化）
            threshold: 能量閾值，低於此值的幀被視為靜音（預設 0.01）
        
        Returns:
            filtered_pitch_class: Shape (num_frames,)
                                 低能量幀為 0.0，高能量幀為 [1, 12]
        
        注意：
        - EDM 幾乎不會有完全靜音，此閾值確保「有意義的靜默」（如淡出）才被標記
        - Chroma 特徵的能量自然大於 pYIN 檢測的閾值，更適合電子音樂
        """
        filtered = np.where(max_energy > threshold, pitch_class, 0.0)
        return filtered.astype(np.float32)

    def extract_from_audio(
        self,
        audio: NDArray[np.float32],
        sr: int,
        hop_length: int = 512,
    ) -> Dict[str, NDArray[np.float32]]:
        """
        從音頻直接提取 Dominant Pitch Class 與 Chroma Flux
        （為便利提供的全流程方法）
        
        Args:
            audio: 單聲道音頻，Shape (num_samples,)
            sr: 採樣率
            hop_length: FFT hop length
        
        Returns:
            {
                "dominant_pitch_class": Shape (num_frames,)，值域 [1, 12] 或 0
                "chroma_flux": Shape (num_frames,)，值域 [0, sqrt(2)]
                "max_energy": Shape (num_frames,)，值域 [0, 1]
                "times": Shape (num_frames,)，每幀的時間戳
            }
        """
        logger.info("[ChromaPitchExtractor] Starting dominant pitch class extraction...")
        
        # 提取 Chroma CQT（12-bin chroma）
        chroma = librosa.feature.chroma_cqt(
            y=audio,
            sr=sr,
            hop_length=hop_length,
            fmin=librosa.note_to_hz('C1'),  # 從 C1 開始
            n_octaves=7  # 7 個八度音階
        )
        logger.info(f"[ChromaPitchExtractor] Chroma CQT shape: {chroma.shape}")
        
        # L2 歸一化
        chroma_normalized = librosa.util.normalize(chroma, axis=0, norm=2)
        
        # 提取主導音級
        dominant_pitch, max_energy = self.extract_dominant_pitch_class(chroma_normalized)
        
        # 應用能量閾值過濾
        filtered_pitch = self.apply_energy_threshold(dominant_pitch, max_energy, threshold=0.01)
        
        # 計算色度通量
        chroma_flux = self.extract_chroma_flux(chroma_normalized)
        
        # 計算時間軸
        num_frames = chroma.shape[1]
        times = librosa.frames_to_time(np.arange(num_frames), sr=sr, hop_length=hop_length)
        
        logger.info(f"[ChromaPitchExtractor] ✓ Extraction complete")
        logger.info(f"  - Dominant pitch class range: {np.min(filtered_pitch[filtered_pitch > 0]):.1f}-{np.max(filtered_pitch):.1f} (or 0 for silence)")
        logger.info(f"  - Chroma flux range: {np.min(chroma_flux):.4f}-{np.max(chroma_flux):.4f}")
        
        return {
            "dominant_pitch_class": filtered_pitch.astype(np.float32),
            "chroma_flux": chroma_flux.astype(np.float32),
            "max_energy": max_energy.astype(np.float32),
            "times": times.astype(np.float32),
        }
