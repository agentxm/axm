using System.Collections.Frozen;
using System.Collections.Immutable;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Text;

namespace AgentXM.Examples.TinyFlags.CSharp;

/// <summary>
/// Identifies the caller and surrounding context for a flag evaluation. The
/// first non-<see langword="null"/> identifier (user, account, session) is used
/// as the deterministic bucketing key.
/// </summary>
public sealed record EvaluationContext(
    string? UserId = null,
    string? AccountId = null,
    string? SessionId = null);

/// <summary>
/// Base type for flag definitions. Construct definitions via
/// <see cref="TinyFlag.Boolean"/> or <see cref="TinyFlag.Variant(ReadOnlySpan{string}, string?, IReadOnlyDictionary{string, int}?)"/>.
/// </summary>
public abstract record FlagDefinition
{
    private protected FlagDefinition() { }
}

/// <summary>A boolean flag, optionally rolled out to a percentage of buckets.</summary>
public sealed record BooleanFlagDefinition : FlagDefinition
{
    internal BooleanFlagDefinition(bool @default, int? rollout)
    {
        Default = @default;
        Rollout = rollout;
    }

    /// <summary>Value returned when no rollout is configured.</summary>
    public bool Default { get; }

    /// <summary>Percentage of buckets (0–100) that resolve to <see langword="true"/>, or <see langword="null"/> for "always <see cref="Default"/>".</summary>
    public int? Rollout { get; }
}

/// <summary>A multi-variant flag with a default and an optional per-variant rollout.</summary>
public sealed record VariantFlagDefinition : FlagDefinition
{
    internal VariantFlagDefinition(
        ImmutableArray<string> variants,
        string @default,
        FrozenDictionary<string, int>? rollout)
    {
        Variants = variants;
        Default = @default;
        Rollout = rollout;
    }

    /// <summary>Declared variant names, in the order they were supplied.</summary>
    public ImmutableArray<string> Variants { get; }

    /// <summary>Variant returned outside any rollout allocation.</summary>
    public string Default { get; }

    /// <summary>Per-variant rollout percentages, or <see langword="null"/> for "always <see cref="Default"/>".</summary>
    public FrozenDictionary<string, int>? Rollout { get; }
}

/// <summary>The resolved value of a flag evaluation.</summary>
public abstract record FlagValue
{
    private FlagValue() { }

    /// <summary>A boolean flag value.</summary>
    public sealed record Bool(bool Value) : FlagValue;

    /// <summary>A variant flag value, identified by the variant's name.</summary>
    public sealed record Variant(string Value) : FlagValue;

    /// <summary>Extracts the boolean value, or returns <see langword="false"/> for variant values.</summary>
    public bool TryGetBool(out bool value)
    {
        if (this is Bool b)
        {
            value = b.Value;
            return true;
        }
        value = default;
        return false;
    }

    /// <summary>Extracts the variant name, or returns <see langword="false"/> for boolean values.</summary>
    public bool TryGetVariant([MaybeNullWhen(false)] out string value)
    {
        if (this is Variant v)
        {
            value = v.Value;
            return true;
        }
        value = null;
        return false;
    }
}

/// <summary>Factories for <see cref="FlagDefinition"/> values.</summary>
public static class TinyFlag
{
    /// <summary>Builds a boolean flag.</summary>
    /// <param name="defaultValue">Value used when <paramref name="rollout"/> is <see langword="null"/>.</param>
    /// <param name="rollout">Percentage of buckets (0–100) that resolve to <see langword="true"/>.</param>
    public static BooleanFlagDefinition Boolean(bool defaultValue = false, int? rollout = null) =>
        new(defaultValue, NormalizePercentage(rollout, nameof(rollout)));

    /// <summary>Builds a variant flag from an inline list of variant names. The first variant is the default.</summary>
    /// <param name="variants">Non-empty list of unique variant names.</param>
    [OverloadResolutionPriority(1)]
    public static VariantFlagDefinition Variant(
        params ReadOnlySpan<string> variants) =>
        Variant(variants, defaultValue: null, rollout: null);

    /// <summary>Builds a variant flag with an explicit default and optional rollout.</summary>
    /// <param name="variants">Non-empty list of unique variant names.</param>
    /// <param name="defaultValue">Variant returned outside any rollout allocation. Defaults to the first variant.</param>
    /// <param name="rollout">Per-variant rollout percentages. Total must not exceed 100.</param>
    public static VariantFlagDefinition Variant(
        ReadOnlySpan<string> variants,
        string? defaultValue = null,
        IReadOnlyDictionary<string, int>? rollout = null)
    {
        if (variants.IsEmpty)
        {
            throw new ArgumentException("Variant flags require at least one variant.", nameof(variants));
        }

        var unique = new HashSet<string>(StringComparer.Ordinal);
        foreach (var variant in variants)
        {
            if (variant.Length == 0 || !unique.Add(variant))
            {
                throw new ArgumentException("Variant names must be unique non-empty strings.", nameof(variants));
            }
        }

        var resolvedDefault = defaultValue ?? variants[0];
        if (!unique.Contains(resolvedDefault))
        {
            throw new ArgumentException("Variant default must be one of the variants.", nameof(defaultValue));
        }

        return new VariantFlagDefinition(
            [.. variants],
            resolvedDefault,
            NormalizeVariantRollout(rollout, unique.ToFrozenSet(StringComparer.Ordinal)));
    }

    private static int? NormalizePercentage(int? value, string label) => value switch
    {
        null => null,
        < 0 or > 100 => throw new ArgumentOutOfRangeException(label, "Percentage must be from 0 to 100."),
        _ => value,
    };

    private static FrozenDictionary<string, int>? NormalizeVariantRollout(
        IReadOnlyDictionary<string, int>? rollout,
        FrozenSet<string> variants)
    {
        if (rollout is null)
        {
            return null;
        }

        var normalized = new Dictionary<string, int>(StringComparer.Ordinal);
        var total = 0;

        foreach (var (variant, percentage) in rollout)
        {
            if (!variants.Contains(variant))
            {
                throw new ArgumentException($"Rollout references unknown variant: {variant}.", nameof(rollout));
            }

            if (NormalizePercentage(percentage, $"rollout for '{variant}'") is not { } pct)
            {
                continue;
            }

            normalized[variant] = pct;
            total += pct;
        }

        if (total > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(rollout), "Variant rollout percentages cannot exceed 100.");
        }

        return normalized.ToFrozenDictionary(StringComparer.Ordinal);
    }
}

/// <summary>
/// A small, deterministic feature-flag evaluator. Bucketing is stable per
/// <c>(flag-name, identifier)</c> pair, so the same caller resolves the same
/// value across processes and machines.
/// </summary>
public sealed class TinyFlags
{
    private readonly FrozenDictionary<string, FlagDefinition> definitions;

    private TinyFlags(FrozenDictionary<string, FlagDefinition> definitions)
    {
        this.definitions = definitions;
    }

    /// <summary>All registered flag definitions, keyed by name.</summary>
    public FrozenDictionary<string, FlagDefinition> Definitions => definitions;

    /// <summary>Builds an evaluator from a name→definition map.</summary>
    public static TinyFlags Create(IReadOnlyDictionary<string, FlagDefinition> definitions) =>
        new(definitions.ToFrozenDictionary(StringComparer.Ordinal));

    /// <summary>
    /// Returns the boolean value of <paramref name="name"/> for the given
    /// <paramref name="context"/>. Throws if the flag is unknown or is not a
    /// boolean flag.
    /// </summary>
    public bool Enabled(string name, EvaluationContext? context = null) =>
        Require<BooleanFlagDefinition>(name) switch
        {
            { Rollout: null } flag => flag.Default,
            { Rollout: { } rollout } => BucketFor(name, context) < rollout,
        };

    /// <summary>
    /// Returns the variant of <paramref name="name"/> for the given
    /// <paramref name="context"/>. Throws if the flag is unknown or is not a
    /// variant flag.
    /// </summary>
    public string Variant(string name, EvaluationContext? context = null)
    {
        var flag = Require<VariantFlagDefinition>(name);
        if (flag.Rollout is null)
        {
            return flag.Default;
        }

        var bucket = BucketFor(name, context);
        var upper = 0;
        // Iterate in declared variant order so allocation is independent of
        // the rollout dictionary's internal layout.
        foreach (var variant in flag.Variants)
        {
            if (!flag.Rollout.TryGetValue(variant, out var percentage))
            {
                continue;
            }

            upper += percentage;
            if (bucket < upper)
            {
                return variant;
            }
        }

        return flag.Default;
    }

    /// <summary>Evaluates <paramref name="name"/> and returns a typed <see cref="FlagValue"/>.</summary>
    public FlagValue Evaluate(string name, EvaluationContext? context = null) =>
        RequireAny(name) switch
        {
            BooleanFlagDefinition => new FlagValue.Bool(Enabled(name, context)),
            VariantFlagDefinition => new FlagValue.Variant(Variant(name, context)),
            _ => throw new UnreachableException(),
        };

    private TFlag Require<TFlag>(string name) where TFlag : FlagDefinition =>
        RequireAny(name) switch
        {
            TFlag matched => matched,
            var other => throw new InvalidOperationException(
                $"TinyFlags flag '{name}' is not a {typeof(TFlag).Name} (got {other.GetType().Name})."),
        };

    private FlagDefinition RequireAny(string name) =>
        definitions.TryGetValue(name, out var flag)
            ? flag
            : throw new KeyNotFoundException($"Unknown TinyFlags flag: {name}.");

    private static int BucketFor(string name, EvaluationContext? context)
    {
        var key = context?.UserId ?? context?.AccountId ?? context?.SessionId ?? "anonymous";
        return (int)(Fnv1aUtf8($"{name}:{key}") % 100);
    }

    // FNV-1a over UTF-8 bytes: ASCII inputs hash identically to a per-char
    // FNV-1a, and non-ASCII identifiers bucket consistently across platforms.
    private static uint Fnv1aUtf8(string value)
    {
        var maxBytes = Encoding.UTF8.GetMaxByteCount(value.Length);
        Span<byte> buffer = maxBytes <= 256 ? stackalloc byte[256] : new byte[maxBytes];
        var written = Encoding.UTF8.GetBytes(value, buffer);
        unchecked
        {
            var hash = 2166136261u;
            for (var i = 0; i < written; i++)
            {
                hash ^= buffer[i];
                hash *= 16777619u;
            }
            return hash;
        }
    }
}
