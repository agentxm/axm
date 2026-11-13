import * as os from "node:os";
import { createHash } from "node:crypto";
import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Console from "effect/Console";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { createBinaryRunner } from "@agentxm/client-e2e-utils";
import { prepareInventoryFixture } from "@agentxm/test-support/inventory-fixture";
import { resolveHostBinaryPath } from "./distribution-targets.js";

export const specification = defineSpecification({
  requirement: "cli/list/ordinary-inventory-latency",
  title: "Thirty locked extensions list within half a second",
  statement:
    "On the recorded Linux reference host with a warm filesystem and an existing lockfile, cheap ordinary listing of 30 installed extensions shall complete in less than 500 milliseconds at the 95th percentile, including process startup, inventory observation, output, and exit.",
  class: "quality",
  characteristic: "performance",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  boundary: "binary",
  boundaryRationale:
    "Runs fresh processes of the compiled CLI against a workspace installed through sync; wall time includes startup and complete output collection.",
  methods: ["benchmark"],
  selection: "platform-matrix",
  derivedFrom: ["cli/list/ordinary-inventory-is-local"],
  supersedes: [],
  assumptions: [
    "A Linux reference host is measured without concurrent build or test workloads; filesystem caches are warmed by three unmeasured invocations.",
  ],
  openQuestions: [],
});

const Inventory = Schema.Struct({
  result: Schema.Struct({
    count: Schema.Number,
    items: Schema.Array(
      Schema.Struct({
        installed: Schema.NullOr(Schema.Boolean),
        inspection: Schema.Struct({ state: Schema.String }),
      }),
    ),
  }),
});
const decodeInventory = Schema.decodeUnknownSync(Schema.fromJsonString(Inventory));

it.live.skipIf(process.platform !== "linux")(
  "lists 30 installed packages with their accepted lockfile",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const home = path.join(root, "home");
      yield* fs.makeDirectory(home);
      const binary = resolveHostBinaryPath();
      const binarySha256 = createHash("sha256")
        .update(yield* fs.readFile(binary))
        .digest("hex");
      const run = createBinaryRunner(binary);
      const invoke = (args: ReadonlyArray<string>) =>
        Effect.tryPromise(() =>
          run(args, {
            cwd: root,
            env: { AXM_USER_HOME: home, AXM_NO_UPDATE_CHECK: "1", AXM_TELEMETRY: "0" },
          }),
        );
      yield* prepareInventoryFixture(root);
      const installed = yield* invoke(["sync", "--non-interactive", "--json"]);
      expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
      expect(yield* fs.exists(path.join(root, "axm.lock"))).toBe(true);
      const firstStarted = performance.now();
      const first = yield* invoke(["list", "--json"]);
      const firstMs = performance.now() - firstStarted;
      expect(first.exitCode, first.stderr).toBe(0);
      const inventory = decodeInventory(first.stdout).result;
      expect(inventory.count).toBe(30);
      expect(
        inventory.items.every(
          (item) => item.installed === true && item.inspection.state === "not-requested",
        ),
      ).toBe(true);
      for (const args of [["list", "--json"], ["list"]]) {
        for (let warmup = 0; warmup < 3; warmup++) {
          const result = yield* invoke(args);
          expect(result.exitCode, result.stderr).toBe(0);
        }
        const samples: number[] = [];
        for (let sample = 0; sample < 20; sample++) {
          const started = performance.now();
          const result = yield* invoke(args);
          samples.push(performance.now() - started);
          expect(result.exitCode, result.stderr).toBe(0);
          expect(result.stdout.length).toBeGreaterThan(0);
        }
        const sorted = [...samples].sort((a, b) => a - b);
        const p95 = sorted[18];
        yield* Console.log(
          JSON.stringify({
            command: args,
            binary,
            binarySha256,
            host: {
              platform: process.platform,
              arch: process.arch,
              release: os.release(),
              cpu: os.cpus()[0]?.model,
            },
            firstMs,
            samples,
            p95,
          }),
        );
        expect(p95, "End-to-end p95 for 30 installed extensions").toBeLessThan(500);
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  600_000,
);
