# frozen_string_literal: true

require "minitest/autorun"
require "tiny_flags"

class TinyFlagsBooleanTest < Minitest::Test
  def test_boolean_default_used_when_no_rollout
    flags = TinyFlags::Registry.new(
      "checkout_redesign" => TinyFlags::BooleanFlag.new(default: true)
    )

    assert_equal true, flags.enabled?("checkout_redesign", user_id: "user-1")
  end

  def test_boolean_rollout_zero_is_off
    flags = TinyFlags::Registry.new(
      "experiment" => TinyFlags::BooleanFlag.new(default: false, rollout: 0)
    )

    assert_equal false, flags.enabled?("experiment", user_id: "user-1")
    assert_equal false, flags.enabled?("experiment", user_id: "user-42")
  end

  def test_boolean_rollout_one_hundred_is_on
    flags = TinyFlags::Registry.new(
      "experiment" => TinyFlags::BooleanFlag.new(default: false, rollout: 100)
    )

    assert_equal true, flags.enabled?("experiment", user_id: "user-1")
    assert_equal true, flags.enabled?("experiment", user_id: "user-42")
  end

  def test_boolean_rollout_is_deterministic_per_context
    flags = TinyFlags::Registry.new(
      "experiment" => TinyFlags::BooleanFlag.new(default: false, rollout: 50)
    )
    ctx = { user_id: "user-1" }

    first = flags.enabled?("experiment", ctx)
    second = flags.enabled?("experiment", ctx)
    third = flags.enabled?("experiment", ctx)

    assert_equal first, second
    assert_equal first, third
  end

  def test_boolean_rollout_fifty_percent_boundary
    # Sample 200 distinct user ids — the 50% rollout should be on for roughly
    # half of them. We assert a generous boundary to keep the test stable.
    flags = TinyFlags::Registry.new(
      "experiment" => TinyFlags::BooleanFlag.new(default: false, rollout: 50)
    )
    on_count = (0...200).count { |i| flags.enabled?("experiment", user_id: "user-#{i}") }

    assert_operator on_count, :>=, 70
    assert_operator on_count, :<=, 130
  end
end

class TinyFlagsVariantTest < Minitest::Test
  def test_variant_default_when_no_rollout
    flags = TinyFlags::Registry.new(
      "search_ranking" => TinyFlags::VariantFlag.new(
        variants: %w[classic semantic],
        default: "classic"
      )
    )

    assert_equal "classic", flags.variant("search_ranking", user_id: "user-1")
  end

  def test_variant_rollout_zero_returns_default
    flags = TinyFlags::Registry.new(
      "search_ranking" => TinyFlags::VariantFlag.new(
        variants: %w[classic semantic],
        default: "classic",
        rollout: { "semantic" => 0 }
      )
    )

    assert_equal "classic", flags.variant("search_ranking", user_id: "user-1")
  end

  def test_variant_full_allocation_returns_variant
    flags = TinyFlags::Registry.new(
      "search_ranking" => TinyFlags::VariantFlag.new(
        variants: %w[classic semantic],
        default: "classic",
        rollout: { "semantic" => 100 }
      )
    )

    assert_equal "semantic", flags.variant("search_ranking", user_id: "user-1")
  end

  def test_variant_is_deterministic_per_context
    flags = TinyFlags::Registry.new(
      "search_ranking" => TinyFlags::VariantFlag.new(
        variants: %w[classic semantic personalized],
        default: "classic",
        rollout: { "semantic" => 33, "personalized" => 33 }
      )
    )
    ctx = { user_id: "user-1" }

    assert_equal flags.variant("search_ranking", ctx), flags.variant("search_ranking", ctx)
  end
end

class TinyFlagsValidationTest < Minitest::Test
  def test_boolean_rollout_above_100_raises
    assert_raises(ArgumentError) { TinyFlags::BooleanFlag.new(rollout: 101) }
  end

  def test_boolean_rollout_negative_raises
    assert_raises(ArgumentError) { TinyFlags::BooleanFlag.new(rollout: -1) }
  end

  def test_boolean_rollout_non_integer_raises
    assert_raises(TypeError) { TinyFlags::BooleanFlag.new(rollout: true) }
  end

  def test_variant_requires_at_least_one_variant
    assert_raises(ArgumentError) do
      TinyFlags::VariantFlag.new(variants: [], default: "classic")
    end
  end

  def test_variant_default_must_be_in_variants
    assert_raises(ArgumentError) do
      TinyFlags::VariantFlag.new(variants: %w[classic semantic], default: "personalized")
    end
  end

  def test_variant_rollout_cannot_exceed_100
    assert_raises(ArgumentError) do
      TinyFlags::VariantFlag.new(
        variants: %w[classic semantic],
        default: "classic",
        rollout: { "semantic" => 80, "classic" => 30 }
      )
    end
  end

  def test_variant_rollout_unknown_variant_raises
    assert_raises(ArgumentError) do
      TinyFlags::VariantFlag.new(
        variants: %w[classic semantic],
        default: "classic",
        rollout: { "personalized" => 10 }
      )
    end
  end

  def test_unknown_flag_lookup_raises
    flags = TinyFlags::Registry.new({})
    assert_raises(KeyError) { flags.enabled?("missing") }
  end

  def test_evaluate_dispatches_on_kind
    flags = TinyFlags::Registry.new(
      "checkout_redesign" => TinyFlags::BooleanFlag.new(default: true),
      "search_ranking" => TinyFlags::VariantFlag.new(
        variants: %w[classic semantic],
        default: "classic"
      )
    )

    assert_equal true, flags.evaluate("checkout_redesign")
    assert_equal "classic", flags.evaluate("search_ranking")
  end
end
