<?php

declare(strict_types=1);

namespace AgentXM\Examples\PawMatch;

final class Pets
{
    public const LONG_STAY_THRESHOLD = 120;

    /**
     * @return list<Pet>
     */
    public static function all(): array
    {
        return [
            new Pet(
                slug: 'biscuit',
                name: 'Biscuit',
                species: 'dog',
                breed: 'Beagle mix',
                ageYears: 4,
                daysInShelter: 12,
                tags: ['playful', 'social', 'good-with-kids'],
                needs: 'Daily walks; loves squeaky toys.',
            ),
            new Pet(
                slug: 'pepper',
                name: 'Pepper',
                species: 'cat',
                breed: 'Domestic Shorthair',
                ageYears: 8,
                daysInShelter: 247,
                tags: ['mellow', 'lap-cat', 'solo'],
                needs: 'Quiet home preferred; no other cats.',
            ),
            new Pet(
                slug: 'marigold',
                name: 'Marigold',
                species: 'dog',
                breed: 'Senior Labrador',
                ageYears: 11,
                daysInShelter: 89,
                tags: ['calm', 'gentle', 'low-energy'],
                needs: 'Joint supplements; short walks only.',
            ),
            new Pet(
                slug: 'tofu',
                name: 'Tofu',
                species: 'rabbit',
                breed: 'Holland Lop',
                ageYears: 2,
                daysInShelter: 31,
                tags: ['curious', 'social'],
                needs: 'Roomy enclosure and unlimited hay.',
            ),
            new Pet(
                slug: 'otis',
                name: 'Otis',
                species: 'dog',
                breed: 'Pittie mix',
                ageYears: 5,
                daysInShelter: 156,
                tags: ['gentle', 'good-with-kids', 'no-cats'],
                needs: 'Cat-free home; loves toddlers.',
            ),
            new Pet(
                slug: 'juniper',
                name: 'Juniper',
                species: 'cat',
                breed: 'Tortoiseshell',
                ageYears: 3,
                daysInShelter: 22,
                tags: ['vocal', 'spunky', 'solo'],
                needs: 'Only cat in the household, please.',
            ),
            new Pet(
                slug: 'maple',
                name: 'Maple',
                species: 'dog',
                breed: 'Mini Australian Shepherd',
                ageYears: 1,
                daysInShelter: 6,
                tags: ['high-energy', 'smart', 'needs-training'],
                needs: 'Training class strongly recommended.',
            ),
            new Pet(
                slug: 'clover',
                name: 'Clover & Sage',
                species: 'guinea-pig',
                breed: 'Bonded pair',
                ageYears: 1,
                daysInShelter: 18,
                tags: ['social', 'bonded-pair'],
                needs: 'Must adopt together — bonded for life.',
            ),
        ];
    }

    public static function isLongStay(Pet $pet): bool
    {
        return $pet->daysInShelter >= self::LONG_STAY_THRESHOLD;
    }

    public static function findBySlug(string $slug): ?Pet
    {
        $target = strtolower($slug);
        foreach (self::all() as $pet) {
            if (strtolower($pet->slug) === $target) {
                return $pet;
            }
        }

        return null;
    }

    /**
     * @return list<Pet>
     */
    public static function filterBySpecies(?string $species): array
    {
        $all = self::all();
        if ($species === null) {
            return $all;
        }

        $target = strtolower($species);

        return array_values(array_filter(
            $all,
            static fn (Pet $pet): bool => strtolower($pet->species) === $target,
        ));
    }
}
