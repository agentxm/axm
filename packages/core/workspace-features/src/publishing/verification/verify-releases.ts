/**
 * `VerifyPublishedReleases`: whether explicitly selected published releases
 * are present in a Registry, are the releases the caller intended, and have
 * archives whose bytes match what the Registry recorded.
 *
 * Verification is read-only. One read phase observes current selection
 * metadata for every distinct extension once; each listed version is then
 * admitted and read through the existing archive path against its recorded
 * integrity, one archive at a time. It never uploads, previews, settles,
 * reads back or replays a publication, and it writes no workspace state.
 * A verdict needs at least one Registry observation: when no selected release
 * yields one, the Registry's own failure keeps its existing error contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { chunksOf } from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import { collectSensitiveStrings, redactCredentialText } from "@agentxm/host-primitives";
import {
  RegistryClientFactory,
  withBufferedArchiveBudget,
  type RegistryClient,
  type RegistryClientFailure,
  type ValidateExtensionAccessArgs,
} from "@agentxm/registry-client";
import { MAX_RESOLUTION_ITEMS } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import { resolutionFailureToStepFailure } from "@agentxm/workspace-kernel/planning";

import { publishRefused } from "../errors.js";
import { resolveTargetRegistry } from "../publish/model.js";
import {
  RELEASE_VERIFICATION_CONTRACT,
  type ReleaseVerificationDocument,
  type ReleaseVerificationRelease,
} from "./document.js";
import { readPublishResultSelection, unrecordedRegistryRefusal } from "./publish-result-input.js";
import type { ReleaseReference } from "./reference.js";
import {
  assessArchive,
  assessIdentity,
  assessPresence,
  decideReleaseVerdict,
  type ArchiveEvidence,
  type CapturedFailure,
  type ExpectationAbsence,
  type PresenceEvidence,
} from "./verdict.js";

/** What one verification selects. */
type ReleaseVerificationSelection =
  | {
      readonly mode: "references";
      /** Exact references the caller named, already parsed, in input order. */
      readonly references: ReadonlyArray<ReleaseReference>;
      /** The expected integrity of the one selected release. */
      readonly integrity: Option.Option<string>;
    }
  | {
      readonly mode: "publish-result";
      /** Absolute path to a saved publish result. */
      readonly path: string;
    };

/** The inputs one verification invocation supplies. */
export interface ReleaseVerificationRequest {
  /** An explicitly named Registry; otherwise the publish result's, or the default. */
  readonly registry: Option.Option<string>;
  readonly selection: ReleaseVerificationSelection;
}

type Expectation = NonNullable<ReleaseVerificationRelease["expectation"]>;

interface PlannedRelease {
  readonly reference: ReleaseReference;
  readonly requestRefs: Array<string>;
  readonly expectation: Expectation | ExpectationAbsence;
  readonly reported?: ReleaseVerificationRelease["reported"];
}

interface PlannedSelection {
  readonly mode: ReleaseVerificationDocument["selection"]["mode"];
  readonly requests: ReleaseVerificationDocument["selection"]["requests"];
  readonly releases: ReadonlyArray<PlannedRelease>;
  /** The recorded selector a publish result supplies, when it supplies one. */
  readonly recordedRegistry: Option.Option<string>;
}

const usage = (detail: string) => publishRefused({ category: "usage", detail });

/** One request per input; one release per distinct canonical id, ordered by first request. */
const planSelection = (
  mode: PlannedSelection["mode"],
  entries: ReadonlyArray<Omit<PlannedRelease, "requestRefs">>,
  recordedRegistry: Option.Option<string>,
): PlannedSelection => {
  const releases = new Map<string, PlannedRelease>();
  const requests = entries.map((entry, index) => {
    const id = `request-${index + 1}`;
    const existing = releases.get(entry.reference.id);
    if (existing === undefined) releases.set(entry.reference.id, { ...entry, requestRefs: [id] });
    else existing.requestRefs.push(id);
    return { id, input: entry.reference.input };
  });
  return { mode, requests, releases: [...releases.values()], recordedRegistry };
};

const buildSelection = Effect.fnUntraced(function* (selection: ReleaseVerificationSelection) {
  if (selection.mode === "publish-result") {
    const supplied = yield* readPublishResultSelection(selection.path);
    return planSelection(
      "publish-result",
      supplied.releases.map((release) => ({
        reference: release.reference,
        expectation:
          release.expectation === undefined
            ? "not-prepared"
            : { integrity: release.expectation.integrity, source: "publish-result" },
        reported: release.reported,
      })),
      Option.fromUndefinedOr(supplied.registry),
    );
  }
  if (selection.references.length === 0)
    return yield* usage("Select at least one exact release to verify.");
  if (Option.isSome(selection.integrity) && selection.references.length !== 1)
    return yield* usage("An expected integrity applies only to a single exact reference.");
  return planSelection(
    "references",
    selection.references.map((reference) => ({
      reference,
      expectation: Option.match(selection.integrity, {
        onNone: (): ExpectationAbsence => "none-supplied",
        onSome: (integrity): Expectation => ({ integrity, source: "flag" }),
      }),
    })),
    Option.none(),
  );
});

/**
 * A Registry failure as release evidence. The detail can quote Registry text,
 * so credential shapes and the exact credentials the response carried under
 * sensitive keys are redacted before it reaches the result.
 */
const capturedFailure = (failure: RegistryClientFailure): CapturedFailure => {
  const rendered = resolutionFailureToStepFailure(failure);
  return {
    category: rendered.category,
    message: redactCredentialText(rendered.detail, {
      secrets: collectSensitiveStrings(rendered.metadata),
    }),
  };
};

const identityKey = (release: ReleaseReference): string =>
  JSON.stringify([release.owner, release.type, release.name]);

interface ListedRelease {
  readonly id: string;
  readonly args: ValidateExtensionAccessArgs;
}

const ADMISSION_MISMATCH: CapturedFailure = {
  category: "internal",
  message: "Registry admission results do not match the submitted batch.",
};

/**
 * Admit each chunk once and read its admitted archives one at a time under
 * the operation's buffered-archive budget, discarding the bytes. Any refusal
 * or failure is that release's archive evidence; nothing is retried.
 */
const readAdmittedArchives = Effect.fnUntraced(function* (
  client: RegistryClient,
  listed: ReadonlyArray<ListedRelease>,
) {
  const evidence = new Map<string, ArchiveEvidence>();
  yield* Effect.forEach(
    chunksOf(listed, MAX_RESOLUTION_ITEMS),
    (chunk) =>
      Effect.gen(function* () {
        const reads = yield* Effect.result(
          client.withAccessibleContent(
            chunk.map((entry) => entry.args),
            (content) =>
              Effect.forEach(
                chunk,
                (entry, position) =>
                  Effect.gen(function* () {
                    const admission = content.results[position];
                    if (admission === undefined || content.results.length !== chunk.length)
                      return { kind: "failed", failure: ADMISSION_MISMATCH } as const;
                    if (Result.isFailure(admission))
                      return {
                        kind: "failed",
                        failure: capturedFailure(admission.failure),
                      } as const;
                    // The identical arguments were admitted; the bytes are not retained.
                    const read = yield* Effect.result(
                      withBufferedArchiveBudget(Effect.asVoid(content.read(entry.args))),
                    );
                    return Result.isSuccess(read)
                      ? ({ kind: "read" } as const)
                      : ({ kind: "failed", failure: capturedFailure(read.failure) } as const);
                  }),
                { concurrency: 1 },
              ),
          ),
        );
        for (const [position, entry] of chunk.entries()) {
          const outcome: ArchiveEvidence | undefined = Result.isFailure(reads)
            ? { kind: "failed", failure: capturedFailure(reads.failure) }
            : reads.success[position];
          if (outcome !== undefined) evidence.set(entry.id, outcome);
        }
      }),
    { concurrency: 1, discard: true },
  );
  return evidence;
});

const verify = Effect.fn("VerifyPublishedReleases.verify")(function* (
  request: ReleaseVerificationRequest,
) {
  const selection = yield* buildSelection(request.selection);

  // An explicit Registry wins; a publish result never falls back to the default.
  const selectedBy: ReleaseVerificationDocument["registry"]["selectedBy"] = Option.isSome(
    request.registry,
  )
    ? "flag"
    : selection.mode === "publish-result"
      ? "publish-result"
      : "default";
  if (selectedBy === "publish-result" && Option.isNone(selection.recordedRegistry))
    return yield* unrecordedRegistryRefusal();
  const registry = yield* resolveTargetRegistry(
    selectedBy === "flag" ? request.registry : selection.recordedRegistry,
  );

  const factory = yield* RegistryClientFactory;
  const releases = yield* factory.withReadPhase(
    Effect.gen(function* () {
      const client = yield* factory.forEndpoint(registry.endpoint);

      const identities = new Map(
        selection.releases.map(
          ({ reference }) =>
            [
              identityKey(reference),
              { owner: reference.owner, type: reference.type, name: reference.name },
            ] as const,
        ),
      );
      const indexes = yield* client.selectMany([...identities.values()]);
      if (indexes.length !== identities.size)
        return yield* Effect.die("Registry selection omitted a selected release");
      // No observation, no verdict: the Registry's own failure keeps its contract.
      const observations = indexes.filter(Result.isSuccess);
      const firstFailure = indexes.find(Result.isFailure);
      if (observations.length === 0 && firstFailure !== undefined)
        return yield* Effect.fail(firstFailure.failure);

      const keys = [...identities.keys()];
      const observed = yield* Effect.forEach(
        selection.releases,
        (planned) =>
          Effect.gen(function* () {
            const index = indexes[keys.indexOf(identityKey(planned.reference))];
            if (index === undefined)
              return yield* Effect.die("Registry selection omitted a selected release");
            const presence: PresenceEvidence = Result.isFailure(index)
              ? { kind: "failed", failure: capturedFailure(index.failure) }
              : Option.match(index.success, {
                  onNone: (): PresenceEvidence => ({ kind: "extension-unavailable" }),
                  onSome: (extension): PresenceEvidence => {
                    const entry = extension.versions.find(
                      (candidate) => candidate.version === planned.reference.version,
                    );
                    if (entry === undefined) return { kind: "version-missing" };
                    return {
                      kind: "listed",
                      observed: {
                        integrity: entry.integrity,
                        publisherBindingId: extension.publisherBindingId,
                        published: entry.published,
                        yanked: entry.yankedAt !== undefined,
                        ...(entry.yankedAt === undefined ? {} : { yankedAt: entry.yankedAt }),
                        ...(entry.yankCategory === undefined
                          ? {}
                          : { yankCategory: entry.yankCategory }),
                        ...(entry.yankMessage === undefined
                          ? {}
                          : { yankMessage: entry.yankMessage }),
                      },
                    };
                  },
                });
            return { planned, presence };
          }),
        { concurrency: 1 },
      );

      const archives = yield* readAdmittedArchives(
        client,
        observed.flatMap(({ planned, presence }): ReadonlyArray<ListedRelease> => {
          if (presence.kind !== "listed") return [];
          const { owner, type, name, version } = planned.reference;
          return [
            {
              id: planned.reference.id,
              args: {
                owner,
                type,
                name,
                usagePurpose: "verification",
                // Assessed against the recorded integrity, even when identity differs.
                exact: {
                  version,
                  integrity: presence.observed.integrity,
                  publisherBindingId: presence.observed.publisherBindingId,
                },
              },
            },
          ];
        }),
      );

      return observed.map(({ planned, presence }): ReleaseVerificationRelease => {
        const { id, owner, type, name, version } = planned.reference;
        return {
          id,
          owner,
          type,
          name,
          version,
          requestRefs: planned.requestRefs,
          ...(typeof planned.expectation === "string" ? {} : { expectation: planned.expectation }),
          ...(planned.reported === undefined ? {} : { reported: planned.reported }),
          ...(presence.kind === "listed" ? { observed: presence.observed } : {}),
          presence: assessPresence(presence),
          identity: assessIdentity(presence, planned.expectation),
          archive: assessArchive(presence, archives.get(id)),
        };
      });
    }),
  );

  return {
    contract: RELEASE_VERIFICATION_CONTRACT,
    registry: { name: registry.name, endpoint: registry.endpoint.href, selectedBy },
    selection: { mode: selection.mode, requests: selection.requests },
    releases,
    verdict: decideReleaseVerdict(releases),
  } satisfies ReleaseVerificationDocument;
});

/** The application API for verifying published releases. */
export const VerifyPublishedReleases = { verify } as const;
