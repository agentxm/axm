import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { makeThrottledUnitProgress, observeChildUnit } from "@agentxm/workspace-operations";
import {
  UpgradeFailed,
  type ScriptReleaseAssets,
} from "@agentxm/cli-maintenance/self-update/application";

const declaredContentLength = (headers: Readonly<Record<string, string>>): number | undefined => {
  const declared = Number(headers["content-length"] ?? "");
  return Number.isFinite(declared) && declared > 0 ? declared : undefined;
};

/**
 * Read a release asset. `reportProgress` streams the body and publishes
 * throttled byte measurements for the unit in progress, so the one download
 * long enough to be worth watching is watchable; everything else reads the
 * body whole.
 */
const fetchAsset = (
  httpClient: HttpClient.HttpClient,
  url: string,
  options?: { readonly reportProgress?: boolean },
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
    if (options?.reportProgress !== true) {
      const body = yield* response.arrayBuffer.pipe(Effect.mapError(readFailed));
      return new Uint8Array(body);
    }

    const total = declaredContentLength(response.headers);
    const report = yield* makeThrottledUnitProgress({ unit: "bytes", intervalMs: 250 });
    const chunks: Array<Uint8Array> = [];
    let received = 0;
    yield* response.stream.pipe(
      Stream.runForEach((chunk) => {
        chunks.push(chunk);
        received += chunk.length;
        return report(received, total);
      }),
      Effect.mapError(readFailed),
    );
    const body = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return body;
  });

export const makeScriptReleaseAssets = (
  client: HttpClient.HttpClient,
): typeof ScriptReleaseAssets.Service => ({
  read: (source, binaryName) =>
    Effect.gen(function* () {
      const [bytes, manifest] = yield* Effect.all([
        observeChildUnit(
          { id: "download-binary", label: `Download ${binaryName}` },
          fetchAsset(client, source.binaryAssetUrl, { reportProgress: true }),
        ),
        fetchAsset(client, source.checksumAssetUrl),
      ]);
      return {
        bytes,
        sha256Hex: createHash("sha256").update(bytes).digest("hex"),
        checksumManifest: new TextDecoder("utf-8", { fatal: false }).decode(manifest),
      };
    }),
});
