package ai.agentxm.examples.pawmatch

data class MatchPreferences(
    val hasKids: Boolean = false,
    val quietHome: Boolean = false,
    val active: Boolean = false,
    val firstTime: Boolean = false,
    val multiplePets: Boolean = false,
    val smallHome: Boolean = false,
) {
    fun activeFlagSet(): Set<String> = buildSet {
        if (hasKids) add("has-kids")
        if (quietHome) add("quiet-home")
        if (active) add("active")
        if (firstTime) add("first-time")
        if (multiplePets) add("multiple-pets")
        if (smallHome) add("small-home")
    }

    fun isEmpty(): Boolean =
        !hasKids && !quietHome && !active && !firstTime && !multiplePets && !smallHome
}
