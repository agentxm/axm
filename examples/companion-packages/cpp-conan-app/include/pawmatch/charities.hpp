#pragma once

#include <string>
#include <vector>

namespace pawmatch {

struct Charity {
    std::string slug;
    std::string name;
    std::string focus;
    std::string description;
    std::string url;
    std::string rating_note;
};

extern const char* const kCharitiesDisclaimer;

const std::vector<Charity>& all_charities();

std::vector<const Charity*> filter_charities_by_focus(const std::string& focus);

const Charity* find_charity_by_slug(const std::string& slug);

}  // namespace pawmatch
