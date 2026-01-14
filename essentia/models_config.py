"""
Essentia Models Configuration
根据 Feature_Extractors.txt 和 classifiers.md 的官方文档配置

包含：
1. 可用模型的完整列表
2. 每個模型的加載方式（Essentia 算法類型）
3. 每個模型的輸入/輸出節點信息
4. 模型的用途說明
"""

from typing import Dict, List, Literal
from dataclasses import dataclass

# ==================== 數據類定義 ====================


@dataclass
class ModelConfig:
    """模型配置"""
    name: str  # Model name (without .pb)
    model_type: Literal["VGGish", "EffnetDiscogs", "MusiCNN", "MAEST", "Generic2D"]  # Model type
    output_layer: str  # TensorFlow output layer
    purpose: str  # extractor/classifier
    sample_rate: int = 16000  # Sample rate (only for feature extractors)
    description: str = ""  # Model description


# ==================== 目前在 /app/weights 中可用的模型 ====================

AVAILABLE_MODELS: Dict[str, ModelConfig] = {
    # ===== 特徵提取模型 (Feature Extractors) =====
    # "audioset-vggish-3": ModelConfig(
    #     name="audioset-vggish-3",
    #     model_type="VGGish",
    #     output_layer="model/vggish/embeddings",
    #     purpose="feature_extractor",
    #     sample_rate=16000,
    #     description="AudioSet-VGGish: Audio embedding trained on AudioSet dataset. Output shape: [128]"
    # ),
    
    # "discogs-effnet-bs64-1": ModelConfig(
    #     name="discogs-effnet-bs64-1",
    #     model_type="EffnetDiscogs",
    #     output_layer="PartitionedCall:1",
    #     purpose="feature_extractor",
    #     sample_rate=16000,
    #     description="Discogs-EffNet: Audio embedding trained with multi-label classification on 400 Discogs styles. Output shape: [256]"
    # ),
    
    "msd-musicnn-1": ModelConfig(
        name="msd-musicnn-1",
        model_type="MusiCNN",
        output_layer="model/dense/BiasAdd",
        purpose="feature_extractor",
        sample_rate=16000,
        description="MSD-MusiCNN: Music embedding extractor based on auto-tagging with 50 MSD tags. Output shape: [200]"
    ),
    
    # ===== Classifiers =====
    # Note: These models require the output of corresponding feature extractors as input
    # "genre_discogs400-discogs-maest-30s-pw-ts-1": ModelConfig(
    #     name="genre_discogs400-discogs-maest-30s-pw-ts-1",
    #     model_type="Generic2D",
    #     output_layer="PartitionedCall/Identity_7",  # MAEST embedding output
    #     purpose="classifier",
    #     description="Genre Discogs400-MAEST: 400-class music genre/style classifier. Input: MAEST embeddings. Output shape: [400]"
    # ),

    "emomusic-msd-musicnn-2": ModelConfig(
        name="emomusic-msd-musicnn-2",
        model_type="MusiCNN",
        output_layer="model/dense/BiasAdd",
        purpose="feature_extractor",
        sample_rate=16000,
        description="EmoMusic-MusiCNN: Music embedding for emotion prediction (arousal/valence). Output shape: [200]"
    ),
}


# ==================== 模型組合配置 ====================
# 這些是經過驗證的端到端組合（音訊 → embedding → 分類結果）

VERIFIED_PIPELINES: Dict[str, Dict] = {
    # 使用 audioset-vggish-3 的管道
    "vggish_pipeline": {
        "extractor": "audioset-vggish-3",
        "feature_dim": 128,
        "compatible_classifiers": [
            # VGGish 無法直接輸入 MAEST 分類器（輸入維度不匹配）
            # 需要 VGGish 特定的分類器（目前未在 weights 中）
        ],
        "note": "VGGish 輸出 [128] 維度的 embedding，需要對應的分類器"
    },
    
    # 使用 discogs-effnet-bs64-1 的管道
    "effnet_pipeline": {
        "extractor": "discogs-effnet-bs64-1",
        "feature_dim": 256,
        "compatible_classifiers": [
            # EffNet embedding 維度與 MAEST embedding 不同，需要對應的分類器
        ],
        "note": "EffNet 輸出 [256] 維度的 embedding"
    },
    
    # 使用 msd-musicnn-1 的管道
    "musicnn_pipeline": {
        "extractor": "msd-musicnn-1",
        "feature_dim": 200,
        "compatible_classifiers": [
            # MusiCNN embedding 維度為 [200]，需要對應的分類器
        ],
        "note": "MusiCNN 輸出 [200] 維度的 embedding"
    },
}


# ==================== 使用示例 ====================

def get_model_config(model_name: str) -> ModelConfig:
    """
    根據模型名稱獲取配置
    
    Args:
        model_name: 模型名稱（不含 .pb）
        
    Returns:
        ModelConfig 對象
        
    Raises:
        ValueError: 如果模型不存在
    """
    if model_name not in AVAILABLE_MODELS:
        raise ValueError(
            f"Model '{model_name}' not found. Available models: "
            f"{list(AVAILABLE_MODELS.keys())}"
        )
    return AVAILABLE_MODELS[model_name]


def list_extractors() -> List[str]:
    """列出所有特徵提取模型"""
    return [
        name for name, cfg in AVAILABLE_MODELS.items()
        if cfg.purpose == "feature_extractor"
    ]


def list_classifiers() -> List[str]:
    """列出所有分類模型"""
    return [
        name for name, cfg in AVAILABLE_MODELS.items()
        if cfg.purpose == "classifier"
    ]


def get_essentia_model_loader(model_name: str):
    """
    獲取用於加載模型的 Essentia 函數
    
    Args:
        model_name: 模型名稱
        
    Returns:
        (Essentia 模型類, 輸出層名稱) 的元組
        
    Example:
        import essentia.standard as es
        model_class, output_layer = get_essentia_model_loader("audioset-vggish-3")
        model = model_class(graphFilename="path/to/model.pb", output=output_layer)
    """
    import essentia.standard as es
    
    cfg = get_model_config(model_name)
    
    model_loaders = {
        "VGGish": (es.TensorflowPredictVGGish, cfg.output_layer),
        "EffnetDiscogs": (es.TensorflowPredictEffnetDiscogs, cfg.output_layer),
        "MusiCNN": (es.TensorflowPredictMusiCNN, cfg.output_layer),
        "MAEST": (es.TensorflowPredictMAEST, cfg.output_layer),
        "Generic2D": (es.TensorflowPredict2D, cfg.output_layer),
    }
    
    if cfg.model_type not in model_loaders:
        raise ValueError(f"Unsupported model type: {cfg.model_type}")
    
    return model_loaders[cfg.model_type]


# ==================== 模型加載輔助函數 ====================

def load_essentia_model(model_name: str, model_path: str):
    """
    根據配置直接加載 Essentia 模型
    
    Args:
        model_name: 模型名稱
        model_path: 模型文件完整路徑
        
    Returns:
        加載的 Essentia 模型對象
        
    Example:
        model = load_essentia_model(
            "audioset-vggish-3",
            "/app/weights/audioset-vggish-3.pb"
        )
    """
    model_class, output_layer = get_essentia_model_loader(model_name)
    return model_class(graphFilename=model_path, output=output_layer)




# ==================== 調試/自檢 ====================

if __name__ == "__main__":
    print("=" * 60)
    print("Essentia Models Configuration")
    print("=" * 60)
    
    print("\n📦 可用的特徵提取模型:")
    for name in list_extractors():
        cfg = AVAILABLE_MODELS[name]
        print(f"  • {name}")
        print(f"    型別: {cfg.model_type}")
        print(f"    輸出層: {cfg.output_layer}")
        print(f"    描述: {cfg.description}")
    
    print("\n📦 可用的分類模型:")
    for name in list_classifiers():
        cfg = AVAILABLE_MODELS[name]
        print(f"  • {name}")
        print(f"    型別: {cfg.model_type}")
        print(f"    輸出層: {cfg.output_layer}")
        print(f"    描述: {cfg.description}")
    
    print("\n🔄 驗證的端到端管道:")
    for pipeline_name, pipeline_cfg in VERIFIED_PIPELINES.items():
        print(f"  • {pipeline_name}")
        print(f"    特徵提取: {pipeline_cfg['extractor']}")
        print(f"    特徵維度: {pipeline_cfg['feature_dim']}")
        if pipeline_cfg['compatible_classifiers']:
            for clf in pipeline_cfg['compatible_classifiers']:
                print(f"    相容分類器: {clf}")
        else:
            print(f"    相容分類器: 無（需要外部提供）")
        if 'note' in pipeline_cfg:
            print(f"    備註: {pipeline_cfg['note']}")
