# DevOps Docs profile

Version **0.5.0** · Base **OKF v0.2** · Maintainer **@craigsmitham**.
Adoption by a repository is a separate scoped act.

This profile describes engineering and operations documentation for people
designing, developing, delivering, operating, and maintaining software products.
It covers development workflows, build and test tooling, repository conventions,
and execution environments alongside deployment, service operation, and response.
Its normative contract comprises this file
and the **Type contract** sections in the ten linked templates, versioned
together. Other template sections are authoring guidance, not required layout.
MUST/MUST NOT are requirements; SHOULD/SHOULD NOT are recommendations with a
recorded reason for departures; MAY denotes an option.

## Adoption and placement

An adoption MUST state this exact version, covered record scope, responsible
maintainer, root location, and composition with host rules in `<root>/README.md`.
The root index MUST link to that declaration and the
versioned profile reference. Resolve conflicts before claiming conformance.
No `okf_profile` field is introduced: profile declarations are producer
conventions beyond OKF v0.2.

The declaration MUST be limited to repository-specific adoption decisions:
the fields above, local exceptions, and rationale needed to interpret them.
It MUST reference shared definitions, type contracts, and authoring guidance
rather than reproduce them. Any continuing need for human-facing instruction
SHOULD be served through accessible references or a separate document with a
distinct reader purpose. Installing a skill does not establish human access.

Default to **`<repository-root>/devops/`**, abbreviated `/devops/`. This is
repository-relative, never the filesystem root. Setup MUST propose this root
and the standard structure below, including in an established repository.
Only the root's name or location MAY vary, through an explicit user request or
an existing adoption declaration. Do not initially offer root alternatives;
an incidental existing folder arrangement is not an adoption decision.
The internal structure MUST remain the same under any adopted root:

```text
devops/
  README.md       # Adoption, scope, placement, and maintenance authority
  index.md        # Navigation
  providers/     services/       teams/        tools/       environments/
  organizations/ repositories/   playbooks/    runbooks/    measures/
```

The root MUST contain `README.md` and `index.md`. Each scoped record MUST live
in its corresponding plural type folder shown above. Create only type folders
with records; every populated type folder MUST have an `index.md`. Setup MUST
propose migrating relevant existing content into this structure, preserving
applicable unique meaning and repairing affected references. Rewriting a record
in its old location does not adopt the structure. Filenames
SHOULD be stable, descriptive kebab-case subjects or actions.

The adoption README is outside the ten-type record scope but MUST satisfy
base OKF; use a host type when defined, otherwise `Reference`. Setup and
maintenance proposals are conversational presentations, not bundle artifacts.
Other host documents MAY coexist outside the declared record scope. Every
non-reserved Markdown file in an OKF bundle requires parseable YAML frontmatter
with non-empty `type`.

At every level, `index.md` and `log.md` are reserved, untyped navigation/history
files. They MUST NOT own subject meaning or concept metadata. Only a bundle-root
index MAY have frontmatter, limited to `okf_version: "0.2"`. Logs, if used,
have ISO `YYYY-MM-DD` date headings, newest first; version control MAY suffice.

## Agent discovery

Setup and maintain MUST check the repository's effective agent instructions for
a discovery pointer to the adopted root index. Use the
[agent-instructions template](../templates/agent-instructions.md) to assess
equivalent guidance and propose missing or stale content. The proposal MUST
identify the canonical instruction source, exact proposed text, and reason.
Instruction edits remain subject to the accepted scope; finding a missing
pointer does not itself authorize a write. The pointer identifies the location
and contents of engineering and operations documentation so the agent can judge
relevance. It does not prescribe when or how to consult the corpus; shared
documentation rules remain in this profile and skill.

## Types and boundaries

Use exactly one exact type per scoped record. The seven subject types are
Provider, Service, Team, Tool, Environment, Organization, and Repository.

| Type and template | Identity and purpose |
| --- | --- |
| [Provider](../templates/provider.md) | Our relationship with a supplier, its adopted offerings and accounts |
| [Service](../templates/service.md) | Software with a coherent responsibility, consumers, accountability, and lifecycle |
| [Team](../templates/team.md) | A group with collective responsibility and a collaboration interface |
| [Tool](../templates/tool.md) | An engineering instrument as locally adopted and supported |
| [Environment](../templates/environment.md) | An execution context with defined purpose, boundaries, and rules |
| [Organization](../templates/organization.md) | An organizational entity with purpose and an authority boundary |
| [Repository](../templates/repository.md) | A source-control repository with canonical remote and its own lifecycle |
| [Playbook](../templates/playbook.md) | Assessment and judgment in selecting, combining, and adapting responses |
| [Runbook](../templates/runbook.md) | An established procedure for a bounded trigger and verifiable outcome |
| [Measure](../templates/measure.md) | A quantity's definition, implementation reference, and interpretation |

A Service is independent of repository and environment instances; map it to
existing architecture when ambiguity matters. It is not automatically a C4
Component, package, deployment, or framework service. A hosted Tool MAY have a
separate Provider relationship record. Separate records require distinct
information to own; one canonical record suffices when roles overlap.
Group provider offerings/accounts only when their administration, accountability,
and maintenance belong together, making the grouping explicit. Organization
does not automatically mean a vendor's tenant named "organization."

Do not invent types or records for graph completeness. Designs, specifications,
implementation documentation, schemas, infrastructure resources, dashboards,
policies, and decisions MAY remain external authorities. Records MUST link to
those sources where relevant rather than absorb or duplicate their meaning.

## Common record contract

Every scoped record MUST have `type`, a standalone non-empty `title`, a
distinguishing `description`, and `status: draft | stable | deprecated`. H1 MUST
match `title`. Action descriptions MUST name the selecting situation or intent
and supported outcome. Other OKF metadata MAY be used when truthful and useful.

Every record MUST identify purpose, scope, accountability, material
relationships, authoritative references or their gaps, and maintenance triggers.
Use one primary `owned-by` target when represented; otherwise name a responsible
role/person and its directory/contact authority in the body. Record secondary
roles separately; do not fabricate a team or self-ownership edge. Identify a
different document maintainer when needed without changing subject ownership.

`status` describes adoption of the document. Subject lifecycle, tool adoption,
live health, objective acceptance, and exercise evidence MUST remain separate.
Generation is not acceptance or verification. Drafts MAY carry explicit gaps;
stable records MUST resolve required information or explain conditional
non-applicability and MUST have established accountability. Unknown is neither
an empty placeholder nor proof of non-applicability. Deprecated records MUST
explain their replacement or retirement and any remaining applicable history.

Records MUST link to the authorities for configuration, agreements, directories,
requirements, measurements, and execution evidence rather than replace them.
Never embed credentials. Respect the intended audience's access boundary;
reference restricted systems without copying restricted content into a broader
corpus. Consequential snapshots MUST identify source, scope, observation time,
and limitations. Provenance and verification MUST describe actual events.

## Relationships

Material relationships among represented records MUST appear as top-level YAML
frontmatter fields in the source record, using the identifiers below as keys.
These fields are DevOps profile conventions, not standard OKF metadata. Do not
nest them under a `relationships` wrapper or use a body table as their authority.

- A **0..1** field MUST contain one target, either a plain string or a qualified
  mapping. Do not use a list for these fields.
- A **0..many** field MUST contain a non-empty list, even for one target. Each
  item MAY be a plain string or a qualified mapping; both forms MAY coexist.
- A **plain target** is a non-empty path or canonical URI string, not a Markdown
  link. A local path MUST identify a non-reserved concept document including
  `.md`, resolved relative to the containing document. Cross-bundle targets
  MUST identify their bundle or canonical URI unambiguously.
- A **qualified mapping** MUST contain `target` in that same string form and MAY
  contain non-empty string fields `scope` and `notes`. No other mapping keys
  are defined by this profile. Use `scope` to narrow applicability by environment,
  account/offering, repository subpath, or dependency kind; otherwise the
  source's stated scope applies. Use `notes` for a short explanation and keep
  longer discussion in the body.
- Omit fields with no documented targets; do not use nulls, empty strings,
  empty lists, or placeholder targets. Name unknown targets as gaps in the body.
  A known target awaiting a record MAY use an unresolved path in a draft,
  provided the missing record is explicitly identified as a gap.

For example, these fictional Service frontmatter fields show single-target,
plain-list, and qualified-list forms:

```yaml
owned-by: ../teams/platform.md

provided-by:
  - ../providers/hosting.md

source-in:
  - target: ../repositories/backend.md
    scope: packages/api

depends-on:
  - ../services/identity.md
  - target: ../services/postgres.md
    scope: Production
    notes: Required for account writes.
```

A single-target field can also carry qualifications:

```yaml
owned-by:
  target: ../teams/platform.md
  notes: Primary accountability; the service desk handles initial triage.
```

Use one YAML key per relationship identifier. For multi-target fields, add list
items rather than repeating the key. Body prose MAY link to the same records
where readers need context, but MUST NOT maintain a second canonical inventory.
A displayed relationship table or inverse view MUST be marked as derived and
identify its source or generation reference. Generic OKF consumers may discover
body links without interpreting these profile-specific fields; typed-graph
consumers must read the frontmatter.

| Identifier | Allowed source → target | Targets per source |
| --- | --- | --- |
| `owned-by` | Any record → Team or Organization | 0..1 |
| `part-of` | Team → Organization; Organization → Organization | 0..1 |
| `provided-by` | Service or Tool → Provider | 0..many |
| `source-in` | Service or Tool → Repository | 0..many |
| `hosted-by` | Repository → Provider | 0..1 |
| `depends-on` | Service or Tool → Service or Tool | 0..many |
| `uses-provider` | Service, Tool, or Environment → Provider | 0..many |
| `runs-in` | Service or Tool → Environment | 0..many |
| `measures` | Measure → any subject type | 0..many |
| `applies-to` | Playbook or Runbook → any subject type | 0..many |
| `uses-tool` | Playbook or Runbook → Tool | 0..many |
| `selects-procedure` | Playbook → Runbook | 0..many |
| `calls-procedure` | Runbook → Runbook | 0..many |

`owned-by` is primary accountability, not access authorization. `part-of` is
organizational placement, not collaboration. `provided-by` identifies who
supplies the represented capability; `uses-provider` identifies reliance on an
offering/account. `depends-on` identifies a functional, build, or operational
dependency. `runs-in` is intended placement, not observed deployment or health.
Procedure relations distinguish selection from execution within a procedure.

Author each edge once at its specified source. Stable targets MUST resolve to the
allowed types; draft unresolved targets MUST be named gaps. Cardinalities count
distinct represented targets; absent edges do not establish absent real-world
dependencies, populations, or scope. State those boundaries in the body.
`part-of` and `calls-procedure` MUST be acyclic. Explain material dependency
cycles rather than rejecting every cycle. Ordinary links to other authorities
are not automatically typed edges.

## Identity, discovery, and change

A record's concept identity is its bundle-relative path without `.md`; it MUST
have one canonical home and be reachable through root index routes. Index
entries MUST use its exact title and description. Use repository-facing relative
Markdown links, or explicit cross-bundle references; do not mistake a
bundle-relative link for a repository-root link.

A move changes identity. Update inbound links and discovery in the same change;
preserve history or a declared mapping needed to interpret earlier evidence.
Do not retain independently maintained duplicate authority. Records SHOULD
link to relevant engineering and operations guidance, and alerts SHOULD link to applicable
playbooks/runbooks where that external change is separately authorized.

## Review and versioning

See the [connected draft example](example.md) for a Service objective, shared
Measure, and read-only Runbook with explicit gaps.

Report separately: base OKF conformance; manual profile/type-contract review;
source support; and actual use/exercise evidence. Name checked scope/version,
failed MUST rules, SHOULD departures, unresolved gaps, and limitations. There
is no profile-specific executable validator. A base validator or link check
does not establish the remaining results or operational readiness.

This package's maintainer owns profile revisions; adopters own their declarations
and records. Version the profile and type contracts together. Changes to
meaning, required content, endpoints, or cardinality MUST state migration impact
before existing records claim the new version.

V0.5.0 moves canonical typed relationships from body tables to top-level YAML
frontmatter. The identifiers, meanings, allowed endpoint types, and target
cardinalities are unchanged. To migrate from v0.4.0:

1. Move each table row to the field named by its relationship identifier. Use
   one value for 0..1 fields and list items for 0..many fields.
2. Extract the Markdown link destination as the target string, preserving its
   document-relative resolution. Preserve all qualifications: split `Scope /
   notes` into `scope` and `notes` only when their meanings are clear; otherwise
   retain the original text in `notes` without guessing.
3. Remove the former canonical table. Retain useful contextual prose and links;
   label any retained generated table as derived from the frontmatter.
4. Check YAML field forms, target resolution/types, distinct-target cardinality,
   scope preservation, and the existing cycle rules. Update any local consumer
   that extracted typed relationships from body tables.
5. Update the scoped adoption declaration after migration and review. A skill
   upgrade does not migrate adopting repositories. Keep skill v0.4.1 and profile
   v0.4.0 if migration is deferred; reverting a migrated corpus also requires
   restoring its relationship tables and prior declaration.

V0.4.0 makes the engineering and operations scope explicit and simplifies the
discovery pointer to documentation location and contents. When adopting this
version, review descriptions and pointers that imply an operations-only corpus
or prescribe consultation throughout the work lifecycle. Propose revisions
through normal maintenance; preserve independently justified workflow-specific
consultation requirements. The root convention, type folders, record types,
fields, and relationships are unchanged; no record relocation is required.

V0.3.0 requires the standard structure and discovery-pointer checks. To migrate
from v0.2.0, retain only an explicitly selected root override, move scoped
records into their type folders, establish the adoption README and root/type
indexes, and repair references. Inspect the agent instructions and propose the
pointer addition or revision where needed. Do not claim v0.3.0 until its
required structure is in place and its checks are complete; upgrading the skill
does not authorize or perform a repository migration. Record types, fields, and
relationships are unchanged.

V0.2.0 limits adoption declarations to repository-specific decisions and
references. When migrating from v0.1.0, review the declaration for copied shared
guidance, preserve applicable local meaning, and repair references before
claiming v0.2.0. Reassess whether superseded local guidance needs a successor;
retirement without one is valid when no unique meaning or reader need remains.
Record types, fields, and relationships are unchanged. Existing v0.1.0 adoption
does not change merely because the skill is upgraded.
