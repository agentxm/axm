<?php

declare(strict_types=1);

namespace AgentXM\Examples\PawMatch;

final class Charities
{
    public const DISCLAIMER = 'Curated example list — verify current ratings on Charity Navigator or GuideStar before giving.';

    /**
     * @return list<Charity>
     */
    public static function all(): array
    {
        return [
            new Charity(
                slug: 'best-friends',
                name: 'Best Friends Animal Society',
                focus: 'shelters',
                description: 'No-kill movement; supports adoptions, shelters, and advocacy nationwide.',
                url: 'https://bestfriends.org/donate',
                ratingNote: 'Charity Navigator 4-star',
            ),
            new Charity(
                slug: 'petsmart-charities',
                name: 'PetSmart Charities',
                focus: 'shelters',
                description: 'Grants to local shelters; spay/neuter; adoption events.',
                url: 'https://petsmartcharities.org/donate',
                ratingNote: 'Charity Navigator 4-star (96% program ratio)',
            ),
            new Charity(
                slug: 'brother-wolf',
                name: 'Brother Wolf Animal Rescue',
                focus: 'rescue',
                description: 'Local rescue with national-impact outreach programs.',
                url: 'https://bwar.org/donate',
                ratingNote: 'Charity Navigator 4-star, GuideStar Platinum',
            ),
            new Charity(
                slug: 'animal-welfare-institute',
                name: 'Animal Welfare Institute',
                focus: 'policy',
                description: 'Policy and advocacy reducing cruelty inflicted on animals.',
                url: 'https://awionline.org/donate',
                ratingNote: 'Charity Navigator 4-star',
            ),
            new Charity(
                slug: 'aspca',
                name: 'ASPCA',
                focus: 'shelters',
                description: 'Adoption, anti-cruelty programs, and animal welfare advocacy.',
                url: 'https://www.aspca.org/donate',
                ratingNote: 'Charity Navigator 4-star',
            ),
        ];
    }

    public static function findBySlug(string $slug): ?Charity
    {
        $target = strtolower($slug);
        foreach (self::all() as $charity) {
            if (strtolower($charity->slug) === $target) {
                return $charity;
            }
        }

        return null;
    }

    /**
     * @return list<Charity>
     */
    public static function filterByFocus(string $focus): array
    {
        if (strtolower($focus) === 'all') {
            return self::all();
        }

        $target = strtolower($focus);

        return array_values(array_filter(
            self::all(),
            static fn (Charity $c): bool => strtolower($c->focus) === $target,
        ));
    }
}
