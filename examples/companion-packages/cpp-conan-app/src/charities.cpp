#include "pawmatch/charities.hpp"

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

const char* const kCharitiesDisclaimer =
    "Curated example list — verify current ratings on Charity Navigator or "
    "GuideStar before giving.";

const std::vector<Charity>& all_charities() {
    static const std::vector<Charity> kCharities = {
        {"best-friends", "Best Friends Animal Society", "shelters",
         "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
         "https://bestfriends.org/donate", "Charity Navigator 4-star"},
        {"petsmart-charities", "PetSmart Charities", "shelters",
         "Grants to local shelters; spay/neuter; adoption events.",
         "https://petsmartcharities.org/donate",
         "Charity Navigator 4-star (96% program ratio)"},
        {"brother-wolf", "Brother Wolf Animal Rescue", "rescue",
         "Local rescue with national-impact outreach programs.",
         "https://bwar.org/donate",
         "Charity Navigator 4-star, GuideStar Platinum"},
        {"animal-welfare-institute", "Animal Welfare Institute", "policy",
         "Policy and advocacy reducing cruelty inflicted on animals.",
         "https://awionline.org/donate", "Charity Navigator 4-star"},
        {"aspca", "ASPCA", "shelters",
         "Adoption, anti-cruelty programs, and animal welfare advocacy.",
         "https://www.aspca.org/donate", "Charity Navigator 4-star"},
    };
    return kCharities;
}

std::vector<const Charity*> filter_charities_by_focus(const std::string& focus) {
    std::vector<const Charity*> result;
    const auto lowered = to_lower(focus);
    const bool include_all = lowered.empty() || lowered == "all";
    for (const auto& c : all_charities()) {
        if (include_all || to_lower(c.focus) == lowered) {
            result.push_back(&c);
        }
    }
    return result;
}

const Charity* find_charity_by_slug(const std::string& slug) {
    if (slug.empty()) {
        return nullptr;
    }
    const auto target = to_lower(slug);
    for (const auto& c : all_charities()) {
        if (to_lower(c.slug) == target) {
            return &c;
        }
    }
    return nullptr;
}

}  // namespace pawmatch
