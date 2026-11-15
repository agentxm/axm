/**
 * A saved publish result as verification input.
 *
 * `axm publish --json` writes an envelope whose `result` is the
 * `publish-result-v3` payload without `mode`, which the envelope promotes, so
 * neither the envelope nor its `result` decodes as the publish result schema
 * itself. Verification accepts the envelope or its bare `result`, decodes only
 * the fields it reads from the canonical field schemas, and takes the admitted
 * publication set as its selection. Each prepared archive integrity is that
 * release's caller-supplied expectation; reported participation, action,
 * status and settlement are carried as reported input, never as observations.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Predicate from "effect/Predicate";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import type { OperationRefused } from "@agentxm/workspace-kernel/operations";

import { publishRefused } from "../errors.js";
import { PublishResultSchema } from "../publish/result.js";
import type { ReleaseVerificationRelease } from "./document.js";
import { releaseId, type ReleaseReference } from "./reference.js";

const { contract, selection, publicationSet, execution } = PublishResultSchema.fields;

/** The publish-result fields verification reads; every other property is ignored. */
const VerificationPublishResultSchema = Schema.Struct({
  contract,
  selection: Schema.Struct({ registry: selection.fields.registry }),
  publicationSet,
  execution: Schema.Struct({ outcomes: execution.fields.outcomes }),
});

const decodeJson = Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Unknown));
const decodePublishResult = Schema.decodeUnknownResult(VerificationPublishResultSchema);

const EXPECTED_CONTRACT = "publish-result-v3";

/** The Registry name a publish result records when its run had no selection. */
const UNRECORDED_REGISTRY = "unknown";

const refuse = (
  detail: string,
  options: { readonly cause?: unknown; readonly suggestion?: string } = {},
) =>
  publishRefused({
    category: "validation",
    detail,
    ...(options.cause === undefined ? {} : { cause: options.cause }),
    ...(options.suggestion === undefined
      ? {}
      : { suggestions: [{ description: options.suggestion }] }),
  });

/** One release a publish result selects, with what the result claimed for it. */
interface PublishResultRelease {
  readonly reference: ReleaseReference;
  readonly expectation?: { readonly integrity: string };
  readonly reported: NonNullable<ReleaseVerificationRelease["reported"]>;
}

/** The selection a publish result supplies: its releases and the Registry it recorded. */
interface PublishResultSelection {
  /** The recorded Registry selector, when the result recorded one. */
  readonly registry: string | undefined;
  readonly releases: ReadonlyArray<PublishResultRelease>;
}

const objectProperty = (value: unknown, key: string): unknown =>
  Predicate.isObject(value) && Object.hasOwn(value, key) && Predicate.hasProperty(value, key)
    ? value[key]
    : undefined;

/**
 * Decide the selection one parsed publish result document supplies. Every
 * refusal is a validation failure decided before any Registry request.
 */
const publishResultSelection = (
  document: unknown,
): Result.Result<PublishResultSelection, OperationRefused> => {
  const wrapped = objectProperty(document, "result");
  if (wrapped === undefined && objectProperty(document, "ok") === false)
    return Result.fail(
      refuse("The publish result is an error document and records no publication set."),
    );
  const payload = Predicate.isObject(wrapped) ? wrapped : document;
  const declared = objectProperty(payload, "contract");
  if (Predicate.isString(declared) && declared !== EXPECTED_CONTRACT)
    return Result.fail(
      refuse(`The document declares contract ${declared}, not ${EXPECTED_CONTRACT}.`),
    );
  const decoded = decodePublishResult(payload);
  if (Result.isFailure(decoded))
    return Result.fail(
      refuse(`The document is not a ${EXPECTED_CONTRACT} publish result.`, {
        cause: decoded.failure,
      }),
    );
  const result = decoded.success;
  if (result.publicationSet.status !== "admitted")
    return Result.fail(
      refuse(
        `The publish result has no admitted publication set: its publication set is ${result.publicationSet.status}.`,
      ),
    );
  if (result.publicationSet.items.length === 0)
    return Result.fail(refuse("The publish result's admitted publication set has no releases."));
  return Result.succeed({
    registry:
      result.selection.registry === UNRECORDED_REGISTRY ? undefined : result.selection.registry,
    releases: result.publicationSet.items.map((item): PublishResultRelease => {
      const outcome = result.execution.outcomes.find(
        (candidate) => candidate.id === item.id && candidate.version === item.version,
      );
      const integrity = outcome?.archive?.integrity;
      const parts = { owner: item.owner, type: item.type, name: item.name, version: item.version };
      return {
        reference: { ...parts, input: item.id, id: releaseId(parts) },
        ...(integrity === undefined ? {} : { expectation: { integrity } }),
        reported: {
          participation: item.participation,
          ...(outcome === undefined ? {} : { action: outcome.action, status: outcome.status }),
          ...(outcome?.settlement === undefined ? {} : { settlement: outcome.settlement }),
        },
      };
    }),
  });
};

/** Read and decide the selection one saved publish result file supplies. */
export const readPublishResultSelection = Effect.fnUntraced(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(path)
    .pipe(
      Effect.mapError((cause) =>
        refuse(`The publish result at ${path} could not be read.`, { cause }),
      ),
    );
  const document = decodeJson(text);
  if (Result.isFailure(document))
    return yield* refuse(`The publish result at ${path} is not valid JSON.`, {
      cause: document.failure,
    });
  return yield* Effect.fromResult(publishResultSelection(document.success));
});

/** The refusal for a publish result that names no Registry when the caller named none either. */
export const unrecordedRegistryRefusal = () =>
  refuse("The publish result does not record the Registry it published to.", {
    suggestion: "Name the Registry to verify against with --registry.",
  });
