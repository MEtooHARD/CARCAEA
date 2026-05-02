"""
CENS (Chroma Energy Normalized Statistics) 提取器
实现高质量的色度特征提取，用于 SSM 计算

流程：
1. CQT（常数Q转换）- 比STFT更适合音乐
2. 色度特征提取 - 12维音高能量
3. 对数压缩 - 模拟人类听觉的对数感受
4. 逐帧归一化 - 消除动态响度的影响
5. 时间平滑化 - 过滤打击乐干扰
6. 降采样 - 减少计算负担
"""

import numpy as np
from numpy.typing import NDArray
import librosa
import logging

logger = logging.getLogger(__name__)


class CENSExtractor:
    """
    CENS 色度特征提取器
    """

    def __init__(
        self,
        sr: int = 22050,
        hop_length: int = 512,
        log_compression_factor: float = 100.0,
        smoothing_window_sec: float = 1.0,
        downsample_factor: int = 4
    ):
        """
        Args:
            sr: 采样率
            hop_length: hop长度
            log_compression_factor: 对数压缩系数 (eta)，控制动态范围压缩
            smoothing_window_sec: 时间平滑窗口大小（秒），通常 0.5-1.0
            downsample_factor: 最终降采样因子
        """
        self.sr = sr
        self.hop_length = hop_length
        self.log_compression_factor = log_compression_factor
        self.smoothing_window_sec = smoothing_window_sec
        self.downsample_factor = downsample_factor

    def extract(self, audio: NDArray[np.float32]) -> NDArray[np.float32]:
        """
        提取 CENS 色度矩阵

        Args:
            audio: 音频数据 (1D numpy array)

        Returns:
            CENS 矩阵 (12, num_frames)，已归一化，范围 [0, 1]
        """
        logger.info("[CENSExtractor] Starting CENS extraction pipeline...")

        # ============================================================
        # Step 1: CQT 色度特征提取
        # ============================================================
        logger.info("[CENS] Step 1: Computing CQT-based chroma features...")
        
        # 使用 CQT 代替 STFT，更适合音乐分析
        # CQT 的频率分辨率与人类听觉对数感受一致
        chroma_cqt = librosa.feature.chroma_cqt(
            y=audio,
            sr=self.sr,
            hop_length=self.hop_length,
            n_octaves=7,  # 覆盖 7 个八度音程
            bins_per_octave=12  # 每个八度 12 个半音
        )
        
        logger.info(f"[CENS]   ✓ Chroma CQT shape: {chroma_cqt.shape}")

        # ============================================================
        # Step 2: 对数压缩 (Log Compression)
        # ============================================================
        logger.info("[CENS] Step 2: Applying logarithmic compression...")
        
        # 公式: log(eta * e + 1)，其中 e 是能量值，eta 是压缩系数
        # 这将微弱的旋律放大，同时压抑过强的鼓声
        chroma_log = np.log(self.log_compression_factor * chroma_cqt + 1.0)
        
        logger.info(f"[CENS]   ✓ Log compression applied (eta={self.log_compression_factor})")

        # ============================================================
        # Step 3: 逐帧归一化 (Frame-wise L2 Normalization)
        # ============================================================
        logger.info("[CENS] Step 3: Applying frame-wise L2 normalization...")
        
        # 计算每一帧的 L2 范数
        frame_norms = np.linalg.norm(chroma_log, axis=0, keepdims=True) + 1e-7
        chroma_normalized = chroma_log / frame_norms
        
        logger.info(f"[CENS]   ✓ Normalized to unit L2 norm per frame")

        # ============================================================
        # Step 4: 时间平滑化 (Temporal Smoothing, CENS)
        # ============================================================
        logger.info("[CENS] Step 4: Applying temporal smoothing (CENS)...")
        
        # 计算平滑窗口大小（帧数）
        frames_per_sec = self.sr / self.hop_length
        smoothing_frames = int(self.smoothing_window_sec * frames_per_sec)
        
        # 确保窗口大小为奇数（居中对齐）
        if smoothing_frames % 2 == 0:
            smoothing_frames += 1
        
        logger.info(f"[CENS]   Smoothing window: {smoothing_frames} frames ({self.smoothing_window_sec}s)")
        
        # 使用均值滤波进行时间平滑
        chroma_smoothed = np.zeros_like(chroma_normalized)
        half_window = smoothing_frames // 2
        
        for i in range(chroma_normalized.shape[1]):
            start = max(0, i - half_window)
            end = min(chroma_normalized.shape[1], i + half_window + 1)
            chroma_smoothed[:, i] = np.mean(chroma_normalized[:, start:end], axis=1)
        
        # 重新归一化平滑后的结果
        smoothed_norms = np.linalg.norm(chroma_smoothed, axis=0, keepdims=True) + 1e-7
        chroma_smoothed = chroma_smoothed / smoothed_norms
        
        logger.info(f"[CENS]   ✓ Temporal smoothing completed")

        # ============================================================
        # Step 5: 降采样 (Downsampling)
        # ============================================================
        logger.info(f"[CENS] Step 5: Downsampling by factor {self.downsample_factor}...")
        
        # 计算目标帧数
        original_frames = chroma_smoothed.shape[1]
        downsampled_frames = original_frames // self.downsample_factor
        
        # 使用平均池化进行降采样
        chroma_trimmed = chroma_smoothed[:, :downsampled_frames * self.downsample_factor]
        chroma_reshaped = chroma_trimmed.reshape(
            12, 
            downsampled_frames, 
            self.downsample_factor
        )
        chroma_downsampled = np.mean(chroma_reshaped, axis=2)
        
        # 最后再做一次归一化
        downsampled_norms = np.linalg.norm(chroma_downsampled, axis=0, keepdims=True) + 1e-7
        chroma_cens = chroma_downsampled / downsampled_norms
        
        logger.info(f"[CENS]   ✓ Downsampled: {original_frames} → {chroma_cens.shape[1]} frames")

        # ============================================================
        # 返回 CENS 矩阵
        # ============================================================
        logger.info(f"[CENSExtractor] ✓ CENS extraction complete: {chroma_cens.shape}")
        
        return chroma_cens.astype(np.float32)

    def get_time_resolution(self) -> float:
        """
        获取降采样后的时间分辨率（秒/帧）
        
        Returns:
            秒数/帧
        """
        original_hop_time = self.hop_length / self.sr
        return original_hop_time * self.downsample_factor
