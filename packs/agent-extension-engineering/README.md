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
narrow their descriptions or combine them?” The skill selects the authoring
guide and helps you decide based on the inputs and results of each skill.

Upgrading from the plural-named pack? See the [migration notes](CHANGELOG.md#migration).
