## Context

`resolveSkillInstallSource` is the install command's source resolver. It handles a subset of `InputPattern` types — registry, shorthand, slash, and name — and rejects the rest (`url-input`, `git-scp-address`, `file-path-pattern`, `glob-input`) with a catch-all error.

The general-purpose `resolveSource` in `sources/resolve-source.ts` already handles URL inputs. It delegates to `routeUrlInput`, which matches against configured + built-in sources (github.com, gitlab.com, bitbucket.org).

`resolveSkillInstallSource` exists separately because it has custom registry resolution logic (scope matching, extension existence checks) that differs from `resolveSource`. But for URL inputs, there's no install-specific behavior needed — the general resolution logic applies directly.

## Goals / Non-Goals

**Goals:**

- `axm skills install https://github.com/owner/repo` resolves via `routeUrlInput`

**Non-Goals:**

- SCP address, file path, or glob support in `resolveSkillInstallSource`
- Changes to `resolveSource` or the resolution pipeline itself

## Decisions

### Wire missing pattern types to existing resolution functions

Add a `resolveSkillUrl` function in `resolve-skill-install-source.ts` that resolves URL inputs against configured + built-in sources — same logic as `routeUrlInput`, but scoped to the skill install context. Wire it into `resolveSkillInstallSource`:

```
case "url-input":
  → resolveSkillUrl(pattern.url, parseResult.originalInput)
```

The remaining unsupported patterns (`git-scp-address`, `file-path-pattern`, `glob-input`) stay in the catch-all error branch.

## Risks / Trade-offs

- [Minimal risk] The change only adds delegation to already-tested functions — no new resolution logic is introduced.
