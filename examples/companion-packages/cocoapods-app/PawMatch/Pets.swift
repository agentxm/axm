// Adoptable-pet catalog — static example data shared across every PawMatch
// ecosystem port.

import Foundation

struct Pet: Equatable {
    let slug: String
    let name: String
    let species: String
    let breed: String
    let ageYears: Int
    let daysInShelter: Int
    let tags: [String]
    let needs: String

    var isLongStay: Bool { daysInShelter >= 120 }
}

enum Pets {
    static let all: [Pet] = [
        Pet(slug: "biscuit", name: "Biscuit", species: "dog", breed: "Beagle mix",
            ageYears: 4, daysInShelter: 12,
            tags: ["playful", "social", "good-with-kids"],
            needs: "Daily walks; loves squeaky toys."),
        Pet(slug: "pepper", name: "Pepper", species: "cat", breed: "Domestic Shorthair",
            ageYears: 8, daysInShelter: 247,
            tags: ["mellow", "lap-cat", "solo"],
            needs: "Quiet home preferred; no other cats."),
        Pet(slug: "marigold", name: "Marigold", species: "dog", breed: "Senior Labrador",
            ageYears: 11, daysInShelter: 89,
            tags: ["calm", "gentle", "low-energy"],
            needs: "Joint supplements; short walks only."),
        Pet(slug: "tofu", name: "Tofu", species: "rabbit", breed: "Holland Lop",
            ageYears: 2, daysInShelter: 31,
            tags: ["curious", "social"],
            needs: "Roomy enclosure and unlimited hay."),
        Pet(slug: "otis", name: "Otis", species: "dog", breed: "Pittie mix",
            ageYears: 5, daysInShelter: 156,
            tags: ["gentle", "good-with-kids", "no-cats"],
            needs: "Cat-free home; loves toddlers."),
        Pet(slug: "juniper", name: "Juniper", species: "cat", breed: "Tortoiseshell",
            ageYears: 3, daysInShelter: 22,
            tags: ["vocal", "spunky", "solo"],
            needs: "Only cat in the household, please."),
        Pet(slug: "maple", name: "Maple", species: "dog", breed: "Mini Australian Shepherd",
            ageYears: 1, daysInShelter: 6,
            tags: ["high-energy", "smart", "needs-training"],
            needs: "Training class strongly recommended."),
        Pet(slug: "clover", name: "Clover & Sage", species: "guinea-pig",
            breed: "Bonded pair", ageYears: 1, daysInShelter: 18,
            tags: ["social", "bonded-pair"],
            needs: "Must adopt together — bonded for life."),
    ]

    static func findBySlug(_ slug: String) -> Pet? {
        all.first { $0.slug.caseInsensitiveCompare(slug) == .orderedSame }
    }

    static func filterBySpecies(_ species: String?) -> [Pet] {
        guard let species else { return all }
        return all.filter { $0.species.caseInsensitiveCompare(species) == .orderedSame }
    }
}
