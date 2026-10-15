/**
 * Projection generation currency recorded in the lockfile.
 *
 * Each row records, for one projection unit AXM writes, the input-only
 * generation digest (`gen`) and the digest of the bytes AXM last wrote
 * (`output`). Rows are currency and deletion evidence. They never establish
 * ownership: authority over a unit comes from the desired graph and the
 * planned native path.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Equal from "effect/Equal";
import * as Schema from "effect/Schema";
import { compareCodePoints } from "./compare-code-points.js";

export const PROJECTION_KINDS = ["rules", "knowledge", "instructions", "subagents"] as const;
export type ProjectionKind = (typeof PROJECTION_KINDS)[number];

/** Projection-format version per kind. Bumping one makes every unit of that kind stale. */
export const PROJECTION_CONTRACTS = {
  rules: 1,
  knowledge: 1,
  instructions: 1,
  subagents: 1,
} as const satisfies Record<ProjectionKind, number>;

export const ProjectionDigestSchema = Schema.String.check(
  Schema.isPattern(/^sha256:[0-9a-f]{64}(?![\s\S])/u, {
    message: "Expected a projection digest of the form sha256:<64 lowercase hex>",
  }),
).pipe(Schema.brand("ProjectionDigest"));
export type ProjectionDigest = typeof ProjectionDigestSchema.Type;

/** Scope-relative POSIX path, preserving the projection path grammar. */
export const ProjectionUnitPathSchema = Schema.String.check(
  Schema.isPattern(
    /^(?![A-Za-z]:)(?!\.{1,2}(?:\/|(?![\s\S])))[^/\\]+(?:\/(?!\.{1,2}(?:\/|(?![\s\S])))[^/\\]+)*(?![\s\S])/u,
    {
      message:
        "Expected a relative projection unit path without empty, '.', '..', or backslash segments",
    },
  ),
).pipe(Schema.brand("ProjectionUnitPath"));
export type ProjectionUnitPath = typeof ProjectionUnitPathSchema.Type;

/**
 * One recorded projection unit. `output` is always known when a row is
 * written; a row without `gen` records bytes whose currency is unknown.
 */
export const ProjectionRowSchema = Schema.Struct({
  gen: Schema.optional(ProjectionDigestSchema),
  output: ProjectionDigestSchema,
});
export type ProjectionRow = typeof ProjectionRowSchema.Type;

export const ProjectionKindStateSchema = Schema.Struct({
  contract: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  units: Schema.Record(ProjectionUnitPathSchema, ProjectionRowSchema),
});
export type ProjectionKindState = typeof ProjectionKindStateSchema.Type;

export const ProjectionsSchema = Schema.Struct({
  rules: Schema.optional(ProjectionKindStateSchema),
  knowledge: Schema.optional(ProjectionKindStateSchema),
  instructions: Schema.optional(ProjectionKindStateSchema),
  subagents: Schema.optional(ProjectionKindStateSchema),
});
export type Projections = typeof ProjectionsSchema.Type;

type MutableProjections = { -readonly [K in ProjectionKind]?: ProjectionKindState | undefined };

/** One staged row edit. `row: undefined` withdraws the unit. */
export interface ProjectionRowChange {
  readonly kind: ProjectionKind;
  readonly path: ProjectionUnitPath;
  readonly row: ProjectionRow | undefined;
}

const sortedUnits = (
  units: Readonly<Record<ProjectionUnitPath, ProjectionRow>>,
): Record<ProjectionUnitPath, ProjectionRow> => {
  return Object.fromEntries(
    Object.entries(units).sort(([left], [right]) => compareCodePoints(left, right)),
  );
};

/**
 * Apply row edits to one kind under `contract`.
 *
 * A changed row is set and a withdrawn row deleted. When the recorded
 * contract differs from `contract`, every row not set by this write keeps its
 * `output` and loses `gen`, so it is never current yet still serves as
 * deletion evidence. Rows are never bulk-dropped. Returns `undefined` when the
 * kind has no units left.
 */
export const applyKindChanges = (
  state: ProjectionKindState | undefined,
  contract: number,
  changes: ReadonlyArray<{
    readonly path: ProjectionUnitPath;
    readonly row: ProjectionRow | undefined;
  }>,
): ProjectionKindState | undefined => {
  const units = new Map<ProjectionUnitPath, ProjectionRow>();
  const contractChanged = state !== undefined && state.contract !== contract;
  for (const [key, row] of Object.entries(state?.units ?? {})) {
    const path = ProjectionUnitPathSchema.make(key);
    units.set(path, contractChanged ? { output: row.output } : row);
  }
  for (const change of changes) {
    if (change.row === undefined) units.delete(change.path);
    else units.set(change.path, change.row);
  }
  return units.size === 0 ? undefined : { contract, units: sortedUnits(Object.fromEntries(units)) };
};

/** Drop empty kinds and sort unit keys; `undefined` for an empty section. */
export const normalizeProjections = (
  projections: Projections | undefined,
): Projections | undefined => {
  if (projections === undefined) return undefined;
  const normalized: MutableProjections = {};
  for (const kind of PROJECTION_KINDS) {
    const state = projections[kind];
    if (state === undefined || Object.keys(state.units).length === 0) continue;
    normalized[kind] = { contract: state.contract, units: sortedUnits(state.units) };
  }
  return Object.keys(normalized).length === 0 ? undefined : normalized;
};

/** Stage row changes against the current contract of each kind. */
export const stageProjectionChanges = (
  projections: Projections | undefined,
  changes: ReadonlyArray<ProjectionRowChange>,
): Projections | undefined => {
  const next: MutableProjections = { ...projections };
  for (const kind of PROJECTION_KINDS) {
    const forKind = changes.filter((change) => change.kind === kind);
    if (forKind.length === 0) continue;
    const state = applyKindChanges(projections?.[kind], PROJECTION_CONTRACTS[kind], forKind);
    if (state === undefined) delete next[kind];
    else next[kind] = state;
  }
  return normalizeProjections(next);
};

/**
 * Three-way merge of projection rows: apply the base→next row edits to the
 * freshly read section, keeping the kind-consistency rule.
 */
export const patchProjections = (
  fresh: Projections | undefined,
  base: Projections | undefined,
  next: Projections | undefined,
): Projections | undefined => {
  const patched: MutableProjections = { ...fresh };
  for (const kind of PROJECTION_KINDS) {
    const before = base?.[kind];
    const after = next?.[kind];
    const changes: Array<{ path: ProjectionUnitPath; row: ProjectionRow | undefined }> = [];
    for (const key of Object.keys(before?.units ?? {})) {
      const path = ProjectionUnitPathSchema.make(key);
      if (!Object.hasOwn(after?.units ?? {}, path)) changes.push({ path, row: undefined });
    }
    for (const [key, row] of Object.entries(after?.units ?? {})) {
      const path = ProjectionUnitPathSchema.make(key);
      if (
        !Equal.equals(
          Object.hasOwn(before?.units ?? {}, path) ? before?.units[path] : undefined,
          row,
        )
      )
        changes.push({ path, row });
    }
    const contractChanged = after !== undefined && after.contract !== before?.contract;
    if (changes.length === 0 && !contractChanged) continue;
    const contract = after?.contract ?? fresh?.[kind]?.contract ?? PROJECTION_CONTRACTS[kind];
    const state = applyKindChanges(fresh?.[kind], contract, changes);
    if (state === undefined) delete patched[kind];
    else patched[kind] = state;
  }
  return normalizeProjections(patched);
};

/** A recorded row with its currency standing under the current contract. */
export interface RecordedProjectionRow {
  readonly row: ProjectionRow;
  /** Recorded contract differs from the current one, or no `gen`: never current, still evidence. */
  readonly stale: boolean;
}

/** Rows of one kind keyed by scope-relative unit path. */
export const recordedProjectionRows = (
  projections: Projections | undefined,
  kind: ProjectionKind,
): ReadonlyMap<ProjectionUnitPath, RecordedProjectionRow> => {
  const state = projections?.[kind];
  const rows = new Map<ProjectionUnitPath, RecordedProjectionRow>();
  if (state === undefined) return rows;
  const contractStale = state.contract !== PROJECTION_CONTRACTS[kind];
  for (const [key, row] of Object.entries(state.units))
    rows.set(ProjectionUnitPathSchema.make(key), {
      row,
      stale: contractStale || row.gen === undefined,
    });
  return rows;
};
