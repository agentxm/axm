"""Typer CLI for PawMatch — community pet-adoption example."""

from __future__ import annotations

import getpass
import os
import subprocess
import sys
from typing import Annotated, Final

import typer
from agentxm_example_tinyflags import FlagContext, TinyFlags

from . import charities, flags, pets
from .match_preferences import MatchPreferences
from .variants import DonateFocus, MatchDepth, MatchStrategy, PetCardStyle

app = typer.Typer(
    name="pawmatch",
    help="pawmatch — community pet adoption CLI.",
    no_args_is_help=True,
    add_completion=False,
)


_ALL_FACTORS: Final[tuple[tuple[str, tuple[str, ...]], ...]] = (
    ("has-kids", ("good-with-kids", "gentle")),
    ("quiet-home", ("mellow", "calm", "solo", "lap-cat")),
    ("active", ("high-energy", "playful")),
    ("first-time", ("gentle", "calm", "low-energy")),
    ("multiple-pets", ("social",)),
    ("small-home", ("lap-cat", "solo", "low-energy")),
)

_POPULARITY_TAGS: Final[frozenset[str]] = frozenset(
    ("social", "good-with-kids", "calm", "mellow", "gentle")
)


def _session_id() -> str:
    try:
        return getpass.getuser()
    except (KeyError, OSError):
        return os.environ.get("USER") or os.environ.get("USERNAME") or "anonymous"


def _context() -> FlagContext:
    return FlagContext(session_id=_session_id())


def _flags() -> TinyFlags:
    return flags.create_flags()


def _factors_for_depth(depth: MatchDepth) -> tuple[tuple[str, tuple[str, ...]], ...]:
    take = {MatchDepth.SHORT: 2, MatchDepth.THOROUGH: 6}.get(depth, 4)
    return _ALL_FACTORS[:take]


def _render_pet(pet: pets.Pet, style: PetCardStyle) -> None:
    long_stay_badge = " ★" if pet.is_long_stay else ""
    if style is PetCardStyle.COMPACT:
        typer.echo(
            f"  {pet.slug:<10} {pet.name:<14} {pet.species:<10} {pet.age_years}y{long_stay_badge}"
        )
    elif style is PetCardStyle.PLAYFUL:
        tag_phrase = " & ".join(pet.tags)
        typer.echo(
            f"  🐾 {pet.name}{long_stay_badge} — a {pet.age_years}-year-old "
            f"{pet.breed.lower()} who is {tag_phrase}."
        )
    else:
        typer.echo(f"  {pet.name}{long_stay_badge}  [{pet.slug}]")
        typer.echo(f"    {pet.breed}, {pet.age_years} years old")
        typer.echo(f"    Tags: {', '.join(pet.tags)}")
        typer.echo()


def _render_charity(charity: charities.Charity, show_ratings: bool) -> None:
    typer.echo(f"  {charity.name}  [{charity.slug}]")
    typer.echo(f"    Focus: {charity.focus}")
    typer.echo(f"    {charity.description}")
    typer.echo(f"    Donate: {charity.url}")
    if show_ratings:
        typer.echo(f"    Rating: {charity.rating_note}")


def _open_url(url: str) -> int:
    cmd: list[str]
    if sys.platform == "darwin":
        cmd = ["open", url]
    elif sys.platform.startswith("linux"):
        cmd = ["xdg-open", url]
    elif sys.platform == "win32":
        os.startfile(url)  # type: ignore[attr-defined]
        return 0
    else:
        typer.echo(f"Unable to open browser on this platform. URL: {url}", err=True)
        return 1

    try:
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError as exc:
        typer.echo(f"Unable to open browser ({type(exc).__name__}). URL: {url}", err=True)
        return 1
    return 0


@app.command()
def browse(
    species: Annotated[
        str | None,
        typer.Option("--species", help="Filter by species (dog|cat|rabbit|guinea-pig)."),
    ] = None,
) -> None:
    """Browse adoptable pets."""
    matching = pets.filter_by_species(species)
    if not matching:
        typer.echo(f"No adoptable pets found for species '{species}'.")
        return

    tf = _flags()
    ctx = _context()
    if tf.enabled(flags.LONG_STAY_HIGHLIGHT, ctx):
        long_stay = sorted(
            (p for p in matching if p.is_long_stay),
            key=lambda p: p.days_in_shelter,
            reverse=True,
        )
        if long_stay:
            featured = long_stay[0]
            typer.echo(f"★ Featured long-stay friend — please consider {featured.name}!")
            typer.echo()

    style = PetCardStyle(tf.variant(flags.PET_CARD_STYLE, ctx))
    for pet in matching:
        _render_pet(pet, style)


@app.command()
def show(pet: Annotated[str, typer.Argument(help="Pet slug (see 'pawmatch browse').")]) -> None:
    """Show details for a pet."""
    found = pets.find_by_slug(pet)
    if found is None:
        typer.echo(f"Unknown pet '{pet}'. Try 'pawmatch browse'.", err=True)
        raise typer.Exit(code=1)

    _render_pet(found, PetCardStyle.DETAILED)
    typer.echo(f"  Needs: {found.needs}")
    suffix = " (long-stay)" if found.is_long_stay else ""
    typer.echo(f"  Days in shelter: {found.days_in_shelter}{suffix}")


@app.command()
def match(
    has_kids: Annotated[bool, typer.Option("--has-kids", help="Family with children.")] = False,
    quiet_home: Annotated[
        bool, typer.Option("--quiet-home", help="Quiet, calm household.")
    ] = False,
    active: Annotated[bool, typer.Option("--active", help="Active, outdoor lifestyle.")] = False,
    first_time: Annotated[
        bool, typer.Option("--first-time", help="First-time pet adopter.")
    ] = False,
    multiple_pets: Annotated[
        bool, typer.Option("--multiple-pets", help="Other pets at home.")
    ] = False,
    small_home: Annotated[
        bool, typer.Option("--small-home", help="Small home or apartment.")
    ] = False,
) -> None:
    """Match pets to your lifestyle."""
    preferences = MatchPreferences(
        has_kids=has_kids,
        quiet_home=quiet_home,
        active=active,
        first_time=first_time,
        multiple_pets=multiple_pets,
        small_home=small_home,
    )
    tf = _flags()
    ctx = _context()
    strategy = MatchStrategy(tf.variant(flags.RECOMMENDATION_STRATEGY, ctx))
    depth = MatchDepth(tf.variant(flags.MATCH_QUIZ_DEPTH, ctx))
    factors = _factors_for_depth(depth)
    user_flags = preferences.to_flag_set()
    wants: set[str] = set()
    for factor_flag, tags in factors:
        if factor_flag not in user_flags:
            continue
        wants.update(tags)

    typer.echo(
        f"Strategy: {strategy.value} • Quiz depth: {depth.value} "
        f"({len(factors)} factor(s) considered)"
    )
    if preferences.is_empty:
        typer.echo(
            "(no preference flags provided — try --has-kids --quiet-home --active --first-time)"
        )
    typer.echo()

    if strategy is MatchStrategy.POPULARITY:
        ranked = sorted(
            pets.ALL,
            key=lambda p: sum(1 for t in p.tags if t in _POPULARITY_TAGS),
            reverse=True,
        )
    elif strategy is MatchStrategy.LONGEST_STAY:
        ranked = sorted(pets.ALL, key=lambda p: p.days_in_shelter, reverse=True)
    else:
        ranked = sorted(
            pets.ALL,
            key=lambda p: sum(1 for t in p.tags if t in wants),
            reverse=True,
        )

    for pet in ranked[:3]:
        typer.echo(
            f"  • {pet.name} ({pet.breed}, {pet.age_years}y) — {', '.join(pet.tags)}"
        )

    typer.echo()
    typer.echo("Adoption is a conversation — book a meet-and-greet to see if it's a fit.")


@app.command()
def apply(pet: Annotated[str, typer.Argument(help="Pet slug to apply for.")]) -> None:
    """Start an adoption application."""
    found = pets.find_by_slug(pet)
    if found is None:
        typer.echo(f"Unknown pet '{pet}'. Try 'pawmatch browse'.", err=True)
        raise typer.Exit(code=1)

    typer.echo(f"Adoption application for {found.name}")
    typer.echo()
    typer.echo("Next steps:")
    typer.echo("  1. Application reviewed by an adoption counselor (1–2 days).")
    typer.echo("  2. Meet-and-greet scheduled at the shelter.")
    typer.echo("  3. 48-hour reflection period before finalizing.")
    typer.echo("  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.")

    tf = _flags()
    ctx = _context()
    if tf.enabled(flags.HOME_CHECK_FOLLOWUP, ctx):
        typer.echo(
            "  5. Two-week follow-up check from a counselor to see how you're settling in."
        )

    typer.echo()
    typer.echo("Returns are always accepted, no questions asked.")

    if tf.enabled(flags.SUGGEST_DONATE_AFTER_ADOPTION, ctx):
        typer.echo()
        typer.echo(f"If {found.name} brings you joy, please consider donating to a shelter:")
        typer.echo("  pawmatch donate")


@app.command()
def fees() -> None:
    """Show adoption fees."""
    typer.echo("Adoption fees")
    typer.echo()
    tf = _flags()
    ctx = _context()
    if tf.enabled(flags.FEE_BREAKDOWN_DETAILED, ctx):
        typer.echo("  Dog adoption — $150 total:")
        typer.echo("    $60   spay / neuter surgery")
        typer.echo("    $45   core vaccinations")
        typer.echo("    $25   microchip and registration")
        typer.echo("    $20   intake exam and deworming")
        typer.echo()
        typer.echo("  Cat adoption — $90 total:")
        typer.echo("    $50   spay / neuter surgery")
        typer.echo("    $25   core vaccinations")
        typer.echo("    $15   microchip and registration")
        typer.echo()
        typer.echo("  Small animal — $35 total (intake exam + microchip).")
    else:
        typer.echo("  Dog adoption           $150")
        typer.echo("  Cat adoption            $90")
        typer.echo("  Small animal            $35")
        typer.echo()
        typer.echo("  Fees cover spay/neuter, vaccines, and microchip.")

    typer.echo()
    typer.echo("No one is turned away for inability to pay — ask about our subsidy fund.")


@app.command("return-support")
def return_support() -> None:
    """Return support information."""
    typer.echo("Return support")
    typer.echo()
    typer.echo("If your adoption isn't working out, we're here to help.")
    typer.echo("  • Free behavior consultation with our trainers.")
    typer.echo("  • No-judgment returns at any time — your pet stays in our care.")
    typer.echo("  • Connections to low-cost vet and food assistance programs.")
    typer.echo()
    typer.echo("Returning a pet is not a failure. Reach out as soon as you'd like support.")


@app.command()
def donate(
    charity: Annotated[
        str | None,
        typer.Argument(help="Charity slug (optional — omit to list charities)."),
    ] = None,
    focus: Annotated[
        str | None,
        typer.Option("--focus", help="Charity focus (all|shelters|rescue|policy)."),
    ] = None,
    open_url: Annotated[
        bool, typer.Option("--open", help="Open the charity's donation URL in a browser.")
    ] = False,
) -> None:
    """Browse animal-welfare charities to support."""
    tf = _flags()
    ctx = _context()
    default_focus = DonateFocus(tf.variant(flags.DONATE_FOCUS_DEFAULT, ctx))
    effective_focus = focus if focus is not None else default_focus.value
    show_ratings = tf.enabled(flags.SHOW_CHARITY_RATINGS, ctx)

    if charity is not None:
        target = charities.find_by_slug(charity)
        if target is None:
            typer.echo(f"Unknown charity '{charity}'.", err=True)
            raise typer.Exit(code=1)

        if open_url:
            raise typer.Exit(code=_open_url(target.url))

        _render_charity(target, show_ratings)
        return

    listing = charities.filter_by_focus(effective_focus)
    typer.echo(f"Animal-welfare charities (focus: {effective_focus})")
    typer.echo()
    for entry in listing:
        _render_charity(entry, show_ratings)
        typer.echo()

    typer.echo(charities.DISCLAIMER)
    if not show_ratings:
        typer.echo("Ratings hidden — set show-charity-ratings to surface them inline.")


if __name__ == "__main__":
    app()
