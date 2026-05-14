package pawmatch

import "fmt"

// Variant value types — narrowed strings so the CLI can switch on them.
type (
	// PetCardStyle is the rendering style for the browse listing.
	PetCardStyle string
	// MatchStrategy is the algorithm used to rank pets in `match`.
	MatchStrategy string
	// MatchDepth controls how many questionnaire factors `match` considers.
	MatchDepth string
	// DonateFocus is the default charity focus when `--focus` is not given.
	DonateFocus string
)

// Pet-card styles.
const (
	PetCardCompact  PetCardStyle = "compact"
	PetCardDetailed PetCardStyle = "detailed"
	PetCardPlayful  PetCardStyle = "playful"
)

// Match strategies.
const (
	StrategyPopularity  MatchStrategy = "popularity"
	StrategyMatchQuiz   MatchStrategy = "match-quiz"
	StrategyLongestStay MatchStrategy = "longest-stay"
)

// Match depths.
const (
	DepthShort    MatchDepth = "short"
	DepthStandard MatchDepth = "standard"
	DepthThorough MatchDepth = "thorough"
)

// Donate focuses.
const (
	FocusAll      DonateFocus = "all"
	FocusShelters DonateFocus = "shelters"
	FocusRescue   DonateFocus = "rescue"
)

var (
	petCardStyles = []PetCardStyle{PetCardCompact, PetCardDetailed, PetCardPlayful}
	strategies    = []MatchStrategy{StrategyPopularity, StrategyMatchQuiz, StrategyLongestStay}
	depths        = []MatchDepth{DepthShort, DepthStandard, DepthThorough}
	focuses       = []DonateFocus{FocusAll, FocusShelters, FocusRescue}
)

// ParsePetCardStyle decodes a TinyFlags variant value into the typed enum.
func ParsePetCardStyle(value string) (PetCardStyle, error) {
	for _, v := range petCardStyles {
		if string(v) == value {
			return v, nil
		}
	}
	return "", fmt.Errorf("pawmatch: unknown pet-card-style variant %q", value)
}

// ParseMatchStrategy decodes a TinyFlags variant value into the typed enum.
func ParseMatchStrategy(value string) (MatchStrategy, error) {
	for _, v := range strategies {
		if string(v) == value {
			return v, nil
		}
	}
	return "", fmt.Errorf("pawmatch: unknown recommendation-strategy variant %q", value)
}

// ParseMatchDepth decodes a TinyFlags variant value into the typed enum.
func ParseMatchDepth(value string) (MatchDepth, error) {
	for _, v := range depths {
		if string(v) == value {
			return v, nil
		}
	}
	return "", fmt.Errorf("pawmatch: unknown match-quiz-depth variant %q", value)
}

// ParseDonateFocus decodes a TinyFlags variant value into the typed enum.
func ParseDonateFocus(value string) (DonateFocus, error) {
	for _, v := range focuses {
		if string(v) == value {
			return v, nil
		}
	}
	return "", fmt.Errorf("pawmatch: unknown donate-focus-default variant %q", value)
}
