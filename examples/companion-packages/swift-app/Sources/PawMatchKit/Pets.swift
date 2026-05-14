// Pet roster shared by every PawMatch command. Mirrors the data in the other
// ecosystem ports so the companion skills see the same fictional shelter
// everywhere.

import Foundation

/// A single adoptable animal in the example shelter.
public struct Pet: Sendable, Equatable {
    public let slug: String
    public let name: String
    public let species: String
    public let breed: String
    public let ageYears: Int
    public let daysInShelter: Int
    public let tags: [String]
    public let needs: String

    public init(
        slug: String,
        name: String,
        species: String,
        breed: String,
        ageYears: Int,
        daysInShelter: Int,
        tags: [String],
        needs: String
    ) {
        self.slug = slug
        self.name = name
        self.species = species
        self.breed = breed
        self.ageYears = ageYears
        self.daysInShelter = daysInShelter
        self.tags = tags
        self.needs = needs
    }
}

/// Days-in-shelter at which a pet is considered "long-stay" and surfaced
/// more prominently to potential adopters.
public let longStayThreshold = 120

public enum Pets {

    /// Curated static roster — kept in sync with the other ecosystem ports.
    public static let all: [Pet] = [
        Pet(
            slug: "biscuit",
            name: "Biscuit",
            species: "dog",
            breed: "Beagle mix",
            ageYears: 4,
            daysInShelter: 12,
            tags: ["playful", "social", "good-with-kids"],
            needs: "Daily walks; loves squeaky toys."
        ),
        Pet(
            slug: "pepper",
            name: "Pepper",
            species: "cat",
            breed: "Domestic Shorthair",
            ageYears: 8,
            daysInShelter: 247,
            tags: ["mellow", "lap-cat", "solo"],
            needs: "Quiet home preferred; no other cats."
        ),
        Pet(
            slug: "marigold",
            name: "Marigold",
            species: "dog",
            breed: "Senior Labrador",
            ageYears: 11,
            daysInShelter: 89,
            tags: ["calm", "gentle", "low-energy"],
            needs: "Joint supplements; short walks only."
        ),
        Pet(
            slug: "tofu",
            name: "Tofu",
            species: "rabbit",
            breed: "Holland Lop",
            ageYears: 2,
            daysInShelter: 31,
            tags: ["curious", "social"],
            needs: "Roomy enclosure and unlimited hay."
        ),
        Pet(
            slug: "otis",
            name: "Otis",
            species: "dog",
            breed: "Pittie mix",
            ageYears: 5,
            daysInShelter: 156,
            tags: ["gentle", "good-with-kids", "no-cats"],
            needs: "Cat-free home; loves toddlers."
        ),
        Pet(
            slug: "juniper",
            name: "Juniper",
            species: "cat",
            breed: "Tortoiseshell",
            ageYears: 3,
            daysInShelter: 22,
            tags: ["vocal", "spunky", "solo"],
            needs: "Only cat in the household, please."
        ),
        Pet(
            slug: "maple",
            name: "Maple",
            species: "dog",
            breed: "Mini Australian Shepherd",
            ageYears: 1,
            daysInShelter: 6,
            tags: ["high-energy", "smart", "needs-training"],
            needs: "Training class strongly recommended."
        ),
        Pet(
            slug: "clover",
            name: "Clover & Sage",
            species: "guinea-pig",
            breed: "Bonded pair",
            ageYears: 1,
            daysInShelter: 18,
            tags: ["social", "bonded-pair"],
            needs: "Must adopt together — bonded for life."
        ),
    ]

    public static func isLongStay(_ pet: Pet) -> Bool {
        pet.daysInShelter >= longStayThreshold
    }

    public static func find(slug: String) -> Pet? {
        let target = slug.lowercased()
        return all.first { $0.slug.lowercased() == target }
    }

    public static func filter(species: String?) -> [Pet] {
        guard let species, !species.isEmpty else { return all }
        let target = species.lowercased()
        return all.filter { $0.species.lowercased() == target }
    }
}
