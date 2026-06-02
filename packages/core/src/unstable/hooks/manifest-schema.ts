/**
 * Hook manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
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

export const HookEventSchema = Schema.Literals([
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "SessionStart",
  "Stop",
  "SubagentStop",
  "PreCompact",
]).annotate({
  identifier: "HookEvent",
  title: "Hook Event",
  description: "Agent hook event this extension binds to.",
});

/** @experimental */
export type HookEvent = Schema.Schema.Type<typeof HookEventSchema>;

export const HookBindingSchema = Schema.Struct({
  event: HookEventSchema,
  matcher: Schema.optional(Schema.NonEmptyString),
})
  .pipe(
    Schema.check(
      Schema.makeFilter((value) =>
        value.matcher !== undefined && value.event !== "PreToolUse" && value.event !== "PostToolUse"
          ? "matcher is only valid for PreToolUse and PostToolUse bindings"
          : undefined,
      ),
    ),
  )
  .annotate({
    identifier: "HookBinding",
    title: "Hook Binding",
    description: "Universal hook event binding with an optional tool matcher.",
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
  blocking: Schema.optional(Schema.Boolean),
  capabilities: Schema.optional(HookCapabilitiesSchema),
}).annotate({
  identifier: "HookManifest",
  title: "Hook Manifest",
  description:
    "Hook manifest for managed agent hooks. The executable body lives under src/ and is invoked from native agent settings.",
});

/** @experimental */
export type HookManifest = Schema.Schema.Type<typeof HookManifestSchema>;
