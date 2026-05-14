// Flag definitions and constants for the PawMatch CLI.

import AgentXMExampleTinyFlags

enum PawMatchFlag {
    static let homeCheckFollowup = "home-check-followup"
    static let feeBreakdownDetailed = "fee-breakdown-detailed"
    static let longStayHighlight = "long-stay-highlight"
    static let suggestDonateAfterAdoption = "suggest-donate-after-adoption"
    static let showCharityRatings = "show-charity-ratings"
    static let recommendationStrategy = "recommendation-strategy"
    static let matchQuizDepth = "match-quiz-depth"
    static let petCardStyle = "pet-card-style"
    static let donateFocusDefault = "donate-focus-default"

    /// Build the TinyFlags bundle the CLI evaluates at runtime. Every flag
    /// declared here is wired into at least one command path so the companion
    /// skills have realistic targets.
    static func makeTinyFlags() throws -> TinyFlags {
        try TinyFlags.builder()
            .boolean(homeCheckFollowup, default: false, rollout: 25)
            .boolean(feeBreakdownDetailed, default: true)
            .boolean(longStayHighlight, default: true)
            .boolean(suggestDonateAfterAdoption, default: false, rollout: 50)
            .boolean(showCharityRatings, default: true)
            .variant(
                recommendationStrategy,
                variants: ["popularity", "match-quiz", "longest-stay"],
                default: "match-quiz",
                rollout: ["longest-stay": 20]
            )
            .variant(
                matchQuizDepth,
                variants: ["short", "standard", "thorough"],
                default: "standard"
            )
            .variant(
                petCardStyle,
                variants: ["compact", "detailed", "playful"],
                default: "detailed"
            )
            .variant(
                donateFocusDefault,
                variants: ["all", "shelters", "rescue"],
                default: "all"
            )
            .build()
    }
}
