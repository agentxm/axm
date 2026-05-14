#include "agentxm/tinyflags.hpp"

#include <algorithm>
#include <set>

namespace agentxm::tinyflags {

namespace {

void validate_percentage(int value, const std::string& label) {
    if (value < 0 || value > 100) {
        throw FlagError(label + " must be an integer in 0..100");
    }
}

}  // namespace

std::uint32_t fnv1a_32(const std::string& value) {
    constexpr std::uint32_t kOffset = 2166136261u;
    constexpr std::uint32_t kPrime = 16777619u;
    std::uint32_t hash = kOffset;
    for (unsigned char byte : value) {
        hash ^= static_cast<std::uint32_t>(byte);
        hash *= kPrime;
    }
    return hash;
}

std::uint32_t bucket_for(const std::string& name, const Context& ctx) {
    const std::string& id = ctx.id().empty() ? std::string("anonymous") : ctx.id();
    std::string key;
    key.reserve(name.size() + 1 + id.size());
    key.append(name);
    key.push_back(':');
    key.append(id);
    return fnv1a_32(key) % 100u;
}

// ── BooleanFlag ─────────────────────────────────────────────────────────────

BooleanFlag BooleanFlag::with_default(bool value) {
    BooleanFlag flag;
    flag.default_ = value;
    return flag;
}

BooleanFlag& BooleanFlag::with_rollout(int percentage) {
    validate_percentage(percentage, "BooleanFlag rollout");
    rollout_ = percentage;
    has_rollout_ = true;
    return *this;
}

// ── VariantFlag ─────────────────────────────────────────────────────────────

VariantFlag VariantFlag::create(std::vector<std::string> variants) {
    if (variants.empty()) {
        throw FlagError("VariantFlag requires at least one variant");
    }
    std::set<std::string> seen;
    for (const auto& v : variants) {
        if (v.empty()) {
            throw FlagError("VariantFlag variants must be non-empty strings");
        }
        if (!seen.insert(v).second) {
            throw FlagError("VariantFlag variants must be unique: " + v);
        }
    }
    VariantFlag flag;
    flag.variants_ = std::move(variants);
    flag.default_ = flag.variants_.front();
    return flag;
}

VariantFlag& VariantFlag::with_default(std::string variant) {
    if (std::find(variants_.begin(), variants_.end(), variant) == variants_.end()) {
        throw FlagError("VariantFlag default must be one of the variants: " + variant);
    }
    default_ = std::move(variant);
    has_default_set_ = true;
    return *this;
}

VariantFlag& VariantFlag::with_rollout(
    std::vector<std::pair<std::string, int>> allocations) {
    int total = 0;
    for (const auto& [name, percentage] : allocations) {
        if (std::find(variants_.begin(), variants_.end(), name) == variants_.end()) {
            throw FlagError("VariantFlag rollout references unknown variant: " + name);
        }
        validate_percentage(percentage, "VariantFlag rollout for '" + name + "'");
        total += percentage;
    }
    if (total > 100) {
        throw FlagError("VariantFlag rollout percentages cannot exceed 100");
    }
    rollout_ = std::move(allocations);
    has_rollout_ = true;
    return *this;
}

// ── Flag ────────────────────────────────────────────────────────────────────

Flag::Flag(BooleanFlag flag) : kind_(Kind::Boolean), boolean_(std::move(flag)) {}
Flag::Flag(VariantFlag flag) : kind_(Kind::Variant), variant_(std::move(flag)) {}

const BooleanFlag& Flag::as_boolean() const {
    if (kind_ != Kind::Boolean) {
        throw FlagError("Flag is not a boolean flag");
    }
    return boolean_;
}

const VariantFlag& Flag::as_variant() const {
    if (kind_ != Kind::Variant) {
        throw FlagError("Flag is not a variant flag");
    }
    return variant_;
}

// ── Registry ────────────────────────────────────────────────────────────────

Registry& Registry::add(std::string name, Flag flag) {
    if (name.empty()) {
        throw FlagError("Registry flag name must not be empty");
    }
    auto [it, inserted] = table_.emplace(std::move(name), std::move(flag));
    if (!inserted) {
        throw FlagError("Registry flag is already registered: " + it->first);
    }
    return *this;
}

bool Registry::contains(const std::string& name) const {
    return table_.find(name) != table_.end();
}

std::vector<std::string> Registry::names() const {
    std::vector<std::string> result;
    result.reserve(table_.size());
    for (const auto& [name, _] : table_) {
        result.push_back(name);
    }
    std::sort(result.begin(), result.end());
    return result;
}

const Flag& Registry::require(const std::string& name) const {
    auto it = table_.find(name);
    if (it == table_.end()) {
        throw FlagError("Unknown flag: " + name);
    }
    return it->second;
}

bool Registry::evaluate_boolean(const std::string& name, const BooleanFlag& flag,
                                const Context& ctx) const {
    if (!flag.has_rollout()) {
        return flag.default_value();
    }
    return static_cast<int>(bucket_for(name, ctx)) < flag.rollout();
}

std::string Registry::evaluate_variant(const std::string& name,
                                       const VariantFlag& flag,
                                       const Context& ctx) const {
    if (!flag.has_rollout()) {
        return flag.default_value();
    }
    const auto bucket = static_cast<int>(bucket_for(name, ctx));
    int upper = 0;
    for (const auto& [variant_name, percentage] : flag.rollout()) {
        upper += percentage;
        if (bucket < upper) {
            return variant_name;
        }
    }
    return flag.default_value();
}

bool Registry::enabled(const std::string& name, const Context& ctx) const {
    const Flag& flag = require(name);
    if (flag.kind() != Flag::Kind::Boolean) {
        throw FlagError("Flag '" + name + "' is not a boolean flag");
    }
    return evaluate_boolean(name, flag.as_boolean(), ctx);
}

std::string Registry::variant(const std::string& name, const Context& ctx) const {
    const Flag& flag = require(name);
    if (flag.kind() != Flag::Kind::Variant) {
        throw FlagError("Flag '" + name + "' is not a variant flag");
    }
    return evaluate_variant(name, flag.as_variant(), ctx);
}

Value Registry::evaluate(const std::string& name, const Context& ctx) const {
    const Flag& flag = require(name);
    Value value;
    value.kind = flag.kind();
    if (flag.kind() == Flag::Kind::Boolean) {
        value.boolean_value = evaluate_boolean(name, flag.as_boolean(), ctx);
    } else {
        value.variant_value = evaluate_variant(name, flag.as_variant(), ctx);
    }
    return value;
}

}  // namespace agentxm::tinyflags
