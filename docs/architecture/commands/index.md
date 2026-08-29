# AXM command architecture

Navigation for the durable responsibilities and boundaries of AXM commands.
The executable specifications under `specifications/cli/`, reached through the
[specification catalog](../../../specifications/catalog.md), own required
command behavior; these documents own the detailed command architecture
response.

- [Overview](overview.md) — command families, shared lifecycle behavior,
  interaction, overrides, and recovery boundaries
- [Install](install.md) — direct extension intent and initial realization
- [Update](update.md) — resolution advancement, constraint changes, and
  reinstall
- [Uninstall](uninstall.md) — direct-intent removal and reachability-based
  retention
- [Lint](lint.md) — fact-only diagnostics and meaning-preserving normalization
- [Sync](sync.md) — reconciliation of managed current state with desired state
- [Authoring](authoring.md) — creation, conversion, defaults, activation, and
  publication-readiness boundaries for workspace-authored extensions
- [Publish](publish.md) — validation and distribution of authored extensions
- [Packs](packs.md) — commands that edit authored pack membership
- [CLI help](help.md) — help surfaces, resolution, authority, discoverability,
  and verification
- [CLI output](output.md) — human and machine surfaces, channel boundaries, and
  contract authority
