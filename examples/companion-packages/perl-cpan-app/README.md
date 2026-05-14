## PawMatch (CPAN consumer app)

`pawmatch` is a tiny Perl CLI for a fictional community pet adoption center.
It is a reference _consumer_ of the `AgentXM-Examples-TinyFlags` CPAN
distribution — exactly the codebase the companion AXM skills and subagent in
`../perl-cpan-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not packable — it exists to demonstrate consumption, not to
publish to CPAN.

The app also ships its own companion AXM skill,
[`perl-cpan-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/perl-cpan-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

Until `AgentXM-Examples-TinyFlags` is published to CPAN, run tests against
the sibling library directly:

```bash
prove -Ilib -I../perl-cpan-lib/lib -lvr t
perl -Ilib -I../perl-cpan-lib/lib bin/pawmatch browse
perl -Ilib -I../perl-cpan-lib/lib bin/pawmatch show pepper
perl -Ilib -I../perl-cpan-lib/lib bin/pawmatch match --has-kids --active
perl -Ilib -I../perl-cpan-lib/lib bin/pawmatch apply biscuit
perl -Ilib -I../perl-cpan-lib/lib bin/pawmatch fees
perl -Ilib -I../perl-cpan-lib/lib bin/pawmatch return-support
perl -Ilib -I../perl-cpan-lib/lib bin/pawmatch donate
perl -Ilib -I../perl-cpan-lib/lib bin/pawmatch donate brother-wolf --open
```

Or, using cpanm with a local `--local-lib`:

```bash
cpanm --local-lib local ../perl-cpan-lib
cpanm --local-lib local --installdeps .
prove -Ilib -Ilocal/lib/perl5 -lvr t
```

## Library dependency

The dist consumes `AgentXM-Examples-TinyFlags` as a runtime dependency,
declared in both `Makefile.PL` (PREREQ_PM) and `cpanfile`:

```perl
PREREQ_PM => {
    'AgentXM::Examples::TinyFlags' => '0.1.0',
    ...
},
```

```perl
requires 'AgentXM::Examples::TinyFlags', '0.1.0';
```

Once `AgentXM-Examples-TinyFlags` is published to CPAN, regular cpanm
installs will pull it from the public index.

## Flag seams

Flag definitions live in `lib/AgentXM/Examples/PawMatch/Flags.pm`. Each is
wired into at least one command so the companion skills have realistic
targets:

| Flag                            | Type    | Used in  |
| ------------------------------- | ------- | -------- |
| `home-check-followup`           | bool    | `apply`  |
| `fee-breakdown-detailed`        | bool    | `fees`   |
| `long-stay-highlight`           | bool    | `browse` |
| `suggest-donate-after-adoption` | bool    | `apply`  |
| `show-charity-ratings`          | bool    | `donate` |
| `recommendation-strategy`       | variant | `match`  |
| `match-quiz-depth`              | variant | `match`  |
| `pet-card-style`                | variant | `browse` |
| `donate-focus-default`          | variant | `donate` |

Rollouts are deterministic per user (the CLI uses `getlogin()` / `$ENV{USER}`
as the `session_id`), so running the same command twice produces the same
flag values.

## Domain framing

The CLI is intentionally framed as a shelter / rescue adoption center — not
a retail pet store — following mainstream animal-welfare best practices:

- "Adopt, don't shop"
- Matching over transacting (counselor-style questionnaire, see `match`)
- Hold and meet-and-greet periods are present in the `apply` flow
- Transparent adoption fees (`fees`) that itemize spay/neuter, vaccines, microchip
- No-judgment return support (`return-support`)
- Long-stay animals highlighted in `browse`

## Donate command

`donate` shows a curated, static list of well-known, highly-rated
animal-welfare organizations with their official donation URLs. The CLI
never processes payments. Every output includes a disclaimer to verify
ratings independently before giving. See
`lib/AgentXM/Examples/PawMatch/Charities.pm`.
