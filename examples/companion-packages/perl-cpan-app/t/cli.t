use strict;
use warnings;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/../lib";
use lib "$FindBin::Bin/../../perl-cpan-lib/lib";

use AgentXM::Examples::PawMatch::CLI;

sub run_cli {
    my (@args) = @_;
    my ($out, $err) = ('', '');
    open(my $out_fh, '>', \$out) or die "open scalar: $!";
    open(my $err_fh, '>', \$err) or die "open scalar: $!";
    my $status = AgentXM::Examples::PawMatch::CLI::run(
        [@args], stdout => $out_fh, stderr => $err_fh,
    );
    close $out_fh;
    close $err_fh;
    return ($status, $out, $err);
}

subtest 'no args prints usage' => sub {
    my ($status, $out, $err) = run_cli();
    is($status, 0, 'exit 0');
    like($out, qr/pawmatch/,   'mentions pawmatch');
    like($out, qr/Commands:/,  'lists commands');
};

subtest 'fees exit zero' => sub {
    my ($status, $out, $err) = run_cli('fees');
    is($status, 0, 'exit 0');
    like($out, qr/Adoption fees/, 'prints adoption fees');
};

subtest 'browse lists pets' => sub {
    my ($status, $out, $err) = run_cli('browse');
    is($status, 0, 'exit 0');
    like($out, qr/Biscuit/, 'lists Biscuit');
};

subtest 'browse species filter' => sub {
    my ($status, $out, $err) = run_cli('browse', '--species', 'cat');
    is($status, 0, 'exit 0');
    like($out,   qr/Pepper/,  'lists Pepper');
    unlike($out, qr/Biscuit/, 'does not list Biscuit');
};

subtest 'browse unknown species' => sub {
    my ($status, $out, $err) = run_cli('browse', '--species', 'dragon');
    is($status, 0, 'exit 0');
    like($out, qr/No adoptable pets found/, 'prints not-found notice');
};

subtest 'show known pet' => sub {
    my ($status, $out, $err) = run_cli('show', 'pepper');
    is($status, 0, 'exit 0');
    like($out, qr/Pepper/, 'shows pet name');
    like($out, qr/Needs:/, 'shows pet needs');
};

subtest 'show unknown pet' => sub {
    my ($status, $out, $err) = run_cli('show', 'nope');
    is($status, 1, 'exit 1');
    like($err, qr/Unknown pet/, 'prints unknown-pet error');
};

subtest 'match with preference flags' => sub {
    my ($status, $out, $err) = run_cli('match', '--has-kids', '--active');
    is($status, 0, 'exit 0');
    like($out, qr/Strategy:/,    'prints strategy');
    like($out, qr/Quiz depth:/, 'prints quiz depth');
};

subtest 'apply known pet' => sub {
    my ($status, $out, $err) = run_cli('apply', 'biscuit');
    is($status, 0, 'exit 0');
    like($out, qr/Adoption application for Biscuit/, 'prints application header');
    like($out, qr/Meet-and-greet/, 'mentions meet-and-greet');
};

subtest 'apply unknown pet' => sub {
    my ($status, $out, $err) = run_cli('apply', 'nope');
    is($status, 1, 'exit 1');
    like($err, qr/Unknown pet/, 'prints unknown-pet error');
};

subtest 'return-support' => sub {
    my ($status, $out, $err) = run_cli('return-support');
    is($status, 0, 'exit 0');
    like($out, qr/Return support/, 'prints heading');
    like($out, qr/No-judgment/,    'mentions no-judgment returns');
};

subtest 'donate lists charities' => sub {
    my ($status, $out, $err) = run_cli('donate');
    is($status, 0, 'exit 0');
    like($out, qr/Animal-welfare charities/, 'prints charities heading');
    like($out, qr/Best Friends/,             'lists Best Friends');
};

subtest 'donate focus filter' => sub {
    my ($status, $out, $err) = run_cli('donate', '--focus', 'rescue');
    is($status, 0, 'exit 0');
    like($out,   qr/Brother Wolf/, 'lists Brother Wolf');
    unlike($out, qr/Best Friends Animal Society/,
           'does not list Best Friends Animal Society');
};

subtest 'donate known slug' => sub {
    my ($status, $out, $err) = run_cli('donate', 'brother-wolf');
    is($status, 0, 'exit 0');
    like($out, qr/Brother Wolf/, 'shows charity details');
};

subtest 'donate unknown slug' => sub {
    my ($status, $out, $err) = run_cli('donate', 'not-a-charity');
    is($status, 1, 'exit 1');
    like($err, qr/Unknown charity/, 'prints unknown-charity error');
};

subtest 'unknown command' => sub {
    my ($status, $out, $err) = run_cli('teleport');
    is($status, 1, 'exit 1');
    like($err, qr/Unknown command/, 'prints unknown-command error');
};

done_testing();
