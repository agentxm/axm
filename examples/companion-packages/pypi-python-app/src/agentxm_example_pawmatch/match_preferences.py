"""Questionnaire preferences expressed as flags on a frozen dataclass."""

from collections.abc import Iterator
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class MatchPreferences:
    has_kids: bool = False
    quiet_home: bool = False
    active: bool = False
    first_time: bool = False
    multiple_pets: bool = False
    small_home: bool = False

    def active_flags(self) -> Iterator[str]:
        if self.has_kids:
            yield "has-kids"
        if self.quiet_home:
            yield "quiet-home"
        if self.active:
            yield "active"
        if self.first_time:
            yield "first-time"
        if self.multiple_pets:
            yield "multiple-pets"
        if self.small_home:
            yield "small-home"

    def to_flag_set(self) -> frozenset[str]:
        return frozenset(self.active_flags())

    @property
    def is_empty(self) -> bool:
        return not (
            self.has_kids
            or self.quiet_home
            or self.active
            or self.first_time
            or self.multiple_pets
            or self.small_home
        )
