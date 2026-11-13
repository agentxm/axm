/** Paired complete-output captures and elapsed/RSS observations; never a truncation mechanism. */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { makeFileRegistry } from "@agentxm/registry-client/testing";
import { prepareInventoryFixture } from "@agentxm/test-support/inventory-fixture";
import { BinaryManifestSchema } from "./observability-contract.js";
import {
  digest,
  hostResourceSnapshot,
  runObservedProcess,
  snapshotTree,
} from "./observability-process.js";

class OutputContractBenchmarkFailure extends Data.TaggedError("OutputContractBenchmarkFailure")<{
  readonly message: string;
}> {}
const failed = (message: string) => new OutputContractBenchmarkFailure({ message });

const writeJson = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const decodeObject = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown));
const objectArray = (value: unknown) =>
  Schema.decodeUnknownSync(Schema.Array(Schema.Record(Schema.String, Schema.Unknown)))(value);
const manifest = (environment: string) => {
  const file = process.env[environment];
  if (file === undefined)
    throw failed(`${environment} must identify an immutable binary manifest.`);
  const result = Schema.decodeUnknownSync(Schema.fromJsonString(BinaryManifestSchema))(
    fs.readFileSync(file, "utf8"),
  );
  if (digest(fs.readFileSync(result.binaryPath)) !== result.binarySha256)
    throw failed(`Binary digest mismatch: ${file}`);
  return result;
};
const median = (numbers: ReadonlyArray<number>) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const result = sorted[Math.floor(sorted.length / 2)];
  if (result === undefined) throw failed("Cannot summarize an empty measurement.");
  return result;
};

/** Restore fixture bytes without replacing unchanged native containers or aliases. */
const restoreTree = (source: string, target: string): void => {
  fs.mkdirSync(target, { recursive: true });
  const expected = new Set(fs.readdirSync(source));
  for (const name of fs.readdirSync(target))
    if (!expected.has(name)) fs.rmSync(path.join(target, name), { recursive: true, force: true });
  for (const name of expected) {
    const from = path.join(source, name);
    const to = path.join(target, name);
    const wanted = fs.lstatSync(from);
    const actual = fs.lstatSync(to, { throwIfNoEntry: false });
    if (wanted.isDirectory() && actual?.isDirectory()) restoreTree(from, to);
    else if (
      wanted.isFile() &&
      actual?.isFile() &&
      fs.readFileSync(from).equals(fs.readFileSync(to))
    ) {
      /* retain physical identity */
    } else if (
      wanted.isSymbolicLink() &&
      actual?.isSymbolicLink() &&
      fs.readlinkSync(from) === fs.readlinkSync(to)
    ) {
      /* retain exact alias */
    } else {
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
    }
    if (!wanted.isSymbolicLink() && (fs.lstatSync(to).mode & 0o777) !== (wanted.mode & 0o777))
      fs.chmodSync(to, wanted.mode & 0o777);
  }
};
const nativeIdentity = (workspace: string) =>
  snapshotTree(workspace, [])
    .filter((entry) => /^(?:\.agents|\.claude)(?:\/|$)/u.test(entry.path))
    .map((entry) => {
      const stat = fs.lstatSync(path.join(workspace, entry.path));
      return { path: entry.path, dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs };
    });

interface Scenario {
  readonly id: string;
  readonly workspace: string;
  readonly home: string;
  readonly template: string;
  readonly baselineArgs: ReadonlyArray<string> | null;
  readonly candidateArgs: ReadonlyArray<string>;
  readonly expectedCount?: number;
  readonly kind: "inventory" | "inspection" | "restoration" | "publication" | "schema";
  readonly preserveWorkspace: boolean;
  readonly comparison: string;
  readonly nativeIdentity: ReturnType<typeof nativeIdentity>;
}

/** Assertions use fixture dimensions and file effects, not a replay of output assembly. */
const inspectOutput = (
  scenario: Scenario,
  stdout: string,
  subject: "baseline" | "candidate",
  machine: boolean,
) => {
  if (!machine || scenario.kind === "schema")
    return {
      bytes: Buffer.byteLength(stdout),
      assertions: ["Complete output retained; semantic process assertions are separate."],
    };
  const document = decodeObject(JSON.parse(stdout));
  if (document["ok"] !== true) throw failed(`${scenario.id} did not report a successful verdict.`);
  const result = decodeObject(document["result"]);
  if (scenario.kind === "inventory" || scenario.kind === "inspection") {
    const items = objectArray(result["items"]);
    if (items.length !== scenario.expectedCount)
      throw failed(`${scenario.id} lost selected subjects.`);
    return {
      bytes: Buffer.byteLength(stdout),
      subjectCount: items.length,
      nativeLocationRecords: Array.isArray(result["nativeLocations"])
        ? result["nativeLocations"].length
        : null,
      assertions: ["Every independently selected subject remains in the document."],
    };
  }
  if (scenario.kind === "restoration") {
    const units = objectArray(result["units"]);
    if (units.length !== 50) throw failed("Restoration must retain all fifty units.");
    if (
      subject === "candidate" &&
      units.some((unit) => !Array.isArray(unit["transitions"]) || unit["transitions"].length === 0)
    )
      throw failed("Restoration omitted structured transitions.");
    return {
      bytes: Buffer.byteLength(stdout),
      unitCount: units.length,
      nativeLocationRecords: Array.isArray(result["nativeLocations"])
        ? result["nativeLocations"].length
        : null,
      assertions: [
        "Fifty restoration units; candidate carries structured source/version transitions.",
      ],
    };
  }
  const execution = decodeObject(result["execution"]);
  const outcomes = objectArray(execution["outcomes"]);
  if (outcomes.length !== 3) throw failed("Publication must retain all three candidates.");
  const archives = outcomes.map((item) => decodeObject(item["archive"]));
  const selectedPaths = archives.flatMap((archive) => objectArray(archive["included"]));
  if (selectedPaths.length !== 100)
    throw failed(
      `Publication selected ${selectedPaths.length} paths, expected exactly one hundred.`,
    );
  for (const archive of archives) {
    const patterns = objectArray(archive["patterns"]);
    if (patterns.length !== (subject === "baseline" ? 305 : 5))
      throw failed(
        "Publication must exercise all five explicit and three hundred inherited rules per package.",
      );
    if (
      subject === "candidate" &&
      decodeObject(archive["patternCoverage"])["omittedInheritedCount"] !== 300
    )
      throw failed("Only three hundred unmatched inherited explanations may be omitted.");
  }
  return {
    bytes: Buffer.byteLength(stdout),
    packageCount: outcomes.length,
    selectedPaths: selectedPaths.length,
    ruleRows: archives.map((archive) => objectArray(archive["patterns"]).length),
    archiveFacts: archives.map((archive) => ({
      included: archive["included"],
      excluded: archive["excluded"],
      integrity: archive["integrity"],
      warnings: archive["warnings"],
    })),
    assertions: [
      "Three candidates and all one hundred exact archive paths retained; all five explicit rules remain, and only the three hundred unmatched inherited explanations are shared by count.",
    ],
  };
};

export const runOutputContractBenchmark = (repoRoot: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const baseline = manifest("AXM_OUTPUT_BASELINE_MANIFEST");
      const candidate = manifest("AXM_OUTPUT_CANDIDATE_MANIFEST");
      const output = path.resolve(
        process.env["AXM_OUTPUT_BENCHMARK_OUTPUT"] ??
          path.join(repoRoot, "test-results/benchmarks/output-contracts"),
      );
      if (fs.existsSync(output))
        return yield* failed("Use a fresh output directory; previous evidence is never replaced.");
      fs.mkdirSync(output, { recursive: true });
      const measure = process.env["AXM_OUTPUT_BENCHMARK_RUN"] === "measure";
      const requestedScenarios = process.env["AXM_OUTPUT_BENCHMARK_SCENARIOS"]?.split(",");
      const includes = (prefixes: ReadonlyArray<string>) =>
        requestedScenarios === undefined ||
        requestedScenarios.some((id) => prefixes.some((prefix) => id.startsWith(prefix)));
      if (measure && process.env["AXM_OUTPUT_REFERENCE_HOST"] !== "1")
        return yield* failed("Declare an isolated Linux reference host before comparative timing.");
      if (measure && process.platform !== "linux")
        return yield* failed("The registered reference host is Linux.");
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-output-contracts-"));
      const registry = yield* Effect.acquireRelease(
        Effect.sync(() => makeFileRegistry()),
        (value) => Effect.sync(value.cleanup),
      );
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
      );
      const scenarios: Scenario[] = [];
      let preparation = 0;
      const environment = (home: string) => ({
        ...process.env,
        AXM_USER_HOME: home,
        AXM_TOKEN: "synthetic-output-fixture-token",
        AXM_TOKEN_FILE: "",
        AXM_NO_UPDATE_CHECK: "1",
        AXM_TELEMETRY: "0",
        AXM_TRACE: "off",
        CI: "1",
        NO_COLOR: "1",
      });
      const invoke = (workspace: string, home: string, args: ReadonlyArray<string>) =>
        runObservedProcess({
          executable: baseline.binaryPath,
          args,
          cwd: workspace,
          environment: environment(home),
          artifacts: path.join(output, "preparation", String(preparation++)),
          measureRss: false,
          timeoutMillis: 600_000,
        }).pipe(
          Effect.tap((result) =>
            result.exitCode === 0
              ? Effect.void
              : Effect.fail(failed(`Fixture preparation failed: ${args.join(" ")}`)),
          ),
        );
      const location = (name: string) => {
        const workspace = path.join(root, name, "workspace");
        const home = path.join(root, name, "home");
        const template = path.join(root, name, "template");
        const identities: ReturnType<typeof nativeIdentity> = [];
        fs.mkdirSync(workspace, { recursive: true });
        fs.mkdirSync(home);
        return { workspace, home, template, nativeIdentity: identities };
      };
      const freeze = (value: ReturnType<typeof location>) => {
        fs.mkdirSync(value.template);
        fs.cpSync(value.workspace, path.join(value.template, "workspace"), {
          recursive: true,
          verbatimSymlinks: true,
        });
        fs.cpSync(value.home, path.join(value.template, "home"), {
          recursive: true,
          verbatimSymlinks: true,
        });
        value.nativeIdentity = nativeIdentity(value.workspace);
      };
      if (includes(["inventory-", "inspection-", "schema-"])) {
        const inventory = location("inventory");
        yield* prepareInventoryFixture(inventory.workspace);
        yield* invoke(inventory.workspace, inventory.home, ["sync", "--non-interactive", "--json"]);
        freeze(inventory);
        scenarios.push({
          ...inventory,
          id: "inventory-30",
          kind: "inventory",
          baselineArgs: ["list"],
          candidateArgs: ["list"],
          expectedCount: 30,
          preserveWorkspace: true,
          comparison: "Identical accepted thirty-package fixture and cheap inventory question.",
        });
        scenarios.push({
          ...inventory,
          id: "inspection-30",
          kind: "inspection",
          baselineArgs: ["list", "--details"],
          candidateArgs: ["show", "--all"],
          expectedCount: 30,
          preserveWorkspace: true,
          comparison:
            "Task comparison: old detailed inventory versus new ownership answer. New authority/retention facts have no equivalent old single-command result.",
        });
        scenarios.push({
          ...inventory,
          id: "inspection-1",
          kind: "inspection",
          baselineArgs: null,
          candidateArgs: ["show", "extension-0"],
          expectedCount: 1,
          preserveWorkspace: true,
          comparison:
            "New unified ownership contract; absolute measurements only, no invented baseline.",
        });
        scenarios.push({
          ...inventory,
          id: "schema-outline",
          kind: "schema",
          baselineArgs: null,
          candidateArgs: ["schema", "show"],
          preserveWorkspace: true,
          comparison:
            "New passive discovery; complete human outline and raw JSON schema are distinct output classes.",
        });
        scenarios.push({
          ...inventory,
          id: "schema-field",
          kind: "schema",
          baselineArgs: null,
          candidateArgs: ["schema", "show", "--field", "result.items[].editing.kind"],
          preserveWorkspace: true,
          comparison: "New passive field explanation; absolute measurements only.",
        });
      }
      if (includes(["restoration-"])) {
        const restoration = location("restoration");
        const names = Array.from(
          { length: 50 },
          (_, index) => `bench-${String(index + 1).padStart(3, "0")}`,
        );
        for (const name of names)
          registry.writeSkill(name, [{ version: "1.0.0", body: `Baseline ${name}.` }]);
        writeJson(path.join(restoration.workspace, "axm.json"), {
          owner: "@acme",
          agents: ["claude-code", "codex"],
          defaultRegistry: "test",
          minimumReleaseAge: "0s",
          sources: [registry.source],
          skills: Object.fromEntries(names.map((name) => [name, `@acme/skills/${name}`])),
        });
        yield* invoke(restoration.workspace, restoration.home, [
          "sync",
          "--non-interactive",
          "--json",
        ]);
        fs.rmSync(path.join(restoration.workspace, "agent_extensions"), {
          recursive: true,
          force: true,
        });
        freeze(restoration);
        for (const preview of [false, true])
          scenarios.push({
            ...restoration,
            id: preview ? "restoration-50-preview" : "restoration-50-apply",
            kind: "restoration",
            baselineArgs: ["sync", ...(preview ? ["--preview"] : []), "--non-interactive"],
            candidateArgs: ["sync", ...(preview ? ["--preview"] : []), "--non-interactive"],
            preserveWorkspace: preview,
            comparison:
              "Same accepted fifty Registry packages, missing canonical content, and two configured native consumers. File Registry transport isolates network latency.",
          });
      }
      if (includes(["publication-"])) {
        const publication = location("publication");
        writeJson(path.join(publication.workspace, "axm.json"), {
          owner: "@acme",
          agents: ["claude-code"],
          sources: [registry.source],
          defaultRegistry: "test",
        });
        fs.writeFileSync(
          path.join(publication.workspace, ".gitignore"),
          Array.from({ length: 300 }, (_, rule) => `ignored-${rule}/**`).join("\n") + "\n",
        );
        for (const [index, count] of [34, 33, 33].entries()) {
          const name = `publication-${index}`;
          yield* invoke(publication.workspace, publication.home, [
            "skills",
            "new",
            name,
            "--description",
            "Output measurement fixture",
          ]);
          const packageRoot = path.join(publication.workspace, "skills", name);
          const manifestPath = path.join(packageRoot, "skill.json");
          const previous = decodeObject(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
          writeJson(manifestPath, {
            ...previous,
            version: "1.2.3",
            publish: {
              exclude: [
                "optional-a/**",
                "optional-b/**",
                "optional-c/**",
                "optional-d/**",
                "optional-e/**",
              ],
            },
          });
          fs.mkdirSync(path.join(packageRoot, "src", "references"), { recursive: true });
          for (let file = 0; file < count - 2; file++)
            fs.writeFileSync(
              path.join(packageRoot, "src", "references", `reference-${file}.md`),
              "Fixture content.\n".repeat(32),
            );
        }
        for (const args of [
          ["init", "--initial-branch=fixture"],
          ["add", "axm.json", ".gitignore", "skills"],
          [
            "-c",
            "user.name=Output fixture",
            "-c",
            "user.email=fixture@example.test",
            "commit",
            "-m",
            "Prepare publication fixture",
          ],
        ]) {
          const result = yield* runObservedProcess({
            executable: "git",
            args,
            cwd: publication.workspace,
            environment: environment(publication.home),
            artifacts: path.join(output, "preparation", String(preparation++)),
            measureRss: false,
          });
          if (result.exitCode !== 0)
            return yield* failed("Could not prepare the publication source-comparison repository.");
        }
        freeze(publication);
        scenarios.push({
          ...publication,
          id: "publication-3-preview",
          kind: "publication",
          baselineArgs: ["publish", "--preview"],
          candidateArgs: ["publish", "--preview"],
          preserveWorkspace: true,
          comparison:
            "Three authored candidates, one hundred selected paths, five explicit rules and three hundred unmatched inherited rules per candidate.",
        });
      }
      if (requestedScenarios?.some((id) => !scenarios.some((scenario) => scenario.id === id)))
        return yield* failed("Unknown output benchmark scenario.");
      const selectedScenarios = scenarios.filter(
        (scenario) => requestedScenarios === undefined || requestedScenarios.includes(scenario.id),
      );
      writeJson(path.join(output, "preregistration.json"), {
        baseline,
        candidate,
        measure,
        selectedScenarios: selectedScenarios.map((scenario) => scenario.id),
        protocol: {
          warmups: 1,
          repetitions: 5,
          observationDeadlineMillis: 600_000,
          balancedOrder: true,
          noiseFraction: 0.2,
          driftFraction: 0.1,
          additionalFeatureRegressionAllowance: null,
        },
        scenarios: selectedScenarios.map(({ workspace, home, template, ...scenario }) => ({
          ...scenario,
          fixtureSha256: digest(JSON.stringify(snapshotTree(template, []))),
          paths: { workspace, home },
        })),
        sourceSha256: digest(fs.readFileSync(new URL(import.meta.url))),
        notes:
          "No comparison is qualified without independent semantics and host review. Observability feature allowances are not used.",
      });
      writeJson(path.join(output, "host-before.json"), hostResourceSnapshot(output));
      const samples: Array<{
        scenario: string;
        machine: boolean;
        subject: "baseline" | "candidate";
        iteration: number;
        durationMs: number;
        peakRssBytes: number;
        stdoutBytes: number;
        stderrBytes: number;
        exitCode: number;
      }> = [];
      for (const scenario of selectedScenarios)
        for (const machine of [true, false]) {
          for (let iteration = -1; iteration < (measure ? 5 : 1); iteration++) {
            if (!measure && iteration === -1) continue;
            const order: ReadonlyArray<"baseline" | "candidate"> =
              scenario.baselineArgs === null
                ? ["candidate"]
                : iteration % 2 === 0
                  ? ["baseline", "candidate"]
                  : ["candidate", "baseline"];
            let pairedArchiveFacts: string | undefined;
            for (const subject of order) {
              restoreTree(path.join(scenario.template, "workspace"), scenario.workspace);
              restoreTree(path.join(scenario.template, "home"), scenario.home);
              if (
                JSON.stringify(nativeIdentity(scenario.workspace)) !==
                JSON.stringify(scenario.nativeIdentity)
              )
                return yield* failed(
                  "Reset changed accepted native physical identity; the next observation would not be a paired fixture.",
                );
              const before = snapshotTree(scenario.workspace, []);
              const selectedArgs =
                subject === "baseline" ? scenario.baselineArgs : scenario.candidateArgs;
              if (selectedArgs === null) throw failed("No baseline for this new command.");
              const artifacts = path.join(
                output,
                "captures",
                scenario.id,
                machine ? "machine" : "human",
                String(iteration),
                subject,
              );
              const observed = yield* runObservedProcess({
                executable: subject === "baseline" ? baseline.binaryPath : candidate.binaryPath,
                args: [...selectedArgs, ...(machine ? ["--json"] : [])],
                cwd: scenario.workspace,
                environment: environment(scenario.home),
                artifacts,
                timeoutMillis: 600_000,
              });
              if (observed.exitCode !== 0)
                return yield* failed(
                  `Capture failed: ${scenario.id}/${subject}; inspect ${artifacts}`,
                );
              const after = snapshotTree(scenario.workspace, []);
              if (scenario.preserveWorkspace && JSON.stringify(before) !== JSON.stringify(after))
                return yield* failed(
                  `Read-only capture mutated workspace: ${scenario.id}/${subject}`,
                );
              const facts = inspectOutput(scenario, observed.stdout, subject, machine);
              if ("archiveFacts" in facts) {
                const exact = JSON.stringify(facts.archiveFacts);
                if (pairedArchiveFacts !== undefined && pairedArchiveFacts !== exact)
                  return yield* failed(
                    "Publication changed selected paths, bytes/integrity, exclusions, or warnings between paired subjects.",
                  );
                pairedArchiveFacts = exact;
              }
              writeJson(path.join(artifacts, "facts.json"), facts);
              writeJson(path.join(artifacts, "before.json"), before);
              writeJson(path.join(artifacts, "after.json"), after);
              writeJson(path.join(artifacts, "receipt.json"), {
                ...facts,
                exitCode: observed.exitCode,
                durationMs: observed.durationMs,
                peakRssBytes: observed.peakRssBytes,
                stdoutSha256: digest(observed.stdout),
                stderrSha256: digest(observed.stderr),
                stderrBytes: Buffer.byteLength(observed.stderr),
              });
              if (iteration >= 0)
                samples.push({
                  scenario: scenario.id,
                  machine,
                  subject,
                  iteration,
                  durationMs: observed.durationMs,
                  peakRssBytes: observed.peakRssBytes,
                  stdoutBytes: Buffer.byteLength(observed.stdout),
                  stderrBytes: Buffer.byteLength(observed.stderr),
                  exitCode: observed.exitCode,
                });
            }
          }
        }
      const summaries = selectedScenarios.flatMap((scenario) =>
        [true, false].flatMap((machine) =>
          (["baseline", "candidate"] as const).flatMap((subject) => {
            const selected = samples.filter(
              (sample) =>
                sample.scenario === scenario.id &&
                sample.machine === machine &&
                sample.subject === subject,
            );
            if (selected.length === 0) return [];
            const times = selected.map((sample) => sample.durationMs);
            const center = median(times);
            const noiseFraction = (Math.max(...times) - Math.min(...times)) / center;
            const first = times[0];
            const last = times.at(-1);
            const driftFraction =
              first === undefined || last === undefined ? null : Math.abs(last - first) / center;
            return [
              {
                scenario: scenario.id,
                machine,
                subject,
                medianMs: center,
                medianRssBytes: median(selected.map((sample) => sample.peakRssBytes)),
                noiseFraction,
                driftFraction,
                investigationRequired:
                  measure && (noiseFraction > 0.2 || driftFraction === null || driftFraction > 0.1),
              },
            ];
          }),
        ),
      );
      writeJson(path.join(output, "host-after.json"), hostResourceSnapshot(output));
      writeJson(path.join(output, "report.json"), {
        samples,
        summaries,
        qualification: measure
          ? "pending-host-and-semantic-review"
          : "captures-only-no-performance-claim",
        tokenizer:
          "Measured independently against these complete raw captures; not estimated here.",
        limitations: [
          "File Registry removes remote transport variance; no network-performance claim.",
          "Schema export and arbitrary exact-content outputs are complete-volume exceptions.",
          "Provider token usage and local tokenizer counts are separate quantities.",
        ],
      });
      yield* Effect.log(`Complete output evidence: ${output}`);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
