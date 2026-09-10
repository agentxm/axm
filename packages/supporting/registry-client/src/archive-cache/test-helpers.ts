/** An isolated user home whose archive cache a specification can populate. */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";

import { makeUserArchiveCache } from "../archive-cache.js";
import { resolveAxmCacheRoot } from "../cache-root.js";

/**
 * A cache rooted in a throwaway home, with a writer that produces valid
 * archives whose file name is their own integrity digest.
 */
export const makeCacheFixture = Effect.gen(function* () {
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-archive-cache-")));
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => fs.rmSync(home, { recursive: true, force: true })),
  );
  const environment = ConfigProvider.layer(
    ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } }),
  );
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, environment);
  const cacheRoot = yield* provide(resolveAxmCacheRoot());
  if (!cacheRoot.startsWith(`${home}${nodePath.sep}`))
    throw new Error("Cache must remain in its fixture home");
  const root = nodePath.join(cacheRoot, "archives");
  const cache = yield* provide(makeUserArchiveCache());

  const writeArchive = (comment: string) => {
    // A valid empty ZIP with a comment, whose bytes have an independently computed digest.
    const bytes = Buffer.concat([
      Buffer.from("504b050600000000000000000000000000000000000000", "hex"),
      Buffer.from(comment),
    ]);
    bytes.writeUInt16LE(Buffer.byteLength(comment), 20);
    const file = nodePath.join(
      root,
      `${crypto.createHash("sha512").update(bytes).digest("base64url")}.zip`,
    );
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(file, bytes);
    return { file, bytes };
  };

  return { home, root, cache, provide, writeArchive };
});
