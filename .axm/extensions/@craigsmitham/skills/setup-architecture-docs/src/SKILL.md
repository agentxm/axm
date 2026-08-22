---
name: setup-architecture-docs
description: Establishes a repository's software architecture docs by resolving their system boundary, root, local authorities, format, navigation, maintenance triggers, and agent discovery route. Use only when the user explicitly asks to set up, adopt, initialize, or connect architecture documentation or Just Enough Architecture Docs. Not for choosing an architecture, authoring substantive architecture meaning, or maintaining established architecture docs.
---

# Set up architecture docs

Establish the smallest repository-local structure needed to discover and apply
Just Enough Architecture Docs without copying the portable method or generating
an empty documentation taxonomy.

This skill is a non-standalone member of the software-architecture pack. From
the active AXM scope root, begin with
`.axm/extensions/@craigsmitham/knowledge/software-architecture/src/guides/organizing-an-architecture-docs-corpus.md`.
Open `architecture-documentation/just-enough-architecture-docs.md` only when
the adoption boundary, authority model, or admission test needs explanation.

## Workflow

1. **Confirm explicit setup intent.** Run only for an explicit request to set
   up or adopt architecture docs. If the repository already has an established
   setup and the request is to repair, refresh, reconcile, or prune it, leave
   that job to `maintain-architecture-docs`.
2. **Inspect before proposing.** Read repository instructions and the existing
   architecture, product, requirement, decision, guide, and proposal material.
   Inspect enough code, tests, schemas, configuration, and workspace structure
   to identify likely systems and the authorities that already own exact facts.
   Treat repository evidence as a proposal until its authority is clear.
3. **Resolve the local adoption choices.** Establish:
   - the system or bounded authority the docs describe;
   - the architecture-doc root, preserving an established repository path and
     otherwise defaulting to `docs/architecture/`;
   - the persistent repository instruction file that agents actually read;
   - local authority or format deviations; and
   - the accepted route, if one exists, to system lifecycle or support state,
     maintenance responsibility, and architecture decision authority; and
   - whether an existing repository convention requires the software
     architecture OKF application profile.

   Plain Markdown is the default when no accepted requirement or existing OKF
   convention says otherwise. Ask only about a material choice that cannot be
   established from repository authority. If several system boundaries or
   instruction files remain plausible, stop for that choice rather than
   creating competing roots or host-specific instructions.

4. **Preserve existing documentation.** Adopt the established root and useful
   local organization when they are coherent. Do not rewrite substantive docs,
   move proposals into accepted architecture, or rename established concepts
   merely to match the portable guide. Record a deliberate material deviation
   instead.
5. **Write the minimum adoption surface.** Create or update the architecture
   root `index.md` so it identifies the documented system, states that the
   repository adopts Just Enough Architecture Docs, records the local root and
   material authority or format deviations, and links every existing admitted
   architecture subject. Keep it navigational; do not place several substantive
   architecture entities in the root. Do not create `overview.md` or collection
   directories without accepted content that passes the admission test. When
   accepted concepts already exist, preserve or recommend their canonical
   named files; never create a plural catch-all such as `use-cases.md` for later
   splitting.
6. **Add the discovery route.** Add one concise route in the repository's
   canonical persistent instructions to the architecture root and the
   software-architecture pack. Preserve unrelated instructions and update an
   existing architecture-doc route in place. Do not copy the shared method,
   templates, or folder tree into repository instructions.
7. **Record maintenance triggers locally.** In the root index, state that the
   docs must be reviewed when accepted behavior, responsibility, boundary,
   Product Quality Requirement, architecture consequence, or an evidence route
   changes.
   Record or link accepted system lifecycle and stewardship routes when they
   already exist. If they do not, identify the gap for bounded authoring rather
   than inferring it from usernames, commit history, or directory ownership. Do
   not invent a calendar cadence without a repository requirement.
8. **Verify setup.** Confirm that the root and instruction route resolve, every
   existing maintained subject is reachable, no empty taxonomy was generated,
   proposals remain outside accepted architecture, and any declared OKF usage
   is consistent with the installed profile. In particular, setup MUST NOT
   generate ISO/IEC 25010 characteristic directories, Product Quality
   Requirements, or a Product Quality View without accepted content and
   explicit authoring intent.
9. **Handoff.** Report the documented system, root, instruction route, local
   choices, files changed, existing docs preserved, and any accepted meaning
   that still needs the separate authoring workflow. Present possible semantic
   additions, reductions, migrations, or reorganizations as recommendations
   unless the user explicitly authorized that class and scope of change.

Do not choose an architecture, create substantive desired-state claims from
implementation inference, configure unrelated tools, or modify source code,
runtime systems, proposals, and external records. Setup succeeds when future
contributors and agents can find the architecture docs and apply the shared
method without repository-local duplication.
