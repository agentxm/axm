package pawmatch

import "strings"

// Charity is a single example-data charity entry.
type Charity struct {
	Slug        string
	Name        string
	Focus       string
	Description string
	URL         string
	RatingNote  string
}

// AllCharities is the curated, static example list shown by `pawmatch
// donate`. Every output reminds the user to verify ratings independently
// before giving — pawmatch does not process payments.
var AllCharities = []Charity{
	{
		Slug:        "best-friends",
		Name:        "Best Friends Animal Society",
		Focus:       "shelters",
		Description: "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
		URL:         "https://bestfriends.org/donate",
		RatingNote:  "Charity Navigator 4-star",
	},
	{
		Slug:        "petsmart-charities",
		Name:        "PetSmart Charities",
		Focus:       "shelters",
		Description: "Grants to local shelters; spay/neuter; adoption events.",
		URL:         "https://petsmartcharities.org/donate",
		RatingNote:  "Charity Navigator 4-star (96% program ratio)",
	},
	{
		Slug:        "brother-wolf",
		Name:        "Brother Wolf Animal Rescue",
		Focus:       "rescue",
		Description: "Local rescue with national-impact outreach programs.",
		URL:         "https://bwar.org/donate",
		RatingNote:  "Charity Navigator 4-star, GuideStar Platinum",
	},
	{
		Slug:        "animal-welfare-institute",
		Name:        "Animal Welfare Institute",
		Focus:       "policy",
		Description: "Policy and advocacy reducing cruelty inflicted on animals.",
		URL:         "https://awionline.org/donate",
		RatingNote:  "Charity Navigator 4-star",
	},
	{
		Slug:        "aspca",
		Name:        "ASPCA",
		Focus:       "shelters",
		Description: "Adoption, anti-cruelty programs, and animal welfare advocacy.",
		URL:         "https://www.aspca.org/donate",
		RatingNote:  "Charity Navigator 4-star",
	},
}

// CharitiesDisclaimer is appended to every donate output reminding users to
// verify ratings independently.
const CharitiesDisclaimer = "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving."

// FindCharityBySlug returns the charity with the matching slug
// (case-insensitive), or false if none.
func FindCharityBySlug(slug string) (Charity, bool) {
	target := strings.ToLower(slug)
	for _, c := range AllCharities {
		if strings.ToLower(c.Slug) == target {
			return c, true
		}
	}
	return Charity{}, false
}

// FilterCharitiesByFocus returns the charities matching the given focus
// keyword. "all" returns the full list.
func FilterCharitiesByFocus(focus string) []Charity {
	target := strings.ToLower(focus)
	if target == "all" || target == "" {
		out := make([]Charity, len(AllCharities))
		copy(out, AllCharities)
		return out
	}
	out := make([]Charity, 0, len(AllCharities))
	for _, c := range AllCharities {
		if strings.ToLower(c.Focus) == target {
			out = append(out, c)
		}
	}
	return out
}
