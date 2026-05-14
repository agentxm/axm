//! Static, curated list of well-known, highly-rated animal-welfare
//! organizations. PawMatch never processes payments — every output reminds
//! the user to verify ratings independently.

#[derive(Debug, Clone)]
pub struct Charity {
    pub slug: &'static str,
    pub name: &'static str,
    pub focus: &'static str,
    pub description: &'static str,
    pub url: &'static str,
    pub rating_note: &'static str,
}

pub const ALL_CHARITIES: &[Charity] = &[
    Charity {
        slug: "best-friends",
        name: "Best Friends Animal Society",
        focus: "shelters",
        description: "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
        url: "https://bestfriends.org/donate",
        rating_note: "Charity Navigator 4-star",
    },
    Charity {
        slug: "petsmart-charities",
        name: "PetSmart Charities",
        focus: "shelters",
        description: "Grants to local shelters; spay/neuter; adoption events.",
        url: "https://petsmartcharities.org/donate",
        rating_note: "Charity Navigator 4-star (96% program ratio)",
    },
    Charity {
        slug: "brother-wolf",
        name: "Brother Wolf Animal Rescue",
        focus: "rescue",
        description: "Local rescue with national-impact outreach programs.",
        url: "https://bwar.org/donate",
        rating_note: "Charity Navigator 4-star, GuideStar Platinum",
    },
    Charity {
        slug: "animal-welfare-institute",
        name: "Animal Welfare Institute",
        focus: "policy",
        description: "Policy and advocacy reducing cruelty inflicted on animals.",
        url: "https://awionline.org/donate",
        rating_note: "Charity Navigator 4-star",
    },
    Charity {
        slug: "aspca",
        name: "ASPCA",
        focus: "shelters",
        description: "Adoption, anti-cruelty programs, and animal welfare advocacy.",
        url: "https://www.aspca.org/donate",
        rating_note: "Charity Navigator 4-star",
    },
];

pub const CHARITIES_DISCLAIMER: &str =
    "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving.";

pub fn find_charity_by_slug(slug: &str) -> Option<&'static Charity> {
    let target = slug.to_lowercase();
    ALL_CHARITIES
        .iter()
        .find(|c| c.slug.to_lowercase() == target)
}

pub fn filter_charities_by_focus(focus: &str) -> Vec<&'static Charity> {
    let target = focus.to_lowercase();
    if target == "all" || target.is_empty() {
        return ALL_CHARITIES.iter().collect();
    }
    ALL_CHARITIES
        .iter()
        .filter(|c| c.focus.to_lowercase() == target)
        .collect()
}
