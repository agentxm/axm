"""TinyFlags evaluator with deterministic rollout bucketing."""

from collections.abc import Iterator, Mapping
from types import MappingProxyType
from typing import Final

from ._flags import BooleanFlag, Flag, FlagContext, VariantFlag

__all__ = ["TinyFlags"]

_FNV_OFFSET: Final[int] = 2_166_136_261
_FNV_PRIME: Final[int] = 16_777_619
_UINT32: Final[int] = 0xFFFF_FFFF


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
