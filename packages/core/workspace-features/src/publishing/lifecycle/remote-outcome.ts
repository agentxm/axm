/**
 * Acknowledged Registry writes share one machine contract. Their state is
 * action-specific; remote effects are not restorable workspace operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
import * as Schema from "effect/Schema";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import {
  ExtensionFqnSchema,
  ExtensionVisibilitySchema,
} from "@agentxm/extension-model/unstable/extensions";
import { ArchivalViewSchema } from "@agentxm/extension-model/unstable/extensions/archival";
import { DeprecationViewSchema } from "@agentxm/extension-model/unstable/extensions/deprecation";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";

export const REGISTRY_TRANSITION_CONTRACT = "registry-transition-v1" as const;

export const RegistryTransitionActionSchema = Schema.Literals([
  "yank",
  "unyank",
  "deprecate",
  "undeprecate",
  "archive",
  "unarchive",
  "visibility-set",
  "visibility-reconcile",
]).annotate({ identifier: "RegistryTransitionAction" });

export const RegistryTransitionDispositionSchema = Schema.Literals([
  "changed",
  "already-current",
]).annotate({ identifier: "RegistryTransitionDisposition" });

const version = Schema.toEncoded(VersionSchema);

const common = {
  contract: Schema.Literal(REGISTRY_TRANSITION_CONTRACT),
  registry: Schema.String,
  fqn: ExtensionFqnSchema,
  disposition: RegistryTransitionDispositionSchema,
  revision: Schema.NonEmptyString,
  restorable: Schema.Literal(false),
  message: Schema.String,
  affectedVersions: Schema.optional(Schema.Array(version)),
};

const versionState = Schema.Struct({
  yankedAt: Schema.NullOr(DateTimeUtcSchema),
  yankCategory: Schema.NullOr(Schema.Literals(["broken", "security", "accidental", "other"])),
  yankMessage: Schema.NullOr(Schema.String),
});

export const RegistryTransitionSchema = Schema.Union([
  Schema.Struct({
    ...common,
    action: Schema.Literals(["yank", "unyank"]),
    version,
    before: versionState,
    after: versionState,
  }),
  Schema.Struct({
    ...common,
    action: Schema.Literal("yank"),
    before: Schema.Array(version),
    after: Schema.Array(version),
  }),
  Schema.Struct({
    ...common,
    action: Schema.Literals(["deprecate", "undeprecate"]),
    before: Schema.NullOr(DeprecationViewSchema),
    after: Schema.NullOr(DeprecationViewSchema),
  }),
  Schema.Struct({
    ...common,
    action: Schema.Literals(["archive", "unarchive"]),
    before: Schema.NullOr(ArchivalViewSchema),
    after: Schema.NullOr(ArchivalViewSchema),
  }),
  Schema.Struct({
    ...common,
    action: Schema.Literals(["visibility-set", "visibility-reconcile"]),
    before: ExtensionVisibilitySchema,
    after: ExtensionVisibilitySchema,
  }),
]).annotate({
  identifier: "RegistryTransition",
  title: "Registry transition",
  description:
    "The acknowledged before/after state and revision of a non-restorable Registry write, discriminated by action.",
});

export type RegistryTransition = typeof RegistryTransitionSchema.Type;
export type RegistryTransitionAction = typeof RegistryTransitionActionSchema.Type;

type TransitionInput<T> = T extends RegistryTransition ? Omit<T, "contract" | "restorable"> : never;

export const registryTransition = <const Input extends TransitionInput<RegistryTransition>>(
  input: Input,
) => ({
  ...input,
  contract: REGISTRY_TRANSITION_CONTRACT,
  restorable: false as const,
});
