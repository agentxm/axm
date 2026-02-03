# Dry Run Architecture for CLI Applications

**The plan-apply pattern with single-codepath execution is the gold standard for maximum preview fidelity.** Terraform's approach—compute intent as a serializable execution plan, then optionally execute—has emerged as the dominant architecture across infrastructure tools, package managers, and system utilities. The key insight: dry run should exercise _exactly the same code_ as real execution, with side effects captured rather than suppressed via conditional logic.

For AgentXM's extension manager, this means structuring commands to first resolve dependencies and compute a complete operation manifest (reading network, files, state freely), then gate only the final write operations. This avoids the "two codepaths" problem where dry run logic diverges from execution and produces misleading previews.

---

## The plan-apply pattern separates intent from execution

The most robust dry run architecture separates computation into two distinct phases: **planning** (compute what would change) and **applying** (execute those changes). Terraform pioneered this with `terraform plan` and `terraform apply` as separate commands, and this pattern has influenced nearly every modern infrastructure tool.

**Terraform's internal architecture** demonstrates the pattern clearly. Its Arborist-style engine maintains three representations of state:

- **Current state**: Read from remote resources and local state file
- **Desired state**: Parsed from configuration files
- **Execution plan**: Computed diff between current and desired

The plan is a first-class data structure that can be serialized with `-out=tfplan`, inspected with `terraform show -json`, reviewed in CI pipelines, and later applied with `terraform apply tfplan`. This separation provides **cryptographic guarantees** that what was previewed is exactly what will execute.

**npm's Arborist library** uses a similar pattern internally. It maintains `actualTree` (current `node_modules`), `virtualTree` (from `package-lock.json`), and `idealTree` (computed target). The `buildIdealTree()` phase computes the dependency resolution plan; the `reify()` phase executes filesystem writes—and is simply skipped when `--dry-run=true`.

**Pulumi takes a different approach**: it runs the actual user program during `pulumi preview`, but intercepts resource registration calls and compares them against stored state without making API calls. This provides accurate previews for computed values but shows `output<string>` placeholders for values that can only be determined at apply time.

---

## Single codepath execution prevents preview divergence

The most common dry run bug is the **two codepaths problem**: dry run is implemented as a separate conditional branch that doesn't exercise the same code as real execution. As features evolve, the branches diverge, and previews become misleading.

**Anti-pattern to avoid:**

```typescript
if (dryRun) {
  console.log(`Would delete: ${file}`); // Different code path
} else {
  await deleteFile(file); // Only this path is tested
}
```

**Recommended pattern using dependency injection:**

```typescript
interface EffectExecutor {
  deleteFile(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  installExtension(manifest: ExtensionManifest): Promise<void>;
}

class RealExecutor implements EffectExecutor {
  async deleteFile(path: string) {
    await fs.unlink(path);
  }
  // ... actual implementations
}

class DryRunExecutor implements EffectExecutor {
  public operations: Operation[] = [];
  async deleteFile(path: string) {
    this.operations.push({ type: "delete", path });
  }
  // ... captures operations without executing
}

// Same code path for both modes:
async function uninstall(ext: Extension, executor: EffectExecutor) {
  const dependents = await findDependents(ext); // Read operation - always runs
  if (dependents.length > 0) {
    throw new Error(
      `Cannot uninstall: ${dependents.length} extensions depend on ${ext.name}`,
    );
  }
  await executor.deleteFile(ext.manifestPath);
  await executor.deleteFile(ext.dataDir);
}
```

This pattern ensures validation, dependency checking, and all business logic runs identically in both modes. The **rsync documentation** explicitly endorses this: "The output of `--itemize-changes` is supposed to be exactly the same on a dry run and a subsequent real run... if it isn't, that's a bug."

A real-world failure illustrates the risk: **Netdata's kickstart.sh** had a dry run that reported "no static build available" while actual execution succeeded—because the dry run code path had different logic for architecture detection.

---

## Flag naming follows established Unix conventions

The ecosystem has converged on **`--dry-run`** with **`-n`** as the short form. This originates from early Unix tradition where `-n` meant "no action" in tools like `make`. Modern tools should follow this convention:

| Flag                | Usage                         | Adoption                                       |
| ------------------- | ----------------------------- | ---------------------------------------------- |
| `--dry-run` / `-n`  | Primary dry run flag          | npm, cargo, pip, rsync, git                    |
| `--plan`            | Separate planning command     | Terraform (`terraform plan`)                   |
| `--preview`         | Alternative naming            | Pulumi (`pulumi preview`)                      |
| `--check` / `-C`    | Validation mode               | Ansible                                        |
| `--simulate` / `-s` | Synonym                       | apt (`--dry-run`, `-s`, `--simulate` all work) |
| `--what-if`         | Windows PowerShell convention | Azure CLI, PowerShell cmdlets                  |

**For AgentXM**, use `--dry-run` with `-n` shorthand to match developer expectations from npm, cargo, and Unix tools. Consider also supporting `--plan` as a synonym if operations are complex enough to warrant Terraform-style separated commands.

---

## Output design should follow diff conventions with structured alternatives

**Visual hierarchy** should use established conventions for terminal output:

| Symbol         | Color        | Meaning                      |
| -------------- | ------------ | ---------------------------- |
| `+`            | Green        | Resource/extension to add    |
| `-`            | Red          | Resource/extension to remove |
| `~`            | Yellow/Amber | Resource/extension to modify |
| `-/+` or `+-`  | Red/Green    | Replace (remove then add)    |
| `=` or (blank) | Gray/dim     | Unchanged                    |

**Terraform's summary line** is the gold standard for scannable output: `Plan: 3 to add, 1 to change, 2 to destroy`

**pip provides the best example of machine-readable output** through its `--report` flag, which outputs versioned JSON:

```bash
pip install --dry-run --ignore-installed --quiet --report - "package>=1.0"
```

The JSON schema includes version metadata (`"version": "1"` for future compatibility), full dependency metadata, download URLs with hashes, and whether each package was explicitly requested or pulled as a dependency.

**For AgentXM's operations**, consider output like:

```
Extension changes for workspace 'my-agents':

+ ai-summarizer@2.1.0         (new)
~ code-assistant@1.5.0 → 1.6.2 (update)
- deprecated-helper@0.9.0     (removed)

Dependencies resolved:
  + shared-utils@1.0.0 (required by ai-summarizer)
  ~ core-types@2.0.0 → 2.1.0 (required by code-assistant)

Plan: 2 to install, 2 to update, 1 to remove

Use --json for machine-readable output.
```

**Always respect terminal capabilities**: disable colors when stdout isn't a TTY, honor the `NO_COLOR` environment variable, and provide `--no-color` and `--json` flags for CI/CD integration.

---

## kubectl demonstrates client versus server dry run modes

Kubernetes introduced a distinction worth considering: **client-side** versus **server-side** dry run.

**`--dry-run=client`**: Processing happens entirely locally. Validates against client-side schemas only. Cannot verify admission controllers, webhooks, or server defaults. Fast but potentially inaccurate.

**`--dry-run=server`**: Request sent to API server with `?dryRun=All` query parameter. Goes through full admission chain—validation webhooks, mutating webhooks, defaulting. Server processes the request completely but tells the storage layer not to persist. Returns the object exactly as it would appear if created.

**For extension management**, this maps to:

- **Client dry run**: Parse manifest, resolve dependencies locally, show plan based on cached registry data
- **Server dry run**: Contact registry, validate manifest signatures, check compatibility constraints, resolve with current registry state

AgentXM should default to server-side behavior for maximum fidelity (network reads are allowed per the requirements), with `--offline` or `--dry-run=client` for scenarios where network access is restricted.

---

## Multi-operation previews require dependency visualization

When operations involve multiple sequential steps, the preview must communicate **ordering and causality**. Terraform handles this with a directed acyclic graph (DAG) that parallelizes independent operations while respecting dependencies.

**Dependency chain display** should show why each operation is happening:

```
The following extensions will be installed:

+ ai-summarizer@2.1.0
  └─ + shared-utils@1.0.0 (dependency of ai-summarizer)
  └─ ~ core-types@2.0.0 → 2.1.0 (peer dependency update)

+ code-reviewer@3.0.0
  └─ (no additional dependencies)
```

**Summarization for large changesets** should provide progressive disclosure:

```
Plan: 47 extensions affected

Summary by operation:
  12 to install (use --verbose to list)
   8 to update
   2 to remove

Breaking changes detected:
  ! api-client@2.0.0 → 3.0.0 contains breaking changes
    See https://registry.example.com/api-client/changelog#v3.0.0
```

**Verbosity tiers** follow established conventions:

- Default: Summary counts + highlighted important changes (breaking, security)
- `-v` / `--verbose`: Full list of all operations
- `-vv`: Include dependency resolution details
- `--json`: Complete structured output for programmatic consumption

---

## Interactive confirmation should integrate with preview output

The preview-then-confirm workflow is standard for destructive operations. **Danger levels** should determine the confirmation requirement:

| Danger Level | Example                    | Behavior                                           |
| ------------ | -------------------------- | -------------------------------------------------- |
| **Low**      | Validate, sync (read-only) | Execute immediately                                |
| **Moderate** | Install, update            | Show preview, prompt `Proceed? [y/N]`              |
| **High**     | Uninstall, force overwrite | Show preview with warnings, prompt with default No |
| **Severe**   | Uninstall with dependents  | Require typing extension name to confirm           |

**Example destructive operation flow:**

```
$ xm uninstall core-api

WARNING: 3 extensions depend on core-api:
  • ai-summarizer (requires core-api@^1.0.0)
  • code-reviewer (requires core-api@^1.2.0)
  • data-sync (requires core-api@^1.0.0)

Removing core-api will break these extensions.

Type 'core-api' to confirm removal: _
```

**Standard flags for scripting:**

- `--yes` / `-y`: Auto-accept confirmation prompts
- `--force` / `-f`: Skip confirmation AND override safety checks
- `--dry-run` / `-n`: Preview only, never prompt or execute

---

## Reference implementations worth studying

**Five implementations demonstrate different aspects of excellent dry run architecture:**

1. **Terraform** (`hashicorp/terraform`) — Gold standard for plan-apply separation. Study `internal/terraform/context_plan.go` for how execution plans are computed and serialized. JSON output format is well-documented at `website/docs/internals/json-format.mdx`.

2. **pip** (`pypa/pip`) — Best-in-class machine-readable output. The `--report` flag with `--dry-run` produces versioned JSON with complete dependency metadata. See `src/pip/_internal/commands/install.py` and the Installation Report specification.

3. **npm/Arborist** (`npm/cli/workspaces/arborist`) — Demonstrates tree-based state management with `actualTree`, `virtualTree`, and `idealTree` abstractions. The `reify()` method is the single point where writes occur.

4. **rsync** — Classic Unix implementation where `--dry-run` uses the same code paths with a global flag check. Documentation explicitly states that itemize output must match between dry run and real run.

5. **kubectl** (`kubernetes/kubectl`) — Demonstrates client vs. server dry run modes and the tradeoffs between speed and accuracy. The KEP (Kubernetes Enhancement Proposal) at `kubernetes/enhancements/keps/sig-api-machinery/576-dry-run/README.md` documents the design rationale.

---

## Ansible's check mode reveals module-level limitations

Ansible's `--check` mode illustrates an important caveat: **dry run accuracy depends on what operations support it**. Ansible passes `_ansible_check_mode=True` to modules, but modules must explicitly declare `supports_check_mode=True` and implement preview logic. Modules that don't support it (like `command` and `shell`) are silently skipped.

This creates a gap where playbook dry runs may show incomplete pictures. **For AgentXM**, ensure all extension operations have full dry run support—don't allow operations that can only be previewed partially.

Additionally, Ansible's task-level `check_mode: true/false` directive allows granular control—always running certain tasks (like status checks) even in check mode, or always dry-running certain tasks (like dangerous operations) even in normal mode. Consider whether AgentXM needs similar per-operation overrides.

---

## Testing benefits from dry run architecture

Separating effect computation from effect execution provides natural testing seams:

**Same code exercises both paths**: When dry run uses dependency injection rather than conditionals, unit tests naturally exercise the same code that runs in production. Mock the executor interface, run the operation, and assert on the captured operations.

**Deterministic assertions**: Tests can assert on the _plan_ rather than mocking filesystem/network state. "Given this workspace state and this manifest, the plan should include these 3 installs and 1 removal."

**Integration test simplification**: Run real operations in dry run mode against real registries/filesystems to verify resolution logic without cleanup concerns.

```typescript
test("install resolves transitive dependencies", async () => {
  const dryRunner = new DryRunExecutor();
  const workspace = await loadWorkspace("./fixtures/basic-workspace");

  await install("ai-summarizer@2.0.0", workspace, dryRunner);

  expect(dryRunner.operations).toContainEqual({
    type: "install",
    extension: "ai-summarizer",
    version: "2.0.0",
  });
  expect(dryRunner.operations).toContainEqual({
    type: "install",
    extension: "shared-utils", // transitive dependency
    version: "1.0.0",
  });
});
```

---

## Conclusion: Architectural recommendations for AgentXM

The research converges on clear recommendations for implementing dry run in AgentXM's extension manager:

**Architecture**: Adopt the plan-apply pattern with dependency-injected executors. Commands should compute a complete `ExtensionPlan` object representing all operations, then pass it to an executor (real or dry-run) for processing. This ensures single-codepath execution and prevents preview divergence.

**Flag conventions**: Use `--dry-run` with `-n` shorthand. Support `--json` for CI/CD integration. Respect `NO_COLOR` and provide `--no-color`.

**Output format**: Use Terraform-style symbols (`+`, `-`, `~`) with standard colors. End with a summary line. Show dependency chains with indentation. Provide verbosity tiers from summary to full detail.

**Confirmation flow**: Preview destructive operations by default. Require explicit confirmation for uninstalls. Support `--yes` for scripting and `--force` for overriding safety checks.

**Avoid**: Conditional dry run logic (`if (dryRun) ... else ...`), incomplete previews that skip validation, and separate code paths that can diverge from execution behavior.

The goal is **maximum preview fidelity**: users should be able to trust that what the dry run shows is exactly what execution will do, with the only difference being whether side effects are committed or captured.
