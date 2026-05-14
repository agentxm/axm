#include "agentxm/tinyflags.hpp"

#include <catch2/catch_test_macros.hpp>

#include <string>

using namespace agentxm::tinyflags;

TEST_CASE("boolean default is returned without rollout", "[boolean]") {
    Registry flags;
    flags.add("checkout-redesign", BooleanFlag::with_default(true));

    REQUIRE(flags.enabled("checkout-redesign", Context("user-1")));
}

TEST_CASE("boolean rollout boundaries", "[boolean][rollout]") {
    Registry flags;
    flags.add("off", BooleanFlag::with_default(false).with_rollout(0));
    flags.add("on", BooleanFlag::with_default(false).with_rollout(100));

    for (const auto* id : {"user-1", "user-2", "alice", "bob", "carol", ""}) {
        Context ctx{id};
        REQUIRE_FALSE(flags.enabled("off", ctx));
        REQUIRE(flags.enabled("on", ctx));
    }
}

TEST_CASE("boolean fifty percent splits roughly evenly", "[boolean][rollout]") {
    Registry flags;
    flags.add("half", BooleanFlag::with_default(false).with_rollout(50));

    constexpr int n = 1000;
    int enabled = 0;
    for (int i = 0; i < n; ++i) {
        Context ctx{std::string("user-") + std::to_string(i)};
        if (flags.enabled("half", ctx)) {
            ++enabled;
        }
    }
    REQUIRE(enabled > n / 4);
    REQUIRE(enabled < (3 * n) / 4);
}

TEST_CASE("boolean decision is stable for same context", "[boolean][rollout]") {
    Registry flags;
    flags.add("experiment", BooleanFlag::with_default(false).with_rollout(37));

    Context ctx{"user-42"};
    const bool first = flags.enabled("experiment", ctx);
    for (int i = 0; i < 100; ++i) {
        REQUIRE(flags.enabled("experiment", ctx) == first);
    }
}

TEST_CASE("variant default returned without rollout", "[variant]") {
    Registry flags;
    flags.add(
        "search-ranking",
        VariantFlag::create({"classic", "semantic"}).with_default("classic"));

    REQUIRE(flags.variant("search-ranking", Context("user-1")) == "classic");
}

TEST_CASE("variant rollout hundred replaces default", "[variant][rollout]") {
    Registry flags;
    flags.add(
        "search-ranking",
        VariantFlag::create({"classic", "semantic"})
            .with_default("classic")
            .with_rollout({{"semantic", 100}}));

    for (const auto* id : {"alice", "bob", "carol", "dave"}) {
        REQUIRE(flags.variant("search-ranking", Context(id)) == "semantic");
    }
}

TEST_CASE("variant rollout zero falls back to default", "[variant][rollout]") {
    Registry flags;
    flags.add(
        "search-ranking",
        VariantFlag::create({"classic", "semantic"})
            .with_default("classic")
            .with_rollout({{"semantic", 0}}));

    REQUIRE(flags.variant("search-ranking", Context("user-1")) == "classic");
}

TEST_CASE("variant decision is stable for same context", "[variant][rollout]") {
    Registry flags;
    flags.add(
        "strategy",
        VariantFlag::create({"a", "b", "c"})
            .with_default("a")
            .with_rollout({{"b", 25}, {"c", 25}}));

    Context ctx{"user-7"};
    const auto first = flags.variant("strategy", ctx);
    for (int i = 0; i < 100; ++i) {
        REQUIRE(flags.variant("strategy", ctx) == first);
    }
}

TEST_CASE("variant rejects unknown default", "[variant][validation]") {
    REQUIRE_THROWS_AS(
        VariantFlag::create({"classic", "semantic"}).with_default("personalized"),
        FlagError);
}

TEST_CASE("variant rejects unknown rollout key", "[variant][validation]") {
    REQUIRE_THROWS_AS(
        VariantFlag::create({"classic", "semantic"})
            .with_rollout({{"personalized", 50}}),
        FlagError);
}

TEST_CASE("variant rejects rollout over hundred", "[variant][validation]") {
    REQUIRE_THROWS_AS(
        VariantFlag::create({"classic", "semantic"})
            .with_rollout({{"classic", 80}, {"semantic", 30}}),
        FlagError);
}

TEST_CASE("variant rejects duplicate variants", "[variant][validation]") {
    REQUIRE_THROWS_AS(VariantFlag::create({"a", "a"}), FlagError);
}

TEST_CASE("variant rejects empty list", "[variant][validation]") {
    REQUIRE_THROWS_AS(VariantFlag::create({}), FlagError);
}

TEST_CASE("boolean rejects out-of-range rollout", "[boolean][validation]") {
    REQUIRE_THROWS_AS(BooleanFlag::with_default(false).with_rollout(101), FlagError);
    REQUIRE_THROWS_AS(BooleanFlag::with_default(false).with_rollout(-1), FlagError);
}

TEST_CASE("enabled on variant flag throws", "[registry][kind]") {
    Registry flags;
    flags.add("strategy",
              VariantFlag::create({"a", "b"}).with_default("a"));
    REQUIRE_THROWS_AS(flags.enabled("strategy", Context{}), FlagError);
}

TEST_CASE("variant on boolean flag throws", "[registry][kind]") {
    Registry flags;
    flags.add("toggle", BooleanFlag::with_default(true));
    REQUIRE_THROWS_AS(flags.variant("toggle", Context{}), FlagError);
}

TEST_CASE("evaluate dispatches by kind", "[registry]") {
    Registry flags;
    flags.add("toggle", BooleanFlag::with_default(true));
    flags.add("strategy",
              VariantFlag::create({"a", "b"}).with_default("b"));

    Context ctx;
    auto toggle_value = flags.evaluate("toggle", ctx);
    REQUIRE(toggle_value.kind == Flag::Kind::Boolean);
    REQUIRE(toggle_value.boolean_value);

    auto strategy_value = flags.evaluate("strategy", ctx);
    REQUIRE(strategy_value.kind == Flag::Kind::Variant);
    REQUIRE(strategy_value.variant_value == "b");
}

TEST_CASE("unknown flag throws", "[registry]") {
    Registry flags;
    REQUIRE_THROWS_AS(flags.enabled("missing", Context{}), FlagError);
    REQUIRE_THROWS_AS(flags.variant("missing", Context{}), FlagError);
    REQUIRE_THROWS_AS(flags.evaluate("missing", Context{}), FlagError);
}

TEST_CASE("duplicate flag name throws", "[registry]") {
    Registry flags;
    flags.add("dup", BooleanFlag::with_default(true));
    REQUIRE_THROWS_AS(flags.add("dup", BooleanFlag::with_default(false)), FlagError);
}

TEST_CASE("names returns sorted", "[registry]") {
    Registry flags;
    flags.add("b", BooleanFlag::with_default(false));
    flags.add("a", BooleanFlag::with_default(false));
    flags.add("c", VariantFlag::create({"x"}));

    auto names = flags.names();
    REQUIRE(names == std::vector<std::string>{"a", "b", "c"});
}
