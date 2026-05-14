<?php

declare(strict_types=1);

namespace AgentXM\Examples\PawMatch;

use InvalidArgumentException;

final class Variants
{
    public const PET_CARD_STYLES = ['compact', 'detailed', 'playful'];
    public const MATCH_STRATEGIES = ['popularity', 'match-quiz', 'longest-stay'];
    public const MATCH_DEPTHS = ['short', 'standard', 'thorough'];
    public const DONATE_FOCUSES = ['all', 'shelters', 'rescue'];

    public static function parsePetCardStyle(string $value): string
    {
        return self::requireOneOf($value, self::PET_CARD_STYLES, 'PetCardStyle');
    }

    public static function parseMatchStrategy(string $value): string
    {
        return self::requireOneOf($value, self::MATCH_STRATEGIES, 'MatchStrategy');
    }

    public static function parseMatchDepth(string $value): string
    {
        return self::requireOneOf($value, self::MATCH_DEPTHS, 'MatchDepth');
    }

    public static function parseDonateFocus(string $value): string
    {
        return self::requireOneOf($value, self::DONATE_FOCUSES, 'DonateFocus');
    }

    /**
     * @param list<string> $allowed
     */
    private static function requireOneOf(string $value, array $allowed, string $label): string
    {
        if (! in_array($value, $allowed, true)) {
            throw new InvalidArgumentException("Unknown {$label} variant '{$value}'.");
        }

        return $value;
    }
}
