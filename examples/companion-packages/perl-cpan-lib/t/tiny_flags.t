use strict;
use warnings;
use Test::More;

# TinyFlags.pm declares BooleanFlag, VariantFlag, and Registry as inner
# packages, so loading the parent module is enough.
use AgentXM::Examples::TinyFlags;

# -- BooleanFlag defaults --------------------------------------------------

subtest 'boolean default used when no rollout' => sub {
    my $flags = AgentXM::Examples::TinyFlags::Registry->new({
        'checkout-redesign' =>
            AgentXM::Examples::TinyFlags::BooleanFlag->new(default => 1),
    });
    is(
        $flags->enabled('checkout-redesign', { user_id => 'user-1' }),
        1,
        'returns default true when no rollout',
    );
};

subtest 'boolean rollout 0 is off' => sub {
    my $flags = AgentXM::Examples::TinyFlags::Registry->new({
        experiment => AgentXM::Examples::TinyFlags::BooleanFlag->new(
            default => 0, rollout => 0,
        ),
    });
    is($flags->enabled('experiment', { user_id => 'user-1'  }), 0, 'user-1 off');
    is($flags->enabled('experiment', { user_id => 'user-42' }), 0, 'user-42 off');
};

subtest 'boolean rollout 100 is on' => sub {
    my $flags = AgentXM::Examples::TinyFlags::Registry->new({
        experiment => AgentXM::Examples::TinyFlags::BooleanFlag->new(
            default => 0, rollout => 100,
        ),
    });
    is($flags->enabled('experiment', { user_id => 'user-1'  }), 1, 'user-1 on');
    is($flags->enabled('experiment', { user_id => 'user-42' }), 1, 'user-42 on');
};

subtest 'boolean rollout is deterministic per context' => sub {
    my $flags = AgentXM::Examples::TinyFlags::Registry->new({
        experiment => AgentXM::Examples::TinyFlags::BooleanFlag->new(
            default => 0, rollout => 50,
        ),
    });
    my $ctx = { user_id => 'user-1' };
    my $first  = $flags->enabled('experiment', $ctx);
    my $second = $flags->enabled('experiment', $ctx);
    my $third  = $flags->enabled('experiment', $ctx);
    is($first, $second, 'second evaluation matches first');
    is($first, $third,  'third evaluation matches first');
};

subtest 'boolean rollout fifty-percent boundary' => sub {
    # 200 distinct users, 50% rollout — expect roughly half on, generous bounds
    # to keep the test stable across hash distributions.
    my $flags = AgentXM::Examples::TinyFlags::Registry->new({
        experiment => AgentXM::Examples::TinyFlags::BooleanFlag->new(
            default => 0, rollout => 50,
        ),
    });
    my $on = 0;
    for my $i (0 .. 199) {
        $on++ if $flags->enabled('experiment', { user_id => "user-$i" });
    }
    cmp_ok($on, '>=', 70,  '50% rollout produces at least 70/200 on');
    cmp_ok($on, '<=', 130, '50% rollout produces at most 130/200 on');
};

# -- VariantFlag -----------------------------------------------------------

subtest 'variant default when no rollout' => sub {
    my $flags = AgentXM::Examples::TinyFlags::Registry->new({
        'search-ranking' => AgentXM::Examples::TinyFlags::VariantFlag->new(
            variants => [qw(classic semantic)],
            default  => 'classic',
        ),
    });
    is(
        $flags->variant('search-ranking', { user_id => 'user-1' }),
        'classic',
        'returns default variant when no rollout',
    );
};

subtest 'variant rollout zero returns default' => sub {
    my $flags = AgentXM::Examples::TinyFlags::Registry->new({
        'search-ranking' => AgentXM::Examples::TinyFlags::VariantFlag->new(
            variants => [qw(classic semantic)],
            default  => 'classic',
            rollout  => { semantic => 0 },
        ),
    });
    is(
        $flags->variant('search-ranking', { user_id => 'user-1' }),
        'classic',
        '0% allocation falls through to default',
    );
};

subtest 'variant full allocation returns variant' => sub {
    my $flags = AgentXM::Examples::TinyFlags::Registry->new({
        'search-ranking' => AgentXM::Examples::TinyFlags::VariantFlag->new(
            variants => [qw(classic semantic)],
            default  => 'classic',
            rollout  => { semantic => 100 },
        ),
    });
    is(
        $flags->variant('search-ranking', { user_id => 'user-1' }),
        'semantic',
        '100% allocation always returns the variant',
    );
};

subtest 'variant is deterministic per context' => sub {
    my $flags = AgentXM::Examples::TinyFlags::Registry->new({
        'search-ranking' => AgentXM::Examples::TinyFlags::VariantFlag->new(
            variants => [qw(classic semantic personalized)],
            default  => 'classic',
            rollout  => { semantic => 33, personalized => 33 },
        ),
    });
    my $ctx = { user_id => 'user-1' };
    is(
        $flags->variant('search-ranking', $ctx),
        $flags->variant('search-ranking', $ctx),
        'same context gets same variant',
    );
};

# -- Validation ------------------------------------------------------------

subtest 'boolean rollout above 100 dies' => sub {
    eval {
        AgentXM::Examples::TinyFlags::BooleanFlag->new(rollout => 101);
    };
    like($@, qr/0 to 100/, 'rollout=101 dies');
};

subtest 'boolean rollout negative dies' => sub {
    eval {
        AgentXM::Examples::TinyFlags::BooleanFlag->new(rollout => -1);
    };
    like($@, qr/0 to 100/, 'rollout=-1 dies');
};

subtest 'variant requires at least one variant' => sub {
    eval {
        AgentXM::Examples::TinyFlags::VariantFlag->new(
            variants => [], default => 'classic',
        );
    };
    like($@, qr/at least one variant/, 'empty variants dies');
};

subtest 'variant default must be in variants' => sub {
    eval {
        AgentXM::Examples::TinyFlags::VariantFlag->new(
            variants => [qw(classic semantic)],
            default  => 'personalized',
        );
    };
    like($@, qr/default must be one of/, 'unknown default dies');
};

subtest 'variant rollout cannot exceed 100' => sub {
    eval {
        AgentXM::Examples::TinyFlags::VariantFlag->new(
            variants => [qw(classic semantic)],
            default  => 'classic',
            rollout  => { semantic => 80, classic => 30 },
        );
    };
    like($@, qr/cannot exceed 100/, 'total > 100 dies');
};

subtest 'variant rollout unknown variant dies' => sub {
    eval {
        AgentXM::Examples::TinyFlags::VariantFlag->new(
            variants => [qw(classic semantic)],
            default  => 'classic',
            rollout  => { personalized => 10 },
        );
    };
    like($@, qr/unknown variant/, 'unknown rollout key dies');
};

subtest 'unknown flag lookup dies' => sub {
    my $flags = AgentXM::Examples::TinyFlags::Registry->new({});
    eval { $flags->enabled('missing') };
    like($@, qr/Unknown TinyFlags flag/, 'missing flag dies');
};

subtest 'evaluate dispatches on flag kind' => sub {
    my $flags = AgentXM::Examples::TinyFlags::Registry->new({
        'checkout-redesign' =>
            AgentXM::Examples::TinyFlags::BooleanFlag->new(default => 1),
        'search-ranking' => AgentXM::Examples::TinyFlags::VariantFlag->new(
            variants => [qw(classic semantic)],
            default  => 'classic',
        ),
    });
    is($flags->evaluate('checkout-redesign'), 1,         'evaluates boolean');
    is($flags->evaluate('search-ranking'),    'classic', 'evaluates variant');
};

done_testing();
