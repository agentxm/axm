---
name: code-review
description: Review code against all project guides, skills, and conventions. Use when reviewing files, folders, diffs, or PRs for code style, idiomatic Effect/TypeScript usage, and project conformance.
user-invocable: true
---

# Code Review

Evaluate code against project guidance. Produce prioritized, numbered findings with remediation options.

---

## Input

The user provides a code reference — one or more of:

- **File path(s)** — specific files to review
- **Folder path** — review all source files in a directory
- **Git diff** — staged, unstaged, or commit range
- **PR number** — review PR changes via `gh pr diff`
- **No input** — review unstaged + staged changes (default)

If the input is ambiguous, ask what to review using AskUserQuestion.

---

## Process

### 1. Resolve scope

| Input                                      | Action                  |
| ------------------------------------------ | ----------------------- |
| File/folder path                           | Read the files directly |
| `--staged` or no input with staged changes | `git diff --cached`     |
| No input, no staged                        | `git diff` (unstaged)   |
| Commit range                               | `git diff <range>`      |
| PR number                                  | `gh pr diff <number>`   |

For folders, focus on `.ts` and `.tsx` files. Skip generated files, `node_modules`, `dist`, `__generated__`.

### 2. Load applicable guidance

Read ALL relevant guidance sources — do not skip any:

**Always load:**

- Root `CLAUDE.md` — project-wide conventions
- Co-located `CLAUDE.md` files in affected directories

**Load based on code content:**

| Code touches...                    | Load these skills                                  |
| ---------------------------------- | -------------------------------------------------- |
| Effect code (gen, pipe, Effect.\*) | `effect-basics`, `effect-service`, `effect-layers` |
| Option/nullable handling           | `effect-option`                                    |
| Schema validation                  | `effect-schema`                                    |
| Iteration/loops with yield\*       | `effect-iteration`                                 |
| Streams                            | `effect-stream`                                    |
| Concurrency (fork, all, forEach)   | `effect-concurrency`                               |
| Collections (Array, Record, Chunk) | `effect-collections`                               |
| Promise wrapping                   | `effect-wrapping`                                  |
| FileSystem/Path usage              | `effect-filesystem`                                |
| Test files                         | `effect-testing`                                   |
| CLI commands/handlers              | `cli-conventions`                                  |

**Load from guides:**

- `contributing/guides/effect.md` — if any Effect code
- `contributing/guides/testing.md` — if test files
- `contributing/guides/cli-design.md` — if CLI commands
- `contributing/guides/spec-driven-development.md` — if spec/design files

### 3. Analyze code

For each file in scope, check against loaded guidance. Focus areas in priority order:

1. **Correctness** — Logic errors, missed error paths, race conditions
2. **Safety** — Type assertions, unvalidated casts, thrown errors in Effect code
3. **Idiomatic Effect** — v4 API usage, proper service patterns, typed errors, inference
4. **Idiomatic TypeScript** — Type safety, minimal assertions, proper narrowing
5. **Project conventions** — Code organization, naming, export patterns, error handling
6. **Style** — Formatting, naming consistency, unnecessary complexity

### 4. Produce findings

Use the **Findings Presentation** format from CLAUDE.md. Each finding is numbered with lettered remediation options and a recommendation.

---

## Output Format

```
## Code Review: <scope description>

### Summary
<1-3 sentences: what was reviewed, overall quality assessment, key themes>

### Findings

#### 1. <Finding title>

<Description with file:line references>

  a) <Option A> — <description>
  b) <Option B> — <description>
  c) <Option C> — <description>

**Recommendation:** (b) — <rationale>

#### 2. <Finding title>
...

### Commendations
<Notable positive patterns — skip if none stand out>

### Review Summary
| Priority | Count |
|----------|-------|
| Critical | N |
| Warning  | N |
| Suggestion | N |
| Total    | N |
```

---

## Finding Priority

Assign each finding a priority:

| Priority       | Meaning                                                       | Examples                                                                                                                         |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Critical**   | Must fix — correctness, safety, or major convention violation | Raw Promise in Effect code, thrown errors in helpers, `as` casts on unvalidated data, missing error mapping                      |
| **Warning**    | Should fix — non-idiomatic usage or convention drift          | Explicit return type annotations blocking inference, `for` + `yield*` instead of `Effect.forEach`, mutable accumulation patterns |
| **Suggestion** | Consider — minor improvements                                 | Naming consistency, unnecessary intermediate variables, opportunities for concurrency                                            |

Order findings by priority (critical first), then by file location.

---

## Review Dimensions

### Effect Idiomatics

Check against loaded Effect skills. Key patterns:

- **v4 API** — Using removed v3 APIs (`Context.Tag`, `catchAll`, `fork`, `FiberRef`)
- **Generator style** — `Effect.gen(function*() { ... })` not async/await
- **Error handling** — `AppError` with codes, not domain error types; `cause` preserved
- **Services** — `ServiceMap.Service` not `Context.Tag`; simple functions over unnecessary services
- **Type inference** — No explicit `Effect<A, E, R>` return types unless justified
- **Collections** — `ReadonlyArray`, `Option`, `Record.ReadonlyRecord` in signatures
- **Iteration** — `Effect.forEach` with concurrency, not `for` + `yield*` + `push`
- **FileSystem/Path** — `effect/FileSystem` and `effect/Path`, not `node:fs`/`node:path`
- **Wrapping** — `Effect.tryPromise` with error mapping for external APIs
- **Option** — `Option<T>` over `T | undefined`; convert at boundaries

### TypeScript Idiomatics

- **Type assertions** — Minimize `as`; prefer `satisfies`, type guards, Schema validation
- **Conditional props** — Spread conditionals, not mutation
- **Discriminated unions** — Check `_tag`, use `Data.TaggedClass` for equality
- **JSON parsing** — Always validate with Schema, never `as Config`

### Project Conventions

- **Code organization** — Group by feature, co-locate constants/types/schemas
- **Exports** — One barrel `index.ts` per folder, single export location per type
- **Error model** — Single `AppError` type, `AREA_REASON` codes, `PromptCancelled` distinct
- **Handlers** — Accept parsed input, return Effects, require services via layers
- **Testing** — Co-located, behavioral, isolated, deterministic

---

## Guidelines

- **Be specific** — Always include `file:line` references
- **Be actionable** — Every finding has concrete remediation options
- **Be proportional** — Don't nitpick style when there are correctness issues
- **Acknowledge good patterns** — Commendations build trust
- **If no issues found** — Say so clearly, mention what was checked
- **Default to thorough** — Load all applicable guidance; shallow reviews miss real issues
