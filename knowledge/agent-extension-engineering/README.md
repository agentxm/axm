# Agent extension engineering knowledge

Browse the [engineering principle, guides, patterns, and glossary](src/index.md) when choosing, writing, or
reviewing an extension. For example, [Choosing extension boundaries](src/guides/choosing-extensions.md)
helps you decide whether a task calls for a skill, scoped instructions, or a hook.

For direct lookup, install the knowledge bundle. For example, to find out what
this collection means by an “open agent,” read the glossary.

```sh
axm install @agentxm/knowledge/agent-extension-engineering
axm knowledge concepts get '@agentxm/knowledge/agent-extension-engineering#glossary'
```

To have Axe select the relevant concept from your request, install the pack.

```sh
axm install @agentxm/packs/agent-extension-engineering
```

The extension-focused guidance adapts concepts from the published
`@agentxm/knowledge/agent-engineering@0.11.0` (AgentXM, CC-BY-4.0),
with revised scope, organization, and procedures. The skill and instruction
authoring workflows also draw on `@agentxm/skills/agent-skills@0.2.0`
and `@agentxm/skills/agent-instructions@0.2.0` (AgentXM, MIT).
