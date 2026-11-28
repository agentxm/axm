# Documentation craft

Use this pack to write, review, and maintain documentation in software
engineering workspaces, including repositories and agent-assisted workflows.
Common uses include software product guides and domain-specific knowledge
bases. Choose the document form around what the reader needs to learn, do,
look up, or understand.

The pattern collection covers tutorials, how-to guides,
reference, explanation, principle documents, playbooks, runbooks, checklists,
pattern descriptions, and pattern collections. Checklist specializations cover
execution, verification, readiness, reporting and review, and learning. Each form has a
standalone explainer, authoring guide, and design pattern.

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

With [AXM](https://axm.sh/) installed, run this command in the project where
you want to use the pack. To configure an agent on first install, add
`--agent` with its name, for example `--agent codex`.

```bash
axm packs install @craigsmitham/packs/docs
```

Ask to write or revise a document, mine recurring experience into a pattern
description, review pattern evidence, curate a pattern collection, repair
links, or audit a bounded documentation corpus. Search the knowledge with
`axm knowledge concepts query` or open a concept by identity with
`axm knowledge concepts get`.

For a museum knowledge base, give the agent the museum’s collections policy
and ask “Write a page for new curators explaining the difference between an
incoming loan and an acquisition.” A curator should be able to use the page
to classify a new arrival using the museum’s own criteria.

For a release team, ask the skill to “Draft a release-readiness checklist from our
release procedure” and supply that procedure. In this checkout, the authoring
guide shows how to turn release conditions into evidence and a decision.
To explore why the form works or judge its fit, open the explainer or pattern.

```sh
axm knowledge concepts get '@craigsmitham/knowledge/docs#guides/designing-a-readiness-checklist'
axm knowledge concepts get '@craigsmitham/knowledge/docs#explainers/readiness-checklist'
axm knowledge concepts get '@craigsmitham/knowledge/docs#patterns/readiness-checklist'
```

If a lookup reports that the concept was not found, run
`axm knowledge concepts query readiness` in the same project. The published
0.15.1 knowledge bundle offers the readiness pattern. For the separate
authoring directions in this checkout, open
`knowledge/docs/src/guides/designing-a-readiness-checklist.md` and supply
that page with the release procedure.

For situations that span several reader needs, [Documentation craft](https://github.com/craigsmitham/agent-extensions/blob/main/knowledge/docs/src/explainers/documentation-craft.md)
illustrates how to select and combine designs.

## Checklist consolidation in 0.9.0

Docs knowledge 0.15.0 and docs skill 0.6.0 absorb checklist design into the
existing docs pack. The standalone checklist-design skill is retired and
archived in the registry, with its source removed from the repository. Its
rigid response format and decision-gate
scripts are not retained. The knowledge owns the design guidance; the docs
skill routes checklist creation, review, adaptation, and validation planning
to it. No additional package dependency is required.

## Retired guide IDs in 0.9.0

If you saved links to the craft or workflow guide in docs knowledge 0.14.0,
update the concept ID within `@craigsmitham/knowledge/docs` when moving to 0.15.0.

| Former concept ID | Current concept ID |
| --- | --- |
| `guides/documentation-craft` | `explainers/documentation-craft` |
| `guides/documentation-workflow` | `explainers/documentation-workflow` |

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

When updating an old link for the current pack, check the question beside
it. For example, someone following a saved how-to link to write directions
needs `guides/writing-a-how-to-guide`. Someone choosing a form needs
`patterns/how-to`, and someone asking how the form works needs
`explainers/how-to`. Open the chosen ID with `axm knowledge concepts get`,
using the full identity as in the examples above, and read the opening
against the original question. Some older IDs now resolve to a page with a
different purpose.

Pattern concepts and authoring now live with their documentation designs in
the two new knowledge entries. The temporary, unpublished standalone patterns
skill has been removed; use the docs pack for that work. No separate patterns
pack or knowledge bundle is required. Earlier released docs versions remain
the rollback option.

## License

CC-BY-SA-4.0. Sources and provenance remain with the concepts they support.
