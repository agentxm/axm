# Agent extension engineering

Design and improve extensions for your agent. The pack pairs a routing skill
with guides and patterns on choices such as when to split a skill, scope an instruction,
or use a hook.

```sh
axm install @agentxm/packs/agent-extension-engineering
```

Start with `$axe ./skills/quality` to review a skill or
`$axe design a way to remind contributors to run package checks`
to design an extension. Use `create`, `revise`, or `verify` when you want an
authored draft, a bounded change, or evidence about behavior.

Try asking “Two of our skills both activate on ‘review this change.’ Should we
narrow their descriptions or combine them?” The guide to sets of extensions
helps you trace a change across both skills and try requests that need one
or both.

“Review everything we author here” includes disabled extensions and looks for
shared decisions across the collection. “Why do contributors get two notes on
save?” starts from the extensions involved in that host event, including ones
acquired from elsewhere. “Does our release pack provide the promised first
use?” starts from what a clean consumer gets by installing the pack.

“Review our AXM setup for a new contributor” follows a task from the shared
configuration to the contributor's host. Axe assesses whether the arrangement
serves that task. “How should we handle extension drift after a branch switch?”
helps the team decide when to report drift, when to reconcile, and how to verify
the result in the contributor’s host. The AXM skill and CLI supply workspace state and handle
authorized configuration changes.

Upgrading from the plural-named pack? See the [migration notes](CHANGELOG.md#migration).
