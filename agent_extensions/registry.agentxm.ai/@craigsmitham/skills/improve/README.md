# improve

Improve a codebase or a specified part with evidence-backed gains in fitness for its intended purpose.

Use this skill when existing software could better serve its users, maintainers,
or operators. The concise [skill](src/SKILL.md) defines worthwhile improvement
and the evidence supporting it, leaving the method to the caller and model.

## Usage

Name the scope, priorities, and any relevant constraints. For example:

```text
$improve this codebase's maintainability while preserving supported behavior
$improve src/search/ for latency without increasing its memory budget
$improve the clarity and usefulness of errors in the import workflow
```

## Philosophy

Improvement is relative to an intended purpose, a starting point, and the people
the system serves. Reliability, performance, usability, maintainability, and
operability can all matter; their importance depends on context. A change is
worthwhile when its benefits justify its costs and tradeoffs, including any
additional complexity or ongoing maintenance burden.

Peter Drucker's continuing improvement provides the organizational inspiration.
Perfective maintenance and software quality engineering supply the closer
engineering foundations. The skill applies that perspective to a bounded
software scope; it does not claim to implement an organization's entire
continuous improvement program.

Evidence should fit the claim. Performance claims need relevant measurements;
maintainability claims may use concrete design reasoning about dependencies,
change effort, or comprehensibility. Passing tests can support preservation of
behavior without establishing that a design is better. An available metric or
personal stylistic preference does not establish a benefit by itself.

Required behavior and existing obligations remain constraints. Preserving every
observed behavior would also preserve defects, so the skill distinguishes what
the system does today from what it must continue to do. Changes remain tied to
the user's intent and the system's intended purpose; a broad request to improve
does not establish a new product direction.

Worthwhile progress is a sufficient outcome. The skill does not demand
perfection, prescribe a quality score, or require changes when no justified
improvement is available. It leaves discovery, prioritization, implementation,
verification methods, and presentation to the caller and model.

## Sources and inspiration

The wording is an original synthesis of these perspectives; their procedures
are not incorporated as a required workflow.

- **Peter Drucker — [Drucker on Creating an Innovative
  Culture](https://drucker.institute/wp-content/uploads/2018/08/Reading_Drucker-on-Creating-an-Innovative-Culture.pdf),
  a Drucker Institute adaptation of “Management's New Paradigms” and
  *Innovation and Entrepreneurship*.** Places systematic, continuing
  improvement alongside abandonment, exploitation of success, and innovation.
  This supplies the renewal philosophy behind the skill.
- **SWEBOK — [Software Maintenance](https://swebokwiki.org/Chapter_5:_Software_Maintenance),
  especially “Categories of Maintenance.”** Describes perfective maintenance
  as improving software attributes and providing enhancements. This supports
  a scope broader than internal restructuring alone.
- **ISO/IEC 25010:2023 — [Product quality
  model](https://committee.iso.org/cms/live/live/en/sites/isoorg/contents/data/standard/07/81/78176.html).**
  Its public abstract describes a multidimensional model for specifying and
  evaluating product quality. This informs context-dependent quality goals;
  the skill does not reproduce the standard or claim conformance to it.
- **Victor Basili, Gianluigi Caldiera, and H. Dieter Rombach — [Goal
  Question Metric Paradigm](https://www.cs.umd.edu/~basili/publications/technical/T89.pdf).**
  Connects measurement to goals and their interpretation in context. This
  informs evidence chosen for the intended benefit rather than goals chosen
  because a metric is easy to collect.
- **Google — [The Standard of Code
  Review](https://google.github.io/eng-practices/review/reviewer/standard.html).**
  Favors improvements in overall code health without demanding perfection and
  distinguishes engineering grounds from personal preference. This informs
  worthwhile progress and justified claims of improvement.

## License

MIT. The linked sources retain their respective rights; no source text or code
is vendored in this package.
