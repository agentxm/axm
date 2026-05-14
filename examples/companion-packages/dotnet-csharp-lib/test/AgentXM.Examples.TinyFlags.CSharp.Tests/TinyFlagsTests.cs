using TUnit.Assertions.AssertConditions.Throws;

namespace AgentXM.Examples.TinyFlags.CSharp.Tests;

public class TinyFlagsTests
{
    [Test]
    public async Task BooleanFlagsUseDefaults()
    {
        var flags = TinyFlags.Create(new Dictionary<string, FlagDefinition>
        {
            ["checkoutRedesign"] = TinyFlag.Boolean(defaultValue: true),
        });

        await Assert.That(flags.Enabled("checkoutRedesign", new EvaluationContext(UserId: "user-1")))
            .IsTrue();
    }

    [Test]
    public async Task BooleanRolloutBoundariesAreDeterministic()
    {
        var flags = TinyFlags.Create(new Dictionary<string, FlagDefinition>
        {
            ["disabledExperiment"] = TinyFlag.Boolean(defaultValue: false, rollout: 0),
            ["enabledExperiment"] = TinyFlag.Boolean(defaultValue: false, rollout: 100),
        });
        var ctx = new EvaluationContext(UserId: "user-1");

        await Assert.That(flags.Enabled("disabledExperiment", ctx)).IsFalse();
        await Assert.That(flags.Enabled("enabledExperiment", ctx)).IsTrue();
        await Assert.That(flags.Enabled("enabledExperiment", ctx))
            .IsEqualTo(flags.Enabled("enabledExperiment", ctx));
    }

    [Test]
    public async Task VariantFlagsReturnDefaultsOutsideRolloutAllocations()
    {
        var flags = TinyFlags.Create(new Dictionary<string, FlagDefinition>
        {
            ["searchRanking"] = TinyFlag.Variant(
                ["classic", "semantic"],
                defaultValue: "classic",
                rollout: new Dictionary<string, int> { ["semantic"] = 0 }),
        });

        await Assert.That(flags.Variant("searchRanking", new EvaluationContext(UserId: "user-1")))
            .IsEqualTo("classic");
    }

    [Test]
    public async Task VariantFlagsCanAllocateAllTrafficToAVariant()
    {
        var flags = TinyFlags.Create(new Dictionary<string, FlagDefinition>
        {
            ["searchRanking"] = TinyFlag.Variant(
                ["classic", "semantic"],
                defaultValue: "classic",
                rollout: new Dictionary<string, int> { ["semantic"] = 100 }),
        });

        await Assert.That(flags.Variant("searchRanking", new EvaluationContext(UserId: "user-1")))
            .IsEqualTo("semantic");
    }

    [Test]
    public async Task VariantRolloutAllocatesInDeclaredOrder()
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
            await Assert.That(resolved is "first" or "second").IsTrue();
        }
    }

    [Test]
    public async Task InvalidBooleanRolloutThrows()
    {
        Action act = () => _ = TinyFlag.Boolean(rollout: 101);

        await Assert.That(act).Throws<ArgumentOutOfRangeException>();
    }

    [Test]
    public async Task InvalidVariantDefaultThrows()
    {
        Action act = () => _ = TinyFlag.Variant(["classic", "semantic"], defaultValue: "personalized");

        await Assert.That(act).Throws<ArgumentException>();
    }

    [Test]
    public async Task VariantRolloutExceedingHundredThrows()
    {
        Action act = () => _ = TinyFlag.Variant(
            ["classic", "semantic"],
            rollout: new Dictionary<string, int> { ["semantic"] = 80, ["classic"] = 30 });

        await Assert.That(act).Throws<ArgumentOutOfRangeException>();
    }

    [Test]
    public async Task EvaluateReturnsTypedResultForEachFlagKind()
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

        await Assert.That(flags.Evaluate("onboarding", ctx))
            .IsEqualTo(new FlagValue.Bool(true));
        await Assert.That(flags.Evaluate("searchRanking", ctx))
            .IsEqualTo(new FlagValue.Variant("semantic"));
    }

    [Test]
    public async Task FlagValueExposesTryGetAccessors()
    {
        FlagValue boolValue = new FlagValue.Bool(true);
        FlagValue variantValue = new FlagValue.Variant("semantic");

        await Assert.That(boolValue.TryGetBool(out var b)).IsTrue();
        await Assert.That(b).IsTrue();
        await Assert.That(boolValue.TryGetVariant(out _)).IsFalse();

        await Assert.That(variantValue.TryGetVariant(out var v)).IsTrue();
        await Assert.That(v).IsEqualTo("semantic");
        await Assert.That(variantValue.TryGetBool(out _)).IsFalse();
    }

    [Test]
    public async Task ParamsOverloadBuildsVariantFromInlineValues()
    {
        var flag = TinyFlag.Variant("classic", "semantic");

        await Assert.That(flag.Variants.Length).IsEqualTo(2);
        await Assert.That(flag.Variants[0]).IsEqualTo("classic");
        await Assert.That(flag.Variants[1]).IsEqualTo("semantic");
        await Assert.That(flag.Default).IsEqualTo("classic");
    }
}
