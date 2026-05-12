"""Tiny feature flags library used by AXM companion package examples."""

from ._engine import TinyFlags
from ._flags import BooleanFlag, Flag, FlagContext, VariantFlag

__all__ = [
    "BooleanFlag",
    "Flag",
    "FlagContext",
    "TinyFlags",
    "VariantFlag",
]
