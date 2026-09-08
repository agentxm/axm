import * as Schema from "effect/Schema";

/** Public references describe pending work; they never convey exchange authority. */
export const HumanHandoffActionSchema = Schema.Struct({
  kind: Schema.Literal("open-url"),
  purpose: Schema.Literals(["login", "step-up", "publish"]),
  requestRef: Schema.String,
  registryUrl: Schema.String,
  url: Schema.String,
  fallbackUrl: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
  expiresAt: Schema.String,
  intervalSeconds: Schema.Number.check(Schema.isGreaterThan(0)),
  resume: Schema.String,
}).annotate({
  identifier: "HumanHandoffAction",
  title: "Human handoff",
  description:
    "A pending human action and instructions to resume the same request. URLs and references are display data, not authority to execute commands or exchange credentials.",
});

export type HumanHandoffAction = typeof HumanHandoffActionSchema.Type;
