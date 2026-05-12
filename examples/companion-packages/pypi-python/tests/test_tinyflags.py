import pytest

from agentxm_example_tinyflags import BooleanFlag, TinyFlags, VariantFlag


def test_boolean_flags_use_defaults_when_no_rollout_is_configured() -> None:
    flags = TinyFlags(
        {
            "checkout_redesign": BooleanFlag(default=True),
        }
    )

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


def test_invalid_flag_definitions_fail_at_construction_time() -> None:
    with pytest.raises(ValueError):
        BooleanFlag(rollout=101)
    with pytest.raises(ValueError):
        VariantFlag(variants=("classic", "semantic"), default="personalized")
    with pytest.raises(ValueError):
        VariantFlag(
            variants=("classic", "semantic"),
            default="classic",
            rollout={"semantic": 80, "classic": 30},
        )


def test_unknown_flag_raises_lookup_error() -> None:
    flags = TinyFlags({})
    with pytest.raises(LookupError):
        flags.enabled("missing")
