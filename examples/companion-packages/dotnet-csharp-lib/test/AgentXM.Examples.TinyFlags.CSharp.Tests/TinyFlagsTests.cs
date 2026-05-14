using Xunit;

namespace AgentXM.Examples.TinyFlags.CSharp.Tests;

public class TinyFlagsTests
{
    [Fact]
    public void BooleanFlagsUseDefaults()
    {
        var flags = TinyFlags.Create(new Dictionary<string, FlagDefinition>
        {
            ["checkoutRedesign"] = TinyFlag.Boolean(defaultValue: true),
        });

        Assert.True(flags.Enabled("checkoutRedesign", new EvaluationContext(UserId: "user-1")));
    }

    [Fact]
    public void BooleanRolloutBoundariesAreDeterministic()
    {
        var flags = TinyFlags.Create(new Dictionary<string, FlagDefinition>
        {
            ["disabledExperiment"] = TinyFlag.Boolean(defaultValue: false, rollout: 0),
            ["enabledExperiment"] = TinyFlag.Boolean(defaultValue: false, rollout: 100),
        });
        var ctx = new EvaluationContext(UserId: "user-1");

        Assert.False(flags.Enabled("disabledExperiment", ctx));
        Assert.True(flags.Enabled("enabledExperiment", ctx));
        Assert.Equal(flags.Enabled("enabledExperiment", ctx), flags.Enabled("enabledExperiment", ctx));
    }

    [Fact]
    public void VariantFlagsReturnDefaultsOutsideRolloutAllocations()
    {
        var flags = TinyFlags.Create(new Dictionary<string, FlagDefinition>
        {
            ["searchRanking"] = TinyFlag.Variant(
                ["classic", "semantic"],
                defaultValue: "classic",
                rollout: new Dictionary<string, int> { ["semantic"] = 0 }),
        });

        Assert.Equal("classic", flags.Variant("searchRanking", new EvaluationContext(UserId: "user-1")));
    }

    [Fact]
    public void VariantFlagsCanAllocateAllTrafficToAVariant()
    {
        var flags = TinyFlags.Create(new Dictionary<string, FlagDefinition>
        {
            ["searchRanking"] = TinyFlag.Variant(
                ["classic", "semantic"],
                defaultValue: "classic",
                rollout: new Dictionary<string, int> { ["semantic"] = 100 }),
        });

        Assert.Equal("semantic", flags.Variant("searchRanking", new EvaluationContext(UserId: "user-1")));
    }

    [Fact]
    public void VariantRolloutAllocatesInDeclaredOrder()
    {
        // Each variant's bucket allocation depends on the order it was declared
        // in, not on the order of the rollout dictionary.
        var flags = TinyFlags.Create(new Dictionary<string, FlagDefinition>
        {
            ["split"] = TinyFlag.Variant(
                ["first", "second"],
                defaultValue: "first",
                rollout: new Dictionary<string, int> { ["second"] = 50, ["first"] = 50 }),
        });

        for (var i = 0; i < 50; i++)
        {
            var resolved = flags.Variant("split", new EvaluationContext(UserId: $"user-{i}"));
            Assert.True(resolved is "first" or "second");
        }
    }

    [Fact]
    public void InvalidBooleanRolloutThrows()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => _ = TinyFlag.Boolean(rollout: 101));
    }

    [Fact]
    public void InvalidVariantDefaultThrows()
    {
        Assert.Throws<ArgumentException>(() => _ = TinyFlag.Variant(["classic", "semantic"], defaultValue: "personalized"));
    }

    [Fact]
    public void VariantRolloutExceedingHundredThrows()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => _ = TinyFlag.Variant(
            ["classic", "semantic"],
            rollout: new Dictionary<string, int> { ["semantic"] = 80, ["classic"] = 30 }));
    }

    [Fact]
    public void EvaluateReturnsTypedResultForEachFlagKind()
    {
        var flags = TinyFlags.Create(new Dictionary<string, FlagDefinition>
        {
            ["onboarding"] = TinyFlag.Boolean(defaultValue: true),
            ["searchRanking"] = TinyFlag.Variant(
                ["classic", "semantic"],
                defaultValue: "semantic",
                rollout: new Dictionary<string, int> { ["semantic"] = 100 }),
        });
        var ctx = new EvaluationContext(UserId: "user-1");

        Assert.Equal(new FlagValue.Bool(true), flags.Evaluate("onboarding", ctx));
        Assert.Equal(new FlagValue.Variant("semantic"), flags.Evaluate("searchRanking", ctx));
    }

    [Fact]
    public void FlagValueExposesTryGetAccessors()
    {
        FlagValue boolValue = new FlagValue.Bool(true);
        FlagValue variantValue = new FlagValue.Variant("semantic");

        Assert.True(boolValue.TryGetBool(out var b));
        Assert.True(b);
        Assert.False(boolValue.TryGetVariant(out _));

        Assert.True(variantValue.TryGetVariant(out var v));
        Assert.Equal("semantic", v);
        Assert.False(variantValue.TryGetBool(out _));
    }

    [Fact]
    public void ParamsOverloadBuildsVariantFromInlineValues()
    {
        var flag = TinyFlag.Variant("classic", "semantic");

        Assert.Equal(2, flag.Variants.Length);
        Assert.Equal("classic", flag.Variants[0]);
        Assert.Equal("semantic", flag.Variants[1]);
        Assert.Equal("classic", flag.Default);
    }
}
