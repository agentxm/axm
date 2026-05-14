using AgentXM.Examples.TinyFlags.CSharp;
using TinyFlagsClient = AgentXM.Examples.TinyFlags.CSharp.TinyFlags;

namespace AgentXM.Examples.PawMatch.CSharp;

internal static class PawMatchFlags
{
    public const string HomeCheckFollowup = "home-check-followup";
    public const string FeeBreakdownDetailed = "fee-breakdown-detailed";
    public const string LongStayHighlight = "long-stay-highlight";
    public const string SuggestDonateAfterAdoption = "suggest-donate-after-adoption";
    public const string ShowCharityRatings = "show-charity-ratings";
    public const string RecommendationStrategy = "recommendation-strategy";
    public const string MatchQuizDepth = "match-quiz-depth";
    public const string PetCardStyle = "pet-card-style";
    public const string DonateFocusDefault = "donate-focus-default";

    public static TinyFlagsClient Create() => TinyFlagsClient.Create(new Dictionary<string, FlagDefinition>
    {
        [HomeCheckFollowup] = TinyFlag.Boolean(defaultValue: false, rollout: 25),
        [FeeBreakdownDetailed] = TinyFlag.Boolean(defaultValue: true),
        [LongStayHighlight] = TinyFlag.Boolean(defaultValue: true),
        [SuggestDonateAfterAdoption] = TinyFlag.Boolean(defaultValue: false, rollout: 50),
        [ShowCharityRatings] = TinyFlag.Boolean(defaultValue: true),
        [RecommendationStrategy] = TinyFlag.Variant(
            ["popularity", "match-quiz", "longest-stay"],
            defaultValue: "match-quiz",
            rollout: new Dictionary<string, int> { ["longest-stay"] = 20 }),
        [MatchQuizDepth] = TinyFlag.Variant(
            ["short", "standard", "thorough"],
            defaultValue: "standard"),
        [PetCardStyle] = TinyFlag.Variant(
            ["compact", "detailed", "playful"],
            defaultValue: "detailed"),
        [DonateFocusDefault] = TinyFlag.Variant(
            ["all", "shelters", "rescue"],
            defaultValue: "all"),
    });
}
