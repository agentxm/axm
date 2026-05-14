<?php

declare(strict_types=1);

namespace AgentXM\Examples\TinyFlags;

/**
 * Stable identity used for deterministic rollout bucketing.
 *
 * Pass at least one of userId, accountId, or sessionId to receive
 * per-caller bucketing. Callers without any identifier share a single
 * "anonymous" bucket.
 */
final class EvaluationContext
{
    public function __construct(
        public readonly ?string $userId = null,
        public readonly ?string $accountId = null,
        public readonly ?string $sessionId = null,
    ) {
    }

    public function bucketKey(): string
    {
        return $this->userId ?? $this->accountId ?? $this->sessionId ?? 'anonymous';
    }
}
