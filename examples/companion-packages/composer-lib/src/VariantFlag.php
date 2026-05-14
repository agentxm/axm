<?php

declare(strict_types=1);

namespace AgentXM\Examples\TinyFlags;

use InvalidArgumentException;

/**
 * Variant feature flag with named treatments and optional percentage allocations.
 */
final class VariantFlag implements Flag
{
    /** @var list<string> */
    public readonly array $variants;

    public readonly string $default;

    /** @var array<string, int>|null */
    public readonly ?array $rollout;

    /**
     * @param list<string> $variants
     * @param array<string, int>|null $rollout
     */
    public function __construct(array $variants, ?string $default = null, ?array $rollout = null)
    {
        if ($variants === []) {
            throw new InvalidArgumentException('variantFlag requires at least one variant');
        }

        $unique = array_values(array_unique($variants));
        if (count($unique) !== count($variants)) {
            throw new InvalidArgumentException('variantFlag variants must be unique non-empty strings');
        }

        foreach ($unique as $variant) {
            if ($variant === '') {
                throw new InvalidArgumentException('variantFlag variants must be unique non-empty strings');
            }
        }

        $resolvedDefault = $default ?? $unique[0];
        if (! in_array($resolvedDefault, $unique, true)) {
            throw new InvalidArgumentException('variantFlag default must be one of the variants');
        }

        $this->variants = $unique;
        $this->default = $resolvedDefault;
        $this->rollout = self::normalizeRollout($rollout, $unique);
    }

    public function kind(): string
    {
        return 'variant';
    }

    /**
     * @param list<string> $variants
     * @param array{default?: string, rollout?: array<string, int>} $options
     */
    public static function of(array $variants, array $options = []): self
    {
        return new self(
            $variants,
            $options['default'] ?? null,
            $options['rollout'] ?? null,
        );
    }

    /**
     * @param array<string, int>|null $rollout
     * @param list<string> $variants
     * @return array<string, int>|null
     */
    private static function normalizeRollout(?array $rollout, array $variants): ?array
    {
        if ($rollout === null) {
            return null;
        }

        $total = 0;
        $normalized = [];
        foreach ($rollout as $variant => $percentage) {
            if (! in_array($variant, $variants, true)) {
                throw new InvalidArgumentException("variantFlag rollout references unknown variant: {$variant}");
            }
            $normalized[$variant] = BooleanFlag::requirePercentage($percentage, "rollout for '{$variant}'");
            $total += $normalized[$variant];
        }

        if ($total > 100) {
            throw new InvalidArgumentException('variantFlag rollout percentages cannot exceed 100');
        }

        return $normalized;
    }
}
