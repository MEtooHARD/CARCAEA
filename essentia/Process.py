from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, List


class ExtractorModels(Enum):
    msd_musicnn_1 = "msd-musicnn-1"


class ClassifierModels(Enum):
    emomusic_msd_musicnn_2 = "emomusic-msd-musicnn-2"


@dataclass(frozen=True)
class BaseOperation(ABC):
    """
    Defines a base operation
    - the name
    - the required input type
    - the output type
    """

    name: str
    # input_type: str
    # output_type: str
    # description: str

    @abstractmethod
    def validate(self, input: Any) -> bool:
        pass

    @abstractmethod
    def run(self, input: Any) -> List[float]:
        pass

@dataclass(frozen=True)
class ExtractorOperation(BaseOperation):
    sample_rate: int = 16000
    resample_quality: int = 4
    output_layer: str

    def validate(self, input: Any) -> bool:
        return True
    def run(self, input: Any) -> List[float]:
        return []
    
