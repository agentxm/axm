/**
 * Hook manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  CanonicalHookEventIdSchema,
  CanonicalHookToolIdSchema,
  HookBlockOutcomeSchema,
  HookModifyOperationSchema,
} from "../agent-capabilities/index.js";
import {
  CommonManifestBaseFields,
  ExtensionNameSchema,
  NonPackManifestFields,
} from "../extensions/common.js";

export const HOOK_MANIFEST_FILENAME = "hook.json";

export const HOOK_EXTENSION_DIR = "hooks";

export const HOOK_MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/hook.schema.json";

export const HookRuntimeSchema = Schema.Literals(["bash", "node", "python"]).annotate({
  identifier: "HookRuntime",
  title: "Hook Runtime",
  description: "Interpreter family used to execute the materialized hook entrypoint.",
});

/** @experimental */
export type HookRuntime = Schema.Schema.Type<typeof HookRuntimeSchema>;

export const HookEventSchema = CanonicalHookEventIdSchema.annotate({
  identifier: "HookEvent",
  title: "Hook Event",
  description: "Canonical AXM hook event this extension binds to.",
});

/** @experimental */
export type HookEvent = Schema.Schema.Type<typeof HookEventSchema>;

export const HookMatchSchema = Schema.Struct({
  tools: Schema.optional(
    Schema.NonEmptyArray(CanonicalHookToolIdSchema).pipe(Schema.check(Schema.isUnique())),
  ),
}).annotate({
  identifier: "HookMatch",
  title: "Hook Match",
  description: "Portable hook matcher expressed over AXM canonical tool IDs.",
});

/** @experimental */
export type HookMatch = Schema.Schema.Type<typeof HookMatchSchema>;

export const HookDecisionRequirementSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("observe") }),
  Schema.Struct({
    kind: Schema.Literal("block"),
    outcomes: Schema.optional(
      Schema.NonEmptyArray(HookBlockOutcomeSchema).pipe(Schema.check(Schema.isUnique())),
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal("modify"),
    operations: Schema.optional(
      Schema.NonEmptyArray(HookModifyOperationSchema).pipe(Schema.check(Schema.isUnique())),
    ),
  }),
]).annotate({
  identifier: "HookDecisionRequirement",
  title: "Hook Decision Requirement",
  description: "Decision capability a hook binding requires from the target agent event.",
});

/** @experimental */
export type HookDecisionRequirement = Schema.Schema.Type<typeof HookDecisionRequirementSchema>;

export const HookBindingTargetSchema = Schema.Struct({
  matcherRaw: Schema.optional(Schema.NonEmptyString),
}).annotate({
  identifier: "HookBindingTarget",
  title: "Hook Binding Target",
  description: "Target-agent-specific hook binding escape hatches.",
});

export const CanonicalHookBindingSchema = Schema.Struct({
  on: HookEventSchema,
  match: Schema.optional(HookMatchSchema),
  matcherRaw: Schema.optional(Schema.NonEmptyString),
  targets: Schema.optional(Schema.Record(Schema.String, HookBindingTargetSchema)),
  requires: Schema.optional(
    Schema.Struct({
      decision: HookDecisionRequirementSchema,
    }),
  ),
}).annotate({
  identifier: "CanonicalHookBinding",
  title: "Canonical Hook Binding",
  description: "Universal hook event binding expressed in AXM canonical vocabulary.",
});

export const HookBindingSchema = CanonicalHookBindingSchema.annotate({
  identifier: "HookBinding",
  title: "Hook Binding",
  description:
    "Universal hook event binding with portable canonical matching and raw native escape hatches.",
});

/** @experimental */
export type HookBinding = Schema.Schema.Type<typeof HookBindingSchema>;

export const HookCapabilitiesSchema = Schema.Struct({
  network: Schema.optional(Schema.Boolean),
  filesystemWrite: Schema.optional(Schema.Boolean),
  exec: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  env: Schema.optional(Schema.Array(Schema.NonEmptyString)),
}).annotate({
  identifier: "HookCapabilities",
  title: "Hook Capabilities",
  description: "Advisory author-declared hook capability surface. v1 does not enforce it.",
});

/** @experimental */
export type HookCapabilities = Schema.Schema.Type<typeof HookCapabilitiesSchema>;

/**
 * Schema for hook manifest files (hook.json).
 *
 * Hooks distribute an executable body plus agent event bindings. Install
 * materializes the body under .axm/extensions and registers native agent hook
 * settings that invoke the materialized entrypoint.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const HookManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  ...NonPackManifestFields,
  type: Schema.Literal("hook"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "hook name is required" }),
    Schema.annotate({
      description:
        "Short name for this hook within its owner namespace. Combined with owner, forms the FQN @owner/hooks/<name>.",
    }),
  ),
  title: Schema.optional(
    Schema.NonEmptyString.annotate({
      description: "Optional display title for this hook.",
    }),
  ),
  runtime: HookRuntimeSchema.pipe(Schema.annotateKey({ messageMissingKey: "runtime is required" })),
  entrypoint: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "entrypoint is required" }),
    Schema.annotate({
      description: "Hook body entrypoint path, relative to the hook manifest directory.",
      examples: ["src/hook.sh", "src/hook.js", "src/hook.py"],
    }),
  ),
  bindings: Schema.Array(HookBindingSchema).pipe(
    Schema.annotateKey({ messageMissingKey: "bindings are required" }),
  ),
  timeoutMs: Schema.optional(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
  capabilities: Schema.optional(HookCapabilitiesSchema),
}).annotate({
  identifier: "HookManifest",
  title: "Hook Manifest",
  description:
    "Hook manifest for managed agent hooks. The executable body lives under src/ and is invoked from native agent settings.",
});

/** @experimental */
export type HookManifest = Schema.Schema.Type<typeof HookManifestSchema>;
