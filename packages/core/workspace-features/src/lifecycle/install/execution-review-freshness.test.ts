import * as fs from "node:fs";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { InstallExtensions } from "./install-extensions.js";
import { installRequest, makeInstallWorld } from "../../testing/install-world.js";
import { writeLocalHookPackage } from "../../testing/local-packages.js";

it.effect(
  "refuses a source changed after its review snapshot but before the candidate is sealed",
  () => {
    const { workspace, cleanup } = makeInstallWorld();
    const source = writeLocalHookPackage(workspace.root, { name: "audit" });
    const settingsBefore = workspace.readFile("axm.json");
    let mutated = false;
    // A real filesystem with one controlled concurrent edit at the review read boundary.
    const changingSource = Layer.effect(
      FileSystem.FileSystem,
      Effect.map(FileSystem.FileSystem, (real): FileSystem.FileSystem => ({
        ...real,
        readFileString: (file, encoding) =>
          real.readFileString(file, encoding).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (
                  !mutated &&
                  file.includes("axm-execution-review-") &&
                  file.endsWith("hook.json")
                ) {
                  fs.writeFileSync(
                    path.join(source, "src/hook.sh"),
                    "#!/usr/bin/env bash\necho changed-after-review\n",
                  );
                  mutated = true;
                }
              }),
            ),
          ),
      })),
    );
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = yield* InstallExtensions.prepare(
            installRequest({ type: "hook", subject: { kind: "source", source } }),
          ).pipe(Effect.result);
          expect(mutated).toBe(true);
          expect(
            Result.isFailure(result),
            "A concurrent source edit must not become the reviewed baseline",
          ).toBe(true);
          if (Result.isFailure(result))
            expect(JSON.stringify(result.failure)).toContain("StaleExecutionCandidate");
          expect(workspace.readFile("axm.json")).toBe(settingsBefore);
          expect(workspace.exists(".claude/settings.json")).toBe(false);
        }),
      )
      .pipe(
        Effect.provide(Layer.provideMerge(changingSource, NodeServices.layer)),
        Effect.ensuring(Effect.sync(cleanup)),
      );
  },
);
