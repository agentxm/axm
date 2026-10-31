# experiment

Experiment within a codebase or a specified scope to reduce uncertainty about an engineering question through empirical evidence.

Use this skill when an engineering decision depends on an uncertain assumption,
feasibility question, or expected effect. The concise [skill](src/SKILL.md)
defines useful empirical learning, leaving experimental methods to the caller
and model.

## Usage

Name the question, the decision it informs, and any relevant constraints. For
example:

```text
$experiment whether streaming can meet the importer's memory limit on large inputs
$experiment whether the candidate parser handles our required syntax before we adopt it
$experiment whether batching improves throughput without unacceptable latency
```

## Philosophy

The outcome is evidence that improves an engineering decision. An idea can be
unsupported, infeasible, or harmful and the experiment can still have produced
valuable learning. An inconclusive result is legitimate when the observations
cannot support a stronger conclusion; it should explain what remains unknown.

Peter Drucker's systematic innovation provides the organizational motivation.
Empirical investigation supports that practice by testing uncertain ideas.
Innovation also requires creating and realizing value, so completing an
experiment does not by itself establish that an innovation has succeeded.

An experiment connects a consequential question or hypothesis to observations
capable of informing it. Research and reasoning can shape the inquiry; the
experiment contributes evidence from a trial or observation of relevant system
behavior. Technical spikes, feasibility trials, comparative benchmarks, and
controlled product experiments are possible methods. None is mandatory.

Claims remain bounded by the conditions examined. A successful demonstration
does not establish production suitability, and a favorable result on one
workload does not establish a universal advantage. The relevant question,
expected signals, and criteria for interpreting them should be clear enough
that an unfavorable result can challenge the idea. Data quality, adverse
effects, and alternative explanations affect what the findings support.

The decision's stakes and the user's constraints determine how much evidence
is useful. The skill does not require a particular statistical method, fixed
timebox, or certainty beyond what the evidence permits. Missing access or
unreliable observations should remain visible as limits rather than become
invented results.

Experimental artifacts have an explicit status. They may be disposable or
retained as evidence or a starting point, according to the task. Their existence
does not make them production implementations or imply permission to deploy
them. This skill defines an outcome, not an additional grant of operational
authority or a mandatory reporting template.

## Sources and inspiration

The wording is an original synthesis of these perspectives; their procedures
are not incorporated as a required workflow.

- **Peter Drucker — [Drucker on Creating an Innovative
  Culture](https://drucker.institute/wp-content/uploads/2018/08/Reading_Drucker-on-Creating-an-Innovative-Culture.pdf),
  a Drucker Institute adaptation of “Management's New Paradigms” and
  *Innovation and Entrepreneurship*.** Presents systematic innovation as an
  ongoing organizational practice. This motivates the skill; the translation
  into a bounded engineering experiment is this package's synthesis.
- **James Shore and Shane Warden — [Spike
  Solutions](https://www.jamesshore.com/v2/books/aoad2/spike_solutions),
  *The Art of Agile Development*, second edition.** Describes small technical
  experiments that inform decisions and distinguishes them from the beginnings
  of a production implementation. This informs the learning outcome and the
  status of experimental artifacts; the skill does not require every
  experiment to use disposable code.
- **Barry O'Reilly / Thoughtworks — [How to Implement Hypothesis-Driven
  Development](https://www.thoughtworks.com/en-us/insights/articles/how-implement-hypothesis-driven-development).**
  Connects proposed capabilities, expected outcomes, and observable signals.
  This informs decision-relevant evidence and explicit assumptions. The skill
  uses bounded support and uncertainty rather than treating an observed outcome
  as proof that a theory is universally correct.
- **Microsoft Research — [Patterns of Trustworthy Experimentation:
  Pre-Experiment Stage](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/articles/patterns-of-trustworthy-experimentation-pre-experiment-stage/)
  and [During-Experiment
  Stage](https://www.microsoft.com/en-us/research/articles/patterns-of-trustworthy-experimentation-during-experiment-stage/).**
  Addresses trustworthy data, interpretation, and detection of unintended
  regressions in online controlled experiments. These inform the skill's
  evidence limits and attention to adverse effects; its scope extends beyond
  A/B testing and does not mandate Microsoft's metrics or infrastructure.

## License

MIT. The linked sources retain their respective rights; no source text or code
is vendored in this package.
