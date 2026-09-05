# Requirements engineering

Portable requirements engineering for discovering needs and constraints,
developing and specifying obligations, reviewing their quality and fitness,
maintaining traceability and change, and mapping them into project-native hosts.

The pack is opinionated about requirement quality, explicit authority,
evidence, uncertainty, identity, and lifecycle while remaining agnostic about
delivery methodology, architecture framework, taxonomy, document form, and
requirements-management tool.

## What the pack installs

| Extension | Responsibility |
| --- | --- |
| `@craigsmitham/knowledge/requirements-engineering` | Portable model and guides for elicitation, analysis, specification, review, traceability, lifecycle, and local adaptation |
| `@craigsmitham/skills/engineer-requirements` | Safe routing and execution for requirement candidates, authoring, review, impact, lineage, and host mapping |

Members are non-standalone because the skill resolves its knowledge sibling
through the active AXM scope. Install the pack:

```sh
axm packs install @craigsmitham/packs/requirements-engineering
```

## Portable operating model

```text
local policy + source evidence
              ↓
observations / needs / candidates
              ↓ explicit decision authority
normative requirements — one authority, many witnesses
              ↓
design · realization · assessment · evidence · coordinated work
```

Candidate maturity, normative force, decision, persistence, realization, and
evidence are independent dimensions. Polished wording, implementation, tests,
or a tool status do not silently accept or satisfy a requirement.

The pack uses a stable content contract while allowing fit-for-purpose forms:
structured prose, examples, tables, scenarios, models, quantitative expressions,
or formal notation. Project instructions own domain vocabulary, classification,
decision authority, assurance rigor, sensitive-content rules, and additional
content obligations. Native host fields take precedence over Markdown fallback.

## Representative uses

- “Inventory the sources and open questions for this requirement area.”
- “Turn these observations into candidates without implying acceptance.”
- “Draft a measurable reliability requirement without guessing the target.”
- “Review this bounded set for conflicts, traceability, and coverage gaps.”
- “Analyze the impact and lineage of splitting REQ-40.”
- “Map these requirements to our tool's native fields without writing them.”

## Optional composition with Work Management

This pack does not depend on Work Management. When both packs are installed,
they compose through typed relationships:

- Defect Reports may preserve observations relative to a requirement or
  intended use;
- Changes may coordinate authorized requirement revisions and their downstream
  realization; and
- Operational Incident Records may provide evidence that a requirement,
  assumption, realization, or assessment strategy needs review.

The requirement source retains authority for requirement meaning. Work items
retain authority for coordinated work and their own evidence and lifecycle.

## Boundaries

The pack does not provide:

- product strategy, prioritization, roadmaps, portfolio management, or approval
  authority;
- a mandatory SDLC, agile practice, stage model, architecture taxonomy, or
  document suite;
- architecture, design, implementation, test execution, release, or operational
  response;
- general work-item management; or
- legal advice, certification, or unsupported regulatory, safety, security, or
  compliance determinations.

## Attribution and license

The pack metadata and README and the skill package are MIT-licensed. The
knowledge bundle is CC-BY-SA-4.0. Each member retains its declared license.
