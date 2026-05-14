//! Static pet data shared across the CLI commands.

/// Number of days in shelter at which a pet is considered "long-stay".
pub const LONG_STAY_THRESHOLD: u32 = 120;

#[derive(Debug, Clone)]
pub struct Pet {
    pub slug: &'static str,
    pub name: &'static str,
    pub species: &'static str,
    pub breed: &'static str,
    pub age_years: u32,
    pub days_in_shelter: u32,
    pub tags: &'static [&'static str],
    pub needs: &'static str,
}

/// Mirrors the npm-javascript-app data so companion skills see the same
/// fictional shelter in every ecosystem port.
pub const ALL_PETS: &[Pet] = &[
    Pet {
        slug: "biscuit",
        name: "Biscuit",
        species: "dog",
        breed: "Beagle mix",
        age_years: 4,
        days_in_shelter: 12,
        tags: &["playful", "social", "good-with-kids"],
        needs: "Daily walks; loves squeaky toys.",
    },
    Pet {
        slug: "pepper",
        name: "Pepper",
        species: "cat",
        breed: "Domestic Shorthair",
        age_years: 8,
        days_in_shelter: 247,
        tags: &["mellow", "lap-cat", "solo"],
        needs: "Quiet home preferred; no other cats.",
    },
    Pet {
        slug: "marigold",
        name: "Marigold",
        species: "dog",
        breed: "Senior Labrador",
        age_years: 11,
        days_in_shelter: 89,
        tags: &["calm", "gentle", "low-energy"],
        needs: "Joint supplements; short walks only.",
    },
    Pet {
        slug: "tofu",
        name: "Tofu",
        species: "rabbit",
        breed: "Holland Lop",
        age_years: 2,
        days_in_shelter: 31,
        tags: &["curious", "social"],
        needs: "Roomy enclosure and unlimited hay.",
    },
    Pet {
        slug: "otis",
        name: "Otis",
        species: "dog",
        breed: "Pittie mix",
        age_years: 5,
        days_in_shelter: 156,
        tags: &["gentle", "good-with-kids", "no-cats"],
        needs: "Cat-free home; loves toddlers.",
    },
    Pet {
        slug: "juniper",
        name: "Juniper",
        species: "cat",
        breed: "Tortoiseshell",
        age_years: 3,
        days_in_shelter: 22,
        tags: &["vocal", "spunky", "solo"],
        needs: "Only cat in the household, please.",
    },
    Pet {
        slug: "maple",
        name: "Maple",
        species: "dog",
        breed: "Mini Australian Shepherd",
        age_years: 1,
        days_in_shelter: 6,
        tags: &["high-energy", "smart", "needs-training"],
        needs: "Training class strongly recommended.",
    },
    Pet {
        slug: "clover",
        name: "Clover & Sage",
        species: "guinea-pig",
        breed: "Bonded pair",
        age_years: 1,
        days_in_shelter: 18,
        tags: &["social", "bonded-pair"],
        needs: "Must adopt together — bonded for life.",
    },
];

pub fn is_long_stay(pet: &Pet) -> bool {
    pet.days_in_shelter >= LONG_STAY_THRESHOLD
}

pub fn find_pet_by_slug(slug: &str) -> Option<&'static Pet> {
    let target = slug.to_lowercase();
    ALL_PETS.iter().find(|p| p.slug.to_lowercase() == target)
}

pub fn filter_pets_by_species(species: &str) -> Vec<&'static Pet> {
    if species.is_empty() {
        return ALL_PETS.iter().collect();
    }
    let target = species.to_lowercase();
    ALL_PETS
        .iter()
        .filter(|p| p.species.to_lowercase() == target)
        .collect()
}
