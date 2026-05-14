// Curated static charity list shown by `pawmatch donate`. The CLI never
// processes payments — every output reminds the user to verify ratings
// independently before giving.

import Foundation

public struct Charity: Sendable, Equatable {
    public let slug: String
    public let name: String
    public let focus: String
    public let description: String
    public let url: String
    public let ratingNote: String

    public init(
        slug: String,
        name: String,
        focus: String,
        description: String,
        url: String,
        ratingNote: String
    ) {
        self.slug = slug
        self.name = name
        self.focus = focus
        self.description = description
        self.url = url
        self.ratingNote = ratingNote
    }
}

public enum Charities {

    public static let disclaimer =
        "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving."

    public static let all: [Charity] = [
        Charity(
            slug: "best-friends",
            name: "Best Friends Animal Society",
            focus: "shelters",
            description: "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
            url: "https://bestfriends.org/donate",
            ratingNote: "Charity Navigator 4-star"
        ),
        Charity(
            slug: "petsmart-charities",
            name: "PetSmart Charities",
            focus: "shelters",
            description: "Grants to local shelters; spay/neuter; adoption events.",
            url: "https://petsmartcharities.org/donate",
            ratingNote: "Charity Navigator 4-star (96% program ratio)"
        ),
        Charity(
            slug: "brother-wolf",
            name: "Brother Wolf Animal Rescue",
            focus: "rescue",
            description: "Local rescue with national-impact outreach programs.",
            url: "https://bwar.org/donate",
            ratingNote: "Charity Navigator 4-star, GuideStar Platinum"
        ),
        Charity(
            slug: "animal-welfare-institute",
            name: "Animal Welfare Institute",
            focus: "policy",
            description: "Policy and advocacy reducing cruelty inflicted on animals.",
            url: "https://awionline.org/donate",
            ratingNote: "Charity Navigator 4-star"
        ),
        Charity(
            slug: "aspca",
            name: "ASPCA",
            focus: "shelters",
            description: "Adoption, anti-cruelty programs, and animal welfare advocacy.",
            url: "https://www.aspca.org/donate",
            ratingNote: "Charity Navigator 4-star"
        ),
    ]

    public static func find(slug: String) -> Charity? {
        let target = slug.lowercased()
        return all.first { $0.slug.lowercased() == target }
    }

    public static func filter(focus: String) -> [Charity] {
        let target = focus.lowercased()
        if target == "all" || target.isEmpty { return all }
        return all.filter { $0.focus.lowercased() == target }
    }
}
