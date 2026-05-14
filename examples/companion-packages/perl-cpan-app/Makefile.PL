use strict;
use warnings;
use ExtUtils::MakeMaker;

WriteMakefile(
    NAME             => 'AgentXM::Examples::PawMatch',
    DISTNAME         => 'AgentXM-Examples-PawMatch',
    AUTHOR           => 'AgentXM <noreply@agentxm.ai>',
    LICENSE          => 'mit',
    VERSION_FROM     => 'lib/AgentXM/Examples/PawMatch.pm',
    ABSTRACT         => 'Tiny community pet-adoption CLI demonstrating consumption of AgentXM-Examples-TinyFlags.',
    MIN_PERL_VERSION => '5.030',
    EXE_FILES        => ['bin/pawmatch'],
    PREREQ_PM        => {
        'AgentXM::Examples::TinyFlags' => '0.1.0',
        'Getopt::Long' => '0',
        'Config'       => '0',
        'File::Spec'   => '0',
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
        x_axm => {
            '$schema'             => 'https://axm.sh/schemas/axm-package-meta.schema.json',
            recommendedExtensions => [
                '@examples/skills/perl-cpan-pawmatch-find-a-pet@^0.1.0',
            ],
        },
    },
    test => { TESTS => 't/*.t' },
    dist => {
        COMPRESS => 'gzip -9f',
        SUFFIX   => 'gz',
    },
    clean => { FILES => 'AgentXM-Examples-PawMatch-*' },
);
