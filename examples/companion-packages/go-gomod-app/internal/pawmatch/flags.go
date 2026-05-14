package pawmatch

import "github.com/agentxm/example-tinyflags/tinyflags"

// Boolean flag names.
const (
	FlagHomeCheckFollowup       = "home-check-followup"
	FlagFeeBreakdownDetailed    = "fee-breakdown-detailed"
	FlagLongStayHighlight       = "long-stay-highlight"
	FlagSuggestDonateAfterAdopt = "suggest-donate-after-adoption"
	FlagShowCharityRatings      = "show-charity-ratings"
	FlagRecommendationStrategy  = "recommendation-strategy"
	FlagMatchQuizDepth          = "match-quiz-depth"
	FlagPetCardStyle            = "pet-card-style"
	FlagDonateFocusDefault      = "donate-focus-default"
)

// NewFlags returns the package-level TinyFlags flag set used by the PawMatch
// CLI. Definitions intentionally mirror the javascript-npm-app port so the
// companion skills see the same seams in every ecosystem.
func NewFlags() *tinyflags.Flags {
	return tinyflags.MustNew(map[string]tinyflags.Flag{
		FlagHomeCheckFollowup: tinyflags.MustBooleanFlag(
			tinyflags.BoolDefault(false),
			tinyflags.BoolRollout(25),
		),
		FlagFeeBreakdownDetailed: tinyflags.MustBooleanFlag(
			tinyflags.BoolDefault(true),
		),
		FlagLongStayHighlight: tinyflags.MustBooleanFlag(
			tinyflags.BoolDefault(true),
		),
		FlagSuggestDonateAfterAdopt: tinyflags.MustBooleanFlag(
			tinyflags.BoolDefault(false),
			tinyflags.BoolRollout(50),
		),
		FlagShowCharityRatings: tinyflags.MustBooleanFlag(
			tinyflags.BoolDefault(true),
		),
		FlagRecommendationStrategy: tinyflags.MustVariantFlag(
			[]string{"popularity", "match-quiz", "longest-stay"},
			tinyflags.VariantDefault("match-quiz"),
			tinyflags.VariantRollout(map[string]int{"longest-stay": 20}),
		),
		FlagMatchQuizDepth: tinyflags.MustVariantFlag(
			[]string{"short", "standard", "thorough"},
			tinyflags.VariantDefault("standard"),
		),
		FlagPetCardStyle: tinyflags.MustVariantFlag(
			[]string{"compact", "detailed", "playful"},
			tinyflags.VariantDefault("detailed"),
		),
		FlagDonateFocusDefault: tinyflags.MustVariantFlag(
			[]string{"all", "shelters", "rescue"},
			tinyflags.VariantDefault("all"),
		),
	})
}
