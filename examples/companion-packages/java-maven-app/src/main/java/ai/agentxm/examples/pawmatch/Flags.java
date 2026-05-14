package ai.agentxm.examples.pawmatch;

import ai.agentxm.examples.tinyflags.TinyFlags;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Flag keys and the canonical PawMatch {@link TinyFlags} bundle. */
public final class Flags {

    public static final String HOME_CHECK_FOLLOWUP = "home-check-followup";
    public static final String FEE_BREAKDOWN_DETAILED = "fee-breakdown-detailed";
    public static final String LONG_STAY_HIGHLIGHT = "long-stay-highlight";
    public static final String SUGGEST_DONATE_AFTER_ADOPTION = "suggest-donate-after-adoption";
    public static final String SHOW_CHARITY_RATINGS = "show-charity-ratings";
    public static final String RECOMMENDATION_STRATEGY = "recommendation-strategy";
    public static final String MATCH_QUIZ_DEPTH = "match-quiz-depth";
    public static final String PET_CARD_STYLE = "pet-card-style";
    public static final String DONATE_FOCUS_DEFAULT = "donate-focus-default";

    private Flags() {}

    public static TinyFlags create() {
        Map<String, Integer> recommendationRollout = new LinkedHashMap<>();
        recommendationRollout.put("longest-stay", 20);

        return TinyFlags.builder()
                .booleanFlag(HOME_CHECK_FOLLOWUP, false, 25)
                .booleanFlag(FEE_BREAKDOWN_DETAILED, true)
                .booleanFlag(LONG_STAY_HIGHLIGHT, true)
                .booleanFlag(SUGGEST_DONATE_AFTER_ADOPTION, false, 50)
                .booleanFlag(SHOW_CHARITY_RATINGS, true)
                .variantFlag(
                        RECOMMENDATION_STRATEGY,
                        List.of("popularity", "match-quiz", "longest-stay"),
                        "match-quiz",
                        recommendationRollout)
                .variantFlag(
                        MATCH_QUIZ_DEPTH,
                        List.of("short", "standard", "thorough"),
                        "standard")
                .variantFlag(
                        PET_CARD_STYLE,
                        List.of("compact", "detailed", "playful"),
                        "detailed")
                .variantFlag(
                        DONATE_FOCUS_DEFAULT,
                        List.of("all", "shelters", "rescue"),
                        "all")
                .build();
    }
}
