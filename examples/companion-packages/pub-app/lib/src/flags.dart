/// TinyFlags definitions for PawMatch.
library;

import 'package:agentxm_example_tinyflags/agentxm_example_tinyflags.dart';

const String homeCheckFollowup = 'home-check-followup';
const String feeBreakdownDetailed = 'fee-breakdown-detailed';
const String longStayHighlight = 'long-stay-highlight';
const String suggestDonateAfterAdoption = 'suggest-donate-after-adoption';
const String showCharityRatings = 'show-charity-ratings';
const String recommendationStrategy = 'recommendation-strategy';
const String matchQuizDepth = 'match-quiz-depth';
const String petCardStyle = 'pet-card-style';
const String donateFocusDefault = 'donate-focus-default';

/// Build the TinyFlags client with PawMatch's flag definitions.
TinyFlags createFlags() {
  return TinyFlags({
    homeCheckFollowup: BooleanFlag(defaultValue: false, rollout: 25),
    feeBreakdownDetailed: BooleanFlag(defaultValue: true),
    longStayHighlight: BooleanFlag(defaultValue: true),
    suggestDonateAfterAdoption: BooleanFlag(defaultValue: false, rollout: 50),
    showCharityRatings: BooleanFlag(defaultValue: true),
    recommendationStrategy: VariantFlag(
      variants: ['popularity', 'match-quiz', 'longest-stay'],
      defaultValue: 'match-quiz',
      rollout: {'longest-stay': 20},
    ),
    matchQuizDepth: VariantFlag(
      variants: ['short', 'standard', 'thorough'],
      defaultValue: 'standard',
    ),
    petCardStyle: VariantFlag(
      variants: ['compact', 'detailed', 'playful'],
      defaultValue: 'detailed',
    ),
    donateFocusDefault: VariantFlag(
      variants: ['all', 'shelters', 'rescue'],
      defaultValue: 'all',
    ),
  });
}
