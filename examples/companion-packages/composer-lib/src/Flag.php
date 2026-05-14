<?php

declare(strict_types=1);

namespace AgentXM\Examples\TinyFlags;

/**
 * Marker interface for TinyFlags definitions.
 *
 * Concrete implementations are BooleanFlag and VariantFlag.
 */
interface Flag
{
    public function kind(): string;
}
