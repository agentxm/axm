<?php

declare(strict_types=1);

namespace AgentXM\Examples\TinyFlags;

use OutOfBoundsException;
use TypeError;

/**
 * Evaluator for a fixed set of TinyFlags definitions.
 *
 * Bucketing is deterministic: the same flag name + context bucket key always
 * resolves to the same bucket integer in [0, 99].
 */
final class Flags
{
    /**
     * @param array<string, Flag> $definitions
     */
    public function __construct(public readonly array $definitions)
    {
    }

    /**
     * @param array<string, Flag> $definitions
     */
    public static function create(array $definitions): self
    {
        foreach ($definitions as $name => $flag) {
            if (! is_string($name) || $name === '') {
                throw new TypeError('Flag names must be non-empty strings');
            }
            if (! $flag instanceof Flag) {
                throw new TypeError("Definition for '{$name}' must implement Flag");
            }
        }

        return new self($definitions);
    }

    public function enabled(string $name, ?EvaluationContext $context = null): bool
    {
        $flag = $this->requireFlag($name);
        if (! $flag instanceof BooleanFlag) {
            throw new TypeError("TinyFlags flag '{$name}' is not a boolean flag");
        }

        if ($flag->rollout === null) {
            return $flag->default;
        }

        return $this->bucketFor($name, $context) < $flag->rollout;
    }

    public function variant(string $name, ?EvaluationContext $context = null): string
    {
        $flag = $this->requireFlag($name);
        if (! $flag instanceof VariantFlag) {
            throw new TypeError("TinyFlags flag '{$name}' is not a variant flag");
        }

        if ($flag->rollout === null) {
            return $flag->default;
        }

        $bucket = $this->bucketFor($name, $context);
        $upperBound = 0;
        foreach ($flag->rollout as $variant => $percentage) {
            $upperBound += $percentage;
            if ($bucket < $upperBound) {
                return $variant;
            }
        }

        return $flag->default;
    }

    /**
     * @return bool|string
     */
    public function evaluate(string $name, ?EvaluationContext $context = null): bool|string
    {
        $flag = $this->requireFlag($name);

        return $flag instanceof BooleanFlag
            ? $this->enabled($name, $context)
            : $this->variant($name, $context);
    }

    private function requireFlag(string $name): Flag
    {
        if (! array_key_exists($name, $this->definitions)) {
            throw new OutOfBoundsException("Unknown TinyFlags flag: {$name}");
        }

        return $this->definitions[$name];
    }

    private function bucketFor(string $name, ?EvaluationContext $context): int
    {
        $key = $context?->bucketKey() ?? 'anonymous';

        return self::hashString("{$name}:{$key}") % 100;
    }

    /**
     * FNV-1a 32-bit hash, mirroring the JS/Go/etc. reference implementations
     * so bucketing behaves consistently across ecosystems.
     */
    public static function hashString(string $value): int
    {
        $hash = 2166136261;
        $length = strlen($value);
        for ($index = 0; $index < $length; $index += 1) {
            $hash ^= ord($value[$index]);
            // Multiply by the FNV prime 16777619 modulo 2^32.
            $hash = ($hash * 16777619) & 0xFFFFFFFF;
        }

        return $hash;
    }
}
