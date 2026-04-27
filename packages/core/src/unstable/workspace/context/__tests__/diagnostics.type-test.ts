/**
 * Compile-time type assertions for the WorkspaceContext diagnostics
 * `Warning` discriminator.
 *
 * Pure type-level. Excluded from vitest's runtime suite; included in
 * `tsconfig.spec.json` so the assertions are checked when typecheck runs.
 */

import type { Warning } from "../diagnostics.js";

// Warning carries the source discriminator with exactly three cases.
type _SourceExact = [Exclude<Warning["source"], "settings" | "lockfile" | "scanner">] extends [
  never,
]
  ? true
  : false;
const _sourceExact = true as const satisfies _SourceExact;

type _SourceComplete = [Exclude<"settings" | "lockfile" | "scanner", Warning["source"]>] extends [
  never,
]
  ? true
  : false;
const _sourceComplete = true as const satisfies _SourceComplete;

// `path` and `code` are optional, `message` is required.
const _withRequiredOnly: Warning = { source: "settings", message: "required only" };
const _withOptionalPath: Warning = {
  source: "lockfile",
  message: "with path",
  path: "/ws/axm-lock.yaml",
};
const _withOptionalCode: Warning = {
  source: "scanner",
  message: "with code",
  code: "deprecated-key",
};
const _withAll: Warning = {
  source: "settings",
  message: "all fields",
  path: "/ws/.axm/settings.json",
  code: "deprecated-key",
};

export type _Refs = [
  typeof _sourceExact,
  typeof _sourceComplete,
  typeof _withRequiredOnly,
  typeof _withOptionalPath,
  typeof _withOptionalCode,
  typeof _withAll,
];
