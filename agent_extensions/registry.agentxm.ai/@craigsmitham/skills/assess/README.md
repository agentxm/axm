# assess

Assess maintenance health and prioritize worthwhile interventions in a codebase or specified scope; assessment only.

Use this skill to decide where maintenance effort would be most valuable. The
self-contained [skill](src/SKILL.md) covers relevant behavior, security,
verification, lifecycle, structure, operational, and knowledge concerns while
keeping findings bounded to the requested scope and available evidence.

## Usage

Invoke directly with the scope, intended changes, and limits that matter.
Automatic model invocation is disabled through the supported native settings.

```text
What maintenance opportunities does $assess identify in the checkout area of our app?
$assess this repository for the most valuable maintenance before our next release
$assess src/importers/ for recurring failure risk and unnecessary upkeep
$assess our build and test pipeline; prioritize reliable feedback
```

## Judgment and result

A supported finding connects evidence to a consequential burden or risk,
identifies obligations to preserve, and weighs a plausible response against
retention. Transition effort, uncertainty, consumer impact, and ongoing costs
affect priority. Metrics and smells guide investigation without determining
the verdict. Defects, vulnerabilities, and technical debt remain distinguishable
even when they share a cause.

The result selects worthwhile interventions and their prerequisites, separating
supported findings from investigation candidates. It makes assessed and
unassessed areas visible and accepts that no intervention may be justified.
It does not modify the subject, create tickets, or start implementation.

`spot-spew` remains a narrower assessment of avoidable maintenance burden.
`assess` applies compatible evidence requirements across a broader health
scope. Neither requires the other to be installed.

## Sources and inspiration

- [SEI's technical-debt recommendations](https://www.sei.cmu.edu/blog/5-recommendations-to-help-your-organization-manage-technical-debt/)
  inform visibility, prioritization, tradeoffs, and contextual measurement.
- [SWEBOK's maintenance chapter](https://swebokwiki.org/Chapter_5:_Software_Maintenance)
  informs coverage of correction, adaptation, prevention, migration, and retirement.
- [NIST SSDF](https://csrc.nist.gov/projects/ssdf) informs risk-based security
  maintenance and prevention of recurring weaknesses.
- [DORA's test-automation guidance](https://dora.dev/capabilities/test-automation/)
  informs the quality and upkeep of engineering feedback.
- [Google SRE's account of toil](https://sre.google/sre-book/eliminating-toil/)
  informs investigation of recurring operational work.

These sources inform an original synthesis, not a comprehensive audit standard
or a validated scoring model. Evidence from actual use determines the limits
of any claim about this skill's effectiveness.

## License

MIT. Linked sources retain their respective rights; no source text or code is
vendored in this package.
