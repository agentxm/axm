/// Curated charity list — ported verbatim from the C# reference app.
library;

final class Charity {
  const Charity({
    required this.slug,
    required this.name,
    required this.focus,
    required this.description,
    required this.url,
    required this.ratingNote,
  });

  final String slug;
  final String name;
  final String focus;
  final String description;
  final String url;
  final String ratingNote;
}

const List<Charity> allCharities = [
  Charity(
    slug: 'best-friends',
    name: 'Best Friends Animal Society',
    focus: 'shelters',
    description:
        'No-kill movement; supports adoptions, shelters, and advocacy nationwide.',
    url: 'https://bestfriends.org/donate',
    ratingNote: 'Charity Navigator 4-star',
  ),
  Charity(
    slug: 'petsmart-charities',
    name: 'PetSmart Charities',
    focus: 'shelters',
    description: 'Grants to local shelters; spay/neuter; adoption events.',
    url: 'https://petsmartcharities.org/donate',
    ratingNote: 'Charity Navigator 4-star (96% program ratio)',
  ),
  Charity(
    slug: 'brother-wolf',
    name: 'Brother Wolf Animal Rescue',
    focus: 'rescue',
    description: 'Local rescue with national-impact outreach programs.',
    url: 'https://bwar.org/donate',
    ratingNote: 'Charity Navigator 4-star, GuideStar Platinum',
  ),
  Charity(
    slug: 'animal-welfare-institute',
    name: 'Animal Welfare Institute',
    focus: 'policy',
    description: 'Policy and advocacy reducing cruelty inflicted on animals.',
    url: 'https://awionline.org/donate',
    ratingNote: 'Charity Navigator 4-star',
  ),
  Charity(
    slug: 'aspca',
    name: 'ASPCA',
    focus: 'shelters',
    description:
        'Adoption, anti-cruelty programs, and animal welfare advocacy.',
    url: 'https://www.aspca.org/donate',
    ratingNote: 'Charity Navigator 4-star',
  ),
];

const String charityDisclaimer =
    'Curated example list — verify current ratings on Charity Navigator or '
    'GuideStar before giving.';

Charity? findCharityBySlug(String slug) {
  final target = slug.toLowerCase();
  for (final charity in allCharities) {
    if (charity.slug.toLowerCase() == target) return charity;
  }
  return null;
}

List<Charity> filterCharitiesByFocus(String focus) {
  if (focus.toLowerCase() == 'all') return allCharities;
  final target = focus.toLowerCase();
  return allCharities.where((c) => c.focus.toLowerCase() == target).toList();
}
