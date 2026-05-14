package pawmatch

import "strings"

// LongStayThreshold is the number of days in shelter at which a pet is
// considered "long-stay" and surfaced more prominently to potential adopters.
const LongStayThreshold = 120

// Pet describes an adoptable animal in the example shelter.
type Pet struct {
	Slug          string
	Name          string
	Species       string
	Breed         string
	AgeYears      int
	DaysInShelter int
	Tags          []string
	Needs         string
}

// AllPets is the curated static roster used by the example CLI. Mirrors the
// npm-javascript-app data exactly so the companion skills see the same
// fictional shelter in every ecosystem port.
var AllPets = []Pet{
	{
		Slug:          "biscuit",
		Name:          "Biscuit",
		Species:       "dog",
		Breed:         "Beagle mix",
		AgeYears:      4,
		DaysInShelter: 12,
		Tags:          []string{"playful", "social", "good-with-kids"},
		Needs:         "Daily walks; loves squeaky toys.",
	},
	{
		Slug:          "pepper",
		Name:          "Pepper",
		Species:       "cat",
		Breed:         "Domestic Shorthair",
		AgeYears:      8,
		DaysInShelter: 247,
		Tags:          []string{"mellow", "lap-cat", "solo"},
		Needs:         "Quiet home preferred; no other cats.",
	},
	{
		Slug:          "marigold",
		Name:          "Marigold",
		Species:       "dog",
		Breed:         "Senior Labrador",
		AgeYears:      11,
		DaysInShelter: 89,
		Tags:          []string{"calm", "gentle", "low-energy"},
		Needs:         "Joint supplements; short walks only.",
	},
	{
		Slug:          "tofu",
		Name:          "Tofu",
		Species:       "rabbit",
		Breed:         "Holland Lop",
		AgeYears:      2,
		DaysInShelter: 31,
		Tags:          []string{"curious", "social"},
		Needs:         "Roomy enclosure and unlimited hay.",
	},
	{
		Slug:          "otis",
		Name:          "Otis",
		Species:       "dog",
		Breed:         "Pittie mix",
		AgeYears:      5,
		DaysInShelter: 156,
		Tags:          []string{"gentle", "good-with-kids", "no-cats"},
		Needs:         "Cat-free home; loves toddlers.",
	},
	{
		Slug:          "juniper",
		Name:          "Juniper",
		Species:       "cat",
		Breed:         "Tortoiseshell",
		AgeYears:      3,
		DaysInShelter: 22,
		Tags:          []string{"vocal", "spunky", "solo"},
		Needs:         "Only cat in the household, please.",
	},
	{
		Slug:          "maple",
		Name:          "Maple",
		Species:       "dog",
		Breed:         "Mini Australian Shepherd",
		AgeYears:      1,
		DaysInShelter: 6,
		Tags:          []string{"high-energy", "smart", "needs-training"},
		Needs:         "Training class strongly recommended.",
	},
	{
		Slug:          "clover",
		Name:          "Clover & Sage",
		Species:       "guinea-pig",
		Breed:         "Bonded pair",
		AgeYears:      1,
		DaysInShelter: 18,
		Tags:          []string{"social", "bonded-pair"},
		Needs:         "Must adopt together — bonded for life.",
	},
}

// IsLongStay reports whether a pet has been in the shelter long enough to
// qualify as a long-stay friend.
func IsLongStay(p Pet) bool {
	return p.DaysInShelter >= LongStayThreshold
}

// FindPetBySlug returns the pet with the matching slug (case-insensitive),
// or false if none.
func FindPetBySlug(slug string) (Pet, bool) {
	target := strings.ToLower(slug)
	for _, p := range AllPets {
		if strings.ToLower(p.Slug) == target {
			return p, true
		}
	}
	return Pet{}, false
}

// FilterPetsBySpecies returns the pets matching the given species
// (case-insensitive). An empty species returns all pets.
func FilterPetsBySpecies(species string) []Pet {
	if species == "" {
		out := make([]Pet, len(AllPets))
		copy(out, AllPets)
		return out
	}
	target := strings.ToLower(species)
	out := make([]Pet, 0, len(AllPets))
	for _, p := range AllPets {
		if strings.ToLower(p.Species) == target {
			out = append(out, p)
		}
	}
	return out
}
