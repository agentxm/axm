use strict;
use warnings;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/../lib";
use lib "$FindBin::Bin/../../perl-cpan-lib/lib";

use_ok('AgentXM::Examples::PawMatch');
use_ok('AgentXM::Examples::PawMatch::CLI');
use_ok('AgentXM::Examples::PawMatch::Flags');
use_ok('AgentXM::Examples::PawMatch::Pets');
use_ok('AgentXM::Examples::PawMatch::Charities');

done_testing();
