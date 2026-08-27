---
name: author-docs
description: >
  Creates, substantially revises, organizes, and remediates repository
  documentation using portable documentation craft. Use for writing or
  improving READMEs, tutorials, how-to guides, reference material,
  explanations, documentation principles and patterns, playbooks and
  runbooks; reviewing one identified document; proposing a documentation
  structure, path, filename, or title, including planning before a document
  exists; organizing or renaming a documentation collection; fixing broken
  links or stale content; or implementing accepted documentation-audit
  findings. When documentation is the requested artifact, apply this skill
  even if another skill covers the document's subject. Not for corpus-level
  documentation audits or health assessments, editing always-on agent
  instruction files themselves, Word or Google Docs artifacts, or implementing
  the product or design the documentation describes.
---

# Author docs

Create the smallest complete documentation improvement that serves the reader's
job and respects local authority.

## Workflow

1. **Resolve the job and authority.** Distinguish creation or remediation from
   review-only work. Read repository-local instructions, inspect the target and
   its authoritative sources, and preserve unrelated user changes. If the
   request is a corpus-level health assessment, route it to `audit-docs`. Route
   by requested artifact: a guide about an agent instruction file is
   documentation work; modifying the instruction file itself is not.
2. **Choose the smallest knowledge route.** Open only the needed concepts under
   `knowledge/docs/src/`:

| Request | Start with | Add when needed |
| --- | --- | --- |
| Understand or classify a documentation form | `explainers/documentation-craft.md` | Matching `explainers/<subject>.md` |
| Create or substantially revise one document | `guides/documentation-craft.md` | Matching guide and explainer for the reader need |
| Review one document's structure | Matching `guides/<subject>.md` | Matching explainer for form-fit questions |
| Remediate or restructure a corpus | `guides/documentation-workflow.md` | `explainers/documentation-workflow.md` for rationale; concepts for the selected unit |
| Propose, organize, place, or rename documentation paths, filenames, titles, or collections | `guides/organizing-and-naming-documentation.md` | `explainers/documentation-organization-and-discovery.md` for tradeoffs |
| Implement accepted audit findings | The supplied finding set | `guides/documentation-workflow.md` and the concept for each affected unit |
| Author or review a principle | `explainers/principle.md` | `guides/principle.md`; related patterns or domain cases when needed |
| Author or review a pattern or pattern library | `explainers/pattern.md` | `guides/pattern.md` and matching `patterns/*.md` examples |
| Author or review a playbook or runbook | Matching `patterns/*.md` | Pattern explainer and guide when pattern quality is in scope |
| Distinguish a practice, standard, principle, or pattern | Matching `explainers/{practice,standard,principle,pattern}.md` | A guide only when authoring is requested |
| Check links, staleness, or factual accuracy | Repository-local sources and validators | Relevant concepts only when form or structure is also in scope |

`explainers/` supports understanding, `guides/` supports action, and
`patterns/` holds reusable solutions to recurring documentation problems.
Principle authoring guidance lives in the explainer and guide collections;
actual principles belong with their subject domain.
Each directory has an `index.md` routing map. The four Diátaxis reader needs
remain foundational inside the explainer and guide collections.

3. **Preserve the reader job.** Name the document's primary reader, need, and
   authority. Keep that job recognizable; link to neighboring material rather
   than making one document perform every function. For an action-oriented
   document, make its description pair the supported outcome with the
   observable situation, event, symptom, or reader intent that makes it
   relevant. Keep that selection condition distinct from the access,
   knowledge, or state preconditions required after selection.
4. **Place and name deliberately.** Follow local information architecture when
   it works. When organization is in scope, choose the axis from reader entry
   points and semantic adjacency; do not invent unsupported host metadata or
   path conventions.
5. **Make the requested change.** Correct facts only from available authority.
   Keep changes bounded, update related indexes and metadata when required,
   and preserve inbound references or plan their migration when paths change.
6. **Verify proportionately.** Re-read for the reader's job, check claims
   against their sources, run available link, metadata, rendering, and package
   validators, and inspect the diff for collateral changes. When an index or
   catalog previews a canonical description, verify that it copies the
   description exactly and that neighboring action documents remain
   distinguishable before opening.
7. **Handoff.** State what changed, what evidence was checked, and any deferred
   finding, uncertainty, or owner. Do not present an authoring review as a
   corpus audit or independent approval.

For a combined “audit and fix” request, let the diagnostic finding set precede
the edits. Ask before remediation materially expands scope, changes an accepted
information architecture, or requires a product decision the documentation
cannot establish.
