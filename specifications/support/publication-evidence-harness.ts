import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { validateArchive } from "@agentxm/registry-protocol/unstable/publish";
import { handleRootPublish, PublishResultSchema } from "axm.sh/specification-harness";
import { makeSpecWorkspace, type SpecWorkspaceOptions } from "./install-harness.js";
import {
  makeFileRegistry,
  makePublishLayer,
  publishArgs,
  type RootPublishArgs,
} from "./publish-harness.js";
import { snapshotWorkspaceContent } from "./workspace-fixtures.js";

export const makePublicationSpecContext = (options: SpecWorkspaceOptions = {}) =>
  Effect.gen(function* () {
    const workspace = makeSpecWorkspace({ ...options, machine: options.machine ?? true });
    yield* Effect.addFinalizer(() => Effect.sync(workspace.cleanup));
    const registry = makeFileRegistry(workspace.root);
    const root = fileURLToPath(registry.url);
    const layer = makePublishLayer(workspace);
    const run = (overrides: Partial<RootPublishArgs> = {}) =>
      Effect.sync(() => {
        workspace.rendererState.results.length = 0;
        workspace.rendererState.docs.length = 0;
      }).pipe(
        Effect.andThen(
          handleRootPublish(publishArgs(registry.url, { preview: false, ...overrides })),
        ),
        Effect.provide(layer),
      );
    const result = () =>
      Schema.decodeUnknownEffect(PublishResultSchema)(workspace.rendererState.results.at(-1)?.data);
    const archive = (name: string, version = "1.0.0", type = "skills") =>
      fs.readFileSync(path.join(root, "extensions", "@acme", type, name, `${version}.zip`));
    return {
      workspace,
      registry,
      run,
      result,
      archive,
      snapshotRegistry: () => snapshotWorkspaceContent(root),
    };
  });

/** Inspect the real ZIP's central directory and independently decompress each entry. */
export const archiveContents = (bytes: Uint8Array) =>
  Effect.gen(function* () {
    const entries = yield* validateArchive(bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return Object.fromEntries(
      entries.map((entry) => {
        const offset = entry.localHeaderOffset;
        const start =
          offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
        const compressed = bytes.subarray(start, start + entry.compressedSize);
        const content =
          entry.compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
        return [entry.fileName, content] as const;
      }),
    );
  });
