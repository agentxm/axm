# simplify

Simplify retained software capabilities through more direct implementation, suitable reuse, and appropriate consolidation.

Use this skill when useful capabilities require unnecessarily burdensome
implementation. The self-contained [skill](src/SKILL.md) weighs alternatives
against actual contracts and total maintenance cost.

## Usage

Invoke directly with the scope, burden, and obligations that matter.
Automatic model invocation is disabled through the supported native settings.

An opportunity question requests findings and recommendations without edits:

```text
What opportunities do we have to $simplify our configuration system?
```

A direct change request asks for implementation and verification:

```text
$simplify the importer using the capabilities of our adopted parser
$simplify the configuration pipeline while preserving supported overrides
$simplify this shared abstraction so independent policies can remain independent
```

## Boundaries and evidence

Pruning decides what can disappear; simplification reduces the burden of
retained capabilities. Modularization improves independent change and can
justify additional structure. The requested outcome determines the task even
when the techniques overlap.

Suitable reuse and consolidation are options. Similar code can express
different rules, and separate representations can serve different audiences.
An abstraction with accumulated exceptions may be simpler when narrowed or
inlined. Broader applicability requires concrete intended cases.

Compare the result with retention, accounting for transition effort, consumer
coupling, operations, and ownership. Fewer lines or dependencies do not establish
benefit if complexity moves elsewhere. A useful result explains what became
easier to understand, maintain, or operate, with proportionate evidence and
visible uncertainty.

The standalone `reuse` and `reconcile` skills remain useful for narrower
requests. This skill requires neither to be installed or invoked.

## Sources and inspiration

- [Fowler's YAGNI](https://martinfowler.com/bliki/Yagni.html) informs the costs
  of speculative capabilities while preserving investment in changeability.
- [Metz's The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
  informs useful duplication and removal of abstractions that entangle policies.
- [Google's dependency-management guidance](https://abseil.io/resources/swe-book/html/ch21.html)
  informs contractual fit and ongoing costs of reuse.
- [Fowler's refactoring workflows](https://martinfowler.com/articles/workflowsOfRefactoring/fallback.html)
  inform small, verifiable structural changes.

The instructions are an original synthesis. The sources do not establish a
universal preference for fewer abstractions or prove this skill's effectiveness.

## License

MIT. Linked sources retain their respective rights; no source text or code is
vendored in this package.
