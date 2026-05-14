#pragma once

#include <optional>
#include <string>
#include <vector>

namespace pawmatch {

struct Pet {
    std::string slug;
    std::string name;
    std::string species;
    std::string breed;
    int age_years;
    int days_in_shelter;
    std::vector<std::string> tags;
    std::string needs;

    bool long_stay() const noexcept { return days_in_shelter >= 120; }
};

const std::vector<Pet>& all_pets();

std::vector<const Pet*> filter_pets_by_species(const std::string& species);

const Pet* find_pet_by_slug(const std::string& slug);

}  // namespace pawmatch
