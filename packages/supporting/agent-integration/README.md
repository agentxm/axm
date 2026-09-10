# @agentxm/agent-integration

Everything AXM knows about a coding agent's native surfaces:

- **Detection** — project- and user-scope marker evidence and executable
  resolution for installed AI coding agents.
- **Path primitives** — home and config directories, catalog-derived agent
  install paths.
- **Coding-agent adapters** — the per-agent `CodingAgent` contract: skills
  directory resolution, MCP entry add/remove, subagent publication.
- **Native formats** — subagent rendering (Markdown+YAML, TOML, JSON, Roo
  modes), MCP entry projection and config writing across JSON/JSONC/YAML/TOML,
  hook-group JSON editing, agent override merge patches, and the versioned
  ownership marker grammar those writers stamp into managed files.

The package depends only on `@agentxm/extension-model`, so every input crosses
as plain data: a rendered MCP entry, an ownership metadata record, a generation
token, banner text. Native writes go through the `NativeWriteAuthority` port
(`protect`, `record`); a core capability supplies the layer that joins it to
the enclosing workspace transaction, so a target that cannot be snapshotted is
refused before it is mutated. Environment-backed layers live behind `./live`
and test doubles behind `./testing`.

Unstable and unsupported — use the [axm.sh](https://axm.sh) CLI.
