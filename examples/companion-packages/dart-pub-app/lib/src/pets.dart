/// Pet records — ported verbatim from the C# reference app.
library;

final class Pet {
  const Pet({
    required this.slug,
    required this.name,
    required this.species,
    required this.breed,
    required this.ageYears,
    required this.daysInShelter,
    required this.tags,
    required this.needs,
  });

  final String slug;
  final String name;
  final String species;
  final String breed;
  final int ageYears;
  final int daysInShelter;
  final List<String> tags;
  final String needs;

  bool get isLongStay => daysInShelter >= 120;
}

const List<Pet> allPets = [
  Pet(
    slug: 'biscuit',
    name: 'Biscuit',
    species: 'dog',
    breed: 'Beagle mix',
    ageYears: 4,
    daysInShelter: 12,
    tags: ['playful', 'social', 'good-with-kids'],
    needs: 'Daily walks; loves squeaky toys.',
  ),
  Pet(
    slug: 'pepper',
    name: 'Pepper',
    species: 'cat',
    breed: 'Domestic Shorthair',
    ageYears: 8,
    daysInShelter: 247,
    tags: ['mellow', 'lap-cat', 'solo'],
    needs: 'Quiet home preferred; no other cats.',
  ),
  Pet(
    slug: 'marigold',
    name: 'Marigold',
    species: 'dog',
    breed: 'Senior Labrador',
    ageYears: 11,
    daysInShelter: 89,
    tags: ['calm', 'gentle', 'low-energy'],
    needs: 'Joint supplements; short walks only.',
  ),
  Pet(
    slug: 'tofu',
    name: 'Tofu',
    species: 'rabbit',
    breed: 'Holland Lop',
    ageYears: 2,
    daysInShelter: 31,
    tags: ['curious', 'social'],
    needs: 'Roomy enclosure and unlimited hay.',
  ),
  Pet(
    slug: 'otis',
    name: 'Otis',
    species: 'dog',
    breed: 'Pittie mix',
    ageYears: 5,
    daysInShelter: 156,
    tags: ['gentle', 'good-with-kids', 'no-cats'],
    needs: 'Cat-free home; loves toddlers.',
  ),
  Pet(
    slug: 'juniper',
    name: 'Juniper',
    species: 'cat',
    breed: 'Tortoiseshell',
    ageYears: 3,
    daysInShelter: 22,
    tags: ['vocal', 'spunky', 'solo'],
    needs: 'Only cat in the household, please.',
  ),
  Pet(
    slug: 'maple',
    name: 'Maple',
    species: 'dog',
    breed: 'Mini Australian Shepherd',
    ageYears: 1,
    daysInShelter: 6,
    tags: ['high-energy', 'smart', 'needs-training'],
    needs: 'Training class strongly recommended.',
  ),
  Pet(
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

Pet? findPetBySlug(String slug) {
  final target = slug.toLowerCase();
  for (final pet in allPets) {
    if (pet.slug.toLowerCase() == target) return pet;
  }
  return null;
}

List<Pet> filterPetsBySpecies(String? species) {
  if (species == null) return allPets;
  final target = species.toLowerCase();
  return allPets.where((pet) => pet.species.toLowerCase() == target).toList();
}
