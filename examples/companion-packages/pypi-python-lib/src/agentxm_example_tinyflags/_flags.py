"""Flag definitions and validation."""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import TypedDict

__all__ = [
    "BooleanFlag",
    "Flag",
    "FlagContext",
    "VariantFlag",
    "validate_percentage",
]


class FlagContext(TypedDict, total=False):
    """Stable identity used to bucket a flag evaluation."""

    user_id: str
    account_id: str
    session_id: str


@dataclass(frozen=True, slots=True)
class BooleanFlag:
    default: bool = False
    rollout: int | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.default, bool):
            raise TypeError("BooleanFlag default must be a bool")
        if self.rollout is not None:
            validate_percentage(self.rollout, "BooleanFlag rollout")


@dataclass(frozen=True, slots=True, kw_only=True)
class VariantFlag:
    variants: tuple[str, ...]
    default: str
    rollout: Mapping[str, int] | None = None

    def __post_init__(self) -> None:
        if not self.variants:
            raise ValueError("VariantFlag requires at least one variant")
        if len(set(self.variants)) != len(self.variants) or any(not v for v in self.variants):
            raise ValueError("VariantFlag variants must be unique non-empty strings")
        if self.default not in self.variants:
            raise ValueError("VariantFlag default must be one of the variants")
        if self.rollout is None:
            return

        total = 0
        for name, percentage in self.rollout.items():
            if name not in self.variants:
                raise ValueError(f"VariantFlag rollout references unknown variant: {name!r}")
            validate_percentage(percentage, f"rollout for {name!r}")
            total += percentage
        if total > 100:
            raise ValueError("VariantFlag rollout percentages cannot exceed 100")


type Flag = BooleanFlag | VariantFlag


def validate_percentage(value: int, label: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{label} must be an integer from 0 to 100")
    if value < 0 or value > 100:
        raise ValueError(f"{label} must be an integer from 0 to 100")
