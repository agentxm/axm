/**
 * Local decoders for the machine documents the built CLI writes.
 *
 * An end-to-end project observes only shipped artifacts, so it may not import
 * the application's own schemas. These declare the fields the examples read,
 * which is also what keeps them honest: a spec that decoded the producer's
 * own schema would agree with the producer by construction.
 */

import * as Schema from "effect/Schema";

/** The `help <topic> --json` result document. */
export const HelpTopicDocument = Schema.Struct({
  ok: Schema.Literal(true),
  result: Schema.Struct({ topic: Schema.String, content: Schema.String }),
});

/** The stable machine error envelope every failing command writes. */
export const ErrorEnvelope = Schema.Struct({
  ok: Schema.Literal(false),
  code: Schema.String,
  title: Schema.String,
  detail: Schema.String,
  suggestions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        description: Schema.String,
        cmd: Schema.optional(Schema.String),
        url: Schema.optional(Schema.String),
      }),
    ),
  ),
});

/**
 * The `agents list --json` result document. The producer's own schema also
 * carries `items`, `available` and `count`; only the fields these
 * specifications read are declared, so the decode stays independent evidence.
 */
export const AgentsListDocument = Schema.Struct({
  configured: Schema.Array(Schema.String),
  detected: Schema.Array(Schema.String),
});

/** One row of the `instructions status --json` document. */
const InstructionStatusItem = Schema.Struct({
  agentId: Schema.String,
  sourceFile: Schema.String,
  targetFile: Schema.String,
});

/** The `instructions status --json` result document. */
export const InstructionsStatusDocument = Schema.Struct({
  enabled: Schema.Boolean,
  sourceFileName: Schema.String,
  roots: Schema.Array(Schema.String),
  items: Schema.Array(InstructionStatusItem),
});

/**
 * The plan-resolution result document every preview or apply writes. Only the
 * fields these examples read are declared, so the decode stays independent of
 * the producer's own schema.
 */
export const PlanResolutionDocument = Schema.Struct({
  /** `false` when the resolution stopped; the outcome says why. */
  ok: Schema.Boolean,
  result: Schema.Struct({
    outcome: Schema.String,
    counts: Schema.optional(Schema.Struct({ committed: Schema.Number })),
    blocking: Schema.optional(
      Schema.Struct({
        class: Schema.String,
        subject: Schema.optional(Schema.String),
        escape: Schema.optional(
          Schema.Struct({
            description: Schema.optional(Schema.String),
            cmd: Schema.optional(Schema.String),
          }),
        ),
      }),
    ),
  }),
});
