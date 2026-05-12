"""Tiny feature flags library used by AXM companion package examples."""

from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Final, TypedDict

__all__ = [
    "BooleanFlag",
    "Flag",
    "FlagContext",
    "TinyFlags",
    "VariantFlag",
]

_FNV_OFFSET: Final[int] = 2_166_136_261
_FNV_PRIME: Final[int] = 16_777_619
_UINT32: Final[int] = 0xFFFF_FFFF


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
            _validate_percentage(self.rollout, "BooleanFlag rollout")


@dataclass(frozen=True, slots=True)
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
            _validate_percentage(percentage, f"rollout for {name!r}")
            total += percentage
        if total > 100:
            raise ValueError("VariantFlag rollout percentages cannot exceed 100")


Flag = BooleanFlag | VariantFlag


class TinyFlags:
    """Evaluate a set of feature flags with deterministic rollout bucketing."""

    __slots__ = ("_definitions",)

    def __init__(self, definitions: Mapping[str, Flag]) -> None:
        if not isinstance(definitions, Mapping):
            raise TypeError("TinyFlags requires a flag definition mapping")
        self._definitions: Mapping[str, Flag] = MappingProxyType(dict(definitions))

    @property
    def definitions(self) -> Mapping[str, Flag]:
        return self._definitions

    def __iter__(self) -> Iterator[str]:
        return iter(self._definitions)

    def __contains__(self, name: object) -> bool:
        return name in self._definitions

    def enabled(self, name: str, context: FlagContext | None = None) -> bool:
        flag = self._lookup(name)
        if not isinstance(flag, BooleanFlag):
            raise TypeError(f"TinyFlags flag {name!r} is not a boolean flag")
        if flag.rollout is None:
            return flag.default
        return _bucket(name, context) < flag.rollout

    def variant(self, name: str, context: FlagContext | None = None) -> str:
        flag = self._lookup(name)
        if not isinstance(flag, VariantFlag):
            raise TypeError(f"TinyFlags flag {name!r} is not a variant flag")
        if flag.rollout is None:
            return flag.default

        bucket = _bucket(name, context)
        upper_bound = 0
        for variant_name, percentage in flag.rollout.items():
            upper_bound += percentage
            if bucket < upper_bound:
                return variant_name
        return flag.default

    def evaluate(self, name: str, context: FlagContext | None = None) -> bool | str:
        flag = self._lookup(name)
        if isinstance(flag, BooleanFlag):
            return self.enabled(name, context)
        return self.variant(name, context)

    def _lookup(self, name: str) -> Flag:
        flag = self._definitions.get(name)
        if flag is None:
            raise LookupError(f"Unknown TinyFlags flag: {name!r}")
        return flag


def _validate_percentage(value: int, label: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{label} must be an integer from 0 to 100")
    if value < 0 or value > 100:
        raise ValueError(f"{label} must be an integer from 0 to 100")


def _bucket(name: str, context: FlagContext | None) -> int:
    key = "anonymous"
    if context is not None:
        key = (
            context.get("user_id")
            or context.get("account_id")
            or context.get("session_id")
            or "anonymous"
        )
    return _fnv1a(f"{name}:{key}") % 100


def _fnv1a(value: str) -> int:
    hash_value = _FNV_OFFSET
    for byte in value.encode("utf-8"):
        hash_value ^= byte
        hash_value = (hash_value * _FNV_PRIME) & _UINT32
    return hash_value
