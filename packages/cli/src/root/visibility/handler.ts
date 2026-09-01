import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { RegistryUrl } from "@agentxm/registry-client";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";
import { CliRenderer, type TableView } from "@agentxm/extension-management/unstable/cli-renderer";
import {
  ExtensionFqnSchema,
  ExtensionVisibilitySchema,
  parseExtensionFqnParts,
} from "@agentxm/extension-model/unstable/extensions";
import {
  VisibilityEvaluationSchema,
  VisibilityMutationResultSchema,
  resolveVisibilityIntent,
  type VisibilityIntent,
} from "@agentxm/registry-protocol/unstable/publish";
import { createRegistryClient, type ExtensionVisibility } from "@agentxm/registry-client";
import { manifestFilenameForType } from "@agentxm/registry-protocol/unstable/publish";
import { WorkspaceMutations } from "@agentxm/workspace-state";

import { runWithStepUp } from "../step-up.js";

const ManifestVisibilitySchema = Schema.Struct({
  publish: Schema.optional(
    Schema.Struct({ visibility: Schema.optional(ExtensionVisibilitySchema) }),
  ),
});

interface VisibilityRow {
  readonly field: string;
  readonly value: string;
}

const VisibilityTable = {
  columns: {
    field: { header: "Field" },
    value: { header: "Value" },
  },
} as const satisfies TableView<VisibilityRow>;

const parseTarget = (input: string) =>
  Effect.gen(function* () {
    const parts = parseExtensionFqnParts(input);
    if (parts === undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid extension target: ${input}`,
        suggestions: [
          { description: "Use @owner/<plural-type>/name, for example @acme/skills/review." },
        ],
      });
    }
    const target = yield* Schema.decodeUnknownEffect(ExtensionFqnSchema)(input).pipe(
      Effect.mapError((cause) =>
        makeAppError({ code: "validation", detail: `Invalid extension target: ${input}`, cause }),
      ),
    );
    return { parts, target };
  });

const repositoryIntent = (parts: NonNullable<ReturnType<typeof parseExtensionFqnParts>>) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (workspace.layout.scope !== "project") {
      return yield* makeAppError({
        code: "validation",
        detail: "Repository visibility intent requires project scope.",
      });
    }
    const manifestPath = path.join(
      workspace.layout.authoredRoot(parts.type),
      parts.name,
      manifestFilenameForType(parts.type),
    );
    const manifest = yield* fs.exists(manifestPath).pipe(
      Effect.flatMap((exists) =>
        exists
          ? fs
              .readFileString(manifestPath)
              .pipe(
                Effect.flatMap(
                  Schema.decodeUnknownEffect(Schema.fromJsonString(ManifestVisibilitySchema)),
                ),
                Effect.map(Option.some),
              )
          : Effect.succeed(Option.none()),
      ),
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Unable to read visibility intent from ${manifestPath}.`,
          cause,
        }),
      ),
    );
    const workspaceDefault = yield* workspace.getPublishDefaultVisibility().pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: "Unable to read workspace publication visibility.",
          cause,
        }),
      ),
    );
    return resolveVisibilityIntent({
      ...Option.match(manifest, {
        onNone: () => ({}),
        onSome: (value) =>
          value.publish?.visibility === undefined
            ? {}
            : {
                manifest: {
                  value: value.publish.visibility,
                  material: JSON.stringify({ publish: { visibility: value.publish.visibility } }),
                },
              },
      }),
      ...Option.match(workspaceDefault, {
        onNone: () => ({}),
        onSome: (value) => ({
          workspace: {
            value,
            material: JSON.stringify({ publish: { defaultVisibility: value } }),
          },
        }),
      }),
    });
  });

const getEvaluation = (target: string, intent: VisibilityIntent | null) =>
  Effect.gen(function* () {
    const parsed = yield* parseTarget(target);
    const registryUrl = yield* RegistryUrl;
    const client = yield* createRegistryClient(registryUrl);
    const evaluation = yield* client
      .getExtensionVisibility({ ...parsed.parts, intent })
      .pipe(Effect.mapError(toAppError));
    return { client, evaluation, parsed };
  });

const emitEvaluation = (evaluation: typeof VisibilityEvaluationSchema.Type) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    if (yield* renderer.result(evaluation, VisibilityEvaluationSchema)) return;
    yield* renderer.table(
      [
        { field: "Extension", value: evaluation.target },
        { field: "Intended", value: evaluation.intent?.value ?? "not configured" },
        { field: "Actual", value: evaluation.actual?.value ?? "not established" },
        { field: "Comparison", value: evaluation.comparison },
        { field: "Source", value: evaluation.intent?.source ?? "-" },
      ],
      VisibilityTable,
    );
    for (const finding of evaluation.findings) {
      yield* renderer.message(`${finding.severity.toUpperCase()}: ${finding.message}`);
    }
  });

export const handleVisibilityStatus = (target: string) =>
  Effect.gen(function* () {
    const parsed = yield* parseTarget(target);
    const intent = yield* repositoryIntent(parsed.parts);
    const registryUrl = yield* RegistryUrl;
    const client = yield* createRegistryClient(registryUrl);
    yield* emitEvaluation(
      yield* client
        .getExtensionVisibility({ ...parsed.parts, intent })
        .pipe(Effect.mapError(toAppError)),
    );
  });

const emitMutation = (result: typeof VisibilityMutationResultSchema.Type) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    if (yield* renderer.result(result, VisibilityMutationResultSchema)) return;
    yield* renderer.success(
      result.result === "already-satisfied"
        ? `${result.target} is already ${result.after}.`
        : `Changed ${result.target} from ${result.before} to ${result.after}.`,
    );
  });

export const handleVisibilitySet = (target: string, visibility: ExtensionVisibility) =>
  Effect.gen(function* () {
    const { client, evaluation, parsed } = yield* getEvaluation(target, null);
    if (evaluation.actual === null) {
      return yield* makeAppError({
        code: "not_found",
        detail: `${target} has no established Registry visibility.`,
      });
    }
    const actual = evaluation.actual;
    const mutation = yield* runWithStepUp(
      (verification) =>
        client
          .updateExtensionVisibility({
            target: parsed.target,
            visibility,
            revision: actual.revision,
            authority: { kind: "operator" },
            ...(verification === undefined ? {} : { verification }),
          })
          .pipe(Effect.mapError(toAppError)),
      {
        initial: `Updating ${target}`,
        success: `Updated ${target}`,
        failure: `Failed to update ${target}`,
        cancelled: `Cancelled update for ${target}`,
        waiting: `Waiting for verification to update ${target}`,
        authorized: `Authorized update for ${target}`,
      },
    );
    yield* emitMutation(mutation.value);
  });

export const handleVisibilityReconcile = (target: string) =>
  Effect.gen(function* () {
    const parsed = yield* parseTarget(target);
    const intent = yield* repositoryIntent(parsed.parts);
    if (intent === null) {
      return yield* makeAppError({
        code: "validation",
        detail: `${target} has no manifest or workspace visibility intent to reconcile.`,
      });
    }
    const registryUrl = yield* RegistryUrl;
    const client = yield* createRegistryClient(registryUrl);
    const evaluation = yield* client
      .getExtensionVisibility({ ...parsed.parts, intent })
      .pipe(Effect.mapError(toAppError));
    if (evaluation.actual === null) {
      return yield* makeAppError({
        code: "not_found",
        detail: `${target} has no established Registry visibility.`,
      });
    }
    const actual = evaluation.actual;
    const mutation = yield* runWithStepUp(
      (verification) =>
        client
          .updateExtensionVisibility({
            target: parsed.target,
            visibility: intent.value,
            revision: actual.revision,
            authority: {
              kind: "repository",
              source: intent.source,
              fingerprint: intent.fingerprint,
            },
            ...(verification === undefined ? {} : { verification }),
          })
          .pipe(Effect.mapError(toAppError)),
      {
        initial: `Reconciling ${target}`,
        success: `Reconciled ${target}`,
        failure: `Failed to reconcile ${target}`,
        cancelled: `Cancelled reconciliation for ${target}`,
        waiting: `Waiting for verification to reconcile ${target}`,
        authorized: `Authorized reconciliation for ${target}`,
      },
    );
    yield* emitMutation(mutation.value);
  });
