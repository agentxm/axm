export interface Pet {
  readonly slug: string;
  readonly name: string;
  readonly species: string;
  readonly breed: string;
  readonly ageYears: number;
  readonly daysInShelter: number;
  readonly tags: readonly string[];
  readonly needs: string;
}

const LONG_STAY_THRESHOLD = 120;

export const ALL_PETS: readonly Pet[] = Object.freeze([
  {
    slug: "biscuit",
    name: "Biscuit",
    species: "dog",
    breed: "Beagle mix",
    ageYears: 4,
    daysInShelter: 12,
    tags: ["playful", "social", "good-with-kids"],
    needs: "Daily walks; loves squeaky toys.",
  },
  {
    slug: "pepper",
    name: "Pepper",
    species: "cat",
    breed: "Domestic Shorthair",
    ageYears: 8,
    daysInShelter: 247,
    tags: ["mellow", "lap-cat", "solo"],
    needs: "Quiet home preferred; no other cats.",
  },
  {
    slug: "marigold",
    name: "Marigold",
    species: "dog",
    breed: "Senior Labrador",
    ageYears: 11,
    daysInShelter: 89,
    tags: ["calm", "gentle", "low-energy"],
    needs: "Joint supplements; short walks only.",
  },
  {
    slug: "tofu",
    name: "Tofu",
    species: "rabbit",
    breed: "Holland Lop",
    ageYears: 2,
    daysInShelter: 31,
    tags: ["curious", "social"],
    needs: "Roomy enclosure and unlimited hay.",
  },
  {
    slug: "otis",
    name: "Otis",
    species: "dog",
    breed: "Pittie mix",
    ageYears: 5,
    daysInShelter: 156,
    tags: ["gentle", "good-with-kids", "no-cats"],
    needs: "Cat-free home; loves toddlers.",
  },
  {
    slug: "juniper",
    name: "Juniper",
    species: "cat",
    breed: "Tortoiseshell",
    ageYears: 3,
    daysInShelter: 22,
    tags: ["vocal", "spunky", "solo"],
    needs: "Only cat in the household, please.",
  },
  {
    slug: "maple",
    name: "Maple",
    species: "dog",
    breed: "Mini Australian Shepherd",
    ageYears: 1,
    daysInShelter: 6,
    tags: ["high-energy", "smart", "needs-training"],
    needs: "Training class strongly recommended.",
  },
  {
    slug: "clover",
    name: "Clover & Sage",
    species: "guinea-pig",
    breed: "Bonded pair",
    ageYears: 1,
    daysInShelter: 18,
    tags: ["social", "bonded-pair"],
    needs: "Must adopt together — bonded for life.",
  },
]);

export function isLongStay(pet: Pet): boolean {
  return pet.daysInShelter >= LONG_STAY_THRESHOLD;
}

export function findPetBySlug(slug: string): Pet | undefined {
  const target = slug.toLowerCase();
  return ALL_PETS.find((pet) => pet.slug.toLowerCase() === target);
}

export function filterPetsBySpecies(species: string | undefined): readonly Pet[] {
  if (species === undefined) return ALL_PETS;
  const target = species.toLowerCase();
  return ALL_PETS.filter((pet) => pet.species.toLowerCase() === target);
}
