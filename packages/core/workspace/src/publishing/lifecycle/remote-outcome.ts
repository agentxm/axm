/**
 * The honest outcome of a Registry write.
 *
 * A published-extension transition is a remote effect. It is not closure-atomic
 * and nothing local can restore it: the Registry either recorded the write or
 * it did not, and this outcome says which. It deliberately does not describe
 * itself as a workspace operation with an artifact, a scope, or a rollback.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

export const REGISTRY_TRANSITION_CONTRACT = "registry-transition-v1" as const;

export const RegistryTransitionActionSchema = Schema.Literals([
  "yank",
  "unyank",
  "deprecate",
  "undeprecate",
  "visibility-set",
  "visibility-reconcile",
] as const).annotate({ identifier: "RegistryTransitionAction" });

export const RegistryTransitionDispositionSchema = Schema.Literals([
  /** The Registry recorded a change. */
  "changed",
  /** The Registry already held the requested state; nothing changed. */
  "already-current",
] as const).annotate({ identifier: "RegistryTransitionDisposition" });

export const RegistryTransitionSchema = Schema.Struct({
  contract: Schema.Literal(REGISTRY_TRANSITION_CONTRACT),
  action: RegistryTransitionActionSchema,
  /** The Registry origin the write was addressed to. */
  registry: Schema.String,
  /** The extension identity, and the exact version when one was addressed. */
  target: Schema.String,
  version: Schema.optional(Schema.String),
  disposition: RegistryTransitionDispositionSchema,
  /**
   * Remote effects are not restorable. Recorded explicitly so no reader
   * mistakes a Registry transition for a rollbackable workspace operation.
   */
  restorable: Schema.Literal(false),
  /** Whether a person completed step-up verification for this write. */
  verification: Schema.Literals(["not-required", "completed"] as const),
  message: Schema.String,
  /** Versions the write affected, when the Registry enumerated them. */
  affectedVersions: Schema.optional(Schema.Array(Schema.String)),
}).annotate({
  identifier: "RegistryTransition",
  title: "Registry transition",
  description:
    "The outcome of one Registry write on a published extension. Remote effects are not restorable.",
});

export type RegistryTransition = typeof RegistryTransitionSchema.Type;
export type RegistryTransitionAction = typeof RegistryTransitionActionSchema.Type;

export const registryTransition = (input: {
  readonly action: RegistryTransitionAction;
  readonly registry: string;
  readonly target: string;
  readonly version?: string;
  readonly disposition?: RegistryTransition["disposition"];
  readonly verificationCompleted: boolean;
  readonly message: string;
  readonly affectedVersions?: ReadonlyArray<string>;
}): RegistryTransition => ({
  contract: REGISTRY_TRANSITION_CONTRACT,
  action: input.action,
  registry: input.registry,
  target: input.target,
  ...(input.version === undefined ? {} : { version: input.version }),
  disposition: input.disposition ?? "changed",
  restorable: false,
  verification: input.verificationCompleted ? "completed" : "not-required",
  message: input.message,
  ...(input.affectedVersions === undefined ? {} : { affectedVersions: input.affectedVersions }),
});
