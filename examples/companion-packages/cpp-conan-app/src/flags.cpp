#include "pawmatch/flags.hpp"

namespace pawmatch {

using agentxm::tinyflags::BooleanFlag;
using agentxm::tinyflags::Registry;
using agentxm::tinyflags::VariantFlag;

Registry build_flag_registry() {
    Registry r;
    r.add(kFlagHomeCheckFollowup,
          BooleanFlag::with_default(false).with_rollout(25));
    r.add(kFlagFeeBreakdownDetailed, BooleanFlag::with_default(true));
    r.add(kFlagLongStayHighlight, BooleanFlag::with_default(true));
    r.add(kFlagSuggestDonateAfterAdoption,
          BooleanFlag::with_default(false).with_rollout(50));
    r.add(kFlagShowCharityRatings, BooleanFlag::with_default(true));

    r.add(kFlagRecommendationStrategy,
          VariantFlag::create({"popularity", "match-quiz", "longest-stay"})
              .with_default("match-quiz")
              .with_rollout({{"longest-stay", 20}}));
    r.add(kFlagMatchQuizDepth,
          VariantFlag::create({"short", "standard", "thorough"})
              .with_default("standard"));
    r.add(kFlagPetCardStyle,
          VariantFlag::create({"compact", "detailed", "playful"})
              .with_default("detailed"));
    r.add(kFlagDonateFocusDefault,
          VariantFlag::create({"all", "shelters", "rescue"})
              .with_default("all"));
    return r;
}

}  // namespace pawmatch
