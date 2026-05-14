<?php

declare(strict_types=1);

namespace AgentXM\Examples\PawMatch;

use AgentXM\Examples\TinyFlags\BooleanFlag;
use AgentXM\Examples\TinyFlags\Flags;
use AgentXM\Examples\TinyFlags\VariantFlag;

/**
 * Flag keys + factory for the PawMatch CLI. Each flag is wired into at least
 * one command in `PawMatchCli` so companion skills have realistic targets.
 */
final class PawMatchFlags
{
    public const HOME_CHECK_FOLLOWUP = 'home-check-followup';
    public const FEE_BREAKDOWN_DETAILED = 'fee-breakdown-detailed';
    public const LONG_STAY_HIGHLIGHT = 'long-stay-highlight';
    public const SUGGEST_DONATE_AFTER_ADOPTION = 'suggest-donate-after-adoption';
    public const SHOW_CHARITY_RATINGS = 'show-charity-ratings';
    public const RECOMMENDATION_STRATEGY = 'recommendation-strategy';
    public const MATCH_QUIZ_DEPTH = 'match-quiz-depth';
    public const PET_CARD_STYLE = 'pet-card-style';
    public const DONATE_FOCUS_DEFAULT = 'donate-focus-default';

    public static function create(): Flags
    {
        return Flags::create([
            self::HOME_CHECK_FOLLOWUP => BooleanFlag::of(['default' => false, 'rollout' => 25]),
            self::FEE_BREAKDOWN_DETAILED => BooleanFlag::of(['default' => true]),
            self::LONG_STAY_HIGHLIGHT => BooleanFlag::of(['default' => true]),
            self::SUGGEST_DONATE_AFTER_ADOPTION => BooleanFlag::of(['default' => false, 'rollout' => 50]),
            self::SHOW_CHARITY_RATINGS => BooleanFlag::of(['default' => true]),
            self::RECOMMENDATION_STRATEGY => VariantFlag::of(
                ['popularity', 'match-quiz', 'longest-stay'],
                ['default' => 'match-quiz', 'rollout' => ['longest-stay' => 20]],
            ),
            self::MATCH_QUIZ_DEPTH => VariantFlag::of(
                ['short', 'standard', 'thorough'],
                ['default' => 'standard'],
            ),
            self::PET_CARD_STYLE => VariantFlag::of(
                ['compact', 'detailed', 'playful'],
                ['default' => 'detailed'],
            ),
            self::DONATE_FOCUS_DEFAULT => VariantFlag::of(
                ['all', 'shelters', 'rescue'],
                ['default' => 'all'],
            ),
        ]);
    }
}
