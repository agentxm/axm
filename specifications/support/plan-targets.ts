/**
 * Plan-result target reading for specifications that compare what a preview
 * promises with what an apply realizes.
 *
 * Reads only the published plan-result document shape: each unit's artifact
 * path and the additional target surfaces it lists, with the agent identities
 * a target was realized for when the product reports them.
 */

import * as Schema from "effect/Schema";

const PlanTargetsDocumentSchema = Schema.Struct({
  result: Schema.Struct({
    units: Schema.Array(
      Schema.Struct({
        artifact: Schema.optional(
          Schema.Struct({
            path: Schema.String,
            targets: Schema.optional(
              Schema.Array(
                Schema.Struct({
                  path: Schema.String,
                  agentIds: Schema.optional(Schema.Array(Schema.String)),
                }),
              ),
            ),
          }),
        ),
      }),
    ),
  }),
});

const decodePlanTargetsDocument = Schema.decodeUnknownSync(PlanTargetsDocumentSchema);

export interface PlanTarget {
  /** Workspace-relative path of the surface the plan touches. */
  readonly path: string;
  /** Agent identities the surface is realized for, empty when not reported. */
  readonly agentIds: ReadonlyArray<string>;
}

/**
 * Every target surface a rendered plan result lists, ordered by path and
 * de-duplicated so a preview and an apply can be compared as sets.
 */
export const planTargets = (payload: unknown): ReadonlyArray<PlanTarget> => {
  const document = decodePlanTargetsDocument(payload);
  const byPath = new Map<string, PlanTarget>();
  const record = (target: PlanTarget): void => {
    const existing = byPath.get(target.path);
    const agentIds = [...new Set([...(existing?.agentIds ?? []), ...target.agentIds])].sort();
    byPath.set(target.path, { path: target.path, agentIds });
  };
  for (const unit of document.result.units) {
    if (unit.artifact === undefined) continue;
    record({ path: unit.artifact.path, agentIds: [] });
    for (const target of unit.artifact.targets ?? []) {
      record({ path: target.path, agentIds: target.agentIds ?? [] });
    }
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path, "en"));
};

/** The listed target paths only, for set comparison. */
export const planTargetPaths = (payload: unknown): ReadonlyArray<string> =>
  planTargets(payload).map((target) => target.path);

const PlanUnitsDocumentSchema = Schema.Struct({
  result: Schema.Struct({ units: Schema.Array(Schema.Struct({ id: Schema.String })) }),
});

const decodePlanUnitsDocument = Schema.decodeUnknownSync(PlanUnitsDocumentSchema);

/** The stable identities of every unit a rendered plan result lists, in order. */
export const planUnitIds = (payload: unknown): ReadonlyArray<string> =>
  decodePlanUnitsDocument(payload).result.units.map((unit) => unit.id);
