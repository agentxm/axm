/** Native Hook package contract. @experimental */
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import { HookBlockOutcomeSchema, HookModifyOperationSchema } from "../agent-capabilities/schema.js";
import {
  CommonManifestBaseFields,
  ConfigurableAgentIdSchema,
  ExtensionNameSchema,
  NonPackManifestFields,
} from "../extensions/common.js";
import { VersionRangeSchema } from "../version-constraints/version-constraints.js";
import type { ConfigurableAgentId } from "../agent-capabilities/identity.js";
import type { WorkspaceScope } from "../workspace-scope.js";

export const HOOK_MANIFEST_FILENAME = "hook.json";
export const HOOK_EXTENSION_DIR = "hooks";
export const HOOK_MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/hook.schema.json";

export const HookRuntimeSchema = Schema.Literals(["bash", "node", "python"]).annotate({
  identifier: "HookRuntime",
  description: "Interpreter family used to execute this native command handler.",
});
export type HookRuntime = Schema.Schema.Type<typeof HookRuntimeSchema>;

const HookIdSchema = Schema.NonEmptyString.check(
  Schema.isPattern(/^[a-z][a-z0-9-]*$/),
  Schema.isMaxLength(80),
);
const ConfigurationKeySchema = Schema.NonEmptyString.check(
  Schema.isPattern(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  Schema.isMaxLength(64),
);
const EnvironmentKeySchema = Schema.NonEmptyString.check(
  Schema.isPattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
);
export const HookPackagePathSchema = Schema.NonEmptyString.check(
  // eslint-disable-next-line no-control-regex -- Package paths must reject control characters, including NUL.
  Schema.isPattern(
    /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*[\\:\u0000-\u001f])[^/]+(?:\/[^/]+)*$/,
  ),
).annotate({
  identifier: "HookPackagePath",
  description:
    "A safe, package-relative POSIX file path. Absolute paths and traversal are forbidden.",
});

/** Symbolic references are preserved, never resolved against the author's environment. */
export const HookEnvironmentReferenceSchema = Schema.Struct({ env: EnvironmentKeySchema });
export const HookValueSchema = Schema.Union([
  Schema.String,
  Schema.Struct({ config: ConfigurationKeySchema }),
  HookEnvironmentReferenceSchema,
]).annotate({ identifier: "HookValue" });
export type HookValue = Schema.Schema.Type<typeof HookValueSchema>;

export const HookConfigurationValueSchema = Schema.Union([
  Schema.String,
  Schema.Finite,
  Schema.Boolean,
  HookEnvironmentReferenceSchema,
]);
export type HookConfigurationValue = Schema.Schema.Type<typeof HookConfigurationValueSchema>;
export const HookConfigurationValuesSchema = Schema.Record(
  ConfigurationKeySchema,
  HookConfigurationValueSchema,
);
export type HookConfigurationValues = Schema.Schema.Type<typeof HookConfigurationValuesSchema>;

const ConfigurationFields = {
  description: Schema.optional(Schema.NonEmptyString),
  required: Schema.optional(Schema.Boolean),
};
export const HookConfigurationFieldSchema = Schema.Union([
  Schema.Struct({
    ...ConfigurationFields,
    type: Schema.Literal("string"),
    default: Schema.optional(Schema.String),
    secret: Schema.optional(Schema.Boolean),
    allowEmpty: Schema.optional(Schema.Boolean),
    minLength: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    maxLength: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  }),
  Schema.Struct({
    ...ConfigurationFields,
    type: Schema.Literal("number"),
    default: Schema.optional(Schema.Finite),
    minimum: Schema.optional(Schema.Finite),
    maximum: Schema.optional(Schema.Finite),
  }),
  Schema.Struct({
    ...ConfigurationFields,
    type: Schema.Literal("boolean"),
    default: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({
    ...ConfigurationFields,
    type: Schema.Literal("enum"),
    values: Schema.NonEmptyArray(Schema.NonEmptyString).check(Schema.isUnique()),
    default: Schema.optional(Schema.NonEmptyString),
  }),
]).annotate({ identifier: "HookConfigurationField" });
export type HookConfigurationField = Schema.Schema.Type<typeof HookConfigurationFieldSchema>;

export const HookBindingRequirementsSchema = Schema.Struct({
  outcomes: Schema.optional(Schema.NonEmptyArray(HookBlockOutcomeSchema).check(Schema.isUnique())),
  operations: Schema.optional(
    Schema.NonEmptyArray(HookModifyOperationSchema).check(Schema.isUnique()),
  ),
}).annotate({
  identifier: "HookBindingRequirements",
  description:
    "Every declared outcome and operation must be supported by this native event. Omit for observation only.",
});

export const HookCommandHandlerSchema = Schema.Struct({
  type: Schema.Literal("command"),
  name: Schema.optional(Schema.NonEmptyString),
  runtime: HookRuntimeSchema,
  entrypoint: HookPackagePathSchema,
  args: Schema.optional(Schema.Array(HookValueSchema)),
  env: Schema.optional(Schema.Record(EnvironmentKeySchema, HookValueSchema)),
  timeoutMs: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
}).annotate({ identifier: "HookCommandHandler" });
export type HookCommandHandler = Schema.Schema.Type<typeof HookCommandHandlerSchema>;

export const HookEventSchema = Schema.NonEmptyString.check(
  Schema.isPattern(/^[a-zA-Z][a-zA-Z0-9_.:-]*$/),
).annotate({
  identifier: "HookEvent",
  description: "Exact event name in the implementation's native host protocol.",
});
export type HookEvent = Schema.Schema.Type<typeof HookEventSchema>;

export const HookBindingSchema = Schema.Struct({
  id: HookIdSchema,
  event: HookEventSchema,
  matcher: Schema.optional(Schema.NonEmptyString),
  handler: HookCommandHandlerSchema,
  requires: Schema.optional(HookBindingRequirementsSchema),
}).annotate({ identifier: "HookBinding" });
export type HookBinding = Schema.Schema.Type<typeof HookBindingSchema>;

export const HookImplementationSchema = Schema.Struct({
  id: HookIdSchema,
  protocol: ConfigurableAgentIdSchema,
  requires: Schema.optional(
    Schema.Struct({
      hostVersion: Schema.optional(VersionRangeSchema),
      profiles: Schema.optional(
        Schema.NonEmptyArray(Schema.NonEmptyString).check(Schema.isUnique()),
      ),
      platforms: Schema.optional(
        Schema.NonEmptyArray(Schema.Literals(["darwin", "linux", "win32"])).check(
          Schema.isUnique(),
        ),
      ),
      scopes: Schema.optional(
        Schema.NonEmptyArray(Schema.Literals(["project", "user"])).check(Schema.isUnique()),
      ),
    }),
  ),
  bindings: Schema.NonEmptyArray(HookBindingSchema),
}).annotate({ identifier: "HookImplementation" });
export type HookImplementation = Schema.Schema.Type<typeof HookImplementationSchema>;

export const HookFixtureSchema = Schema.Struct({
  id: HookIdSchema,
  implementation: HookIdSchema,
  binding: HookIdSchema,
  input: HookPackagePathSchema,
  expect: Schema.Struct({
    exitCode: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 })),
    stdout: Schema.optional(HookPackagePathSchema),
    stderr: Schema.optional(HookPackagePathSchema),
  }),
}).annotate({
  identifier: "HookFixture",
  description:
    "Native stdin and expected output files used only by explicitly requested fixture execution.",
});
export type HookFixture = Schema.Schema.Type<typeof HookFixtureSchema>;

const HookManifestStruct = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  enhances: NonPackManifestFields.enhances,
  requires: NonPackManifestFields.requires,
  recommendedPacks: NonPackManifestFields.recommendedPacks,
  standalone: NonPackManifestFields.standalone,
  type: Schema.Literal("hook"),
  name: ExtensionNameSchema,
  title: Schema.optional(Schema.NonEmptyString),
  implementations: Schema.NonEmptyArray(HookImplementationSchema),
  configuration: Schema.optional(
    Schema.Record(ConfigurationKeySchema, HookConfigurationFieldSchema),
  ),
  assets: Schema.optional(Schema.Array(HookPackagePathSchema).check(Schema.isUnique())),
  fixtures: Schema.optional(Schema.Array(HookFixtureSchema)),
});

const configurationValueProblem = (
  field: HookConfigurationField,
  value: HookConfigurationValue,
): string | undefined => {
  if (field.type === "string" && field.secret === true) {
    return typeof value === "object"
      ? undefined
      : "Secret configuration requires a symbolic environment reference.";
  }
  if (typeof value === "object")
    return "Environment references are only accepted by secret string configuration.";
  switch (field.type) {
    case "string":
      if (typeof value !== "string") return "Expected a string.";
      if (value.length === 0 && field.allowEmpty !== true) return "An empty string is not allowed.";
      if (field.minLength !== undefined && value.length < field.minLength)
        return "String is shorter than minLength.";
      if (field.maxLength !== undefined && value.length > field.maxLength)
        return "String is longer than maxLength.";
      return undefined;
    case "boolean":
      return typeof value === "boolean" ? undefined : "Expected a boolean.";
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return "Expected a finite number.";
      if (field.minimum !== undefined && value < field.minimum) return "Number is below minimum.";
      if (field.maximum !== undefined && value > field.maximum) return "Number exceeds maximum.";
      return undefined;
    case "enum":
      return typeof value === "string" && field.values.includes(value)
        ? undefined
        : "Expected a declared enum value.";
  }
};

export const HookManifestSchema = HookManifestStruct.check(
  Schema.makeFilter((manifest) => {
    const issues: Array<Schema.FilterIssue> = [];
    const implementationIds = new Set<string>();
    for (const [index, implementation] of manifest.implementations.entries()) {
      if (implementationIds.has(implementation.id))
        issues.push({
          path: ["implementations", index, "id"],
          issue: "Implementation IDs must be unique.",
        });
      implementationIds.add(implementation.id);
      const bindingIds = new Set<string>();
      for (const [bindingIndex, binding] of implementation.bindings.entries()) {
        if (bindingIds.has(binding.id))
          issues.push({
            path: ["implementations", index, "bindings", bindingIndex, "id"],
            issue: "Binding IDs must be unique within an implementation.",
          });
        bindingIds.add(binding.id);
        for (const value of [
          ...(binding.handler.args ?? []),
          ...Object.values(binding.handler.env ?? {}),
        ]) {
          if (
            typeof value === "object" &&
            "config" in value &&
            !Object.hasOwn(manifest.configuration ?? {}, value.config)
          ) {
            issues.push({
              path: ["implementations", index, "bindings", bindingIndex, "handler"],
              issue: `Unknown configuration reference: ${value.config}.`,
            });
          }
        }
      }
    }
    for (const [key, field] of Object.entries(manifest.configuration ?? {})) {
      if (field.default !== undefined) {
        const problem = configurationValueProblem(field, field.default);
        if (problem !== undefined)
          issues.push({ path: ["configuration", key, "default"], issue: problem });
      }
      if (
        field.type === "string" &&
        field.minLength !== undefined &&
        field.maxLength !== undefined &&
        field.minLength > field.maxLength
      )
        issues.push({
          path: ["configuration", key],
          issue: "minLength must not exceed maxLength.",
        });
      if (
        field.type === "number" &&
        field.minimum !== undefined &&
        field.maximum !== undefined &&
        field.minimum > field.maximum
      )
        issues.push({ path: ["configuration", key], issue: "minimum must not exceed maximum." });
    }
    const fixtureIds = new Set<string>();
    for (const [index, fixture] of (manifest.fixtures ?? []).entries()) {
      if (fixtureIds.has(fixture.id))
        issues.push({ path: ["fixtures", index, "id"], issue: "Fixture IDs must be unique." });
      fixtureIds.add(fixture.id);
      const implementation = manifest.implementations.find(
        (entry) => entry.id === fixture.implementation,
      );
      if (
        implementation === undefined ||
        !implementation.bindings.some((entry) => entry.id === fixture.binding)
      )
        issues.push({
          path: ["fixtures", index],
          issue: "Fixture must reference an existing implementation and binding.",
        });
    }
    return issues;
  }),
).annotate({
  identifier: "HookManifest",
  title: "Hook Manifest",
  description:
    "A package of explicit native Hook implementations, shared assets, typed consumer configuration, and optional native protocol fixtures. AXM installs native settings; it does not translate payloads or execute hook bodies during lifecycle operations.",
});
export type HookManifest = Schema.Schema.Type<typeof HookManifestSchema>;

/** The complete referenced file closure, including every implementation and fixture. */
export const referencedHookPackageFiles = (manifest: HookManifest): ReadonlyArray<string> => [
  ...new Set([
    ...(manifest.assets ?? []),
    ...manifest.implementations.flatMap((implementation) =>
      implementation.bindings.map((binding) => binding.handler.entrypoint),
    ),
    ...(manifest.fixtures ?? []).flatMap((fixture) => [
      fixture.input,
      ...(fixture.expect.stdout === undefined ? [] : [fixture.expect.stdout]),
      ...(fixture.expect.stderr === undefined ? [] : [fixture.expect.stderr]),
    ]),
  ]),
];

export interface HookConfigurationIssue {
  readonly key: string;
  readonly code: "unknown" | "missing" | "invalid";
  readonly message: string;
}

/** Explicit consumer values override author defaults; no source objects are mutated. */
export const resolveHookConfiguration = (
  manifest: Pick<HookManifest, "configuration">,
  values: Readonly<Record<string, unknown>> = {},
): Result.Result<
  Readonly<Record<string, HookConfigurationValue>>,
  ReadonlyArray<HookConfigurationIssue>
> => {
  const fields = manifest.configuration ?? {};
  const issues: Array<HookConfigurationIssue> = [];
  const resolved: Record<string, HookConfigurationValue> = {};
  for (const key of Object.keys(values))
    if (!Object.hasOwn(fields, key))
      issues.push({ key, code: "unknown", message: "Unknown hook configuration key." });
  for (const [key, field] of Object.entries(fields)) {
    const input = Object.hasOwn(values, key) ? values[key] : field.default;
    if (input === undefined) {
      if (field.required === true)
        issues.push({ key, code: "missing", message: "Required hook configuration is missing." });
      continue;
    }
    const decoded = Schema.decodeUnknownResult(HookConfigurationValueSchema)(input, {
      onExcessProperty: "error",
    });
    if (Result.isFailure(decoded)) {
      issues.push({
        key,
        code: "invalid",
        message: "Expected a scalar value or symbolic environment reference.",
      });
      continue;
    }
    const problem = configurationValueProblem(field, decoded.success);
    if (problem !== undefined) issues.push({ key, code: "invalid", message: problem });
    else resolved[key] = decoded.success;
  }
  return issues.length > 0 ? Result.fail(issues) : Result.succeed(resolved);
};

export interface HookImplementationContext {
  readonly scope: WorkspaceScope;
  readonly platform?: "darwin" | "linux" | "win32";
  readonly hostVersion?: string;
  readonly profile?: string;
}
export type HookImplementationResolution =
  | {
      readonly status: "selected" | "conditional";
      readonly implementation: HookImplementation;
      readonly conditions: ReadonlyArray<string>;
    }
  | { readonly status: "unsupported"; readonly reasons: ReadonlyArray<string> }
  | { readonly status: "ambiguous"; readonly implementationIds: ReadonlyArray<string> };

/** Select declared implementations without treating unknown host facts as verified support. */
export const resolveHookImplementation = (
  manifest: HookManifest,
  agentId: ConfigurableAgentId,
  context: HookImplementationContext,
): HookImplementationResolution => {
  const candidates: Array<{ implementation: HookImplementation; conditions: Array<string> }> = [];
  const reasons: Array<string> = [];
  for (const implementation of manifest.implementations) {
    if (implementation.protocol !== agentId) continue;
    const required = implementation.requires;
    if (required?.scopes !== undefined && !required.scopes.includes(context.scope)) {
      reasons.push(`${implementation.id} does not support ${context.scope} scope.`);
      continue;
    }
    const conditions: Array<string> = [];
    let excluded = false;
    if (required?.platforms !== undefined) {
      if (context.platform === undefined)
        conditions.push(`Platform must be one of: ${required.platforms.join(", ")}.`);
      else if (!required.platforms.includes(context.platform)) {
        reasons.push(`${implementation.id} does not support ${context.platform}.`);
        excluded = true;
      }
    }
    if (required?.profiles !== undefined) {
      if (context.profile === undefined)
        conditions.push(`Host profile must be one of: ${required.profiles.join(", ")}.`);
      else if (!required.profiles.includes(context.profile)) {
        reasons.push(`${implementation.id} does not support profile ${context.profile}.`);
        excluded = true;
      }
    }
    if (required?.hostVersion !== undefined) {
      if (context.hostVersion === undefined)
        conditions.push(`Host version must satisfy ${required.hostVersion}.`);
      else if (!semver.satisfies(context.hostVersion, required.hostVersion)) {
        reasons.push(`${implementation.id} requires host version ${required.hostVersion}.`);
        excluded = true;
      }
    }
    if (!excluded) candidates.push({ implementation, conditions });
  }
  if (candidates.length > 1)
    return {
      status: "ambiguous",
      implementationIds: candidates.map(({ implementation }) => implementation.id),
    };
  const candidate = candidates[0];
  if (candidate === undefined)
    return {
      status: "unsupported",
      reasons:
        reasons.length > 0
          ? reasons
          : [`No implementation declares the ${agentId} native protocol.`],
    };
  return { status: candidate.conditions.length === 0 ? "selected" : "conditional", ...candidate };
};
