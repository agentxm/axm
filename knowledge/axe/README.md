# Agent Extension Engineering

Browse the [engineering principle, guides, patterns, and glossary](src/index.md) when choosing, writing, or
reviewing an extension. For example, [Choosing extension boundaries](src/guides/choosing-extensions.md)
helps you decide whether a task calls for a skill, scoped instructions, or a hook.

Install the pack to have AXE choose the relevant concept for a request.

```sh
axm install @agentxm/packs/axe
```

For direct lookup, install the standalone knowledge bundle. For example, to find out what
this collection means by an “open agent,” read the glossary.

```sh
axm install @agentxm/knowledge/axe
axm knowledge concepts get '@agentxm/knowledge/axe#glossary'
```

The extension-focused guidance adapts concepts from the published
`@agentxm/knowledge/agent-engineering@0.11.0` (AgentXM, CC-BY-4.0),
with revised scope, organization, and procedures. The skill and instruction
authoring workflows also draw on `@agentxm/skills/agent-skills@0.2.0`
and `@agentxm/skills/agent-instructions@0.2.0` (AgentXM, MIT).
