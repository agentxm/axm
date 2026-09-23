/** Local discovery measurements: operation counts and peak I/O are distinct from host timings. */

import { createHash } from "node:crypto";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Clock from "effect/Clock";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { createLocalRegistryClient } from "@agentxm/registry-client";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  AgentRootResolverLive,
  makeWorkspaceReadModel,
  skillsInDir,
  WorkspaceReadModelConfig,
} from "@agentxm/workspace/desired-state";

class DiscoveryBenchmarkFailed extends Data.TaggedError("DiscoveryBenchmarkFailed")<{
  readonly step: string;
  readonly cause: unknown;
}> {}

const Sample = Schema.Struct({
  scenario: Schema.String,
  repeat: Schema.Number,
  admission: Schema.NullOr(Schema.Number),
  durationMs: Schema.Number,
  peakIo: Schema.Number,
  calls: Schema.Record(Schema.String, Schema.Number),
  resultCount: Schema.Number,
  resultDigest: Schema.String,
});
const Report = Schema.Struct({
  runtime: Schema.String,
  samples: Schema.Array(Sample),
});
type Sample = typeof Sample.Type;

const skill = (name: string) =>
  `---\nname: ${name}\ndescription: Discovery fixture.\n---\n\nGuidance.\n`;
const admissions = [null, 4, 8, 16, 20, 32] as const;
const repeats = 3;

const createFixtures = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-discovery-bench-" });
  const write = (relative: string, content: string) => {
    const target = path.join(root, relative);
    return fs
      .makeDirectory(path.dirname(target), { recursive: true })
      .pipe(Effect.andThen(fs.writeFileString(target, content)));
  };
  for (let index = 0; index < 512; index++) {
    const name = `skill-${String(index).padStart(4, "0")}`;
    yield* write(`wide/skills/${name}/SKILL.md`, skill(name));
    yield* write(
      `workspace/skills/${name}/skill.json`,
      JSON.stringify({ name, type: "skill", owner: "@bench" }),
    );
    yield* write(`workspace/skills/${name}/src/SKILL.md`, skill(name));
    yield* write(`workspace/.claude/skills/${name}/SKILL.md`, skill(name));
    yield* write(
      `acquired/agent_extensions/@bench/skills/${name}/skill.json`,
      JSON.stringify({ name, type: "skill", owner: "@bench" }),
    );
    yield* write(`acquired/agent_extensions/@bench/skills/${name}/src/SKILL.md`, skill(name));
  }
  for (let branch = 0; branch < 32; branch++) {
    const name = `deep-${String(branch).padStart(4, "0")}`;
    yield* write(`deep/branch-${branch}/one/two/three/${name}/SKILL.md`, skill(name));
  }
  yield* write("workspace/axm.json", JSON.stringify({ owner: "@bench", agents: ["claude-code"] }));
  yield* write("acquired/axm.json", JSON.stringify({ owner: "@bench", agents: ["claude-code"] }));
  yield* fs.makeDirectory(path.join(root, "home"));
  const types = [
    { directory: "skills", type: "skill" },
    { directory: "subagents", type: "subagent" },
    { directory: "rules", type: "rule" },
  ] as const;
  for (let owner = 0; owner < 8; owner++) {
    for (const { directory, type } of types) {
      for (let index = 0; index < 64; index++) {
        const name = `extension-${String(index).padStart(4, "0")}`;
        yield* write(
          `registry/extensions/@owner-${owner}/${directory}/${name}/index.json`,
          JSON.stringify({
            owner: `@owner-${owner}`,
            name,
            type,
            publisherBindingId: "hbnd_bench",
            archival: null,
            deprecation: null,
            versions: [
              { version: "1.0.0", published: "2025-01-01T00:00:00Z", integrity: "sha512-AAAA==" },
            ],
          }),
        );
      }
    }
  }
  return root;
});

const instrument = (fs: FileSystem.FileSystem, admission: number | null) =>
  Effect.gen(function* () {
    const metrics = yield* Ref.make<{
      readonly active: number;
      readonly peak: number;
      readonly calls: Readonly<Record<string, number>>;
    }>({ active: 0, peak: 0, calls: {} });
    const semaphore = admission === null ? undefined : yield* Semaphore.make(admission);
    const measure = <A, E, R>(method: string, operation: Effect.Effect<A, E, R>) => {
      const measured = Effect.gen(function* () {
        yield* Ref.update(metrics, (state) => ({
          active: state.active + 1,
          peak: Math.max(state.peak, state.active + 1),
          calls: { ...state.calls, [method]: (state.calls[method] ?? 0) + 1 },
        }));
        return yield* operation.pipe(
          Effect.ensuring(Ref.update(metrics, (state) => ({ ...state, active: state.active - 1 }))),
        );
      });
      return semaphore === undefined ? measured : semaphore.withPermit(measured);
    };
    const measuredFs = FileSystem.FileSystem.of({
      ...fs,
      exists: (...args) => measure("exists", fs.exists(...args)),
      stat: (...args) => measure("stat", fs.stat(...args)),
      readDirectory: (...args) => measure("readDirectory", fs.readDirectory(...args)),
      readFileString: (...args) => measure("readFileString", fs.readFileString(...args)),
      readFile: (...args) => measure("readFile", fs.readFile(...args)),
    });
    return { fs: measuredFs, metrics: Ref.get(metrics) };
  });

const measureAll = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* createFixtures;
  const samples: Array<Sample> = [];
  for (let repeat = 0; repeat < repeats; repeat++) {
    // Rotate the candidate order so one admission policy is not always cold.
    const order = [...admissions.slice(repeat), ...admissions.slice(0, repeat)];
    for (const admission of order) {
      for (const scenario of [
        "wide-skills",
        "deep-skills",
        "workspace-scanners",
        "acquired-scanner",
        "registry-names",
        "registry-owners",
      ]) {
        const measured = yield* instrument(fs, admission);
        const client = createLocalRegistryClient(path.join(root, "registry"), measured.fs, path);
        const operation =
          scenario === "workspace-scanners" || scenario === "acquired-scanner"
            ? makeWorkspaceReadModel("project").pipe(
                Effect.flatMap((model) => model.skills.actual),
                Effect.map((rows) =>
                  rows.map((row) => JSON.stringify(row).replaceAll(root, "<fixture>")),
                ),
                Effect.provideService(WorkspaceReadModelConfig, {
                  projectRoot: decodeAbsolutePathSync(
                    path.join(root, scenario === "acquired-scanner" ? "acquired" : "workspace"),
                  ),
                  userHome: decodeAbsolutePathSync(path.join(root, "home")),
                  allowedRoot: decodeAbsolutePathSync(root),
                }),
                Effect.provide(AgentRootResolverLive),
                Effect.provideService(FileSystem.FileSystem, measured.fs),
              )
            : scenario === "wide-skills" || scenario === "deep-skills"
              ? skillsInDir(
                  path.join(root, scenario === "wide-skills" ? "wide" : "deep"),
                  Option.none(),
                  { fullDepth: true, includeInternal: false },
                ).pipe(
                  Effect.map((rows) => rows.map((row) => row.skill.name)),
                  Effect.provideService(FileSystem.FileSystem, measured.fs),
                )
              : client
                  .getExtensionsByScope({
                    owner: scenario === "registry-owners" ? "*" : decodeHandleSync("@owner-0"),
                    names:
                      scenario === "registry-owners"
                        ? []
                        : Array.from({ length: 32 }, (_, index) =>
                            decodeExtensionNameSync(`extension-${String(index).padStart(4, "0")}`),
                          ),
                    types: ["skill", "subagent", "rule"],
                    limit: Option.none(),
                    offset: 0,
                  })
                  .pipe(
                    Effect.map((result) =>
                      result.extensions.map(
                        (entry) => `${entry.owner}/${entry.type}/${entry.name}`,
                      ),
                    ),
                  );
        const start = yield* Clock.currentTimeNanos;
        const result = yield* operation;
        const finish = yield* Clock.currentTimeNanos;
        const metrics = yield* measured.metrics;
        samples.push({
          scenario,
          repeat,
          admission,
          durationMs: Number(finish - start) / 1_000_000,
          peakIo: metrics.peak,
          calls: metrics.calls,
          resultCount: result.length,
          resultDigest: createHash("sha256").update(JSON.stringify(result)).digest("hex"),
        });
      }
    }
  }
  return {
    runtime:
      process.versions["bun"] === undefined
        ? `node-${process.versions.node}`
        : `bun-${process.versions["bun"]}`,
    samples,
  };
}).pipe(
  Effect.scoped,
  Effect.provide(
    Layer.merge(NodeServices.layer, ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
  ),
);

if (process.argv.includes("--discovery-worker")) {
  const report = await Effect.runPromise(measureAll);
  process.stdout.write(JSON.stringify(report));
}

/** The existing benchmark target owns process execution and output publication. */
export const runDiscoveryBenchmark = (repoRoot: string, output: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const processes = yield* ChildProcessSpawner;
      const reports = yield* Effect.forEach(["node", "bun"], (runtime) =>
        Effect.gen(function* () {
          // Resolve the exact repository tool: inherited shell PATH can shadow an activated runtime.
          const executable = yield* processes.string(
            ChildProcess.make("mise", ["which", runtime], {
              cwd: repoRoot,
              stderr: "inherit",
            }),
          );
          return yield* processes.string(
            ChildProcess.make(
              executable.trim(),
              [nodePath.join(repoRoot, "benchmarks/discovery.ts"), "--discovery-worker"],
              {
                cwd: repoRoot,
                stderr: "inherit",
              },
            ),
          );
        }).pipe(
          Effect.timeout("3 minutes"),
          Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Report))),
          Effect.mapError(
            (cause) => new DiscoveryBenchmarkFailed({ step: `${runtime} measurements`, cause }),
          ),
        ),
      );
      yield* fs.makeDirectory(nodePath.dirname(output), { recursive: true });
      yield* fs.writeFileString(
        output,
        JSON.stringify(
          {
            fixtureVersion: 2,
            notes:
              "Diagnostic measurements; counts track Effect filesystem method calls. Durations vary with host and cache state. Admission null is the operation policy under test; numeric admission additionally caps individual filesystem operations for comparison.",
            reports,
          },
          null,
          2,
        ) + "\n",
      );
      yield* Effect.log(`Discovery measurements written to ${output}`);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
