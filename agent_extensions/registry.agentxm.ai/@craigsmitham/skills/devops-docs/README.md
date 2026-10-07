# DevOps docs

Set up, discover, author, and maintain engineering and operations documentation
for software products. The skill helps engineers and operators make necessary
knowledge available to collaborators and future maintainers, with explicit
accountability, authoritative references, and maintenance triggers.

The corpus covers development workflows, build and test tooling, repository
conventions, and execution environments alongside deployment, service operation,
and incident response. Its ten record types link to authoritative designs,
specifications, and implementation documentation where those already live.

## Use

```text
$devops-docs setup
$devops-docs setup providers
$devops-docs setup tools
$devops-docs maintain providers
$devops-docs maintain github.md
$devops-docs who owns the package registry
$devops-docs how local development and CI environments differ
$devops-docs where the repository's build and test conventions are documented
$devops-docs author — implement the accepted provider changes
```

Choose setup, author, or maintain explicitly, or describe the work
naturally. Scope can name document types, files, directories, or subjects.

Setup and maintain analyze the selected scope and present one final proposal
for feedback. The proposal explains relevant document types, groups suggested
changes by type, and ends with the overall recommendation. It lives only in the
conversation; neither task changes files. Related impacts outside the selected
scope are identified separately.

For other requests, the skill starts at the corpus root's `index.md` (default:
`devops/index.md`) and follows relevant links to find the documentation needed.
Author creates or revises records within the requested authority, including
implementing an accepted proposal. An inline draft stays in the conversation.

## Standard structure

Setup proposes **`/devops/` at the adopting repository's root**, including in
established repositories, and migrates relevant existing content into fixed
type folders. Create only populated folders:
providers, services, teams, tools, environments, organizations, repositories,
playbooks, runbooks, and measures. The adoption README owns scope and maintenance;
root and populated type-folder indexes own navigation. Only the root name or
location may vary, through an explicit request or existing adoption declaration.
Setup does not initially offer root alternatives, and an existing folder
arrangement alone is not an override. Author applies accepted changes.

Adoption, migration, and maintenance reassess whether local guidance still
needs a document once the skill supplies it. Preserve applicable unique meaning
and human reader needs; redundant guidance may be retired without a successor.
Adoption declarations contain repository-specific decisions and references to
shared guidance.

Setup and maintain also inspect the repository's canonical agent instructions
for a discovery pointer. Their proposals name the instruction source, exact
text to add or revise, and reason; equivalent adequate guidance is retained.
The pointer identifies engineering and operations documentation, all ten
supported record types, and the adopted index. It establishes awareness and
lets the agent judge relevance. Author applies accepted instruction changes
and verifies effective discovery and link resolution.

## Package map

| Read | For |
| --- | --- |
| [Skill](src/SKILL.md) | Routing and execution workflow |
| [Profile](src/references/profile.md) | Versioned common contract and routes to ten type templates |
| [Proposal template](src/templates/plan.md) | Conversational orientation and proposed changes grouped by type |
| [Agent-instructions template](src/templates/agent-instructions.md) | Discovery-pointer wording, inspection, proposal, and verification |
| [Connected example](src/references/example.md) | A fictional draft Service, Measure, and Runbook |

The canonical AXM package is `@craigsmitham/skills/devops-docs`, version 0.5.1.
`src/` is the portable runtime payload. README is package documentation.
This package has no executable helpers or mandatory runtime sibling dependencies.
When available, `author-docs` contributes documentation craft and `author-okf`
contributes OKF authoring and base validation. Their absence leaves manual checks
available and automated-check limitations explicit.

## Boundaries and evidence

Documentation work does not deploy software, grant access, accept service
commitments, execute procedures, or publish external changes. Documents identify
their sources and limitations; record acceptance is distinct from live health
or successful exercise.

The profile is an application convention over OKF v0.2, not an OKF extension
standard. Profile review is manual. Base validation, profile consistency,
source support, and actual use evidence are distinct results.

## Changes in 0.5.1

Setup and maintain run an advisory [skill freshness check](src/references/skill-freshness.md)
and include its result in the proposal. The check respects installation source,
pins, update policy, and compatibility; an unavailable check does not block the
analysis. Updates remain separately authorized. Profile 0.5.0 still applies;
no corpus migration is required.

## Changes in 0.5.0

Profile 0.5.0 stores canonical typed relationships as top-level YAML fields such
as `owned-by`, `source-in`, and `depends-on`. Single-target fields accept a plain
target or qualified mapping; multi-target fields use lists of either form.
Optional `scope` and `notes` preserve per-target qualifications. Body links
remain useful for readers; relationship tables, if displayed, are derived.

This is an incompatible representation change during pre-1.0 development.
Relationship identifiers, meanings, endpoint types, and cardinalities are
unchanged. Follow the [profile migration](src/references/profile.md#review-and-versioning)
to move table rows into frontmatter, preserve qualifications, update local
consumers, and revise the adoption declaration. Installing the skill does not
migrate existing records. Keep skill 0.4.1 with profile 0.4.0 when deferring;
rollback of migrated records also restores their tables and prior declaration.

Templates and the connected example use the new representation. Routing and
authority boundaries are unchanged. Package, YAML/example, link, and manual
profile checks cover the representation; the behavioral evaluation suite
remains deferred during design.

## Changes in 0.4.1

Documentation lookup is the default fallback in `SKILL.md`, starting at the
corpus root's index and following relevant links. The separate Discover task
and its answer-format requirements are removed. Setup, author, maintain, and
their authority boundaries are unchanged. Profile 0.4.0 still applies; no corpus
migration is required. Version 0.4.0 remains available for rollback.

Package and manual routing checks cover this simplification; the behavioral
evaluation suite remains deferred during design.

## Changes in 0.4.0

Descriptions, discovery metadata, workflows, profile guidance, and examples now
consistently describe engineering and operations documentation. Engineering
workflows, tooling, repository conventions, and development environments are
explicitly in scope. The ten record types continue to link to existing design,
specification, and implementation authorities.

The discovery pointer now names documentation location and contents. It no
longer prescribes consultation across a lifecycle list; setup and maintenance
propose simplifying overly prescriptive pointers while retaining independent
workflow-specific requirements. The pointer still lists all ten supported types.

Profile 0.4.0 requires no record relocation, new fields, or relationship changes.
Review operations-only descriptions and older pointers during normal maintenance.
The `/devops/` root convention and fixed type folders are unchanged. Documentation
work does not authorize software implementation or procedure execution. The
previous 0.3.0 release remains available if adoption of this revision is deferred.
Package, link, and manual consistency checks do not establish behavioral proof;
the evaluation suite remains deferred during design.

## Changes in 0.3.0

Setup now proposes a standard structure in both new and established repositories.
The prior preserve-in-place and subject-first layout options are removed.
Profile 0.3.0 fixes type-folder placement and requires the adoption README and
root/populated type-folder indexes. Only an explicit root name/location override
remains available. Scoped maintenance proposes necessary placement repairs.

Setup and maintain check agent discovery against one shared pointer template.
Plans show the canonical instruction target, exact text, and reason for an
addition or revision; accepted authoring verifies the effective pointer and link.

Migration from 0.2.0 requires reviewing root selection, moving scoped records
into their standard folders, establishing required navigation, repairing
references, and checking the discovery pointer. Preserve applicable unique
meaning; unnecessary documents still need no successor. Record types, metadata,
and relationships are unchanged. Keep the prior skill/profile at 0.2.0 if the
structure migration is deferred; installing 0.3.0 does not perform it.

The reported motivating case was setup retaining existing locations while
revising content in an established repository. The revised contract requires a
migration proposal for that case. Package and manual consistency checks are
distinct from behavioral proof; the evaluation suite remains deferred during design.

## Changes in 0.2.0

Setup, maintenance, and authoring now explicitly support retirement without a
successor after checking unique meaning, human access, and affected references.
The proposal example demonstrates this alongside consolidation.

Profile 0.2.0 limits adoption declarations to local decisions and references.
Before migrating an existing declaration from 0.1.0, remove copied shared
guidance while preserving applicable local meaning and access to needed
instruction. Record types, metadata, and relationships are unchanged. A skill
upgrade does not itself migrate an adopting repository. Keep the prior skill
and declared profile at 0.1.0 if that review is deferred.

Routing and authority are unchanged: setup and maintain propose; author applies
authorized changes. Validation covers package structure and manual consistency;
the package's behavioral evaluation suite remains deferred during design.

License: CC-BY-SA-4.0. Examples are fictional.
