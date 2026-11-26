# Software maintenance

Seven standalone skills for explicit maintenance: assess, stabilize, refresh, prune, simplify, modularize, and improve.

Keep software dependable, supportable, understandable, and economical to change
by selecting worthwhile maintenance, preserving live obligations, and verifying
the resulting benefit. The pack supports correction, adaptation, prevention,
and improvement across code and its supporting machinery.

Each skill is self-contained and individually installable. The pack supplies
selection and sequencing guidance; it does not automatically run its members
or require a repository-wide assessment before a bounded change.

## Install

```bash
axm install @craigsmitham/packs/software-maintenance
```

Install an individual skill when only its outcome is needed:

```bash
axm install @craigsmitham/skills/modularize
```

## Choose an outcome

All seven identities are under `@craigsmitham/skills/`.

| Skill | Choose it when… | Desired outcome |
| --- | --- | --- |
| `assess` | You need to choose worthwhile maintenance in a bounded scope. | Evidence-supported priorities, prerequisites, and visible uncertainty; assessment only. |
| `stabilize` | Behavior, tests, builds, or environments are unreliable or materially weak. | Corrected failures or weaknesses and trustworthy evidence of the correction. |
| `refresh` | Dependencies, platforms, toolchains, or external contracts are changing. | A supportable, compatible configuration and completed justified migrations. |
| `prune` | Elements no longer justify their continued presence. | A smaller, coherent system that preserves remaining obligations. |
| `simplify` | Retained capabilities require unnecessarily burdensome machinery. | Less total maintenance burden through direct implementation, suitable reuse, or consolidation. |
| `modularize` | Responsibilities are entangled and changes spread across unrelated concerns. | Cohesive responsibilities that can evolve independently. |
| `improve` | A selected quality could better serve users, maintainers, or operators. | A worthwhile gain supported by comparison with a relevant baseline. |

Stabilization restores dependable behavior or feedback; improvement advances a
selected quality. Refresh responds to an evolving environment. Pruning removes
expendable elements, simplification reduces the burden of retained capabilities,
and modularization improves independent change. Their techniques may overlap;
the requested outcome determines scope and completion.

## Ask for opportunities or action

Name the scope and the outcome or constraints that matter. A question about
opportunities requests findings and recommendations. A request to make a change
requests implementation and verification within that scope. Mentioning a skill
in an opportunity question does not authorize edits.

| Find opportunities | Direct request |
| --- | --- |
| `What maintenance opportunities does $assess identify in our checkout flow?` | `$assess our checkout flow and recommend the next maintenance priority` (assessment only) |
| `Where could we $stabilize our build and test pipeline?` | `$stabilize the intermittent failures in our build and test pipeline` |
| `What opportunities do we have to $refresh our runtime and dependencies?` | `$refresh our runtime and dependencies to a compatible supported configuration` |
| `What could we safely $prune from our legacy import pipeline?` | `$prune the retired importer and its exclusive supporting machinery` |
| `Where could we $simplify our configuration system?` | `$simplify the configuration system while preserving supported overrides` |
| `What opportunities do we have to $modularize the billing area of our app?` | `$modularize billing so pricing changes remain independent of delivery details` |
| `How could we $improve the importer's memory use?` | `$improve the importer's memory use without sacrificing required throughput` |

Each member preserves explicit-only invocation. Codex receives
`policy.allow_implicit_invocation: false` in `agents/openai.yaml`; the skill
frontmatter also declares `disable-model-invocation: true` for hosts supporting
that setting. Use the host's direct skill invocation control as appropriate.

## Maintenance practice

The default loop is: assess the need, establish sufficient confidence, perform
a bounded intervention, verify the benefit, and reconsider the remaining work.
Enter at the point justified by the task. Urgent failures may take precedence;
an understood local change may need only brief assessment.

The [maintenance guide](guides/maintaining-a-codebase.md) explains conditional
sequencing, prioritization, recurring use, and completion. It is optional reader
guidance. Each installed skill carries its own essential decision criteria and
does not depend on this README or another skill being available.

Across the pack, a useful result:

- Preserves applicable requirements, intended behavior, and live obligations.
- Addresses a concrete risk, recurring burden, lifecycle change, or quality goal.
- Accounts for transition, operating, coupling, and ownership costs.
- Uses evidence proportionate to the intervention and the claim.
- Completes affected configuration, tests, documentation, and transitional work.
- Distinguishes demonstrated gains, expected benefits, and unresolved uncertainty.

A justified no-change result is successful. Structural checks and source
review establish bounded properties of the packages; they do not prove the
skills' behavioral effectiveness or guarantee codebase health.

## Companion skills and migration

`align`, `reconcile`, `reuse`, and `generalize` remain independently available.
Alignment constrains maintenance; reconciliation resolves shared meaning;
reuse targets capability substitution; generalization serves concrete intended
cases. `spot-spew` remains a narrower assessment of avoidable maintenance burden.
These companions are not dependencies of this pack.

Version 0.2.0 replaces four members of the 0.1.0 pack. See the
[changelog](CHANGELOG.md) for exact membership and retention instructions.
Existing direct installations can retain companion skills independently of
pack membership. The discipline packs and their knowledge remain separately
scoped; this pack does not rely on their placeholder skills.

## Sources and rationale

This is an original synthesis of complementary practices:

- [SWEBOK: Software Maintenance](https://swebokwiki.org/Chapter_5:_Software_Maintenance)
  informs the breadth of maintenance and its migration and retirement concerns.
- [SEI's technical-debt recommendations](https://www.sei.cmu.edu/blog/5-recommendations-to-help-your-organization-manage-technical-debt/)
  inform visibility, prioritization, tradeoffs, and contextual measures.
- [DORA's test automation](https://dora.dev/capabilities/test-automation/) and
  [small batches](https://dora.dev/capabilities/working-in-small-batches/)
  inform trustworthy feedback and bounded interventions.
- [NIST SSDF](https://csrc.nist.gov/projects/ssdf) informs security maintenance
  and learning from root causes.
- [Software Engineering at Google](https://abseil.io/resources/swe-book)
  informs dependency management, deprecation, and consumer migration.

The original pack drew organizational inspiration from
[Peter Drucker's renewal practices](https://drucker.institute/wp-content/uploads/2018/08/Reading_Drucker-on-Creating-an-Innovative-Culture.pdf).
That inspiration remains relevant to purposeful abandonment and improvement.
The seven-skill composition and sequencing are this pack's design, not a
framework attributed to Drucker or an empirically established optimal set.
Each member's README explains its own sources and their limits.

## License

The pack metadata and documentation are MIT-licensed. Each member retains its
declared license. Linked sources retain their respective rights; no source text
or code is vendored here.
