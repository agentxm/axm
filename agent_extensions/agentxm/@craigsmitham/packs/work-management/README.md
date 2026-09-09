# Work management

Portable work-item semantics and authoring for consistent software work across
repositories and trackers. The pack is opinionated about record quality,
evidence, identity, relationships, completion, and verification while remaining
agnostic about delivery methodology, tracker, requirements system, and
architecture framework.

## What the pack installs

| Extension | Responsibility |
| --- | --- |
| `@craigsmitham/knowledge/product-engineering` | Taxonomy, common content contract, role guidance, and portable templates, held in the How to ship it section under `src/delivery/work-items/` |
| `@craigsmitham/skills/manage-work-items` | Classification, authoring, triage, relationship, lifecycle, host mapping, and verified persistence workflow |

The `work-management` bundle was retired into `product-engineering`, so this
pack now installs that body of knowledge and the skill reads the work-item
subtree inside it. The skill is non-standalone because it resolves its
knowledge sibling through the active AXM scope. Install the pack:

```sh
axm packs install @craigsmitham/packs/work-management
```

## Portable taxonomy

| Role | Purpose |
| --- | --- |
| Operational Incident Record | Coordinate current or imminent operational impact through a living record |
| Defect Report | Preserve evidence that may indicate a deficiency relative to an expectation or intended use |
| Change | Coordinate one bounded proposed or authorized software modification |

Bugfix is a Change classification linked to established Defects and their
provenance-bearing reports. Investigation is uncertainty-reduction activity.
Tasks, stories, epics, milestones, and projects remain host-native planning
constructs.

## How consistency and adaptation compose

```text
common contract → role-specific contract → repository considerations
                → native host representation
```

The common and role contracts define stable meanings. Repository instructions
may add content obligations for conditions such as public APIs, sensitive data,
security, accessibility, migrations, or operational readiness. The skill puts
those considerations into the applicable portable slots rather than requiring
each repository to maintain a competing general template.

Native tracker fields remain the preferred home for facts they carry exactly.
Portable Markdown templates are fallbacks for residual body meaning, not
mandatory forms.

## Representative uses

- “Turn these observations into a Defect Report without inventing a cause.”
- “Create a Bugfix Change linked to these confirmed defects.”
- “Draft a process-agnostic Change with scope, constraints, acceptance, and
  verification.”
- “Update the incident record from these response notes.”
- “Triage these possible duplicates and preserve item-local failures.”
- “Rewrite this issue title and summary without changing its body.”

## Boundaries

The work-item capability does not provide:

- a complete SDLC or delivery process;
- backlog prioritization, capacity planning, roadmaps, or portfolio management;
- a requirements, architecture, design, test, or operational-response system;
- implementation, debugging, release, or production-mutation authority; or
- an end-to-end stage model, governed corpus, or focused-artifact lifecycle.

The installed bundle covers several of those subjects in other sections, and
holding both capabilities in one body of knowledge does not merge them. The
skill routes to the work-item subtree only.

## Attribution and license

The pack metadata and README and the skill package are MIT-licensed. The
knowledge bundle is CC-BY-SA-4.0. Each member retains its declared license.
