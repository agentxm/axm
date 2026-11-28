# OKF

Author, review, convert, maintain, and validate
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format)
(OKF) v0.2 knowledge bundles and application profiles. A bundle is a directory
of Markdown concepts with YAML frontmatter. The skill keeps bundles conformant
and discoverable, and keeps their provenance honest: it never invents sources,
generation records, or verification events.

## Use

Use it to create a bundle, convert existing material into concepts, extend or
maintain a bundle, record provenance, trust, and lifecycle metadata, author an
Attested Computation, or review an application profile. It reports OKF
conformance and profile conformance separately.

```text
$okf create a bundle for our delivery playbooks under knowledge/delivery
$okf convert docs/billing into OKF concepts
$okf validate knowledge/docs/src and explain the warnings
$okf review this proposed profile for reserved-file conflicts
```

It is not for general documentation organization when no OKF bundle is
declared; the `docs` skill covers that.

```bash
axm install @craigsmitham/skills/okf
```

To check a bundle yourself, start in the directory containing the installed
`SKILL.md` (`skills/okf/src` in this checkout). With Python 3 and PyYAML
available, try the included delivery bundle first.

```bash
python3 scripts/validate_okf.py examples/delivery
```

The summary should report zero errors. Replace `examples/delivery` with the
absolute path to your bundle root. Correct reported errors and rerun the
check. Review warnings against the [validation guidance](src/references/validation.md).
The validator reads local files only. Source verification and procedure
exercises need their own evidence.

## Package map

| Read | For |
| --- | --- |
| [Skill](src/SKILL.md) | Invariants, workflows, discovery, links, reserved files |
| [Frontmatter](src/references/frontmatter.md) | Fields, YAML quoting, timestamps, actors, trust tiers, maintenance |
| [Discovery and granularity](src/references/discovery-and-granularity.md) | Concept boundaries and browse/search route review |
| [Application profiles](src/references/application-profiles.md) | Defining, applying, and reviewing profiles |
| [Validation boundaries](src/references/validation.md) | Rule-to-severity mapping and what validation cannot prove |
| [Specification](src/references/SPEC.md) | Vendored OKF v0.2 at upstream commit `ad30107` |
| [Templates](src/templates/) and [example](src/examples/delivery/index.md) | Starting files and a synthetic bundle |

## Upstream watch

Checked 2026-11-14. The skill stays pinned to OKF v0.2 at
`GoogleCloudPlatform/open-knowledge-format` commit `ad30107`; nothing below
changes that pin yet.

### Repository move and v0.3

Upstream [PR #63](https://github.com/GoogleCloudPlatform/open-knowledge-format/pull/63)
is still open. It comes from the canonical repository's only committer, and it
marks that repository deprecated in favor of
`open-knowledge-format/open-knowledge-format`, described as having "the latest
spec (v0.3), bundles, and tooling". The stated reason is vendor-neutral
governance. On the check date the `open-knowledge-format` GitHub organization
had no public repositories, so there is no v0.3 text to align with.

When v0.3 is published:

1. Re-vendor `SPEC.md` and its license from the new canonical repository. Then
   update the pin and attribution in `SKILL.md`, `references/validation.md`,
   and the repository's `THIRD_PARTY_NOTICES.md` and `LICENSE.md`.
2. Review the spec changes against the invariants, templates, examples, and
   validator, which applies only v0.2 rules (`validator_target_version: "0.2"`).
3. Decide whether to keep validating v0.2 bundles alongside v0.3, and write
   migration guidance in the changelog.
4. Assess this repository's knowledge bundles, which declare `format.version:
   "0.2"` in `knowledge.json` and `okf_version: "0.2"` in their root indexes.
   Whether AXM's knowledge manifest accepts v0.3 is AXM's decision.

### Open specification questions

None of these upstream issues had a maintainer response on the check date. The
skill's interim handling should be revisited when v0.3 settles them.

| Issue | Question | Interim handling here |
| --- | --- | --- |
| [#56](https://github.com/GoogleCloudPlatform/open-knowledge-format/issues/56) | YAML parsers convert unquoted timestamps and digit-only strings | Quoting guidance; warnings when `okf_version` or `sources[].id` loads as a non-string |
| [#57](https://github.com/GoogleCloudPlatform/open-knowledge-format/issues/57) | §5.1 examples use `team:` authors, which §7 does not define | Accepted in `sources[].author`; flagged in `generated.by` and `verified[].by` |
| [#58](https://github.com/GoogleCloudPlatform/open-knowledge-format/issues/58) | No way to keep README, AGENTS.md, or immutable records inside a bundle | Keep them outside the bundle root; one base error per such file |
| [#59](https://github.com/GoogleCloudPlatform/open-knowledge-format/issues/59) | Bundle-relative `/` links break in Git hosting views | File-relative links for GitHub and ordinary Markdown readers |
| [#60](https://github.com/GoogleCloudPlatform/open-knowledge-format/issues/60) | A producer verifying its own output reaches machine-confirmed | `self-verification` info finding; the derived tier is unchanged |
| [#61](https://github.com/GoogleCloudPlatform/open-knowledge-format/issues/61) | Namespacing producer keys; `status` values outside §5.4 | Unchanged: unknown keys are preserved, nonstandard `status` warns |
| [#64](https://github.com/GoogleCloudPlatform/open-knowledge-format/issues/64) | Proposed `generated.with_skills` | Not adopted; `generated.by` remains one actor |

## License

`MIT AND Apache-2.0`. The original skill, templates, and validator use MIT;
the vendored OKF specification keeps its upstream Apache-2.0 license
([text](src/references/LICENSE-OKF.txt)). See the repository
[notices](../../THIRD_PARTY_NOTICES.md). Version history is in
[CHANGELOG.md](CHANGELOG.md).
