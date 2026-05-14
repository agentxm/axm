using System.Collections.Frozen;
using System.Collections.Immutable;
using System.Diagnostics;

namespace AgentXM.Examples.TinyFlags.CSharp;

public sealed record EvaluationContext(
    string? UserId = null,
    string? AccountId = null,
    string? SessionId = null);

public abstract record FlagDefinition
{
    private protected FlagDefinition() { }
}

public sealed record BooleanFlagDefinition : FlagDefinition
{
    internal BooleanFlagDefinition(bool @default, int? rollout)
    {
        Default = @default;
        Rollout = rollout;
    }

    public bool Default { get; }
    public int? Rollout { get; }
}

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

    public ImmutableArray<string> Variants { get; }
    public string Default { get; }
    public FrozenDictionary<string, int>? Rollout { get; }
}

public abstract record FlagValue
{
    private FlagValue() { }

    public sealed record Bool(bool Value) : FlagValue;

    public sealed record Variant(string Value) : FlagValue;
}

public static class TinyFlag
{
    public static BooleanFlagDefinition Boolean(bool defaultValue = false, int? rollout = null) =>
        new(defaultValue, NormalizePercentage(rollout, nameof(rollout)));

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

public sealed class TinyFlags
{
    private readonly FrozenDictionary<string, FlagDefinition> definitions;

    private TinyFlags(FrozenDictionary<string, FlagDefinition> definitions)
    {
        this.definitions = definitions;
    }

    public IReadOnlyDictionary<string, FlagDefinition> Definitions => definitions;

    public static TinyFlags Create(IReadOnlyDictionary<string, FlagDefinition> definitions) =>
        new(definitions.ToFrozenDictionary(StringComparer.Ordinal));

    public bool Enabled(string name, EvaluationContext? context = null) =>
        Require<BooleanFlagDefinition>(name) switch
        {
            { Rollout: null } flag => flag.Default,
            { Rollout: { } rollout } => BucketFor(name, context) < rollout,
        };

    public string Variant(string name, EvaluationContext? context = null)
    {
        var flag = Require<VariantFlagDefinition>(name);
        if (flag.Rollout is null)
        {
            return flag.Default;
        }

        var bucket = BucketFor(name, context);
        var upper = 0;
        foreach (var (variant, percentage) in flag.Rollout)
        {
            upper += percentage;
            if (bucket < upper)
            {
                return variant;
            }
        }

        return flag.Default;
    }

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
        return (int)(HashString($"{name}:{key}") % 100);
    }

    private static uint HashString(string value)
    {
        unchecked
        {
            var hash = 2166136261u;
            foreach (var character in value)
            {
                hash ^= character;
                hash *= 16777619u;
            }

            return hash;
        }
    }
}
