# Codebase renewal

Five standalone skills for codebase renewal: align with guidance, prune unnecessary elements, improve quality, generalize capabilities, and experiment to reduce uncertainty.

Codebase renewal keeps software useful as requirements, knowledge, and
circumstances change. This pack brings together five concise, outcome-focused
skills. Each defines the desired result while leaving methods to the caller
and model. Use them independently or combine them as the work requires; the
pack prescribes no execution order.

## Install

```bash
axm install @craigsmitham/packs/codebase-renewal
```

Each skill remains self-contained and individually installable. For example:

```bash
axm install @craigsmitham/skills/improve
```

The pack installs its members together. It adds no orchestrating skill,
automatic execution, or requirement for one skill to invoke another.

## Choose a skill

All five skills are published under `@craigsmitham/skills/`.

| Skill | Choose it when… | Desired outcome |
| --- | --- | --- |
| `align` | Requirements or guidance have changed, or implementation has drifted. | The codebase satisfies applicable requirements and reflects relevant guidance. |
| `prune` | Elements no longer justify their continued presence. | A smaller, coherent system with less maintenance burden. |
| `improve` | Existing software could better serve its intended purpose. | Worthwhile, evidence-backed gains in relevant qualities. |
| `generalize` | Related cases should benefit from an existing capability. | Broader applicability through coherent commonality and appropriate variation. |
| `experiment` | An engineering decision depends on an uncertain assumption. | Empirical evidence that reduces uncertainty and informs the decision. |

## Usage

Name the relevant scope and the outcome or constraints that matter. For example:

```text
$align src/api/ with the updated error-handling requirements
$prune obsolete build configuration while retaining supported release targets
$improve the importer's memory use without sacrificing required throughput
$generalize the exporter to support the additional formats in the specification
$experiment whether incremental parsing can meet the editor's latency budget
```

Work can begin with whichever outcome is needed. An uncertain design decision
may call for an experiment before an improvement. Changed requirements may
call for alignment, with removal of superseded machinery where obligations
permit. A well-scoped task may need only one skill. These are examples of
composition, not a required sequence or an instruction to invoke all five.

## Philosophy

Renewal is purposeful change in relation to what software is for and what it
must continue to support. A useful result can involve removing something,
improving a quality, extending applicability, satisfying changed guidance, or
learning that a proposed change is not worthwhile.

The skills share a concern for context, live obligations, and claims supported
by appropriate evidence. They have distinct outcomes, even when their
techniques overlap. Conformance does not by itself establish improved quality;
broader applicability does not establish that every new case is valuable; a
working experiment does not establish production suitability.

The pack's organizing inspiration is Peter Drucker's treatment of renewal
through abandonment, continuing improvement, exploitation of success, and
systematic innovation. The software mapping is this pack's synthesis:

- Pruning closely corresponds to systematic abandonment.
- Improving closely corresponds to continuing improvement.
- Generalizing can enable new applications of proven capabilities, supporting
  exploitation of success.
- Experimenting supplies learning that can support systematic innovation;
  innovation also requires creating and realizing value.
- Aligning adds conformance as requirements and guidance change.

This is not a claim that Drucker proposed five software practices or a fixed
renewal cycle. The pack supplies a vocabulary of useful outcomes and convenient
installation. The caller and model retain judgment about methods, priorities,
sequence, and the extent of change.

## Sources and inspiration

- **Peter Drucker — [Drucker on Creating an Innovative
  Culture](https://drucker.institute/wp-content/uploads/2018/08/Reading_Drucker-on-Creating-an-Innovative-Culture.pdf).**
  This Drucker Institute reading adapts “Management's New Paradigms” and
  *Innovation and Entrepreneurship*, presenting four ongoing entrepreneurial
  activities. It supplies the organizational inspiration described above.
- **Engineering foundations:** each member's package README credits the
  sources behind its own definition and explains the limits of that synthesis:
  [align](https://agentxm.ai/@craigsmitham/skills/align),
  [prune](https://agentxm.ai/@craigsmitham/skills/prune),
  [improve](https://agentxm.ai/@craigsmitham/skills/improve),
  [generalize](https://agentxm.ai/@craigsmitham/skills/generalize), and
  [experiment](https://agentxm.ai/@craigsmitham/skills/experiment).

The pack's explanatory prose is original. Linked sources retain their respective
rights; no source text or code is vendored here.

## License

The pack metadata and README are MIT-licensed. Each included skill retains the
license declared in its own manifest.
