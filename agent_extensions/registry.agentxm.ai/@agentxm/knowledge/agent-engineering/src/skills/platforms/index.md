# Host and extension-management profiles

Two independent layers adapt the portable core: agent hosts own discovery and
invocation behavior, while extension managers own canonical packages,
projection, composition, distribution, and lifecycle.

Apply [Portability and compatibility](../portability-and-compatibility.md) to
the named product, execution surface, edition, and release. These profiles
explain authoring implications. The
[Agent Capability Catalog](https://github.com/agentxm/axm/blob/main/packages/core/extension-model/src/unstable/agent-capabilities/data/agents/README.md)
owns the changing per-agent inventory, identity and lifecycle qualifications,
native readers, AXM writers, and installation conditions. Consult its reviewed
sources and release reference instead of treating a vendor profile as a current
compatibility matrix.

- [Portable Agent Skills core](portable-agent-skills-core.md) - The cross-host
  package and progressive-disclosure contract defined by the open specification.
- [AXM extension-management profile](axm.md) - How AXM manages canonical
  packages, projections, composition, workspace state, validation, distribution,
  and lifecycle across agent extension types.
- [Claude skill profile](claude.md) - Claude-specific authoring, evaluation,
  runtime, and enterprise review guidance layered on the portable core.
- [OpenAI skill profile](openai.md) - OpenAI-specific discovery, invocation,
  metadata, and distribution behavior layered on the portable core.
- [GitHub Copilot and VS Code skill profile](copilot.md) - Copilot-specific
  locations, invocation controls, forked context, and plugin behavior layered on
  the portable core.
- [Gemini CLI skill profile](gemini-cli.md) - Gemini CLI discovery tiers,
  consent, management, and extension behavior layered on the portable core.
