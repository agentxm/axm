# Effect v4 checklists

Install this standalone bundle to look up design and review checklists for
TypeScript projects using Effect 4.1.4 or later in the 4.x line.

```sh
axm install @craigsmitham/knowledge/effect
```

When reviewing a connection that must close even if a fiber is interrupted,
open the resource safety checklist. Use it to identify who owns the
connection and how its finalizer runs.

```sh
axm knowledge concepts get '@craigsmitham/knowledge/effect#resource-safety'
```

Browse the [bundle index](src/index.md) for other topics. The
[Effect pack](https://github.com/craigsmitham/agent-extensions/tree/main/packs/effect)
adds a workspace rule requiring Effect v4 for TypeScript applications and scripts.
