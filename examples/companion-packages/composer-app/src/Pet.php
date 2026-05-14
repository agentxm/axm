<?php

declare(strict_types=1);

namespace AgentXM\Examples\PawMatch;

final class Pet
{
    /**
     * @param list<string> $tags
     */
    public function __construct(
        public readonly string $slug,
        public readonly string $name,
        public readonly string $species,
        public readonly string $breed,
        public readonly int $ageYears,
        public readonly int $daysInShelter,
        public readonly array $tags,
        public readonly string $needs,
    ) {
    }
}
