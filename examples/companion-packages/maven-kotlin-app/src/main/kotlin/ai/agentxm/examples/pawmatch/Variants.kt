package ai.agentxm.examples.pawmatch

enum class PetCardStyle(val kebab: String) {
    Compact("compact"),
    Detailed("detailed"),
    Playful("playful");

    companion object {
        fun fromKebab(value: String): PetCardStyle =
            entries.firstOrNull { it.kebab == value }
                ?: error("Unknown PetCardStyle variant '$value'.")
    }
}

enum class MatchStrategy(val kebab: String) {
    Popularity("popularity"),
    MatchQuiz("match-quiz"),
    LongestStay("longest-stay");

    companion object {
        fun fromKebab(value: String): MatchStrategy =
            entries.firstOrNull { it.kebab == value }
                ?: error("Unknown MatchStrategy variant '$value'.")
    }
}

enum class MatchDepth(val kebab: String) {
    Short("short"),
    Standard("standard"),
    Thorough("thorough");

    companion object {
        fun fromKebab(value: String): MatchDepth =
            entries.firstOrNull { it.kebab == value }
                ?: error("Unknown MatchDepth variant '$value'.")
    }
}

enum class DonateFocus(val kebab: String) {
    All("all"),
    Shelters("shelters"),
    Rescue("rescue");

    companion object {
        fun fromKebab(value: String): DonateFocus =
            entries.firstOrNull { it.kebab == value }
                ?: error("Unknown DonateFocus variant '$value'.")
    }
}
