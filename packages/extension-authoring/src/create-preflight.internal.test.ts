import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { CreateDestinationExists, CreateNameConfigured } from "@agentxm/extension-workspace";

import { preflightCreateOnly } from "./create-preflight.js";

describe("preflightCreateOnly", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-create-preflight-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("rejects a configured identity before inspecting or writing destinations", () => {
    const destination = path.join(tempDir, "missing");
    return preflightCreateOnly({
      subject: "Skill",
      name: "review",
      configured: true,
      destinations: [destination],
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error).toBeInstanceOf(CreateNameConfigured);
          expect(fs.existsSync(destination)).toBe(false);
        }),
      ),
      Effect.provide(NodeServices.layer),
    );
  });

  it.effect("rejects a partial destination without changing its bytes", () => {
    const destination = path.join(tempDir, "partial");
    const marker = path.join(destination, "keep.txt");
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(marker, "preserve exactly\n");
    const before = fs.readFileSync(marker);

    return preflightCreateOnly({
      subject: "Pack",
      name: "tools",
      configured: false,
      destinations: [destination],
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error).toBeInstanceOf(CreateDestinationExists);
          expect(fs.readFileSync(marker)).toEqual(before);
          expect(fs.readdirSync(destination)).toEqual(["keep.txt"]);
        }),
      ),
      Effect.provide(NodeServices.layer),
    );
  });
});
