package AgentXM::Examples::PawMatch::CLI;

# Command-line entrypoint for the pawmatch example app. Subcommands use
# Getopt::Long with `pass_through` so unknown flags become positional args.

use strict;
use warnings;

use Getopt::Long qw(GetOptionsFromArray :config no_ignore_case pass_through);
use Config;

use AgentXM::Examples::PawMatch::Pets;
use AgentXM::Examples::PawMatch::Charities;
use AgentXM::Examples::PawMatch::Flags;

our $USAGE = <<'USAGE';
pawmatch — community pet-adoption CLI.

Usage: pawmatch <command> [options]

Commands:
  browse [--species SPECIES]   List adoptable pets
  show <pet>                   Show details for a pet
  match [match flags]          Match pets to your lifestyle
  apply <pet>                  Start an adoption application
  fees                         Show adoption fees
  return-support               No-judgment return information
  donate [--focus FOCUS]       Browse charities to support
  donate <slug> --open         Open a charity's donation URL
USAGE

# Ordered (factor flag, [matching pet tags]) tuples — the quiz depth variant
# controls how many factors are considered.
our @ALL_FACTORS = (
    ['has-kids',      [qw(good-with-kids gentle)]],
    ['quiet-home',    [qw(mellow calm solo lap-cat)]],
    ['active',        [qw(high-energy playful)]],
    ['first-time',    [qw(gentle calm low-energy)]],
    ['multiple-pets', [qw(social)]],
    ['small-home',    [qw(lap-cat solo low-energy)]],
);

our @POPULARITY_TAGS = qw(social good-with-kids calm mellow gentle);

sub run {
    my ($argv_ref, %opts) = @_;
    # `run(\@argv, stdout => $fh, stderr => $fh)` — argv is copied so the
    # caller's array is not consumed.
    my $argv = [@{$argv_ref // []}];
    my $out = $opts{stdout} // \*STDOUT;
    my $err = $opts{stderr} // \*STDERR;

    my $command = shift @$argv;
    if (!defined $command || $command eq '--help' || $command eq '-h') {
        print {$out} $USAGE;
        return 0;
    }

    my %dispatch = (
        'browse'         => \&_cmd_browse,
        'show'           => \&_cmd_show,
        'match'          => \&_cmd_match,
        'apply'          => \&_cmd_apply,
        'fees'           => \&_cmd_fees,
        'return-support' => \&_cmd_return_support,
        'donate'         => \&_cmd_donate,
    );

    my $handler = $dispatch{$command};
    if (!defined $handler) {
        print {$err} "Unknown command: $command\n";
        print {$err} $USAGE;
        return 1;
    }
    return $handler->($argv, $out, $err);
}

# -- browse --------------------------------------------------------------

sub _cmd_browse {
    my ($argv, $out, $err) = @_;
    my $species;
    GetOptionsFromArray($argv, 'species=s' => \$species)
        or do { print {$err} "Usage: pawmatch browse [--species SPECIES]\n"; return 1 };

    my @matching = AgentXM::Examples::PawMatch::Pets::filter_by_species($species);
    if (!@matching) {
        my $label = defined $species ? $species : '';
        print {$out} "No adoptable pets found for species '$label'.\n";
        return 0;
    }

    my $flags = AgentXM::Examples::PawMatch::Flags::build_registry();
    my $ctx   = _context();

    if ($flags->enabled(
        AgentXM::Examples::PawMatch::Flags::LONG_STAY_HIGHLIGHT, $ctx))
    {
        my @long_stay =
            sort { $b->{days_in_shelter} <=> $a->{days_in_shelter} }
            grep { AgentXM::Examples::PawMatch::Pets::long_stay($_) }
            @matching;
        if (@long_stay) {
            my $featured = $long_stay[0];
            print {$out} "* Featured long-stay friend — please consider $featured->{name}!\n\n";
        }
    }

    my $style = $flags->variant(
        AgentXM::Examples::PawMatch::Flags::PET_CARD_STYLE, $ctx);
    _render_pet($_, $style, $out) for @matching;
    return 0;
}

# -- show ----------------------------------------------------------------

sub _cmd_show {
    my ($argv, $out, $err) = @_;
    my $slug = shift @$argv;
    if (!defined $slug || $slug eq '') {
        print {$err} "Usage: pawmatch show <pet>\n";
        return 1;
    }

    my $pet = AgentXM::Examples::PawMatch::Pets::find_by_slug($slug);
    if (!defined $pet) {
        print {$err} "Unknown pet '$slug'. Try 'pawmatch browse'.\n";
        return 1;
    }

    _render_pet($pet, 'detailed', $out);
    print {$out} "  Needs: $pet->{needs}\n";
    my $suffix = AgentXM::Examples::PawMatch::Pets::long_stay($pet)
        ? ' (long-stay)' : '';
    print {$out} "  Days in shelter: $pet->{days_in_shelter}$suffix\n";
    return 0;
}

# -- match ---------------------------------------------------------------

sub _cmd_match {
    my ($argv, $out, $err) = @_;
    my %prefs = (
        'has-kids'      => 0,
        'quiet-home'    => 0,
        'active'        => 0,
        'first-time'    => 0,
        'multiple-pets' => 0,
        'small-home'    => 0,
    );
    GetOptionsFromArray($argv,
        'has-kids'      => \$prefs{'has-kids'},
        'quiet-home'    => \$prefs{'quiet-home'},
        'active'        => \$prefs{'active'},
        'first-time'    => \$prefs{'first-time'},
        'multiple-pets' => \$prefs{'multiple-pets'},
        'small-home'    => \$prefs{'small-home'},
    ) or do { print {$err} "Usage: pawmatch match [preferences]\n"; return 1 };

    my $flags = AgentXM::Examples::PawMatch::Flags::build_registry();
    my $ctx   = _context();
    my $strategy = $flags->variant(
        AgentXM::Examples::PawMatch::Flags::RECOMMENDATION_STRATEGY, $ctx);
    my $depth = $flags->variant(
        AgentXM::Examples::PawMatch::Flags::MATCH_QUIZ_DEPTH, $ctx);
    my @factors = _factors_for_depth($depth);

    my @wants;
    for my $factor (@factors) {
        my ($name, $tags) = @$factor;
        next unless $prefs{$name};
        push @wants, @$tags;
    }

    printf {$out} "Strategy: %s • Quiz depth: %s (%d factor(s) considered)\n",
        $strategy, $depth, scalar @factors;
    if (!grep { $_ } values %prefs) {
        print {$out} "(no preference flags provided — try --has-kids --quiet-home --active --first-time)\n";
    }
    print {$out} "\n";

    my @all_pets = AgentXM::Examples::PawMatch::Pets::all();
    my @ranked;
    if ($strategy eq 'popularity') {
        @ranked = sort {
            _tag_count($b->{tags}, \@POPULARITY_TAGS)
                <=> _tag_count($a->{tags}, \@POPULARITY_TAGS)
        } @all_pets;
    }
    elsif ($strategy eq 'longest-stay') {
        @ranked = sort { $b->{days_in_shelter} <=> $a->{days_in_shelter} } @all_pets;
    }
    else {
        @ranked = sort {
            _tag_count($b->{tags}, \@wants)
                <=> _tag_count($a->{tags}, \@wants)
        } @all_pets;
    }

    for my $pet (@ranked[0 .. 2]) {
        last unless defined $pet;
        my $tags = join(', ', @{ $pet->{tags} });
        print {$out} "  • $pet->{name} ($pet->{breed}, $pet->{age_years}y) — $tags\n";
    }
    print {$out} "\n";
    print {$out} "Adoption is a conversation — book a meet-and-greet to see if it's a fit.\n";
    return 0;
}

# -- apply ---------------------------------------------------------------

sub _cmd_apply {
    my ($argv, $out, $err) = @_;
    my $slug = shift @$argv;
    if (!defined $slug || $slug eq '') {
        print {$err} "Usage: pawmatch apply <pet>\n";
        return 1;
    }

    my $pet = AgentXM::Examples::PawMatch::Pets::find_by_slug($slug);
    if (!defined $pet) {
        print {$err} "Unknown pet '$slug'. Try 'pawmatch browse'.\n";
        return 1;
    }

    print {$out} "Adoption application for $pet->{name}\n\n";
    print {$out} "Next steps:\n";
    print {$out} "  1. Application reviewed by an adoption counselor (1-2 days).\n";
    print {$out} "  2. Meet-and-greet scheduled at the shelter.\n";
    print {$out} "  3. 48-hour reflection period before finalizing.\n";
    print {$out} "  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.\n";

    my $flags = AgentXM::Examples::PawMatch::Flags::build_registry();
    my $ctx   = _context();
    if ($flags->enabled(
        AgentXM::Examples::PawMatch::Flags::HOME_CHECK_FOLLOWUP, $ctx))
    {
        print {$out} "  5. Two-week follow-up check from a counselor to see how you're settling in.\n";
    }
    print {$out} "\nReturns are always accepted, no questions asked.\n";

    if ($flags->enabled(
        AgentXM::Examples::PawMatch::Flags::SUGGEST_DONATE_AFTER_ADOPTION, $ctx))
    {
        print {$out} "\nIf $pet->{name} brings you joy, please consider donating to a shelter:\n";
        print {$out} "  pawmatch donate\n";
    }
    return 0;
}

# -- fees ----------------------------------------------------------------

sub _cmd_fees {
    my ($argv, $out, $err) = @_;
    my $flags = AgentXM::Examples::PawMatch::Flags::build_registry();
    my $ctx   = _context();

    print {$out} "Adoption fees\n\n";
    if ($flags->enabled(
        AgentXM::Examples::PawMatch::Flags::FEE_BREAKDOWN_DETAILED, $ctx))
    {
        print {$out} "  Dog adoption — \$150 total:\n";
        print {$out} "    \$60   spay / neuter surgery\n";
        print {$out} "    \$45   core vaccinations\n";
        print {$out} "    \$25   microchip and registration\n";
        print {$out} "    \$20   intake exam and deworming\n\n";
        print {$out} "  Cat adoption — \$90 total:\n";
        print {$out} "    \$50   spay / neuter surgery\n";
        print {$out} "    \$25   core vaccinations\n";
        print {$out} "    \$15   microchip and registration\n\n";
        print {$out} "  Small animal — \$35 total (intake exam + microchip).\n";
    }
    else {
        print {$out} "  Dog adoption           \$150\n";
        print {$out} "  Cat adoption            \$90\n";
        print {$out} "  Small animal            \$35\n\n";
        print {$out} "  Fees cover spay/neuter, vaccines, and microchip.\n";
    }
    print {$out} "\nNo one is turned away for inability to pay — ask about our subsidy fund.\n";
    return 0;
}

# -- return-support ------------------------------------------------------

sub _cmd_return_support {
    my ($argv, $out, $err) = @_;
    print {$out} "Return support\n\n";
    print {$out} "If your adoption isn't working out, we're here to help.\n";
    print {$out} "  • Free behavior consultation with our trainers.\n";
    print {$out} "  • No-judgment returns at any time — your pet stays in our care.\n";
    print {$out} "  • Connections to low-cost vet and food assistance programs.\n\n";
    print {$out} "Returning a pet is not a failure. Reach out as soon as you'd like support.\n";
    return 0;
}

# -- donate --------------------------------------------------------------

sub _cmd_donate {
    my ($argv, $out, $err) = @_;
    my $focus;
    my $open_flag = 0;
    GetOptionsFromArray($argv,
        'focus=s' => \$focus,
        'open'    => \$open_flag,
    ) or do { print {$err} "Usage: pawmatch donate [<slug>] [--focus FOCUS] [--open]\n"; return 1 };
    my $charity_slug = shift @$argv;

    my $flags = AgentXM::Examples::PawMatch::Flags::build_registry();
    my $ctx   = _context();
    my $default_focus = $flags->variant(
        AgentXM::Examples::PawMatch::Flags::DONATE_FOCUS_DEFAULT, $ctx);
    my $effective_focus = $focus // $default_focus;
    my $show_ratings = $flags->enabled(
        AgentXM::Examples::PawMatch::Flags::SHOW_CHARITY_RATINGS, $ctx);

    if (defined $charity_slug) {
        my $target = AgentXM::Examples::PawMatch::Charities::find_by_slug($charity_slug);
        if (!defined $target) {
            print {$err} "Unknown charity '$charity_slug'.\n";
            return 1;
        }
        return _open_url($target->{url}, $err) if $open_flag;

        _render_charity($target, $show_ratings, $out);
        return 0;
    }

    my @listing = AgentXM::Examples::PawMatch::Charities::filter_by_focus($effective_focus);
    print {$out} "Animal-welfare charities (focus: $effective_focus)\n\n";
    for my $c (@listing) {
        _render_charity($c, $show_ratings, $out);
        print {$out} "\n";
    }
    print {$out} "$AgentXM::Examples::PawMatch::Charities::DISCLAIMER\n";
    print {$out} "Ratings hidden — set show-charity-ratings to surface them inline.\n"
        unless $show_ratings;
    return 0;
}

# -- helpers -------------------------------------------------------------

sub _context {
    return { session_id => _session_id() };
}

sub _session_id {
    my $login = eval { getlogin() };
    return $login if defined $login && $login ne '';
    return $ENV{USER}     if defined $ENV{USER}     && $ENV{USER}     ne '';
    return $ENV{USERNAME} if defined $ENV{USERNAME} && $ENV{USERNAME} ne '';
    return 'anonymous';
}

sub _factors_for_depth {
    my ($depth) = @_;
    my $take =
          $depth eq 'short'    ? 2
        : $depth eq 'thorough' ? 6
        :                        4;
    return @ALL_FACTORS[0 .. $take - 1];
}

sub _tag_count {
    my ($tags, $wants) = @_;
    return 0 unless ref $tags eq 'ARRAY' && ref $wants eq 'ARRAY' && @$wants;
    my %want_set = map { $_ => 1 } @$wants;
    my $n = 0;
    for my $t (@$tags) {
        $n++ if $want_set{$t};
    }
    return $n;
}

sub _render_pet {
    my ($pet, $style, $out) = @_;
    my $badge = AgentXM::Examples::PawMatch::Pets::long_stay($pet) ? ' *' : '';
    if ($style eq 'compact') {
        printf {$out} "  %-10s %-14s %-10s %dy%s\n",
            $pet->{slug}, $pet->{name}, $pet->{species},
            $pet->{age_years}, $badge;
    }
    elsif ($style eq 'playful') {
        my $tag_phrase = join(' & ', @{ $pet->{tags} });
        my $breed_lc   = lc $pet->{breed};
        print {$out} "  paw $pet->{name}$badge — a $pet->{age_years}-year-old "
                    . "$breed_lc who is $tag_phrase.\n";
    }
    else {
        print {$out} "  $pet->{name}$badge  [$pet->{slug}]\n";
        print {$out} "    $pet->{breed}, $pet->{age_years} years old\n";
        my $tags = join(', ', @{ $pet->{tags} });
        print {$out} "    Tags: $tags\n\n";
    }
}

sub _render_charity {
    my ($charity, $show_ratings, $out) = @_;
    print {$out} "  $charity->{name}  [$charity->{slug}]\n";
    print {$out} "    Focus: $charity->{focus}\n";
    print {$out} "    $charity->{description}\n";
    print {$out} "    Donate: $charity->{url}\n";
    print {$out} "    Rating: $charity->{rating_note}\n" if $show_ratings;
}

sub _open_url {
    my ($url, $err) = @_;
    my @cmd;
    if ($Config{osname} eq 'darwin') {
        @cmd = ('open', $url);
    }
    elsif ($Config{osname} =~ /linux|bsd|solaris/i) {
        @cmd = ('xdg-open', $url);
    }
    elsif ($Config{osname} =~ /mswin|cygwin|msys/i) {
        @cmd = ('cmd', '/c', 'start', '', $url);
    }
    else {
        print {$err} "Unable to open browser on this platform. URL: $url\n";
        return 1;
    }

    my $pid = eval { _spawn_detached(@cmd) };
    if ($@ || !defined $pid) {
        print {$err} "Unable to open browser. URL: $url\n";
        return 1;
    }
    return 0;
}

sub _spawn_detached {
    my (@cmd) = @_;
    my $pid = fork();
    die "fork failed: $!" unless defined $pid;
    if ($pid == 0) {
        # Child — detach stdio, exec.
        my $devnull = File::Spec->devnull;
        open(STDOUT, '>', $devnull) or exit 0;
        open(STDERR, '>', $devnull) or exit 0;
        exec(@cmd) or exit 0;
    }
    return $pid;
}

BEGIN { require File::Spec }

1;
