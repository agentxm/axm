#pragma once

#include <string>

namespace pawmatch {

enum class MatchStrategy { Popularity, MatchQuiz, LongestStay };
enum class MatchDepth { Short, Standard, Thorough };
enum class PetCardStyle { Compact, Detailed, Playful };
enum class DonateFocus { All, Shelters, Rescue, Policy };

MatchStrategy parse_match_strategy(const std::string& value);
MatchDepth parse_match_depth(const std::string& value);
PetCardStyle parse_pet_card_style(const std::string& value);
DonateFocus parse_donate_focus(const std::string& value);

const char* to_string(MatchStrategy v);
const char* to_string(MatchDepth v);
const char* to_string(PetCardStyle v);
const char* to_string(DonateFocus v);

}  // namespace pawmatch
