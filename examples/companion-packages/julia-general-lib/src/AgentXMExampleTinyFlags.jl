"""
    AgentXMExampleTinyFlags

A minimal feature-flag library with deterministic rollout bucketing.

Two flag kinds:

  - [`BooleanFlag`](@ref): on/off with optional percentage rollout.
  - [`VariantFlag`](@ref): named treatment with optional per-variant allocations.

Evaluation context is a [`Context`](@ref) carrying an optional `user_id`,
`account_id`, or `session_id`. Bucketing uses SHA-1 over
`"\$flag_name:\$context_id"` mapped to an integer in `0:99`.
"""
module AgentXMExampleTinyFlags

using SHA: sha1

export BooleanFlag,
    VariantFlag,
    Registry,
    Context,
    tf_bool,
    tf_variant,
    tf_evaluate

# ── Context ─────────────────────────────────────────────────────────

"""
    Context(; user_id=nothing, account_id=nothing, session_id=nothing)

Stable identifiers used to bucket a request for rollout decisions. Bucketing
prefers `user_id`, falling back to `account_id`, then `session_id`. Pass
`Context()` for anonymous evaluation.
"""
struct Context
    user_id::Union{String,Nothing}
    account_id::Union{String,Nothing}
    session_id::Union{String,Nothing}

    function Context(;
        user_id::Union{AbstractString,Nothing}=nothing,
        account_id::Union{AbstractString,Nothing}=nothing,
        session_id::Union{AbstractString,Nothing}=nothing,
    )
        return new(
            user_id === nothing ? nothing : String(user_id),
            account_id === nothing ? nothing : String(account_id),
            session_id === nothing ? nothing : String(session_id),
        )
    end
end

context_key(ctx::Context) =
    something(ctx.user_id, ctx.account_id, ctx.session_id, "anonymous")
context_key(::Nothing) = "anonymous"

# ── Validation helpers ──────────────────────────────────────────────

function validate_percentage(value, label::AbstractString)
    if value isa Bool || !(value isa Integer)
        throw(ArgumentError("$label must be an Integer from 0 to 100"))
    end
    if value < 0 || value > 100
        throw(ArgumentError("$label must be an Integer from 0 to 100"))
    end
    return Int(value)
end

# ── Flag types ──────────────────────────────────────────────────────

"""
    BooleanFlag(; default::Bool=false, rollout::Union{Integer,Nothing}=nothing)

A boolean flag with an optional percentage rollout. `rollout` must be an
`Integer` in `0:100`.
"""
struct BooleanFlag
    default::Bool
    rollout::Union{Int,Nothing}

    function BooleanFlag(;
        default::Bool=false,
        rollout::Union{Integer,Nothing}=nothing,
    )
        normalized = rollout === nothing ? nothing : validate_percentage(rollout, "BooleanFlag rollout")
        return new(default, normalized)
    end
end

"""
    VariantFlag(; variants, default, rollout=nothing)

A named-variant flag.

  - `variants` is a non-empty `Vector{String}` of unique non-empty names.
  - `default` must be one of the declared variants.
  - `rollout` is an optional `Dict{String,Int}` mapping variant name to an
    integer allocation in `0:100`. Allocations must sum to no more than 100
    and may only reference declared variants.
"""
struct VariantFlag
    variants::Vector{String}
    default::String
    rollout::Union{Dict{String,Int},Nothing}

    function VariantFlag(;
        variants::AbstractVector,
        default,
        rollout::Union{AbstractDict,Nothing}=nothing,
    )
        if isempty(variants)
            throw(ArgumentError("VariantFlag requires at least one variant"))
        end

        strings = String[String(v) for v in variants]
        if any(isempty, strings)
            throw(ArgumentError("VariantFlag variants must be non-empty strings"))
        end
        if length(unique(strings)) != length(strings)
            throw(ArgumentError("VariantFlag variants must be unique"))
        end

        default_str = String(default)
        if !(default_str in strings)
            throw(ArgumentError("VariantFlag default must be one of the variants"))
        end

        normalized = nothing
        if rollout !== nothing
            normalized = Dict{String,Int}()
            total = 0
            for (name, percentage) in rollout
                name_str = String(name)
                if !(name_str in strings)
                    throw(ArgumentError("VariantFlag rollout references unknown variant: $name_str"))
                end
                allocation = validate_percentage(percentage, "rollout for \"$name_str\"")
                normalized[name_str] = allocation
                total += allocation
            end
            if total > 100
                throw(ArgumentError("VariantFlag rollout percentages cannot exceed 100"))
            end
        end

        return new(strings, default_str, normalized)
    end
end

const Flag = Union{BooleanFlag,VariantFlag}

# ── Registry ────────────────────────────────────────────────────────

"""
    Registry(definitions::AbstractDict)

A frozen collection of named flag definitions. Each value must be a
[`BooleanFlag`](@ref) or [`VariantFlag`](@ref).
"""
struct Registry
    definitions::Dict{String,Flag}

    function Registry(definitions::AbstractDict)
        store = Dict{String,Flag}()
        for (name, flag) in definitions
            if !(flag isa BooleanFlag || flag isa VariantFlag)
                throw(ArgumentError("Definition for \"$name\" must be BooleanFlag or VariantFlag"))
            end
            store[String(name)] = flag
        end
        return new(store)
    end
end

Base.haskey(reg::Registry, name) = haskey(reg.definitions, String(name))
Base.keys(reg::Registry) = keys(reg.definitions)

function lookup(reg::Registry, name)
    key = String(name)
    flag = get(reg.definitions, key, nothing)
    flag === nothing && throw(KeyError(key))
    return flag
end

# ── Bucketing ───────────────────────────────────────────────────────

"""
    bucket(flag_name, context) -> Int

Deterministic `0:99` bucket for a `flag_name` and evaluation context. The
context may be a [`Context`](@ref) or `nothing`.
"""
function bucket(flag_name::AbstractString, ctx::Union{Context,Nothing})
    key = context_key(ctx)
    digest = sha1(string(flag_name, ":", key))
    # Take the first 4 bytes as a big-endian unsigned integer, then mod 100.
    n = (UInt32(digest[1]) << 24) |
        (UInt32(digest[2]) << 16) |
        (UInt32(digest[3]) << 8) |
        UInt32(digest[4])
    return Int(n % UInt32(100))
end

# ── Evaluation ──────────────────────────────────────────────────────

"""
    tf_bool(reg, name; context=nothing) -> Bool

Evaluate a boolean flag against `context`.
"""
function tf_bool(reg::Registry, name; context::Union{Context,Nothing}=nothing)
    flag = lookup(reg, name)
    flag isa BooleanFlag || throw(ArgumentError("Flag \"$name\" is not a boolean flag"))
    flag.rollout === nothing && return flag.default
    return bucket(String(name), context) < flag.rollout
end

"""
    tf_variant(reg, name; context=nothing) -> String

Evaluate a variant flag against `context`.
"""
function tf_variant(reg::Registry, name; context::Union{Context,Nothing}=nothing)
    flag = lookup(reg, name)
    flag isa VariantFlag || throw(ArgumentError("Flag \"$name\" is not a variant flag"))
    flag.rollout === nothing && return flag.default

    b = bucket(String(name), context)
    upper = 0
    for variant in flag.variants
        allocation = get(flag.rollout, variant, 0)
        allocation == 0 && continue
        upper += allocation
        if b < upper
            return variant
        end
    end
    return flag.default
end

"""
    tf_evaluate(reg, name; context=nothing)

Evaluate a flag by name, dispatching on whether it is a boolean or variant
flag. Returns a `Bool` for boolean flags and a `String` for variant flags.
"""
function tf_evaluate(reg::Registry, name; context::Union{Context,Nothing}=nothing)
    flag = lookup(reg, name)
    return flag isa BooleanFlag ?
        tf_bool(reg, name; context=context) :
        tf_variant(reg, name; context=context)
end

end # module AgentXMExampleTinyFlags
