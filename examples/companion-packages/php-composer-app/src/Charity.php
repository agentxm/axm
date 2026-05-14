<?php

declare(strict_types=1);

namespace AgentXM\Examples\PawMatch;

final class Charity
{
    public function __construct(
        public readonly string $slug,
        public readonly string $name,
        public readonly string $focus,
        public readonly string $description,
        public readonly string $url,
        public readonly string $ratingNote,
    ) {
    }
}
