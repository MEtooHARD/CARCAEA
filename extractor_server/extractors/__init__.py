"""特征提取模块"""

from .base import AudioExtractor
from .master_feature_extractor import MasterFeatureExtractor

__all__ = [
    "AudioExtractor",
    "MasterFeatureExtractor",
]
