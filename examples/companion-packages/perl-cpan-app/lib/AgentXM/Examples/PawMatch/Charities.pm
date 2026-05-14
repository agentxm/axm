package AgentXM::Examples::PawMatch::Charities;

use strict;
use warnings;

our @ALL = (
    {
        slug        => 'best-friends',
        name        => 'Best Friends Animal Society',
        focus       => 'shelters',
        description => 'No-kill movement; supports adoptions, shelters, and advocacy nationwide.',
        url         => 'https://bestfriends.org/donate',
        rating_note => 'Charity Navigator 4-star',
    },
    {
        slug        => 'petsmart-charities',
        name        => 'PetSmart Charities',
        focus       => 'shelters',
        description => 'Grants to local shelters; spay/neuter; adoption events.',
        url         => 'https://petsmartcharities.org/donate',
        rating_note => 'Charity Navigator 4-star (96% program ratio)',
    },
    {
        slug        => 'brother-wolf',
        name        => 'Brother Wolf Animal Rescue',
        focus       => 'rescue',
        description => 'Local rescue with national-impact outreach programs.',
        url         => 'https://bwar.org/donate',
        rating_note => 'Charity Navigator 4-star, GuideStar Platinum',
    },
    {
        slug        => 'animal-welfare-institute',
        name        => 'Animal Welfare Institute',
        focus       => 'policy',
        description => 'Policy and advocacy reducing cruelty inflicted on animals.',
        url         => 'https://awionline.org/donate',
        rating_note => 'Charity Navigator 4-star',
    },
    {
        slug        => 'aspca',
        name        => 'ASPCA',
        focus       => 'shelters',
        description => 'Adoption, anti-cruelty programs, and animal welfare advocacy.',
        url         => 'https://www.aspca.org/donate',
        rating_note => 'Charity Navigator 4-star',
    },
);

our $DISCLAIMER =
    'Curated example list — verify current ratings on Charity Navigator or '
  . 'GuideStar before giving.';

sub all { return @ALL }

sub find_by_slug {
    my ($slug) = @_;
    return undef unless defined $slug;
    my $needle = lc $slug;
    for my $c (@ALL) {
        return $c if lc($c->{slug}) eq $needle;
    }
    return undef;
}

sub filter_by_focus {
    my ($focus) = @_;
    return @ALL unless defined $focus && $focus ne '' && lc($focus) ne 'all';
    my $target = lc $focus;
    return grep { lc($_->{focus}) eq $target } @ALL;
}

1;
