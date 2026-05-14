using System.Collections.Frozen;

namespace AgentXM.Examples.PawMatch.CSharp;

internal sealed record MatchPreferences(
    bool HasKids,
    bool QuietHome,
    bool Active,
    bool FirstTime,
    bool MultiplePets,
    bool SmallHome)
{
    public IEnumerable<string> ActiveFlags()
    {
        if (HasKids) yield return "has-kids";
        if (QuietHome) yield return "quiet-home";
        if (Active) yield return "active";
        if (FirstTime) yield return "first-time";
        if (MultiplePets) yield return "multiple-pets";
        if (SmallHome) yield return "small-home";
    }

    public FrozenSet<string> ToFlagSet() =>
        ActiveFlags().ToFrozenSet(StringComparer.Ordinal);

    public bool IsEmpty =>
        !HasKids && !QuietHome && !Active && !FirstTime && !MultiplePets && !SmallHome;
}
