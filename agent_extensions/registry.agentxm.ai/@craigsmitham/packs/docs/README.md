# Documentation craft

Practical guidance for writing, reviewing, organizing, and maintaining useful
documentation. Its pattern collection covers tutorials, how-to guides,
reference, explanation, principle documents, playbooks, runbooks, checklists,
pattern descriptions, and pattern collections. Checklist specializations cover
execution, verification, readiness, reporting and review, and learning. Each
pattern connects a recurring reader problem to a design response, with
applicability, tradeoffs, evidence, and detailed authoring guidance.

The four general reader needs draw on [Diátaxis](https://diataxis.fr/).
Pattern concepts, mining, description, review, and collection maintenance draw
on [Rebecca Wirfs-Brock and collaborators' work](https://wirfs-brock.com/rebecca/)
and [Alistair Cockburn's 2023 PLoP talk](https://alistaircockburn.com/Talk%202023-10%20PLOP%2030%20yrs%20patterns.pdf).
The docs knowledge bundle owns that guidance for pattern subjects across
domains; the docs skill routes to it. Broader documentation foundations,
organization, and audit workflows remain available alongside it. Projects
retain their own layouts, metadata schemas, validators, and tooling.

## Included extensions

| Extension | Role |
| --- | --- |
| `@craigsmitham/knowledge/docs` | Documentation and checklist patterns, foundations, and practical workflows |
| `@craigsmitham/skills/docs` | Write, review, adapt, organize, audit, and remediate documentation and reusable checklists |

Install the pack to supply the skill with its knowledge companion. These two
extensions provide all required guidance.

## Install and use

```bash
axm packs install @craigsmitham/packs/docs
```

Ask to write or revise a document, mine recurring experience into a pattern
description, review pattern evidence, curate a pattern collection, repair
links, or audit a bounded documentation corpus. Search the knowledge with
`axm knowledge concepts query` or open a concept by identity with
`axm knowledge concepts get`.

For checklist work, start with the shared pattern, then select its purpose:

```bash
axm knowledge concepts get '@craigsmitham/knowledge/docs#patterns/checklist'
```

The guidance includes use protocols, evidence, validation plans, and lifecycle.
Writing or reviewing a checklist does not establish its real-world effectiveness.

Start with the reader's problem and choose a suitable pattern. Adapt its design
and authoring guidance to the document's job. For an example of selecting and
combining patterns, open the Documentation craft concept:

```bash
axm knowledge concepts get '@craigsmitham/knowledge/docs#explainers/documentation-craft'
```

## Checklist consolidation in 0.9.0

Docs knowledge 0.15.0 and docs skill 0.6.0 absorb checklist design into the
existing docs pack. The standalone checklist-design skill is retired and
archived in the registry, with its source removed from the repository. Its
rigid response format and decision-gate
scripts are not retained. The knowledge owns the design guidance; the docs
skill routes checklist creation, review, adaptation, and validation planning
to it. No additional package dependency is required.

## Migration in 0.8.0

Docs skill 0.5.0 uses docs knowledge 0.14.0. Update the pack together. This is a
coordinated concept-ID change; old pages are removed rather than retained as
migration stubs. Update saved references using these mappings:

| Former concept IDs | Current concept ID |
| --- | --- |
| `explainers/tutorial`, `guides/tutorial` | `patterns/tutorial` |
| `explainers/how-to`, `guides/how-to` | `patterns/how-to` |
| `explainers/reference`, `guides/reference` | `patterns/reference` |
| `explainers/explanation`, `guides/explanation` | `patterns/explanation` |
| `explainers/principle`, `guides/principle` | `patterns/principle` |
| `explainers/pattern`, `guides/pattern` | `patterns/pattern-description` |
| `patterns/pattern-library` | `patterns/pattern-collection` |
| `patterns/concept-boundaries` | `guides/comparing-concepts` |

Playbook and runbook retain `patterns/playbook` and `patterns/runbook`.
The temporary, unpublished `types/<subject>` routes have moved to
`patterns/<subject>`; update any local references to those temporary routes.

Pattern concepts and authoring now live with their documentation designs in
the two new knowledge entries. The temporary, unpublished standalone patterns
skill has been removed; use the docs pack for that work. No separate patterns
pack or knowledge bundle is required. Earlier released docs versions remain
the rollback option.

## License

CC-BY-SA-4.0. Sources and provenance remain with the concepts they support.
