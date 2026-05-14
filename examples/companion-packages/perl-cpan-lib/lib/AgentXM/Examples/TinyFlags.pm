package AgentXM::Examples::TinyFlags;

# AgentXM::Examples::TinyFlags is a minimal feature-flag library with
# deterministic rollout bucketing.
#
# Two flag kinds:
#   - BooleanFlag(default => $bool, rollout => $int|undef)
#       on/off with optional percentage rollout in 0..100.
#   - VariantFlag(variants => \@strs, default => $str, rollout => \%alloc|undef)
#       named treatment with optional per-variant percentage allocations.
#
# Evaluation context is a hashref with optional user_id / account_id /
# session_id keys. Bucketing uses Digest::SHA1 over "<flag_name>:<context_id>"
# then takes a 0..99 integer from the leading 8 hex chars.

use strict;
use warnings;
use Digest::SHA qw(sha1_hex);
use Scalar::Util qw(blessed);

our $VERSION = '0.1.0';

# -- Module-level validation helper --------------------------------------

sub _validate_percentage {
    my ($value, $label) = @_;
    my $type_err = "$label must be an integer from 0 to 100";

    return undef unless defined $value;

    # Reject references (incl. blessed) and non-integer-looking strings.
    if (ref $value) {
        die "$type_err\n";
    }
    unless ($value =~ /\A-?\d+\z/) {
        die "$type_err\n";
    }
    if ($value < 0 || $value > 100) {
        die "$type_err\n";
    }
    return 0 + $value;
}

# -- BooleanFlag ---------------------------------------------------------

package AgentXM::Examples::TinyFlags::BooleanFlag;

use strict;
use warnings;

sub new {
    my ($class, %args) = @_;
    my $default = exists $args{default} ? $args{default} : 0;
    if (defined $default && ref $default) {
        die "BooleanFlag default must be 0 or 1\n";
    }
    $default = $default ? 1 : 0;

    my $rollout = exists $args{rollout} ? $args{rollout} : undef;
    if (defined $rollout) {
        $rollout = AgentXM::Examples::TinyFlags::_validate_percentage(
            $rollout, 'BooleanFlag rollout'
        );
    }

    my $self = {
        default => $default,
        rollout => $rollout,
    };
    return bless $self, $class;
}

sub default { $_[0]->{default} }
sub rollout { $_[0]->{rollout} }

# -- VariantFlag ---------------------------------------------------------

package AgentXM::Examples::TinyFlags::VariantFlag;

use strict;
use warnings;

sub new {
    my ($class, %args) = @_;

    my $variants_ref = $args{variants};
    unless (ref $variants_ref eq 'ARRAY' && @$variants_ref > 0) {
        die "VariantFlag requires at least one variant\n";
    }

    my @variants;
    my %seen;
    for my $v (@$variants_ref) {
        die "VariantFlag variants must be unique non-empty strings\n"
            if !defined $v || ref $v || $v eq '' || $seen{$v}++;
        push @variants, "$v";
    }

    unless (exists $args{default} && defined $args{default}) {
        die "VariantFlag requires a default\n";
    }
    my $default = "$args{default}";
    unless (grep { $_ eq $default } @variants) {
        die "VariantFlag default must be one of the variants\n";
    }

    my $rollout = exists $args{rollout} ? $args{rollout} : undef;
    my $normalized;
    if (defined $rollout) {
        die "VariantFlag rollout must be a hashref\n"
            unless ref $rollout eq 'HASH';

        my $total = 0;
        $normalized = {};
        for my $name (sort keys %$rollout) {
            unless (grep { $_ eq $name } @variants) {
                die "VariantFlag rollout references unknown variant: $name\n";
            }
            my $pct = AgentXM::Examples::TinyFlags::_validate_percentage(
                $rollout->{$name}, "rollout for '$name'"
            );
            $normalized->{$name} = $pct;
            $total += $pct;
        }
        die "VariantFlag rollout percentages cannot exceed 100\n"
            if $total > 100;
    }

    my $self = {
        variants => [@variants],
        default  => $default,
        rollout  => $normalized,
        _order   => [@variants],
    };
    return bless $self, $class;
}

sub variants { [ @{ $_[0]->{variants} } ] }
sub default  { $_[0]->{default} }
sub rollout  { $_[0]->{rollout} }

# -- Registry ------------------------------------------------------------

package AgentXM::Examples::TinyFlags::Registry;

use strict;
use warnings;
use Scalar::Util qw(blessed);

sub new {
    my ($class, $definitions) = @_;
    die "Registry requires a hashref of definitions\n"
        unless ref $definitions eq 'HASH';

    my %normalized;
    for my $name (keys %$definitions) {
        my $flag = $definitions->{$name};
        my $b = blessed($flag) // '';
        unless ($b eq 'AgentXM::Examples::TinyFlags::BooleanFlag'
            ||  $b eq 'AgentXM::Examples::TinyFlags::VariantFlag') {
            die "Definition for '$name' must be a BooleanFlag or VariantFlag\n";
        }
        $normalized{$name} = $flag;
    }

    my $self = { definitions => \%normalized };
    return bless $self, $class;
}

sub names {
    my ($self) = @_;
    return sort keys %{ $self->{definitions} };
}

sub include {
    my ($self, $name) = @_;
    return exists $self->{definitions}{$name} ? 1 : 0;
}

sub _lookup {
    my ($self, $name) = @_;
    my $flag = $self->{definitions}{$name};
    die "Unknown TinyFlags flag: $name\n" unless defined $flag;
    return $flag;
}

sub enabled {
    my ($self, $name, $context) = @_;
    my $flag = $self->_lookup($name);
    my $b = blessed($flag) // '';
    die "Flag '$name' is not a boolean flag\n"
        unless $b eq 'AgentXM::Examples::TinyFlags::BooleanFlag';

    my $rollout = $flag->rollout;
    return $flag->default unless defined $rollout;

    my $bucket = AgentXM::Examples::TinyFlags::bucket($name, $context);
    return $bucket < $rollout ? 1 : 0;
}

sub variant {
    my ($self, $name, $context) = @_;
    my $flag = $self->_lookup($name);
    my $b = blessed($flag) // '';
    die "Flag '$name' is not a variant flag\n"
        unless $b eq 'AgentXM::Examples::TinyFlags::VariantFlag';

    my $rollout = $flag->rollout;
    return $flag->default unless defined $rollout;

    my $bucket = AgentXM::Examples::TinyFlags::bucket($name, $context);
    my $upper = 0;
    # Iterate in the order variants were declared.
    for my $v (@{ $flag->{_order} }) {
        next unless exists $rollout->{$v};
        $upper += $rollout->{$v};
        return $v if $bucket < $upper;
    }
    return $flag->default;
}

sub evaluate {
    my ($self, $name, $context) = @_;
    my $flag = $self->_lookup($name);
    my $b = blessed($flag) // '';
    return $b eq 'AgentXM::Examples::TinyFlags::BooleanFlag'
        ? $self->enabled($name, $context)
        : $self->variant($name, $context);
}

# -- Bucketing -----------------------------------------------------------

package AgentXM::Examples::TinyFlags;

sub bucket {
    my ($flag_name, $context) = @_;
    my $key = 'anonymous';
    if (ref $context eq 'HASH') {
        for my $k (qw(user_id account_id session_id)) {
            if (defined $context->{$k} && !ref $context->{$k} && $context->{$k} ne '') {
                $key = $context->{$k};
                last;
            }
        }
    }
    my $digest = sha1_hex("$flag_name:$key");
    return hex(substr($digest, 0, 8)) % 100;
}

1;

__END__

=head1 NAME

AgentXM::Examples::TinyFlags - Tiny feature-flag library used by AXM
companion-package examples.

=head1 SYNOPSIS

  use AgentXM::Examples::TinyFlags;
  # BooleanFlag, VariantFlag, and Registry are inner packages, loaded
  # by `use AgentXM::Examples::TinyFlags`.

  my $flags = AgentXM::Examples::TinyFlags::Registry->new({
      'checkout-redesign' => AgentXM::Examples::TinyFlags::BooleanFlag->new(
          default => 0, rollout => 10,
      ),
      'search-ranking' => AgentXM::Examples::TinyFlags::VariantFlag->new(
          variants => [qw(classic semantic)],
          default  => 'classic',
          rollout  => { semantic => 25 },
      ),
  });

  $flags->enabled('checkout-redesign', { user_id => 'user-1' });
  $flags->variant('search-ranking',   { user_id => 'user-1' });

=head1 DESCRIPTION

A minimal feature flags library that demonstrates boolean and variant flags
with deterministic rollout bucketing keyed on a user / account / session id.

=head1 LICENSE

MIT.

=cut
