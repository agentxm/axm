package AgentXM::Examples::PawMatch::Flags;

use strict;
use warnings;

use AgentXM::Examples::TinyFlags;
# TinyFlags.pm declares BooleanFlag, VariantFlag, and Registry as inner
# packages, so loading the parent module is enough.

# Public flag-name constants — used by the CLI to avoid string-literal drift.
use constant HOME_CHECK_FOLLOWUP           => 'home-check-followup';
use constant FEE_BREAKDOWN_DETAILED        => 'fee-breakdown-detailed';
use constant LONG_STAY_HIGHLIGHT           => 'long-stay-highlight';
use constant SUGGEST_DONATE_AFTER_ADOPTION => 'suggest-donate-after-adoption';
use constant SHOW_CHARITY_RATINGS          => 'show-charity-ratings';
use constant RECOMMENDATION_STRATEGY       => 'recommendation-strategy';
use constant MATCH_QUIZ_DEPTH              => 'match-quiz-depth';
use constant PET_CARD_STYLE                => 'pet-card-style';
use constant DONATE_FOCUS_DEFAULT          => 'donate-focus-default';

sub build_registry {
    return AgentXM::Examples::TinyFlags::Registry->new({
        HOME_CHECK_FOLLOWUP() =>
            AgentXM::Examples::TinyFlags::BooleanFlag->new(
                default => 0, rollout => 25,
            ),
        FEE_BREAKDOWN_DETAILED() =>
            AgentXM::Examples::TinyFlags::BooleanFlag->new(default => 1),
        LONG_STAY_HIGHLIGHT() =>
            AgentXM::Examples::TinyFlags::BooleanFlag->new(default => 1),
        SUGGEST_DONATE_AFTER_ADOPTION() =>
            AgentXM::Examples::TinyFlags::BooleanFlag->new(
                default => 0, rollout => 50,
            ),
        SHOW_CHARITY_RATINGS() =>
            AgentXM::Examples::TinyFlags::BooleanFlag->new(default => 1),
        RECOMMENDATION_STRATEGY() =>
            AgentXM::Examples::TinyFlags::VariantFlag->new(
                variants => [qw(popularity match-quiz longest-stay)],
                default  => 'match-quiz',
                rollout  => { 'longest-stay' => 20 },
            ),
        MATCH_QUIZ_DEPTH() =>
            AgentXM::Examples::TinyFlags::VariantFlag->new(
                variants => [qw(short standard thorough)],
                default  => 'standard',
            ),
        PET_CARD_STYLE() =>
            AgentXM::Examples::TinyFlags::VariantFlag->new(
                variants => [qw(compact detailed playful)],
                default  => 'detailed',
            ),
        DONATE_FOCUS_DEFAULT() =>
            AgentXM::Examples::TinyFlags::VariantFlag->new(
                variants => [qw(all shelters rescue)],
                default  => 'all',
            ),
    });
}

1;
