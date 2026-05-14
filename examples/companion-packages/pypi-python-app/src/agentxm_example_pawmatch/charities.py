"""Curated charity list — ported verbatim from the C# reference app."""

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True, slots=True)
class Charity:
    slug: str
    name: str
    focus: str
    description: str
    url: str
    rating_note: str


ALL: Final[tuple[Charity, ...]] = (
    Charity(
        slug="best-friends",
        name="Best Friends Animal Society",
        focus="shelters",
        description="No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
        url="https://bestfriends.org/donate",
        rating_note="Charity Navigator 4-star",
    ),
    Charity(
        slug="petsmart-charities",
        name="PetSmart Charities",
        focus="shelters",
        description="Grants to local shelters; spay/neuter; adoption events.",
        url="https://petsmartcharities.org/donate",
        rating_note="Charity Navigator 4-star (96% program ratio)",
    ),
    Charity(
        slug="brother-wolf",
        name="Brother Wolf Animal Rescue",
        focus="rescue",
        description="Local rescue with national-impact outreach programs.",
        url="https://bwar.org/donate",
        rating_note="Charity Navigator 4-star, GuideStar Platinum",
    ),
    Charity(
        slug="animal-welfare-institute",
        name="Animal Welfare Institute",
        focus="policy",
        description="Policy and advocacy reducing cruelty inflicted on animals.",
        url="https://awionline.org/donate",
        rating_note="Charity Navigator 4-star",
    ),
    Charity(
        slug="aspca",
        name="ASPCA",
        focus="shelters",
        description="Adoption, anti-cruelty programs, and animal welfare advocacy.",
        url="https://www.aspca.org/donate",
        rating_note="Charity Navigator 4-star",
    ),
)


DISCLAIMER: Final[str] = (
    "Curated example list — verify current ratings on Charity Navigator or "
    "GuideStar before giving."
)


_BY_SLUG: Final[dict[str, Charity]] = {c.slug.lower(): c for c in ALL}


def find_by_slug(slug: str) -> Charity | None:
    return _BY_SLUG.get(slug.lower())


def filter_by_focus(focus: str) -> tuple[Charity, ...]:
    if focus.lower() == "all":
        return ALL
    target = focus.lower()
    return tuple(c for c in ALL if c.focus.lower() == target)
