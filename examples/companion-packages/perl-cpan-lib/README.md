# CPAN TinyFlags

This example shows how a CPAN distribution can ship companion AXM extensions
for its users. The distribution is a small Perl feature flag library named
`AgentXM-Examples-TinyFlags` (module `AgentXM::Examples::TinyFlags`).

The AXM extensions are published to AgentXM.ai under `@examples`. The
distribution itself uses the CPAN distribution name
`AgentXM-Examples-TinyFlags`.

`META.json` embeds an AXM recommendation as a top-level `x_axm` object — the
shape the AXM CPAN reader expects:

```json
{
  "x_axm": {
    "recommendedExtensions": ["@examples/packs/perl-cpan-tinyflags@^0.1.0"]
  }
}
```

The standard CPAN toolchain copies `META.json` content into the installed
`MYMETA.json` at build/install time, so `axm discover` can read this metadata
out of the installed distribution and surface the companion pack as a
package-author recommendation.

A working consumer is in `../perl-cpan-app/` (the `pawmatch` CLI).

## Package

Targets Perl 5.30+. Tests use `Test::More`.

```bash
perl Makefile.PL
make
make test
```

Or, with cpanm:

```bash
cpanm --installdeps .
prove -Ilib -lvr t
```

Building and publishing:

```bash
# Build the dist tarball locally:
perl Makefile.PL
make dist

# TODO: configure PAUSE credentials for AgentXM-Examples-TinyFlags,
# then:
# cpan-upload AgentXM-Examples-TinyFlags-0.1.0.tar.gz
```

The library lives in `lib/AgentXM/Examples/TinyFlags.pm` and exposes:

- `AgentXM::Examples::TinyFlags::BooleanFlag->new(default => $bool, rollout => $int|undef)`
- `AgentXM::Examples::TinyFlags::VariantFlag->new(variants => \@strs, default => $str, rollout => \%alloc|undef)`
- `AgentXM::Examples::TinyFlags::Registry->new(\%definitions)` — `enabled($name, $ctx)`,
  `variant($name, $ctx)`, `evaluate($name, $ctx)`
- `AgentXM::Examples::TinyFlags::bucket($name, $ctx)` — exposes the bucketing
  function for tests and tooling.

Flag objects validate their inputs in the constructor and die with a clear
message on bad input. Bucketing is deterministic by `user_id`, `account_id`,
or `session_id` keys (in that order) of the evaluation context hashref.

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                   |
| -------- | ----------------------------------------------------- |
| Skill    | `@examples/skills/perl-cpan-tinyflags-add-flag`       |
| Skill    | `@examples/skills/perl-cpan-tinyflags-rollout-review` |
| Skill    | `@examples/skills/perl-cpan-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/perl-cpan-tinyflags-maintainer`  |
| Pack     | `@examples/packs/perl-cpan-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:cpan/AgentXM-Examples-TinyFlags@^0.1.0` as its companion
package. Note that CPAN purls use the distribution name (hyphens), not the
module name (`::`).

## Scenario

A CPAN author can use this layout as a model:

1. Implement the normal Perl distribution under `lib/`.
2. Embed package-native AXM metadata in `META.json` (and propagate it through
   `META_MERGE` in `Makefile.PL`) under the top-level `x_axm` key.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
