import * as Effect from "effect/Effect";
import {
  resolutionMetadataResponseMatchesRequest,
  type ResolutionMetadataOutcome,
  type ResolutionMetadataRequest,
  type ResolutionMetadataResponse,
} from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import { RegistryRequestFailed, type RegistryClientFailure } from "./errors.js";

type MetadataOutcome = Extract<ResolutionMetadataOutcome, { readonly outcome: "metadata" }>;

interface PendingPage {
  readonly item: ResolutionMetadataRequest["items"][number];
  readonly first: MetadataOutcome;
  readonly versions: MetadataOutcome["page"]["versions"];
  readonly seenTokens: ReadonlySet<string>;
  readonly nextToken: string;
}

const incompatible = (detail: string) =>
  new RegistryRequestFailed({ category: "internal", detail });

/** Gather every version page before exposing a candidate list to selection. */
export const collectResolutionMetadataPages = (
  request: ResolutionMetadataRequest,
  exchange: (
    request: ResolutionMetadataRequest,
  ) => Effect.Effect<ResolutionMetadataResponse, RegistryClientFailure>,
): Effect.Effect<ReadonlyArray<ResolutionMetadataOutcome>, RegistryClientFailure> =>
  Effect.gen(function* () {
    const completed = new Map<string, ResolutionMetadataOutcome>();
    let pending = new Map<string, PendingPage>();
    let submitted = request;

    for (let pageRound = 0; pageRound < 1_000; pageRound += 1) {
      const response = yield* exchange(submitted);
      if (!resolutionMetadataResponseMatchesRequest(submitted, response)) {
        return yield* Effect.fail(
          incompatible("Registry batch metadata response does not match its request."),
        );
      }

      const next = new Map<string, PendingPage>();
      for (const [index, outcome] of response.results.entries()) {
        const item = submitted.items[index];
        if (item === undefined) {
          return yield* Effect.fail(incompatible("Registry batch response has an extra result."));
        }
        const previous = pending.get(item.key);
        if (previous !== undefined && outcome.outcome === "restart-required") {
          completed.set(item.key, outcome);
          continue;
        }
        if (previous !== undefined && outcome.outcome !== "metadata") {
          return yield* Effect.fail(
            incompatible("Registry batch metadata changed during version pagination."),
          );
        }
        if (outcome.outcome !== "metadata") {
          completed.set(item.key, outcome);
          continue;
        }

        if (
          previous !== undefined &&
          (outcome.page.revision !== previous.first.page.revision ||
            outcome.page.publisherBindingId !== previous.first.page.publisherBindingId)
        ) {
          return yield* Effect.fail(
            incompatible("Registry version pages disagree on their representation."),
          );
        }
        const first = previous?.first ?? outcome;
        const versions = [...(previous?.versions ?? []), ...outcome.page.versions];
        if (item.purpose === "restore-exact") {
          completed.set(item.key, outcome);
          continue;
        }
        const token = outcome.page.continuation;
        if (token === null) {
          completed.set(item.key, {
            ...first,
            page: { ...first.page, versions, continuation: null },
          });
          continue;
        }
        const seenTokens = previous?.seenTokens ?? new Set<string>();
        if (seenTokens.has(token)) {
          return yield* Effect.fail(
            incompatible("Registry repeated a version continuation token."),
          );
        }
        next.set(item.key, {
          item: previous?.item ?? item,
          first,
          versions,
          seenTokens: new Set([...seenTokens, token]),
          nextToken: token,
        });
      }

      if (next.size === 0) {
        const results: ResolutionMetadataOutcome[] = [];
        for (const item of request.items) {
          const outcome = completed.get(item.key);
          if (outcome === undefined) {
            return yield* Effect.fail(incompatible("Registry batch metadata result is missing."));
          }
          results.push(outcome);
        }
        return results;
      }

      submitted = {
        ...request,
        items: [...next.values()].map(({ item, first, nextToken }) =>
          item.purpose === "restore-exact"
            ? {
                key: item.key,
                identity: item.identity,
                purpose: item.purpose,
                accepted: item.accepted,
                ...(item.expectedPublisherBinding === undefined
                  ? {}
                  : { expectedPublisherBinding: item.expectedPublisherBinding }),
                continuation: { token: nextToken, revision: first.page.revision },
              }
            : {
                key: item.key,
                identity: item.identity,
                purpose: item.purpose,
                ...(item.expectedPublisherBinding === undefined
                  ? {}
                  : { expectedPublisherBinding: item.expectedPublisherBinding }),
                continuation: { token: nextToken, revision: first.page.revision },
              },
        ),
      };
      pending = next;
    }

    return yield* Effect.fail(incompatible("Registry version history exceeds the page budget."));
  });
