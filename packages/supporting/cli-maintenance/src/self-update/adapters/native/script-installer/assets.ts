import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
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
                category: "network",
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
      const body = yield* response.arrayBuffer.pipe(Effect.mapError(readFailed));
      return new Uint8Array(body);
    }

    const total = declaredContentLength(response.headers);
    const chunks = yield* response.stream.pipe(
      Stream.mapAccum(
        () => 0,
        (received, chunk) => {
          const next = received + chunk.length;
          return [next, [{ received: next, chunk }]] as const;
        },
      ),
      Stream.tap((observation) => report(observation.received, total)),
      Stream.map((observation) => observation.chunk),
      Stream.runCollect,
      Effect.mapError(readFailed),
    );
    const body = new Uint8Array(chunks.reduce((totalBytes, chunk) => totalBytes + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return body;
  });

export const makeScriptReleaseAssets = (
  client: HttpClient.HttpClient,
  observeDownload: UpgradeExecutionObserverService["download"],
): typeof ScriptReleaseAssets.Service => ({
  read: (source, binaryName) =>
    Effect.gen(function* () {
      const [bytes, manifest] = yield* Effect.all([
        observeDownload(binaryName, (report) => fetchAsset(client, source.binaryAssetUrl, report)),
        fetchAsset(client, source.checksumAssetUrl),
      ]);
      return {
        bytes,
        sha256Hex: createHash("sha256").update(bytes).digest("hex"),
        checksumManifest: new TextDecoder("utf-8", { fatal: false }).decode(manifest),
      };
    }),
});
