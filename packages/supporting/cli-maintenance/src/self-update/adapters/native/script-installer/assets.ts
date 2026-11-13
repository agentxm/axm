import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/http/HttpClient";
import { withWork } from "@agentxm/host-primitives/work-observation";
import {
  UpgradeFailed,
  type ScriptReleaseAssets,
  type UpgradeExecutionObserverService,
} from "../../../application/index.js";

const declaredContentLength = (headers: Readonly<Record<string, string>>): number | undefined => {
  const declared = Number(headers["content-length"] ?? "");
  return Number.isFinite(declared) && declared > 0 ? declared : undefined;
};

/**
 * Read a release asset. Streaming reports byte observations to the selected
 * observer; the adapter does not select labels or progress timing.
 */
const fetchAsset = (
  httpClient: HttpClient.HttpClient,
  url: string,
  purpose: "binary" | "checksums",
  report?: (received: number, total: number | undefined) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const response = yield* httpClient
      .get(url, {
        headers: { Accept: "application/octet-stream", "User-Agent": "axm-cli" },
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new UpgradeFailed({
              category: "network",
              detail: "Release asset download did not complete",
              suggestions: [{ description: "Check the network connection and retry." }],
              cause,
            }),
        ),
        Effect.timeoutOrElse({
          duration: "60 seconds",
          orElse: () =>
            Effect.fail(
              new UpgradeFailed({
                category: "timeout",
                detail: "Release asset download timed out",
              }),
            ),
        }),
      );
    if (response.status !== 200) {
      return yield* new UpgradeFailed({
        category: "unavailable",
        detail: `Release asset is temporarily unavailable (status ${String(response.status)})`,
        suggestions: [{ description: "Try again after release publication completes." }],
      });
    }
    const readFailed = (cause: unknown) =>
      new UpgradeFailed({
        category: "network",
        detail: "Failed to read the release asset",
        cause,
      });
    if (report === undefined) {
      const body = yield* response.arrayBuffer.pipe(
        Effect.tap((value) => Effect.annotateCurrentSpan("axm.work.bytes", value.byteLength)),
        Effect.mapError(readFailed),
        Effect.withSpan("axm.update.body", {
          attributes: { "axm.update.purpose": purpose, "axm.work.executed": 1 },
        }),
      );
      return new Uint8Array(body);
    }

    const total = declaredContentLength(response.headers);
    return yield* response.stream.pipe(
      Stream.mapAccum(
        () => 0,
        (received, chunk) => {
          const next = received + chunk.length;
          return [next, [{ received: next, chunk }]] as const;
        },
      ),
      Stream.tap((observation) =>
        Effect.annotateCurrentSpan("axm.work.bytes", observation.received),
      ),
      Stream.tap((observation) => report(observation.received, total)),
      Stream.map((observation) => observation.chunk),
      Stream.mkUint8Array,
      Effect.mapError(readFailed),
      Effect.withSpan("axm.update.body", {
        attributes: { "axm.update.purpose": purpose, "axm.work.executed": 1 },
      }),
    );
  }).pipe(
    Effect.withSpan("axm.update.request", {
      attributes: {
        "axm.update.purpose": purpose,
        "axm.work.requested": 1,
        "axm.work.executed": 1,
      },
    }),
  );

export const makeScriptReleaseAssets = (
  client: HttpClient.HttpClient,
  observeDownload: UpgradeExecutionObserverService["download"],
): typeof ScriptReleaseAssets.Service => ({
  read: (source, binaryName) =>
    Effect.gen(function* () {
      const [bytes, manifest] = yield* Effect.all([
        observeDownload(binaryName, (report) =>
          fetchAsset(client, source.binaryAssetUrl, "binary", report),
        ),
        fetchAsset(client, source.checksumAssetUrl, "checksums"),
      ]);
      const sha256Hex = yield* Effect.sync(() =>
        createHash("sha256").update(bytes).digest("hex"),
      ).pipe((effect) =>
        withWork("axm.update.integrity", effect, {
          attributes: { "axm.work.bytes": bytes.byteLength, "axm.work.executed": 1 },
        }),
      );
      return {
        bytes,
        sha256Hex,
        checksumManifest: new TextDecoder("utf-8", { fatal: false }).decode(manifest),
      };
    }),
});
