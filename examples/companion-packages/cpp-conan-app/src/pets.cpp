#include "pawmatch/pets.hpp"

#include <algorithm>
#include <cctype>

namespace pawmatch {

namespace {

std::string to_lower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    return s;
}

}  // namespace

const std::vector<Pet>& all_pets() {
    static const std::vector<Pet> kPets = {
        {"biscuit", "Biscuit", "dog", "Beagle mix", 4, 12,
         {"playful", "social", "good-with-kids"},
         "Daily walks; loves squeaky toys."},
        {"pepper", "Pepper", "cat", "Domestic Shorthair", 8, 247,
         {"mellow", "lap-cat", "solo"},
         "Quiet home preferred; no other cats."},
        {"marigold", "Marigold", "dog", "Senior Labrador", 11, 89,
         {"calm", "gentle", "low-energy"},
         "Joint supplements; short walks only."},
        {"tofu", "Tofu", "rabbit", "Holland Lop", 2, 31,
         {"curious", "social"},
         "Roomy enclosure and unlimited hay."},
        {"otis", "Otis", "dog", "Pittie mix", 5, 156,
         {"gentle", "good-with-kids", "no-cats"},
         "Cat-free home; loves toddlers."},
        {"juniper", "Juniper", "cat", "Tortoiseshell", 3, 22,
         {"vocal", "spunky", "solo"},
         "Only cat in the household, please."},
        {"maple", "Maple", "dog", "Mini Australian Shepherd", 1, 6,
         {"high-energy", "smart", "needs-training"},
         "Training class strongly recommended."},
        {"clover", "Clover & Sage", "guinea-pig", "Bonded pair", 1, 18,
         {"social", "bonded-pair"},
         "Must adopt together — bonded for life."},
    };
    return kPets;
}

std::vector<const Pet*> filter_pets_by_species(const std::string& species) {
    std::vector<const Pet*> result;
    if (species.empty()) {
        for (const auto& p : all_pets()) {
            result.push_back(&p);
        }
        return result;
    }
    const auto target = to_lower(species);
    for (const auto& p : all_pets()) {
        if (to_lower(p.species) == target) {
            result.push_back(&p);
        }
    }
    return result;
}

const Pet* find_pet_by_slug(const std::string& slug) {
    if (slug.empty()) {
        return nullptr;
    }
    const auto target = to_lower(slug);
    for (const auto& p : all_pets()) {
        if (to_lower(p.slug) == target) {
            return &p;
        }
    }
    return nullptr;
}

}  // namespace pawmatch
