import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { reconcileManagedRegionFile } from "./managed-region-adapter.js";

describe("reconcileManagedRegionFile", () => {
  it.effect("refuses an uncommentable target without writing it", () =>
    Effect.gen(function* () {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-marker-target-"));
      const target = path.join(root, ".prettierrc");
      try {
        fs.writeFileSync(target, '{"proseWrap":"always"}\n');
        const before = fs.readFileSync(target, "utf8");
        const error = yield* reconcileManagedRegionFile({
          targetPath: target,
          displayPath: ".prettierrc",
          region: "rules",
          owner: "@acme/rules/instructions",
          rendered: "body",
        }).pipe(Effect.flip, Effect.provide(NodeServices.layer));
        expect(error._tag).toBe("ProjectionTargetUnsupported");
        expect(fs.readFileSync(target, "utf8")).toBe(before);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }),
  );
});
