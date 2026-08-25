# YAGNI rule

Keeps agents from adding capability, structure, process, or scope before a
present need justifies the commitment. It applies across the software delivery
lifecycle while preserving current quality obligations and options that would
be costly to recover.

The injected rule stays deliberately concise and links to the fuller YAGNI
principle in the software-engineering knowledge bundle. It is not standalone;
install the pack that provides both extensions:

```bash
axm install @craigsmitham/packs/gen-stack
```

For example, an agent asked to add one authentication provider should avoid
building an unused provider framework unless a present contract or concrete
constraint requires it.

The rule is original guidance informed by Kent Beck's writing on YAGNI and
Martin Fowler's account of YAGNI, Simple Design, and incremental design. It is
licensed under MIT.
