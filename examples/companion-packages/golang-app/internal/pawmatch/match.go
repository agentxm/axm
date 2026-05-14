package pawmatch

// MatchPreferences captures the lifestyle answers a user provides to the
// `pawmatch match` command.
type MatchPreferences struct {
	HasKids      bool
	QuietHome    bool
	Active       bool
	FirstTime    bool
	MultiplePets bool
	SmallHome    bool
}

// activeFlagSet returns the questionnaire factor flags the user enabled.
func activeFlagSet(p MatchPreferences) map[string]struct{} {
	out := make(map[string]struct{}, 6)
	if p.HasKids {
		out["has-kids"] = struct{}{}
	}
	if p.QuietHome {
		out["quiet-home"] = struct{}{}
	}
	if p.Active {
		out["active"] = struct{}{}
	}
	if p.FirstTime {
		out["first-time"] = struct{}{}
	}
	if p.MultiplePets {
		out["multiple-pets"] = struct{}{}
	}
	if p.SmallHome {
		out["small-home"] = struct{}{}
	}
	return out
}

// preferencesEmpty reports whether none of the questionnaire flags were
// supplied.
func preferencesEmpty(p MatchPreferences) bool {
	return !p.HasKids && !p.QuietHome && !p.Active && !p.FirstTime && !p.MultiplePets && !p.SmallHome
}
