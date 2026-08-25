# Software engineering

Software engineering judgment and authoring workflows for evidence-rich
software work items and evidence-timed design change.
The pack keeps YAGNI and Tidy First as distinct, concise rules while routing
work-item authoring through a focused skill backed by shared knowledge.

## Included extensions

| Extension | Role |
| --- | --- |
| `@craigsmitham/knowledge/software-engineering` | YAGNI, Tidy First, and paired explainers and guides for software work items |
| `@craigsmitham/skills/author-software-work-items` | Create and revise feature requests, defect reports, incident records, and their tracker briefs |
| `@craigsmitham/rules/yagni` | Questions speculative capability, structure, process, and scope throughout the SDLC |
| `@craigsmitham/rules/tidy-first` | Questions whether a small behavior-preserving preparation should precede an authorized behavior change |

The skills and rules are not standalone: each loads or links to the bundled
knowledge package. The knowledge package remains useful on its own.

## Install

```bash
axm install @craigsmitham/packs/software-engineering
```

## Usage

- Ask to draft or update a feature request, defect report, operational incident
  record, or work-item title and summary to preserve its evidence and lifecycle.
- Use the YAGNI and Tidy First rules as lightweight decision prompts, following
  their links when the decision needs the fuller model, constraints, or
  examples.
- Search or open the knowledge bundle directly for tool-neutral explanations
  and guides without invoking an authoring workflow.

## Evaluation cases

Use these cases when validating the effective instruction surface:

| Case | Expected decision |
| --- | --- |
| One provider is requested and no second variation is active | Do not build an unused provider framework |
| Current structure materially obstructs an authorized behavior change | Consider the smallest behavior-preserving preparation, then make the behavior change separately |
| Urgent restoration makes preparatory work too costly | Change behavior directly; tidy after, later, or never |
| A public compatibility boundary will soon become costly to reverse | Treat compatibility as a current constraint while deferring unrelated extension points |
| The task is read-only research, diagnosis, or review | Neither rule authorizes a structural or behavioral change |
| An untriaged feature request is presented as an implementation task | Preserve intake evidence and do not invent acceptance, design, priority, or delivery authorization |

## License

The pack's own metadata and README are licensed under MIT. Each member retains
the license declared in its manifest. See the repository for source attribution
and provenance.
