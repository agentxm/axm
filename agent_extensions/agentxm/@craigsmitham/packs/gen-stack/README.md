# Gen Stack

An opinionated software-change system that uses OODA to carry Signals and
Observations through human-oriented Intent, co-developed Architecture and
canonical Requirements, Compilation, Implementation, Evaluations, and
operational learning.

The pack installs one knowledge authority and focused workflows around this
contract:

- a Gen Stack corpus owns cross-cutting system governance, Intent,
  Architecture, subject-colocated Requirements, Evaluation Protocols, and
  required Evaluation navigation, and its sole supported repository location
  is `./gen-stack/`;
- Intent shapes co-developed Architecture and Requirements; Architecture owns
  durable subjects and responses, while each Requirement owns one accepted
  obligation on exactly one eligible Architecture subject;
- the governed corpus owns Evaluation Protocols while the repository owns
  Implementation and executable evaluation machinery, including Suites,
  Executions, Results, and Reports; and
- Signals, Observations, results, and other evidence enter the OODA loop without
  becoming desired state by themselves.

People remain the primary authors and accountable authorities for desired
state and durable system shape. The skill can develop candidates, compare
options, recommend a response, draft artifacts, and record explicit decisions;
it cannot ratify Intent, Requirements, or Architecture on a person's behalf.

## Included extensions

| Extension | Role |
| --- | --- |
| `@craigsmitham/knowledge/gen-stack` | Gen Stack terminology, strict greenfield and brownfield adoption, profile, authority, change-loop, Implementation, Evaluation, and regeneration guidance |
| `@craigsmitham/skills/gen-stack` | Route bounded change development, work-item authoring, and accepted established-corpus authoring through one human-governed surface |

## Install

```bash
axm install @craigsmitham/packs/gen-stack
```

Pack `2.9.0` uses Gen Stack knowledge `0.17.0`, the `gen-stack` OKF
application profile `0.5.0`, and the unified `gen-stack` skill `1.8.0`. The
glossary owns semantic meaning; the profile owns fixed `./gen-stack/`
placement, discovery, and governed representation; Explanations deepen
understanding; and Guides support action. Protocols are governed; executable
Cases and tests, Suites, Executions, Results, Reports, and run evidence remain
repository-native.

This release adds policy-neutral Evaluation candidate projection for harness
integration while retaining governed, role-specific Evaluation Protocols and
separate Protocol Coverage, evidence state, and bounded outcomes in reporting.
Candidate eligibility does not select required coverage, judge Protocol
adequacy, prescribe a Suite or adapter, or establish evidence or outcomes. The
release also retains native-first representation, exact-path corpus
inspection, and fixed-placement evaluation fixtures. It
uses each artifact's native format and exact host fields first, applies the OKF
profile only as a delta, gives every Guide an artifact-specific logical
presentation contract, and keeps fallbacks, transient outputs, and derived
views proportionate and non-authoritative. The knowledge bundle also supplies
the human adoption workflow for establishing a strictly conforming first
corpus from greenfield intent or brownfield evidence. The unified skill still
stops before initial setup, connection, federation, or migration; this release
does not treat the Guide as authorization for that agent mutation.

The earlier `2.6.0` release made the supersession evidence boundary explicit in activated
skill behavior: predecessor Results retain their exact Requirement and
Execution context, and successor satisfaction begins unknown.

The earlier `2.5.0` release made coupled-knowledge resolution deterministic and strengthened
the valid fixed-corpus evaluation fixture around the canonical Capability
collection.

The earlier `2.4.0` release added controlled Requirement additions, revisions, retirements,
replacements, splits, and merges; explicit active and retired lifecycle;
many-to-many supersession lineage; action-specific blockers; and regression
coverage across happy, error, and unresolved paths.

The earlier `2.3.0` release made `./gen-stack/` the deterministic
established-corpus location across the profile, tools, skill, and evaluation
fixtures. Existing
adopters move the complete corpus to that path and update repository-external
references; the skill itself continues to stop before setup or migration.

The earlier `2.2.0` release added shared and element-specific candidate
Architecture and Requirement development, material gap disposition across change work, and
behavioral coverage for greenfield, brownfield, placement, blocking,
non-blocking, direct-authoring, adoption-boundary, and documentation-routing
cases. It retains the shared work-item evidence, identity, lifecycle, metadata,
and label foundations introduced in `2.1.0`.

The earlier `2.0.0` breaking release replaced `author-gen-stack` and
`author-software-work-items` with `gen-stack`. It retired `setup-gen-stack`
without an agent-workflow replacement: the unified skill still does not
execute initial corpus setup, profile adoption, connection, federation, or
migration. The current knowledge bundle provides human-led adoption guidance;
that Guide is not authorization for agent mutation. The release also removed
the YAGNI and Tidy First rules and their dedicated knowledge content. The pack
provides no aliases or compatibility paths for the retired package or workflow
identities.

## Working model

1. **Observe** Signals and contextual Observations without inferring desired
   state or cause.
2. **Orient** across Intent, Requirements, Architecture, Implementation,
   Evaluations, operations, and Provenance.
3. **Decide** on the smallest authorized hypothesis, including preservation or
   further investigation.
4. **Act** within that authority, then return new evidence to Observe.

Installing the pack does not imply a complete corpus, satisfied Requirements,
automated regeneration, evaluation coverage, or production fitness.

## Attribution and license

The synthesis was influenced by Chad Fowler's
[The Generative Stack](https://chadfowler.com/regenerative-software/3miwhqqvwxc2x/)
and John R. Boyd's
[The Essence of Winning and Losing](https://www.coljohnboyd.com/documents/1995-06-28__Boyd_John_R__The_Essence_of_Winning_and_Losing__PPT-PDF.pdf).
See `THIRD_PARTY_NOTICES.md` for provenance.

The pack metadata and README are MIT-licensed. Each member retains the license
declared in its manifest.
