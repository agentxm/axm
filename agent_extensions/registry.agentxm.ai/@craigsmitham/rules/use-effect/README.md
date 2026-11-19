# Use Effect

Install this rule in a workspace that has chosen Effect v4 as the foundation
for all TypeScript, including applications and scripts.

```sh
axm install @craigsmitham/rules/use-effect
```

With the rule active, ask the agent to add a retry to an existing TypeScript
job. Expect it to use Effect v4 for the change and migrate the relevant job
code incrementally while preserving its intended behavior.

The [Effect pack](https://github.com/craigsmitham/agent-extensions/tree/main/packs/effect)
installs this rule together with the Effect checklists. To consult checklists
without adopting the workspace rule, install `@craigsmitham/knowledge/effect`
on its own.
