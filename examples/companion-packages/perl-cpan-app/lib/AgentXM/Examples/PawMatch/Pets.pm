package AgentXM::Examples::PawMatch::Pets;

use strict;
use warnings;

# Each pet is a plain hashref. A blessed pet object is overkill for this
# example; consumers treat the structure as data.
our @ALL = (
    {
        slug => 'biscuit', name => 'Biscuit', species => 'dog',
        breed => 'Beagle mix', age_years => 4, days_in_shelter => 12,
        tags => [qw(playful social good-with-kids)],
        needs => 'Daily walks; loves squeaky toys.',
    },
    {
        slug => 'pepper', name => 'Pepper', species => 'cat',
        breed => 'Domestic Shorthair', age_years => 8, days_in_shelter => 247,
        tags => [qw(mellow lap-cat solo)],
        needs => 'Quiet home preferred; no other cats.',
    },
    {
        slug => 'marigold', name => 'Marigold', species => 'dog',
        breed => 'Senior Labrador', age_years => 11, days_in_shelter => 89,
        tags => [qw(calm gentle low-energy)],
        needs => 'Joint supplements; short walks only.',
    },
    {
        slug => 'tofu', name => 'Tofu', species => 'rabbit',
        breed => 'Holland Lop', age_years => 2, days_in_shelter => 31,
        tags => [qw(curious social)],
        needs => 'Roomy enclosure and unlimited hay.',
    },
    {
        slug => 'otis', name => 'Otis', species => 'dog',
        breed => 'Pittie mix', age_years => 5, days_in_shelter => 156,
        tags => [qw(gentle good-with-kids no-cats)],
        needs => 'Cat-free home; loves toddlers.',
    },
    {
        slug => 'juniper', name => 'Juniper', species => 'cat',
        breed => 'Tortoiseshell', age_years => 3, days_in_shelter => 22,
        tags => [qw(vocal spunky solo)],
        needs => 'Only cat in the household, please.',
    },
    {
        slug => 'maple', name => 'Maple', species => 'dog',
        breed => 'Mini Australian Shepherd', age_years => 1,
        days_in_shelter => 6,
        tags => [qw(high-energy smart needs-training)],
        needs => 'Training class strongly recommended.',
    },
    {
        slug => 'clover', name => 'Clover & Sage', species => 'guinea-pig',
        breed => 'Bonded pair', age_years => 1, days_in_shelter => 18,
        tags => [qw(social bonded-pair)],
        needs => 'Must adopt together — bonded for life.',
    },
);

sub all { return @ALL }

sub long_stay {
    my ($pet) = @_;
    return $pet->{days_in_shelter} >= 120 ? 1 : 0;
}

sub find_by_slug {
    my ($slug) = @_;
    return undef unless defined $slug;
    my $needle = lc $slug;
    for my $pet (@ALL) {
        return $pet if lc($pet->{slug}) eq $needle;
    }
    return undef;
}

sub filter_by_species {
    my ($species) = @_;
    return @ALL unless defined $species && $species ne '';
    my $target = lc $species;
    return grep { lc($_->{species}) eq $target } @ALL;
}

1;
