# Tidy First rule

Prompts agents to consider a small behavior-preserving structural change before
an authorized behavior change when doing so materially reduces difficulty or
risk. It preserves the question mark in Kent Beck's formulation: first, after,
later, and never can all be responsible outcomes.

The injected rule stays deliberately concise and links to the fuller Tidy First
pattern in the software-engineering knowledge bundle. It is not standalone;
install the pack that provides both extensions:

```bash
axm install @craigsmitham/packs/software-engineering
```

For example, an agent changing two distant functions may first move them
together in a behavior-preserving commit when that makes the requested change
safer and easier to review.

The rule is original guidance informed by Kent Beck's *Tidy First?* and Martin
Fowler's Preparatory Refactoring. It is licensed under MIT.
