/** Real cache commands over a temporary home; only configuration and rendering are controlled. */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { resolveAxmCacheRoot } from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "./install-harness.js";

export const makeCacheSpecContext = Effect.gen(function* () {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-cache-spec-")));
  const workspace = makeSpecWorkspace({ machine: true });
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      workspace.cleanup();
      fs.rmSync(home, { recursive: true, force: true });
    }),
  );
  const config = ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } }));
  const layer = Layer.provideMerge(workspace.layer, config);
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(layer));
  const cacheRoot = yield* provide(resolveAxmCacheRoot());
  if (!cacheRoot.startsWith(`${home}${path.sep}`))
    throw new Error("Cache must remain in its fixture home");
  const root = path.join(cacheRoot, "archives");
  const writeArchive = (comment: string) => {
    // A valid empty ZIP with a comment, whose bytes have an independently computed digest.
    const bytes = Buffer.concat([
      Buffer.from("504b050600000000000000000000000000000000000000", "hex"),
      Buffer.from(comment),
    ]);
    bytes.writeUInt16LE(Buffer.byteLength(comment), 20);
    const file = path.join(
      root,
      `${crypto.createHash("sha512").update(bytes).digest("base64url")}.zip`,
    );
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(file, bytes);
    return { file, bytes };
  };
  return { home, root, provide, rendererState: workspace.rendererState, writeArchive };
});
