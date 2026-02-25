## Context

`axm skills install <source>` currently parses bare names (for example `effect-basics`) as `name-input`, then attempts registry resolution via default namespace in `resolveSkillRegistrySourceByName` (`packages/cli/src/cli-commands/skills/install/resolve-skill-install-source.ts`).

The current UX problem is not the lookup itself, but error presentation:

- Missing/failed bare-name lookup is wrapped as `INVALID_SOURCE` in `packages/cli/src/cli-commands/skills/install/handler.ts`.
- The message suggests format issues even when the real failure is "checked registries, not found".
- Users cannot tell whether registry lookup was attempted or which registries were checked.

This change keeps default-namespace lookup behavior, but makes lookup attempts explicit and actionable when no match exists.

## Goals / Non-Goals

**Goals:**

- Preserve current bare-name resolution behavior (default namespace + effective registry source hosts in order).
- Make lookup attempts visible in CLI output for not-found cases.
- Distinguish parse/format errors from lookup-not-found failures.
- Keep the change scoped to `skills install` path first.
- Add tests for both successful bare-name resolution and not-found messaging.
- Keep lint/typecheck/test green.

**Non-Goals:**

- Changing registry search order or namespace selection policy.
- Adding fuzzy search/suggestions ("did you mean") or cross-namespace auto-discovery.
- Changing non-skill commands in this change (`packs`, `mcp-servers`, `commands`).

## Decisions

### 1) Introduce a first-class not-found error for bare-name registry lookup

Decision: replace generic `SOURCE_PARSE_FAILED` for bare-name miss with a specific `CliError` code that captures lookup context, for example `REGISTRY_SKILL_NOT_FOUND`.

Why:

- "Not found after lookup" is semantically different from "invalid input format".
- Enables user-facing details like namespace and checked registries.

Alternatives considered:

- Keep `INVALID_SOURCE` and append one detail line: rejected (still misleading category).
- Add only logging (no typed error changes): rejected (harder to test and less explicit contract).

### 2) Return lookup diagnostics from the bare-name resolver path

Decision: update the bare-name resolver path to collect checked registry endpoints and include them in error `details`.

Primary code paths:

- `packages/cli/src/workspace/service.ts`
  - Add `getDefaultNamespace` returning `Effect<Option<string>, CliError>` with precedence: project settings > user settings > logged-in identity handle (TODO: auth not implemented) > `Option.none()`.
  - Rename `getConfiguredRegistrySources` to `getRegistrySourceHosts` (aligns to ontology `Registry Source Hosts` set term).
- `packages/cli/src/cli-commands/skills/install/resolve-skill-install-source.ts`
  - Update `resolveSkillRegistrySourceByName` to use `getDefaultNamespace` and `getRegistrySourceHosts`.
  - When `getDefaultNamespace` returns `Option.none()`, fail with `REGISTRY_SKILL_NOT_FOUND` explaining that no namespace was available for lookup (not a separate error code — just a different detail message on the same not-found path).
  - Accumulate registry attempts; on miss, fail with structured details (`input`, `namespace`, `checked registries`).
- `packages/cli/src/cli-commands/skills/install/handler.ts`
  - Stop coercing all resolver failures into `INVALID_SOURCE`.
  - Preserve specific resolver errors; map only true parse failures to `INVALID_SOURCE`.

Pseudo-code (target behavior):

```typescript
// resolve-skill-install-source.ts
const resolveSkillRegistrySourceByName = (name: string, input: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    // DefaultNamespace: project settings > user settings > logged-in identity > none
    const maybeNamespace = yield* ws.getDefaultNamespace();

    // No namespace available — can't perform bare-name lookup
    if (Option.isNone(maybeNamespace)) {
      return yield* makeCliError({
        code: "REGISTRY_SKILL_NOT_FOUND",
        what: `Skill "${name}" could not be looked up (no default namespace)`,
        details: [
          `Provided: ${input}`,
          `No default namespace configured and not logged in`,
        ],
        howToFix: Option.some(
          "Configure a namespace in settings.json, log in with `axm auth login`, or install with an explicit source like github:owner/repo or @namespace/skills/name",
        ),
      });
    }
    const namespace = maybeNamespace.value;

    // Registry Source Hosts (H_registry): effective registry hosts from merged source inventory
    const registryHosts = yield* ws.getRegistrySourceHosts();

    if (registryHosts.length === 0) {
      return yield* makeCliError({
        code: "REGISTRY_SKILL_NOT_FOUND",
        what: `Skill "${namespace}/${name}" could not be looked up (no registry sources)`,
        details: [
          `Provided: ${input}`,
          `Default namespace: ${namespace}`,
          `No registry sources configured`,
        ],
        howToFix: Option.some(
          "Configure a registry source in settings.json, or install with an explicit source like github:owner/repo",
        ),
      });
    }

    const checked: ReadonlyArray<string> = [];
    for (const reg of registryHosts) {
      checked.push(reg.location.href);
      const client = yield* createRegistryClient(reg.location.href);
      const { exists } = yield* client
        .extensionExists({ namespace, type: "skill", name })
        .pipe(Effect.orElseSucceed(() => ({ exists: false })));
      if (exists) {
        return {
          type: "registry",
          location: reg.location,
          namespace: Option.some(namespace),
        } satisfies RegistrySource;
      }
    }

    return yield* makeCliError({
      code: "REGISTRY_SKILL_NOT_FOUND",
      what: `Skill "${namespace}/${name}" was not found in configured registries`,
      details: [
        `Provided: ${input}`,
        `Default namespace: ${namespace}`,
        `Checked registries: ${checked.join(", ")}`,
      ],
      howToFix: Option.some(
        "Verify the skill name, or install with an explicit source like github:owner/repo or @namespace/skills/name",
      ),
    });
  });

// handler.ts
const parsed = parseInputPattern(args.source.trim());
if (Option.isNone(parsed)) {
  return yield* makeCliError({ code: "INVALID_SOURCE", ... });
}

const source = yield* resolveSkillInstallSource(parsed.value).pipe(
  // Preserve CliError from resolver (including REGISTRY_SKILL_NOT_FOUND)
  Effect.mapError((error) => error),
);
```

### 3) Add explicit CLI output for "checked but not found"

Decision: for lookup miss, print actionable error details that explicitly state lookup happened and where.

Expected CLI output (not-found case):

```text
info axm skills install (project)
⠋ Parsing source...
✗ Skill "@axm/effect-basics" was not found in configured registries (REGISTRY_SKILL_NOT_FOUND)
  Provided: effect-basics
  Default namespace: @axm
  Checked registries: https://registry1.example.com, https://registry2.example.com
  Verify the skill name, or install with an explicit source like github:owner/repo or @namespace/skills/name
```

Expected CLI output (no default namespace available):

```text
info axm skills install (project)
⠋ Parsing source...
✗ Skill "effect-basics" could not be looked up (no default namespace) (REGISTRY_SKILL_NOT_FOUND)
  Provided: effect-basics
  No default namespace configured and not logged in
  Configure a namespace in settings.json, log in with `axm auth login`, or install with an explicit source like github:owner/repo or @namespace/skills/name
```

Expected CLI output (true format error stays unchanged category):

```text
✗ Invalid source: Unable to parse source (INVALID_SOURCE)
  Provided: not a valid source ???
  Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com
```

### 4) Test strategy

Decision: add/adjust tests in install-source resolver and install handler suites.

- `packages/cli/src/cli-commands/skills/install/resolve-skill-install-source.test.ts`
  - bare name found in first registry -> returns registry source.
  - bare name found in later registry -> returns matching registry.
  - bare name not found anywhere -> fails with `REGISTRY_SKILL_NOT_FOUND` and includes checked list.
  - no default namespace available -> fails with `REGISTRY_SKILL_NOT_FOUND` with "no default namespace" detail.
  - no registry source hosts -> fails with `REGISTRY_SKILL_NOT_FOUND` with "no registry sources" detail.
- `packages/cli/src/cli-commands/skills/install/handler.test.ts`
  - resolver not-found error is surfaced (not remapped to `INVALID_SOURCE`).
  - true parse failure still returns `INVALID_SOURCE`.

## Risks / Trade-offs

- [Risk] Registry checks can fail transiently and look like not-found. -> Mitigation: include per-registry failure notes in details or clearly treat request failures as lookup failures with cause in verbose mode.
- [Risk] New error code can affect existing tests/automation expecting `INVALID_SOURCE`. -> Mitigation: update tests and release notes with new code semantics.
- [Trade-off] More detailed error output is longer. -> Benefit: users can immediately see lookup behavior and next steps.

## Migration Plan

1. Add `getDefaultNamespace` to workspace service returning `Option<string>` (precedence: project settings > user settings > TODO logged-in identity > none). Update callers of `getConfiguredNamespace` in bare-name paths.
2. Rename `getConfiguredRegistrySources` to `getRegistrySourceHosts` in workspace service and all callers.
3. Add `REGISTRY_SKILL_NOT_FOUND` error code for bare-name lookup misses with diagnostics (covers no-namespace, no-registries, and not-found-after-search paths).
4. Update `skills install` handler to preserve resolver errors.
5. Update/add tests for resolver + handler behavior.
6. Run `pnpm lint`, `pnpm typecheck`, and targeted tests (`skills/install` suites), then full test suite if required.
7. Rollback path: revert workspace API changes, handler mapping, and resolver error code changes.

## Open Questions

- Should per-registry request failures be surfaced as a separate error (`REGISTRY_LOOKUP_FAILED`) instead of folding into not-found details?
- Do we want to reuse the same bare-name lookup diagnostics pattern for `packs install` in a follow-up change?
