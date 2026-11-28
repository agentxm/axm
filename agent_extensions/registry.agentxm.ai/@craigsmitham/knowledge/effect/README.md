# Effect v4 checklists

These design and review checklists cover TypeScript targeting Effect 4.1.4
or later in the 4.x line. Install the standalone bundle in the workspace
where you want to consult them.

```sh
axm install @craigsmitham/knowledge/effect
```

If AXM prompts for project setup, select the agents that should discover the
bundle and enable instruction syncing to give them its lookup route. For
command-line lookup alone, you can leave the agent selection empty.

When reviewing a connection that must close even if a fiber is interrupted,
open the resource safety checklist. Use it to identify who owns the
connection and how its finalizer runs.

```sh
axm knowledge concepts get '@craigsmitham/knowledge/effect#resource-safety'
```

Browse the [bundle index](src/index.md) for other topics. The
[Effect pack](https://github.com/craigsmitham/agent-extensions/tree/main/packs/effect)
adds a workspace rule requiring Effect v4 for TypeScript applications and scripts.
