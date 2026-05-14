// Flag keys and the canonical PawMatch TinyFlags bundle. Definitions
// intentionally mirror the other ecosystem ports so the companion skills see
// the same seams everywhere.

import AgentXMExampleTinyFlags
import Foundation

public enum FlagKey {
    public static let homeCheckFollowup = "home-check-followup"
    public static let feeBreakdownDetailed = "fee-breakdown-detailed"
    public static let longStayHighlight = "long-stay-highlight"
    public static let suggestDonateAfterAdoption = "suggest-donate-after-adoption"
    public static let showCharityRatings = "show-charity-ratings"
    public static let recommendationStrategy = "recommendation-strategy"
    public static let matchQuizDepth = "match-quiz-depth"
    public static let petCardStyle = "pet-card-style"
    public static let donateFocusDefault = "donate-focus-default"
}

public enum PawMatchFlags {

    /// Build the package-level TinyFlags bundle used by every command.
    public static func makeBundle() throws -> TinyFlags {
        try TinyFlags.builder()
            .boolean(FlagKey.homeCheckFollowup, default: false, rollout: 25)
            .boolean(FlagKey.feeBreakdownDetailed, default: true)
            .boolean(FlagKey.longStayHighlight, default: true)
            .boolean(FlagKey.suggestDonateAfterAdoption, default: false, rollout: 50)
            .boolean(FlagKey.showCharityRatings, default: true)
            .variant(
                FlagKey.recommendationStrategy,
                variants: ["popularity", "match-quiz", "longest-stay"],
                default: "match-quiz",
                rollout: ["longest-stay": 20]
            )
            .variant(
                FlagKey.matchQuizDepth,
                variants: ["short", "standard", "thorough"],
                default: "standard"
            )
            .variant(
                FlagKey.petCardStyle,
                variants: ["compact", "detailed", "playful"],
                default: "detailed"
            )
            .variant(
                FlagKey.donateFocusDefault,
                variants: ["all", "shelters", "rescue"],
                default: "all"
            )
            .build()
    }

    /// Default evaluation context derived from the host environment so
    /// rollouts are stable per user.
    public static func defaultContext() -> EvaluationContext {
        let env = ProcessInfo.processInfo.environment
        for key in ["USER", "USERNAME", "LOGNAME"] {
            if let value = env[key], !value.isEmpty {
                return EvaluationContext.session(value)
            }
        }
        return EvaluationContext.session("anonymous")
    }
}
