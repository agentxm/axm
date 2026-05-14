use strict;
use warnings;
use ExtUtils::MakeMaker;

WriteMakefile(
    NAME             => 'AgentXM::Examples::TinyFlags',
    DISTNAME         => 'AgentXM-Examples-TinyFlags',
    AUTHOR           => 'AgentXM <noreply@agentxm.ai>',
    LICENSE          => 'mit',
    VERSION_FROM     => 'lib/AgentXM/Examples/TinyFlags.pm',
    ABSTRACT         => 'Tiny feature flags library used by AXM companion package examples.',
    MIN_PERL_VERSION => '5.030',
    PREREQ_PM        => {
        'Digest::SHA'  => '0',
        'Scalar::Util' => '0',
    },
    TEST_REQUIRES => {
        'Test::More' => '0.98',
    },
    CONFIGURE_REQUIRES => {
        'ExtUtils::MakeMaker' => '0',
    },
    META_MERGE => {
        'meta-spec' => { version => 2 },
        resources => {
            homepage   => 'https://github.com/agentxm/axm',
            repository => {
                type => 'git',
                url  => 'https://github.com/agentxm/axm.git',
                web  => 'https://github.com/agentxm/axm',
            },
        },
        # Embed AXM recommendation in META.json (and MYMETA.json).
        x_axm => {
            '$schema'             => 'https://axm.sh/schemas/axm-package-meta.schema.json',
            recommendedExtensions => [
                '@examples/packs/perl-cpan-tinyflags@^0.1.0',
            ],
        },
    },
    test => { TESTS => 't/*.t' },
    dist => {
        COMPRESS => 'gzip -9f',
        SUFFIX   => 'gz',
    },
    clean => { FILES => 'AgentXM-Examples-TinyFlags-*' },
);
