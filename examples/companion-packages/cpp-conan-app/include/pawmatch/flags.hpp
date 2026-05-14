#pragma once

#include <agentxm/tinyflags.hpp>

namespace pawmatch {

inline constexpr const char* kFlagHomeCheckFollowup = "home-check-followup";
inline constexpr const char* kFlagFeeBreakdownDetailed = "fee-breakdown-detailed";
inline constexpr const char* kFlagLongStayHighlight = "long-stay-highlight";
inline constexpr const char* kFlagSuggestDonateAfterAdoption =
    "suggest-donate-after-adoption";
inline constexpr const char* kFlagShowCharityRatings = "show-charity-ratings";
inline constexpr const char* kFlagRecommendationStrategy = "recommendation-strategy";
inline constexpr const char* kFlagMatchQuizDepth = "match-quiz-depth";
inline constexpr const char* kFlagPetCardStyle = "pet-card-style";
inline constexpr const char* kFlagDonateFocusDefault = "donate-focus-default";

agentxm::tinyflags::Registry build_flag_registry();

}  // namespace pawmatch
