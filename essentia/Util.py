from typing import TypeVar


T = TypeVar('T')

def non_instantiatable(cls: T) -> T:
    """Mark a class as non-instantiatable for type checkers."""
    if '__annotations__' not in cls.__dict__:
        cls.__annotations__ = {}
    cls.__annotations__['__init__'] = None  # type: ignore
    return cls