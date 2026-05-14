"""Pet records — ported verbatim from the C# reference app."""

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True, slots=True)
class Pet:
    slug: str
    name: str
    species: str
    breed: str
    age_years: int
    days_in_shelter: int
    tags: tuple[str, ...]
    needs: str

    @property
    def is_long_stay(self) -> bool:
        return self.days_in_shelter >= 120


ALL: Final[tuple[Pet, ...]] = (
    Pet(
        slug="biscuit",
        name="Biscuit",
        species="dog",
        breed="Beagle mix",
        age_years=4,
        days_in_shelter=12,
        tags=("playful", "social", "good-with-kids"),
        needs="Daily walks; loves squeaky toys.",
    ),
    Pet(
        slug="pepper",
        name="Pepper",
        species="cat",
        breed="Domestic Shorthair",
        age_years=8,
        days_in_shelter=247,
        tags=("mellow", "lap-cat", "solo"),
        needs="Quiet home preferred; no other cats.",
    ),
    Pet(
        slug="marigold",
        name="Marigold",
        species="dog",
        breed="Senior Labrador",
        age_years=11,
        days_in_shelter=89,
        tags=("calm", "gentle", "low-energy"),
        needs="Joint supplements; short walks only.",
    ),
    Pet(
        slug="tofu",
        name="Tofu",
        species="rabbit",
        breed="Holland Lop",
        age_years=2,
        days_in_shelter=31,
        tags=("curious", "social"),
        needs="Roomy enclosure and unlimited hay.",
    ),
    Pet(
        slug="otis",
        name="Otis",
        species="dog",
        breed="Pittie mix",
        age_years=5,
        days_in_shelter=156,
        tags=("gentle", "good-with-kids", "no-cats"),
        needs="Cat-free home; loves toddlers.",
    ),
    Pet(
        slug="juniper",
        name="Juniper",
        species="cat",
        breed="Tortoiseshell",
        age_years=3,
        days_in_shelter=22,
        tags=("vocal", "spunky", "solo"),
        needs="Only cat in the household, please.",
    ),
    Pet(
        slug="maple",
        name="Maple",
        species="dog",
        breed="Mini Australian Shepherd",
        age_years=1,
        days_in_shelter=6,
        tags=("high-energy", "smart", "needs-training"),
        needs="Training class strongly recommended.",
    ),
    Pet(
        slug="clover",
        name="Clover & Sage",
        species="guinea-pig",
        breed="Bonded pair",
        age_years=1,
        days_in_shelter=18,
        tags=("social", "bonded-pair"),
        needs="Must adopt together — bonded for life.",
    ),
)


_BY_SLUG: Final[dict[str, Pet]] = {pet.slug.lower(): pet for pet in ALL}


def find_by_slug(slug: str) -> Pet | None:
    return _BY_SLUG.get(slug.lower())


def filter_by_species(species: str | None) -> tuple[Pet, ...]:
    if species is None:
        return ALL
    target = species.lower()
    return tuple(pet for pet in ALL if pet.species.lower() == target)
