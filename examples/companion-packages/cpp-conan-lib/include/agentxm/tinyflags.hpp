// agentxm/tinyflags.hpp — Tiny feature-flag library used by AXM companion
// package examples.
//
// Define flags with BooleanFlag / VariantFlag, register them in a Registry,
// and evaluate them with enabled(name, ctx) / variant(name, ctx). Rollouts are
// deterministic for a given (flag name, context id) pair so the same caller
// always receives the same answer.
//
// Example:
//
//     using namespace agentxm::tinyflags;
//
//     Registry flags;
//     flags.add("checkout-redesign",
//               BooleanFlag::with_default(true));
//     flags.add("search-ranking",
//               VariantFlag::create({"classic", "semantic"})
//                   .with_default("classic")
//                   .with_rollout({{"semantic", 100}}));
//
//     Context ctx("user-1");
//     bool on = flags.enabled("checkout-redesign", ctx);  // true
//     auto v  = flags.variant("search-ranking", ctx);     // "semantic"
//
#pragma once

#include <cstdint>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace agentxm::tinyflags {

// Caller identity used for deterministic rollout bucketing. An empty id maps
// to a single shared "anonymous" bucket; supply a stable id for per-caller
// bucketing.
class Context {
public:
    Context() = default;
    explicit Context(std::string id) : id_(std::move(id)) {}

    const std::string& id() const noexcept { return id_; }

private:
    std::string id_;
};

// Exception thrown when a flag definition or lookup is invalid.
class FlagError : public std::runtime_error {
public:
    explicit FlagError(const std::string& message) : std::runtime_error(message) {}
};

// Compute the deterministic 0..99 bucket for a flag name and context id.
// Uses 32-bit FNV-1a — matches the implementation in the other TinyFlags
// ports so bucketing decisions agree across ecosystems.
std::uint32_t bucket_for(const std::string& name, const Context& ctx);

// 32-bit FNV-1a hash. Exposed for testability and parity with the other ports.
std::uint32_t fnv1a_32(const std::string& value);

// Boolean feature flag with optional percentage rollout.
class BooleanFlag {
public:
    BooleanFlag() = default;

    static BooleanFlag with_default(bool value);

    BooleanFlag& with_rollout(int percentage);

    bool default_value() const noexcept { return default_; }
    bool has_rollout() const noexcept { return has_rollout_; }
    int rollout() const noexcept { return rollout_; }

private:
    bool default_ = false;
    bool has_rollout_ = false;
    int rollout_ = 0;
};

// Named-variant flag with optional per-variant allocations.
class VariantFlag {
public:
    VariantFlag() = default;

    static VariantFlag create(std::vector<std::string> variants);

    VariantFlag& with_default(std::string variant);
    VariantFlag& with_rollout(std::vector<std::pair<std::string, int>> allocations);

    const std::vector<std::string>& variants() const noexcept { return variants_; }
    const std::string& default_value() const noexcept { return default_; }
    bool has_rollout() const noexcept { return has_rollout_; }
    const std::vector<std::pair<std::string, int>>& rollout() const noexcept {
        return rollout_;
    }

private:
    std::vector<std::string> variants_;
    std::string default_;
    bool has_default_set_ = false;
    bool has_rollout_ = false;
    std::vector<std::pair<std::string, int>> rollout_;
};

// Tagged-union flag stored in the registry.
class Flag {
public:
    enum class Kind { Boolean, Variant };

    Flag(BooleanFlag flag);  // NOLINT(google-explicit-constructor)
    Flag(VariantFlag flag);  // NOLINT(google-explicit-constructor)

    Kind kind() const noexcept { return kind_; }
    const BooleanFlag& as_boolean() const;
    const VariantFlag& as_variant() const;

private:
    Kind kind_;
    BooleanFlag boolean_{};
    VariantFlag variant_{};
};

// Treatment of an evaluated flag. The active member is selected by `kind`.
struct Value {
    Flag::Kind kind;
    bool boolean_value = false;
    std::string variant_value;
};

// A frozen set of flag definitions evaluated against a Context.
class Registry {
public:
    Registry& add(std::string name, Flag flag);

    bool contains(const std::string& name) const;
    std::vector<std::string> names() const;

    bool enabled(const std::string& name, const Context& ctx) const;
    std::string variant(const std::string& name, const Context& ctx) const;
    Value evaluate(const std::string& name, const Context& ctx) const;

private:
    const Flag& require(const std::string& name) const;
    bool evaluate_boolean(const std::string& name, const BooleanFlag& flag,
                          const Context& ctx) const;
    std::string evaluate_variant(const std::string& name, const VariantFlag& flag,
                                 const Context& ctx) const;

    std::unordered_map<std::string, Flag> table_;
};

}  // namespace agentxm::tinyflags
