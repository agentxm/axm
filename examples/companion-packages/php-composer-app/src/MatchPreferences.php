<?php

declare(strict_types=1);

namespace AgentXM\Examples\PawMatch;

final class MatchPreferences
{
    public function __construct(
        public readonly bool $hasKids = false,
        public readonly bool $quietHome = false,
        public readonly bool $active = false,
        public readonly bool $firstTime = false,
        public readonly bool $multiplePets = false,
        public readonly bool $smallHome = false,
    ) {
    }

    /**
     * @return list<string>
     */
    public function activeFlags(): array
    {
        $flags = [];
        if ($this->hasKids) {
            $flags[] = 'has-kids';
        }
        if ($this->quietHome) {
            $flags[] = 'quiet-home';
        }
        if ($this->active) {
            $flags[] = 'active';
        }
        if ($this->firstTime) {
            $flags[] = 'first-time';
        }
        if ($this->multiplePets) {
            $flags[] = 'multiple-pets';
        }
        if ($this->smallHome) {
            $flags[] = 'small-home';
        }

        return $flags;
    }

    public function isEmpty(): bool
    {
        return $this->activeFlags() === [];
    }
}
