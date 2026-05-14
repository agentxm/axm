from collections.abc import Callable

import pytest

from agentxm_example_tinyflags import BooleanFlag, TinyFlags, VariantFlag


def test_boolean_flags_use_defaults_when_no_rollout_is_configured() -> None:
    flags = TinyFlags({"checkout_redesign": BooleanFlag(default=True)})

    assert flags.enabled("checkout_redesign", {"user_id": "user-1"}) is True


def test_boolean_rollout_boundaries_are_deterministic() -> None:
    flags = TinyFlags(
        {
            "disabled_experiment": BooleanFlag(default=False, rollout=0),
            "enabled_experiment": BooleanFlag(default=False, rollout=100),
        }
    )

    assert flags.enabled("disabled_experiment", {"user_id": "user-1"}) is False
    assert flags.enabled("enabled_experiment", {"user_id": "user-1"}) is True
    assert flags.enabled("enabled_experiment", {"user_id": "user-1"}) == flags.enabled(
        "enabled_experiment", {"user_id": "user-1"}
    )


def test_variant_flags_return_defaults_outside_rollout_allocations() -> None:
    flags = TinyFlags(
        {
            "search_ranking": VariantFlag(
                variants=("classic", "semantic"),
                default="classic",
                rollout={"semantic": 0},
            ),
        }
    )

    assert flags.variant("search_ranking", {"user_id": "user-1"}) == "classic"


def test_variant_flags_can_allocate_all_traffic_to_a_variant() -> None:
    flags = TinyFlags(
        {
            "search_ranking": VariantFlag(
                variants=("classic", "semantic"),
                default="classic",
                rollout={"semantic": 100},
            ),
        }
    )

    assert flags.variant("search_ranking", {"user_id": "user-1"}) == "semantic"


def test_evaluate_dispatches_on_flag_kind() -> None:
    flags = TinyFlags(
        {
            "checkout_redesign": BooleanFlag(default=True),
            "search_ranking": VariantFlag(
                variants=("classic", "semantic"),
                default="classic",
            ),
        }
    )

    assert flags.evaluate("checkout_redesign") is True
    assert flags.evaluate("search_ranking") == "classic"


@pytest.mark.parametrize(
    ("factory", "error", "match"),
    [
        pytest.param(
            lambda: BooleanFlag(rollout=101),
            ValueError,
            "0 to 100",
            id="boolean-rollout-above-100",
        ),
        pytest.param(
            lambda: BooleanFlag(rollout=-1),
            ValueError,
            "0 to 100",
            id="boolean-rollout-negative",
        ),
        pytest.param(
            lambda: BooleanFlag(rollout=True),  # type: ignore[arg-type]
            TypeError,
            "must be an integer from 0 to 100",
            id="boolean-rollout-bool",
        ),
        pytest.param(
            lambda: VariantFlag(variants=(), default="classic"),
            ValueError,
            "at least one variant",
            id="variant-empty",
        ),
        pytest.param(
            lambda: VariantFlag(variants=("classic", "semantic"), default="personalized"),
            ValueError,
            "default must be one of the variants",
            id="variant-default-not-listed",
        ),
        pytest.param(
            lambda: VariantFlag(
                variants=("classic", "semantic"),
                default="classic",
                rollout={"semantic": 80, "classic": 30},
            ),
            ValueError,
            "cannot exceed 100",
            id="variant-rollout-over-100",
        ),
    ],
)
def test_invalid_flag_definitions_fail_at_construction_time(
    factory: Callable[[], object],
    error: type[Exception],
    match: str,
) -> None:
    with pytest.raises(error, match=match):
        factory()


def test_unknown_flag_raises_lookup_error() -> None:
    flags = TinyFlags({})

    with pytest.raises(LookupError, match="Unknown TinyFlags flag"):
        flags.enabled("missing")
