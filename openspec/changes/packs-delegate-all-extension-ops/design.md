## Context

Pack operations currently treat the three extension types (skills, commands, MCP servers) inconsistently:

- **Skills** have full install/uninstall operation handlers, but pack install never generates install-skill ops (`skillOps: []` is always passed to the plan builder). Pack uninstall delegates skill removal via plan steps (from the `packs-uninstall-delegate-skill-removal` change).
- **Commands and MCP servers** have only publish operations. No install/uninstall handlers exist. They're tracked in pack lock entries (`resolvedCommands`, `resolvedMcpServers`) as metadata but never installed to disk or managed independently. The settings schema supports them (`commands` and `mcp-servers` optional maps), but no workspace service methods exist.
- **Unpack** does inline `ws.setSkill()` calls with fabricated lock entries (empty integrity), bypassing the install pipeline.

The pack install plan type already declares a union (`PackInstallOp = InstallPackOperation | InstallSkillOperation`) and registers both handlers in `resolvePlan`, but the handler never builds skill ops. The infrastructure for delegation exists; it just isn't wired.

## Goals / Non-Goals

**Goals:**

- Pack install plan emits install operations for all resolved extensions (skills, commands, MCP servers)
- Pack uninstall plan emits uninstall operations for orphaned commands and MCP servers (extending the existing skill pattern)
- Pack unpack uses a plan with explicit install operations followed by pack removal
- New install/uninstall operation handlers for commands and MCP servers
- Workspace service gains methods for command and MCP server management
- Lockfile gains top-level entries for commands and MCP servers

**Non-Goals:**

- Standalone `axm commands install` or `axm mcp-servers install` CLI commands (only via packs for now)
- Agent symlinks for commands or MCP servers (they're workspace-level, not agent-level)
- Per-extension integrity values in pack manifests (use empty integrity to skip validation)
- Changing the `packs-uninstall-delegate-skill-removal` change (it handles skill uninstall delegation independently)

## Decisions

### 1. Command and MCP server operation handlers (simpler than skills)

Commands and MCP servers are workspace-level extensions — no agent symlinks needed. Their install/uninstall handlers are significantly simpler than the skill equivalents:

**Install:**

1. Fetch archive from registry (via `SourceHostProviders.fetch`)
2. Extract to canonical location (`.axm/extensions/@namespace/commands/<name>/` or `.axm/extensions/@namespace/mcp-servers/<name>/`)
3. Update lockfile entry
4. Update settings entry (unless `skipSettings: true` for pack dependencies)

**Uninstall:**

1. Remove canonical directory from disk
2. Remove lockfile entry
3. Remove settings entry

Follow the existing skill operation patterns for args shape, result type, and error handling.

**Why over adding agent symlinks:** Commands and MCP servers don't execute per-agent. They're workspace-level resources. Only skills need agent-specific installation.

### 2. New extension ref types for commands and MCP servers

Create `CommandExtensionRef` and `McpServerExtensionRef` following the existing `SkillExtensionRef` pattern:

```typescript
type CommandExtensionRefBase<TRefType, TSource> = ExtensionRefBase<"command", TRefType, TSource> & {
  readonly command: { readonly name: string };
};
type RegistryCommandRef = CommandExtensionRefBase<"registry", RegistrySource> & RegistryRefDetails;
```

Same pattern for MCP servers. For now, only registry refs are needed (commands/MCP servers are pack dependencies, and packs are registry-only).

**Why new ref types over reusing skill refs:** Each extension type has its own type discriminant (`"skill"`, `"command"`, `"mcp-server"`), canonical paths, and manifest schemas. Separate ref types maintain type safety and allow the operation handlers to accept their specific ref type.

### 3. Lockfile extension for commands and MCP servers

Add top-level lockfile maps for standalone command and MCP server entries:

```typescript
// lockfile schema additions
commands: Record<string, CommandLockEntry>;
mcpServers: Record<string, McpServerLockEntry>;
```

`CommandLockEntry` and `McpServerLockEntry` follow `SkillLockEntry` structure but without the `agents` field (no per-agent installation):

```typescript
interface CommandLockEntry {
  type: "registry";
  namespace: string;
  name: string;
  resolvedVersion: string;
  integrity: string;
  sourceName: string;
  installedAt: Date;
  updatedAt: Date;
}
```

**Why not reuse SkillLockEntry:** Skills have an `agents` array for per-agent tracking. Commands and MCP servers don't need this. A separate schema keeps lock entries accurate to each extension type.

### 4. Workspace service methods for commands and MCP servers

Add methods mirroring the skill/pack pattern:

- `getConfiguredCommands()` → reads settings `commands` map
- `getLockedCommands()` → reads lockfile `commands` map
- `getLockedCommand(name)` → `Option<CommandLockEntry>`
- `setCommand(args)` → writes settings + lockfile
- `setCommandLock(args)` → writes lockfile only
- `removeCommand(name)` → removes from settings + lockfile

Same set for MCP servers. All mutations go through the existing settings/lockfile semaphore.

### 5. Pack install generates extension ops from pack ref

The pack install handler builds operation args from the pack ref's resolved extension maps:

1. Parse each FQN in `ref.pack.skills` to get namespace/name
2. Build a `RegistrySkillRef` using the pack's registry source, parsed namespace/name, resolved version, and empty integrity
3. Create an `InstallSkillOperation` with `skipSettings: true` (pack dependency — no direct settings entry)
4. Repeat for `ref.pack.commands` and `ref.pack.mcpServers`
5. Pass all ops to the plan builder

The plan builder gains the extended union type:

```typescript
type PackInstallOp =
  | InstallPackOperation
  | InstallSkillOperation
  | InstallCommandOperation
  | InstallMcpServerOperation;
```

Plan ordering: pack step first (writes pack lock entry with resolved maps), then extension steps (can run concurrently since they're independent).

**Empty integrity for pack dependencies:** The pack ref contains FQN → version mappings but not per-extension integrity hashes. The install handlers skip integrity validation when integrity is empty — they trust the pack's registry source. The install-from-registry code path already handles `ref.integrity === ""` for synthetic refs; this extends that pattern to pack dependency installs.

### 6. Pack uninstall extends orphan computation to commands and MCP servers

The pack uninstall plan builder already computes removable skills by:

1. Collecting from target packs' `resolvedSkills`
2. Excluding skills in remaining packs
3. Excluding directly-installed skills

Apply the same algorithm for `resolvedCommands` and `resolvedMcpServers`. The plan union type extends to:

```typescript
type PackUninstallOp =
  | UninstallPackOperation
  | UninstallSkillOperation
  | UninstallCommandOperation
  | UninstallMcpServerOperation;
```

Step ordering: pack steps first (removes pack from lockfile), then skill/command/mcp-server steps.

The existing `findOrphanedCommands` and `findOrphanedMcpServers` functions in `orphan-detection.ts` are removed — the plan builder computes orphans inline (same approach as the skill delegation change).

### 7. Pack unpack becomes plan-based with install + remove-pack operations

Unpack currently does inline `ws.setSkill()` calls. After pack install delegates properly, all extensions are already on disk and in the lockfile after pack install. Unpack promotes them to direct entries.

The refactored unpack plan emits:

1. **Install-skill ops** — with `force: true` and `skipSettings: false`. The install handler sees the skill is already at the canonical location (empty integrity + canonical exists → skip fetch), creates agent symlinks if missing, and writes a settings entry.
2. **Install-command ops** — same pattern, promotes to direct settings entry.
3. **Install-mcp-server ops** — same pattern.
4. **Uninstall-pack op** — removes pack directory, settings entry, and lockfile entry. Since extensions are individually installed at their own canonical paths, removing the pack directory is safe.

Extensions already directly installed (user ran `axm skills install` separately) become no-op steps in the plan — the plan builder detects their settings entry and marks them accordingly.

```typescript
type PackUnpackOp =
  | InstallSkillOperation
  | InstallCommandOperation
  | InstallMcpServerOperation
  | UninstallPackOperation;
```

**Why reuse install operations over a dedicated "promote" operation:** Install handlers already support idempotent behavior (empty integrity → use existing canonical, force → overwrite). Adding `skipSettings: false` makes them write the settings entry. No new operation type needed — the existing install pipeline handles promotion naturally.

### 8. Install handler idempotent mode for empty integrity

The skill install handler's registry path already has: `const useExisting = ref.integrity === "" && canonicalExists`. This skips fetch and extraction when the canonical directory exists.

Extend this pattern:

- If integrity is empty AND canonical directory exists → skip fetch, proceed to metadata updates
- If integrity is empty AND canonical directory does NOT exist → fetch without integrity validation (trust source)

The second case is needed for fresh pack installs where extensions haven't been extracted yet. Currently the handler fails on integrity mismatch when expected is `""` and actual is a real hash. The fix: skip the integrity comparison when `ref.integrity === ""`.

Command and MCP server install handlers follow this same pattern from the start.

### 9. Extension ref construction from pack resolved maps

The pack install handler needs to build extension refs from `Record<string, string>` (FQN → version). A shared helper constructs registry refs from pack metadata:

```typescript
const buildRegistrySkillRef = (
  fqn: Fqn,
  version: string,
  source: RegistrySource,
): RegistrySkillRef => ({
  type: "skill",
  refType: "registry",
  skill: { name: fqn.name, description: Option.none(), metadata: Option.none() },
  source,
  namespace: fqn.namespace,
  name: fqn.name,
  version,
  integrity: "", // trust pack source
});
```

Same pattern for command and MCP server refs. Parse FQN, reuse pack's registry source, set empty integrity.

## Risks / Trade-offs

**Empty integrity for pack dependencies** — Extensions installed via packs skip integrity validation. This trusts the registry source that served the pack. Mitigated by: the pack itself is integrity-validated; individual extensions share the same trusted source. Future enhancement: add per-extension integrity to pack manifests.

**Lockfile schema change** — Adding `commands` and `mcpServers` top-level maps changes the lockfile format. Mitigated by: both maps are optional with empty defaults; existing lockfiles remain valid.

**Large scope** — This change touches operation handlers, plan builders, workspace service, lockfile schema, and ref types across three extension types. Mitigated by: commands and MCP servers follow identical patterns (can be implemented in parallel); each piece is independently testable.

**Unpack depends on proper pack install** — The refactored unpack assumes pack install has already materialized extensions to disk. If a pack was installed before this change (old behavior), its extensions won't be on disk individually. Mitigated by: the install handlers' idempotent mode handles missing files by fetching from the registry.
