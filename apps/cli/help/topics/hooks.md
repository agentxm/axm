# Hooks

Hook packages contain native event handlers and their resources. AXM installs
and reconciles native registrations for the workspace's configured agents.
The native agent owns execution, trust, event timing, and decision aggregation.

Project-authored packages live in `hooks/<name>`. Acquired packages use their
source-family and identity path, for example
`agent_extensions/registry/@acme/hooks/block-secrets`.

## Manifest

`hook.json` declares identified implementations of exact native protocols. Each
implementation contains identified bindings, native event names, optional native
matchers, and command handlers. Run `axm help hook-schema` for the complete schema.

```json
{
  "type": "hook",
  "owner": "@acme",
  "name": "block-secrets",
  "version": "1.0.0",
  "implementations": [
    {
      "id": "claude",
      "protocol": "claude-code",
      "bindings": [
        {
          "id": "guard",
          "event": "PreToolUse",
          "matcher": "Write|Edit",
          "handler": {
            "type": "command",
            "runtime": "bash",
            "entrypoint": "src/hook.sh",
            "timeoutMs": 5000
          },
          "requires": { "outcomes": ["deny"] }
        }
      ]
    }
  ],
  "assets": ["src/policy.json"]
}
```

- `protocol` identifies the native host contract. A package can declare several
  implementations; AXM requires a unique compatible implementation for each
  configured target.
- `event` and `matcher` retain native meaning. AXM does not translate canonical
  event or tool names into an executable protocol.
- Command handlers support `bash`, `node`, and `python` interpreter families;
  Python commands use `python3`. `entrypoint` is package-relative. `args` and
  `env` can contain literals or typed configuration references.
- `requires.outcomes` and `requires.operations` require every named native
  decision effect. Unsupported fields or effects block projection.
- Implementation `requires` can constrain scopes, platforms, host versions, and
  profiles. Unknown host facts remain conditions, not verified compatibility.
- `assets` identifies additional package resources. Executables and required
  resources must remain inside the package and survive publication filtering.
  See `axm help publish` for archive validation and preview.

The launch writer supports command handlers only. A host advertising HTTP,
MCP, prompt, or agent hooks does not make those handler types installable by AXM.
Command names must be supported by the selected writer. Writers using seconds
accept whole-second `timeoutMs` values; AXM refuses lossy rounding.

Command serialization supports Linux and macOS POSIX shells. Windows projection
is refused. The host environment must provide each declared interpreter; AXM
does not install or execute interpreters to infer availability during lifecycle
operations. Fixture inputs and expected outputs may be excluded from a published
archive; `hooks test` then requires the authoring source containing those files.

### Launch writer coverage

The native command writers cover these surfaces and scopes. This is serializer
coverage, not a claim that every host version has executed every package.

| Protocol      | Host surface                    | Writable scopes |
| ------------- | ------------------------------- | --------------- |
| `claude-code` | Claude Code CLI                 | Project, user   |
| `codex`       | Codex CLI                       | Project, user   |
| `cursor`      | Cursor desktop/CLI native hooks | Project, user   |
| `gemini-cli`  | Gemini CLI                      | Project, user   |
| `qwen-code`   | Qwen Code CLI                   | Project, user   |
| `qoder`       | Qoder CLI                       | Project, user   |
| `codebuddy`   | CodeBuddy CLI                   | Project, user   |
| `augment`     | Auggie CLI                      | Project, user   |
| `devin`       | Devin CLI                       | Project only    |

Every row requires Linux or macOS and the implementation's `bash`, `node`, or
`python3` interpreter. AXM does not detect the native host version or active
profile during reconciliation. Publisher version/profile constraints therefore
remain explicit unresolved conditions until those facts are supplied; a writer
does not establish an unrestricted version range. Native loading and trust are
host prerequisites, and fixture receipts cannot satisfy them. Catalog source
review and attributable host execution remain separate evidence.

## Consumer configuration

Publishers declare typed fields in `hook.json`:

```json
{
  "configuration": {
    "label": { "type": "string", "default": "audit" },
    "token": { "type": "string", "secret": true, "required": true }
  }
}
```

Handlers reference a declared field with `{ "config": "label" }`. Fields support
strings, numbers, booleans, and enumerations with type-specific constraints.
Explicit consumer values override publisher defaults. Unknown keys, missing
required values, and invalid values are rejected. Empty strings require the
field's `allowEmpty` policy to permit them.

Consumer settings belong in `axm.json`, separate from immutable package content:

```json
{
  "hooks": {
    "block-secrets": {
      "source": "@acme/hooks/block-secrets@^1.0.0",
      "configuration": {
        "label": "team-audit",
        "token": { "env": "AUDIT_TOKEN" }
      }
    }
  }
}
```

Secret fields require symbolic environment references. AXM keeps the reference
in workspace settings and generated commands; the execution environment supplies
the value. A hook supplied by a Pack can use a source-less settings object to
hold these preferences without creating another acquisition declaration.

`axm hooks configure <name> --configuration '<JSON object>'` replaces the whole
consumer document. Omitted keys return to publisher defaults. Add `--preview`
to validate without writing. Configuration retains source, accepted resolution,
package bytes, and enabled state; disabled hooks remain disabled.

## Creation and fixture execution

`axm hooks new <name> --protocol claude-code --event PreToolUse --runtime node`
creates an inactive project package with applicable and nonapplicable fixtures.
Review the source and native behavior before enabling it.

`axm hooks test <directory>` explicitly executes declared fixtures. Use repeated
`--fixture <id>` flags to select fixtures and `--configuration '<JSON object>'`
to supply typed consumer values. Execution uses the package root as its working
directory. Fixture input must be JSON; expected exit codes and optional stdout
and stderr files determine pass or failure.

The runner limits each input, expected-output file, and output stream to 1 MiB.
The default process deadline is 10 seconds, with declared deadlines capped at
60 seconds. Cancellation terminates the process group and escalates to forced
termination after one second if needed; cleanup can extend past the execution
deadline. It records a local receipt containing package and configuration
hashes, scope, OS and architecture, implementation and binding IDs, results, and limitations. Interpreter versions remain unknown unless measured. Raw process
output is omitted from receipts. Changed package content or configuration makes
previous evidence stale; a changed scope or execution platform also makes a
receipt stale. Matching facts describe historical execution only; runtime
environment values and native host prerequisites have not been reverified.

Fixture execution is not sandboxed and does not prove native loading, trust, or
host invocation. Inspect package code before running it. Lint, preview,
installation, synchronization, and publication do not execute fixture code.

## Native state and ownership

Hooks activate only through native settings. Unsupported required targets block
before writing; AXM does not generate instruction fallbacks. Disabling a hook
withdraws its owned native registrations and retains its package and preferences.

Install and sync report per-agent outcomes and reasons. `projected` means a
preview has a supported native representation; `current` describes configuration
currency. Neither means the host executed the hook. `axm hooks show <name>`
reports the effective configured-agent outcomes, selected implementation and
bindings, configuration provenance with secrets redacted, and local fixture
evidence. Missing, invalid, historical, and stale evidence remain distinct.
`axm hooks list` summarizes implementation selection and fixture/native evidence.
`axm view @owner/hooks/<name>` verifies the published archive's integrity and
reports static package facts and prospective configured-agent outcomes. Published
inspection does not inherit local fixture receipts or claim native invocation.

Generated entries carry structured `x-axm` metadata identifying the package,
scope, canonical source root, binding, and selected implementations. AXM preserves
foreign entries and unrelated native settings. A command merely pointing inside
`agent_extensions` is not ownership proof; lint reports ambiguous ownership for
such entries. Compatible readers of an aliased native file share one physical
registration only when their complete native renderings agree.

## Native bundles

`axm hooks import <directory> @owner/hooks/<name> --protocol <host>` converts a
local native command bundle into an inactive project package. The directory
contains `hooks.json` and relative scripts. Use `--config <relative-path>` for a
different JSON filename and repeat `--resource <relative-path>` for additional
runtime files. Preview validates the bundle without creating or executing it.

Import accepts grouped command arrays for grouped native protocols and version-1
flat command arrays for Cursor. Commands must name `bash`, `node`, or `python3`,
followed by a package-relative script and literal arguments. Import refuses
`python` because its interpreter version is unknown. Inline
shell expressions, environment assignments, plugin substitutions, escaping
resources, and unsupported native fields are refused. Original registrations
remain untouched: enabling the imported package can run the same hook twice.

`axm hooks export <directory> <destination> --implementation <id>` creates a
native bundle for one declared implementation. The destination must be a new
directory under an existing project-workspace parent without symbolic aliases.
Existing destinations and staging paths are protected. Add `--preview` to
validate and list files without writing them.

Export copies the selected entrypoints and declared assets and records package
identity, version, protocol, and implementation in `hook-bundle.json`. Import
reads that file's resource list automatically. Exported commands require the
bundle root as their working directory; exporting does not register or run them.
The bounded export format refuses consumer configuration, environment bindings,
configuration references, and absolute workstation arguments. It omits workspace
state and AXM registration ownership. Declare every required helper as an asset;
AXM does not discover dependencies by executing or parsing scripts.

## Commands

- `axm hooks new <name>` — create an inactive project package.
- `axm hooks test <directory>` — execute selected declared fixtures and save evidence.
- `axm hooks import <directory> @owner/hooks/<name> --protocol <host>` — import an inactive native bundle.
- `axm hooks export <directory> <destination> --implementation <id>` — create a portable native bundle.
- `axm hooks install <source>` — acquire and project a hook; use `--configuration`
  for one selected Hook's consumer values.
- `axm hooks configure <name> --configuration '<JSON object>'` — replace consumer values.
- `axm hooks list` — list local hooks, source, lock state, and agent outcomes.
- `axm hooks show <name>` — inspect installed state and per-agent reasons.
- `axm hooks enable <name>` / `axm hooks disable <name>` — reconcile activation.
- `axm hooks update <name>` — update the accepted package version.
- `axm hooks uninstall <name>` — withdraw owned outputs and remove acquired state.
- `axm sync --preview` — inspect reconciliation without writing.
- `axm hooks publish @owner/hooks/<name> --preview` — inspect publication validation.

Scoped commands accept `--scope project` or `--scope user`; package creation is
project authoring. Consult each command's `--help` for its supported flags.

## Recommended packs

Name the pack(s) your hook ships with in `hook.json` `recommendedPacks`, using
the bare pack reference — do not include a version range:

```json
{
  "recommendedPacks": ["@acme/packs/bricks"]
}
```

When a pack lists this hook as a dependency and the hook lists that pack as
recommended, the registry marks both sides of the relationship **official**.
Either side may declare alone; the badge appears only when both agree.

Keep the hook self-contained. `recommendedPacks` does not install the pack or
its members. If the hook requires another extension, name that sibling by its
extension identity and let the agent resolve it through its own discovery —
never by file path. See `axm help packs` for pack composition.

## Where to go next

- `axm hooks --help` — Hook commands and flags
- `axm help hook-schema` — complete manifest schema
- `axm help settings` — consumer settings
- `axm help workspace-state` — desired, accepted, and observed state
- `axm help packs` — composing Hook packages
