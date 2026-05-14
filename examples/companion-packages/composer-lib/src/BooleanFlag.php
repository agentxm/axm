<?php

declare(strict_types=1);

namespace AgentXM\Examples\TinyFlags;

use InvalidArgumentException;

/**
 * Boolean feature flag with an optional integer percentage rollout in [0, 100].
 */
final class BooleanFlag implements Flag
{
    public readonly bool $default;
    public readonly ?int $rollout;

    public function __construct(bool $default = false, ?int $rollout = null)
    {
        $this->default = $default;
        $this->rollout = $rollout === null ? null : self::requirePercentage($rollout, 'booleanFlag rollout');
    }

    public function kind(): string
    {
        return 'boolean';
    }

    /**
     * @param array{default?: bool, rollout?: int} $options
     */
    public static function of(array $options = []): self
    {
        return new self(
            $options['default'] ?? false,
            $options['rollout'] ?? null,
        );
    }

    public static function requirePercentage(int $value, string $label): int
    {
        if ($value < 0 || $value > 100) {
            throw new InvalidArgumentException("{$label} must be an integer from 0 to 100");
        }

        return $value;
    }
}
