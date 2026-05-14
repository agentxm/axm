// Curated static list of well-known animal-welfare charities. PawMatch never
// processes payments — every output includes a disclaimer reminding the user
// to verify ratings independently before giving.

import Foundation

struct Charity: Equatable {
    let slug: String
    let name: String
    let focus: String
    let description: String
    let url: String
    let ratingNote: String
}

enum Charities {
    static let disclaimer =
        "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving."

    static let all: [Charity] = [
        Charity(slug: "best-friends", name: "Best Friends Animal Society",
                focus: "shelters",
                description: "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
                url: "https://bestfriends.org/donate",
                ratingNote: "Charity Navigator 4-star"),
        Charity(slug: "petsmart-charities", name: "PetSmart Charities",
                focus: "shelters",
                description: "Grants to local shelters; spay/neuter; adoption events.",
                url: "https://petsmartcharities.org/donate",
                ratingNote: "Charity Navigator 4-star (96% program ratio)"),
        Charity(slug: "brother-wolf", name: "Brother Wolf Animal Rescue",
                focus: "rescue",
                description: "Local rescue with national-impact outreach programs.",
                url: "https://bwar.org/donate",
                ratingNote: "Charity Navigator 4-star, GuideStar Platinum"),
        Charity(slug: "animal-welfare-institute", name: "Animal Welfare Institute",
                focus: "policy",
                description: "Policy and advocacy reducing cruelty inflicted on animals.",
                url: "https://awionline.org/donate",
                ratingNote: "Charity Navigator 4-star"),
        Charity(slug: "aspca", name: "ASPCA",
                focus: "shelters",
                description: "Adoption, anti-cruelty programs, and animal welfare advocacy.",
                url: "https://www.aspca.org/donate",
                ratingNote: "Charity Navigator 4-star"),
    ]

    static func findBySlug(_ slug: String) -> Charity? {
        all.first { $0.slug.caseInsensitiveCompare(slug) == .orderedSame }
    }

    static func filterByFocus(_ focus: String) -> [Charity] {
        if focus.caseInsensitiveCompare("all") == .orderedSame { return all }
        return all.filter { $0.focus.caseInsensitiveCompare(focus) == .orderedSame }
    }
}
