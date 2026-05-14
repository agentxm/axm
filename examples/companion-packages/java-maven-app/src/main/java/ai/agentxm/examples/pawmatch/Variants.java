package ai.agentxm.examples.pawmatch;

/** Kebab-case variant parsers for {@link Flags}. */
public final class Variants {

    public enum PetCardStyle {
        COMPACT,
        DETAILED,
        PLAYFUL
    }

    public enum MatchStrategy {
        POPULARITY,
        MATCH_QUIZ,
        LONGEST_STAY
    }

    public enum MatchDepth {
        SHORT,
        STANDARD,
        THOROUGH
    }

    public enum DonateFocus {
        ALL,
        SHELTERS,
        RESCUE
    }

    private Variants() {}

    public static PetCardStyle parsePetCardStyle(String value) {
        return switch (value) {
            case "compact" -> PetCardStyle.COMPACT;
            case "detailed" -> PetCardStyle.DETAILED;
            case "playful" -> PetCardStyle.PLAYFUL;
            default -> throw new IllegalArgumentException(
                    "Unknown PetCardStyle variant '" + value + "'.");
        };
    }

    public static MatchStrategy parseMatchStrategy(String value) {
        return switch (value) {
            case "popularity" -> MatchStrategy.POPULARITY;
            case "match-quiz" -> MatchStrategy.MATCH_QUIZ;
            case "longest-stay" -> MatchStrategy.LONGEST_STAY;
            default -> throw new IllegalArgumentException(
                    "Unknown MatchStrategy variant '" + value + "'.");
        };
    }

    public static MatchDepth parseMatchDepth(String value) {
        return switch (value) {
            case "short" -> MatchDepth.SHORT;
            case "standard" -> MatchDepth.STANDARD;
            case "thorough" -> MatchDepth.THOROUGH;
            default -> throw new IllegalArgumentException(
                    "Unknown MatchDepth variant '" + value + "'.");
        };
    }

    public static DonateFocus parseDonateFocus(String value) {
        return switch (value) {
            case "all" -> DonateFocus.ALL;
            case "shelters" -> DonateFocus.SHELTERS;
            case "rescue" -> DonateFocus.RESCUE;
            default -> throw new IllegalArgumentException(
                    "Unknown DonateFocus variant '" + value + "'.");
        };
    }

    public static String petCardStyleToKebab(PetCardStyle style) {
        return switch (style) {
            case COMPACT -> "compact";
            case DETAILED -> "detailed";
            case PLAYFUL -> "playful";
        };
    }

    public static String matchStrategyToKebab(MatchStrategy strategy) {
        return switch (strategy) {
            case POPULARITY -> "popularity";
            case MATCH_QUIZ -> "match-quiz";
            case LONGEST_STAY -> "longest-stay";
        };
    }

    public static String matchDepthToKebab(MatchDepth depth) {
        return switch (depth) {
            case SHORT -> "short";
            case STANDARD -> "standard";
            case THOROUGH -> "thorough";
        };
    }

    public static String donateFocusToKebab(DonateFocus focus) {
        return switch (focus) {
            case ALL -> "all";
            case SHELTERS -> "shelters";
            case RESCUE -> "rescue";
        };
    }
}
