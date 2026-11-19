# Extension engineering guides

Choose the task you are working on.

## Choose and compose

Start with the boundary guide for one capability, the set guide for shared
ownership or a host interaction, and the pack guide for a consumer's installation.
For “can a new contributor do this from a fresh checkout?”, start with workspace setup.

- [Choosing extension boundaries](choosing-extensions.md) — Choose an extension type based on when and where the behavior should apply.
- [Designing and reviewing sets of extensions](extension-sets.md) — Trace a change and a request to decide which extensions should evolve independently, work together, or ship together.
- [Composing extension packs](composing-packs.md) — Choose pack members and compatible versions from the job a clean installation must support.
- [Designing and reviewing a workspace setup](workspace-setup.md) — Trace a user's workflow through the capabilities, scopes, and hosts that the workspace supplies.

## Author the selected surface

- [Writing an extension README](authoring-readme.md) — Choose an example and the details a reader needs to decide whether to install an extension and try it.
- [Authoring and revising skills](authoring-skills.md) — Design or revise a skill from a concrete use case, including how it gets invoked and how it chooses a procedure.
- [Authoring extension knowledge](authoring-knowledge.md) — Design concepts for browsing and search, and decide when a worked example supports a reusable pattern.
- [Authoring agent definitions](authoring-agent-definitions.md) — Decide when to delegate and what the caller must supply for the role to work independently.
- [Configuring hooks and MCP connections](configuring-hooks-and-mcp.md) — Decide how a hook should handle failure or what access an MCP connection needs.

## Review, verify, and maintain

- [Reviewing and remediating extensions](reviewing-extensions.md) — Review an extension for issues, improvements, and pruning opportunities, then verify the changes the user selects.
- [Verifying extension behavior](verification.md) — Choose evidence for a claim about packaging, routing, runtime behavior, portability, or improvement.
- [Bounding extension trust and authority](trust-and-authority.md) — Review how a change affects what an extension can read, execute, or send.
- [Publishing and retiring extensions](lifecycle.md) — Choose release contents, revisit guidance when upstream contracts change, and plan consumer migrations.
