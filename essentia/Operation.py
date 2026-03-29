from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
import os
import tempfile
from typing import Any
from numpy import ndarray
import essentia.standard as es
from Util import non_instantiatable
from pathlib import Path

@dataclass(frozen=True)
class BaseOperation(ABC):
    name: str
    graphFilename: str
    output_layer: str

    @classmethod
    @abstractmethod
    def run(cls, input: Any) -> ndarray[Any, Any]:
        pass


@dataclass(frozen=True)
class ExtractorOperation(BaseOperation):
    sample_rate: int = 16000
    resample_quality: int = 4

    @classmethod
    def run(cls, input: bytes) -> ndarray[Any, Any]:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(input)
            tmp_path = f.name

        try:
            audio = es.MonoLoader(
                filename=tmp_path,
                sampleRate=cls.sample_rate,
                resampleQuality=cls.resample_quality
            )()

            model = cls.prepare_model(cls.graphFilename, cls.output_layer)

            result = model(audio)
            
            # If result is 2D (frame-level embeddings), average across frames to get a single embedding
            if len(result.shape) == 2:
                result = result.mean(axis=0)

            return result
        finally:
            os.remove(tmp_path)

    @classmethod
    @abstractmethod
    def prepare_model(cls, graphFilename: str, output_layer: str) -> Any:
        pass

@dataclass(frozen=True)
class ClassifierOperation(BaseOperation):
    @classmethod
    def run(cls, input: ndarray[Any, Any]) -> ndarray[Any, Any]:
        model = es.TensorflowPredict2D(
            graphFilename=cls.graphFilename,
            output=cls.output_layer
        )

        # TensorflowPredict2D expects a 2D matrix (batch dimension)
        # Reshape 1D embedding (200,) to 2D (1, 200)
        if len(input.shape) == 1:
            input = input.reshape(1, -1)

        predictions = model(input)

        # If output is 2D with batch size 1, squeeze to 1D
        if len(predictions.shape) == 2 and predictions.shape[0] == 1:
            predictions = predictions.squeeze(axis=0)

        return predictions

# Actual Operations
WEIGHTS_DIR = Path(__file__).parent / "weights"

@non_instantiatable
@dataclass(frozen=True)
class MSDMusicNN1(ExtractorOperation):
    name: str = "msd-musicnn-1"
    graphFilename: str = str(WEIGHTS_DIR / "msd-musicnn-1.pb")
    output_layer: str = "model/dense/BiasAdd"

    @classmethod
    def prepare_model(cls, graphFilename: str, output_layer: str) -> Any:
        return es.TensorflowPredictMusiCNN(
            graphFilename=graphFilename,
            output=output_layer
        )
    
@non_instantiatable
@dataclass(frozen=True)
class EmoMusicMSDMusicNN2(ClassifierOperation):
    name: str = "emomusic-msd-musicnn-2"
    graphFilename: str = str(WEIGHTS_DIR / "emomusic-msd-musicnn-2.pb")
    output_layer: str = "model/Identity"
    


# from essentia.standard import MonoLoader, TensorflowPredictMusiCNN, TensorflowPredict2D

# audio = MonoLoader(filename="audio.wav", sampleRate=16000, resampleQuality=4)()
# embedding_model = TensorflowPredictMusiCNN(graphFilename="msd-musicnn-1.pb", output="model/dense/BiasAdd")
# embeddings = embedding_model(audio)

# model = TensorflowPredict2D(graphFilename="emomusic-msd-musicnn-2.pb", output="model/Identity")
# predictions = model(embeddings)
