#include "pawmatch/variants.hpp"

#include <stdexcept>

namespace pawmatch {

MatchStrategy parse_match_strategy(const std::string& value) {
    if (value == "popularity") return MatchStrategy::Popularity;
    if (value == "match-quiz") return MatchStrategy::MatchQuiz;
    if (value == "longest-stay") return MatchStrategy::LongestStay;
    throw std::invalid_argument("unknown recommendation-strategy: " + value);
}

MatchDepth parse_match_depth(const std::string& value) {
    if (value == "short") return MatchDepth::Short;
    if (value == "standard") return MatchDepth::Standard;
    if (value == "thorough") return MatchDepth::Thorough;
    throw std::invalid_argument("unknown match-quiz-depth: " + value);
}

PetCardStyle parse_pet_card_style(const std::string& value) {
    if (value == "compact") return PetCardStyle::Compact;
    if (value == "detailed") return PetCardStyle::Detailed;
    if (value == "playful") return PetCardStyle::Playful;
    throw std::invalid_argument("unknown pet-card-style: " + value);
}

DonateFocus parse_donate_focus(const std::string& value) {
    if (value == "all") return DonateFocus::All;
    if (value == "shelters") return DonateFocus::Shelters;
    if (value == "rescue") return DonateFocus::Rescue;
    if (value == "policy") return DonateFocus::Policy;
    throw std::invalid_argument("unknown donate-focus-default: " + value);
}

const char* to_string(MatchStrategy v) {
    switch (v) {
        case MatchStrategy::Popularity: return "popularity";
        case MatchStrategy::MatchQuiz: return "match-quiz";
        case MatchStrategy::LongestStay: return "longest-stay";
    }
    return "match-quiz";
}

const char* to_string(MatchDepth v) {
    switch (v) {
        case MatchDepth::Short: return "short";
        case MatchDepth::Standard: return "standard";
        case MatchDepth::Thorough: return "thorough";
    }
    return "standard";
}

const char* to_string(PetCardStyle v) {
    switch (v) {
        case PetCardStyle::Compact: return "compact";
        case PetCardStyle::Detailed: return "detailed";
        case PetCardStyle::Playful: return "playful";
    }
    return "detailed";
}

const char* to_string(DonateFocus v) {
    switch (v) {
        case DonateFocus::All: return "all";
        case DonateFocus::Shelters: return "shelters";
        case DonateFocus::Rescue: return "rescue";
        case DonateFocus::Policy: return "policy";
    }
    return "all";
}

}  // namespace pawmatch
