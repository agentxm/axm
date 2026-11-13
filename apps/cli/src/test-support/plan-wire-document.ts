import * as Schema from "effect/Schema";
import { PlanResolutionResultSchema } from "../operation-output.js";

// Typed observation of the final wire shape. The renderer input keeps mode and
// outcome with the plan; the stdout envelope owns them after normalization.
const { mode, outcome, ...payload } = PlanResolutionResultSchema.fields;
type PlanFields = typeof PlanResolutionResultSchema.fields;
export const PlanWireDocumentSchema: Schema.Struct<{
  ok: typeof Schema.Boolean;
  mode: PlanFields["mode"];
  outcome: PlanFields["outcome"];
  result: Schema.Struct<Omit<PlanFields, "mode" | "outcome">>;
}> = Schema.Struct({
  ok: Schema.Boolean,
  mode,
  outcome,
  result: Schema.Struct(payload),
});
