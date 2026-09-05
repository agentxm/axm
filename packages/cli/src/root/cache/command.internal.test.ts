import { startedUnits } from "../../screen/index.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeCliTestContext, makeEffectProvide } from "../../test-helpers.js";
import { handleCachePrune, handleCacheStatus, handleCacheVerify } from "./command.js";

describe("cache commands", () => {
  let tempDir: string;
  let originalAxmUserHome: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-cache-command-test-"));
    originalAxmUserHome = process.env["AXM_USER_HOME"];
    process.env["AXM_USER_HOME"] = tempDir;
  });

  afterEach(() => {
    if (originalAxmUserHome === undefined) {
      delete process.env["AXM_USER_HOME"];
    } else {
      process.env["AXM_USER_HOME"] = originalAxmUserHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("reports liveness while loading human-readable status", () => {
    const context = makeCliTestContext();
    const provide = makeEffectProvide(context.baseLayer);
    const { logs, rendererState } = context;

    return provide(
      Effect.gen(function* () {
        yield* handleCacheStatus();

        expect(startedUnits(rendererState)).toEqual(["archive cache status"]);
        expect(rendererState.events.at(-1)).toMatchObject({
          _tag: "OperationSettled",
          outcome: "completed",
        });
        expect(logs.message.join("")).toContain("Archive cache");
      }),
    );
  });

  it.effect("reports liveness and one machine result for maintenance commands", () => {
    const context = makeCliTestContext({ machine: true });
    const provide = makeEffectProvide(context.baseLayer);
    const { rendererState } = context;

    return provide(
      Effect.gen(function* () {
        yield* handleCacheVerify();
        yield* handleCachePrune();

        expect(startedUnits(rendererState)).toEqual([
          "cached archives",
          "expired and excess archives",
        ]);
        expect(rendererState.results).toHaveLength(2);
      }),
    );
  });

  it.effect("keeps machine-readable status flat inside the ordinary result envelope", () => {
    const context = makeCliTestContext({ machine: true });
    const provide = makeEffectProvide(context.baseLayer);
    const { rendererState } = context;

    return provide(
      Effect.gen(function* () {
        yield* handleCacheStatus();

        expect(rendererState.results).toEqual([
          {
            data: { entries: 0, bytes: 0, maxBytes: 2_147_483_648, maxAgeDays: 90 },
            schema: expect.anything(),
          },
        ]);
      }),
    );
  });
});
