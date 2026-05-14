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
    public void InvalidBooleanRolloutThrows()
    {
        Throws<ArgumentOutOfRangeException>(() => TinyFlag.Boolean(rollout: 101));
    }

    [Test]
    public void InvalidVariantDefaultThrows()
    {
        Throws<ArgumentException>(() => TinyFlag.Variant(["classic", "semantic"], defaultValue: "personalized"));
    }

    [Test]
    public void VariantRolloutExceedingHundredThrows()
    {
        Throws<ArgumentOutOfRangeException>(() => TinyFlag.Variant(
                ["classic", "semantic"],
                rollout: new Dictionary<string, int> { ["semantic"] = 80, ["classic"] = 30 }));
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

    private static void Throws<TException>(Action action)
        where TException : Exception
    {
        try
        {
            action();
        }
        catch (TException)
        {
            return;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                $"Expected {typeof(TException).Name}, received {ex.GetType().Name}.",
                ex);
        }

        throw new InvalidOperationException($"Expected {typeof(TException).Name}.");
    }
}
