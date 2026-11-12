import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fixtureArchive } from "@agentxm/client-e2e-utils/registry";
import * as Schema from "effect/Schema";
import {
  assertOutput,
  assertSuccessful,
  configureWorkspace,
  extensionKinds,
  packageFiles,
  type BenchmarkScenario,
  type ScenarioContext,
} from "./fixtures.js";

const archiveCache = (home: string): string =>
  path.join(
    home,
    ...(process.platform === "darwin"
      ? ["Library", "Caches", "axm"]
      : process.platform === "win32"
        ? ["AppData", "Local", "axm", "cache"]
        : [".cache", "axm"]),
    "archives",
  );

const prepareCache = async (context: ScenarioContext) => {
  const root = archiveCache(context.home);
  await fs.mkdir(root, { recursive: true });
  const entries = await Promise.all(
    ["valid", "corrupt", "expired"].map(async (state) => {
      const content = fixtureArchive(packageFiles(extensionKinds[0], state));
      const name = `${createHash("sha512").update(content).digest("base64url")}.zip`;
      const file = path.join(root, name);
      await fs.writeFile(
        file,
        state === "corrupt" ? Buffer.from("Corrupt disposable fixture archive") : content,
      );
      if (state === "expired") await fs.utimes(file, 946684800, 946684800);
      return { state, file };
    }),
  );
  return { root, entries };
};

const diagnosticReview = Schema.Struct({
  diagnosticId: Schema.String,
  sha256: Schema.String,
  record: Schema.Unknown,
});

const prepareDiagnostic = async (context: ScenarioContext) => {
  await configureWorkspace(context);
  const failure = await context.run([
    "skills",
    "show",
    "missing-diagnostic-fixture",
    "--json",
    "--non-interactive",
  ]);
  if (failure.exitCode === 0)
    throw new Error("Diagnostic fixture did not produce the intended missing-extension failure");
  const directory = path.join(context.home, ".axm", "diagnostics");
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".json"));
  if (files.length !== 1 || files[0] === undefined)
    throw new Error("Expected exactly one retained diagnostic from fixture failure");
  const id = files[0].slice(0, -5);
  const review = await context.run(["diagnostics", "show", id, "--json", "--non-interactive"]);
  assertSuccessful(review);
  const { result: document } = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Struct({ result: diagnosticReview })),
  )(review.stdout);
  return { id, digest: document.sha256, content: `${JSON.stringify(document.record, null, 2)}\n` };
};

export const applicationStateScenarios = (): ReadonlyArray<BenchmarkScenario> => {
  const scenarios: BenchmarkScenario[] = [];
  for (const modeId of ["default", "json"]) {
    const flags = modeId === "json" ? ["--json"] : [];
    for (const action of ["status", "verify", "prune"]) {
      scenarios.push({
        id: `application:cache ${action}:${modeId}`,
        operationId: `cache ${action}`,
        modeId,
        dimensions: {
          scope: "none",
          source: "none",
          selection: "bulk",
          view: "filesystem",
          output: modeId === "json" ? "json" : "human",
          state: action === "status" ? "query" : "changed",
          format: modeId === "json" ? "result-json" : "terminal-text",
          kinds: [],
        },
        fixtureId: "archive-cache-valid-corrupt-expired-v1",
        description:
          "Inspect or maintain three disposable archive entries with distinct valid, corrupt, and expired states",
        prepare: async (context) => {
          const cache = await prepareCache(context);
          return {
            args: ["cache", action, ...flags, "--non-interactive"],
            expectedExitCode: 0,
            verify: async (result) => {
              assertSuccessful(result);
              const remaining = await fs.readdir(cache.root);
              for (const entry of cache.entries) {
                const shouldRemain = !(
                  (action === "verify" && entry.state === "corrupt") ||
                  (action === "prune" && entry.state === "expired")
                );
                if (remaining.includes(path.basename(entry.file)) !== shouldRemain)
                  throw new Error(
                    `Cache ${action} did not preserve/remove the ${entry.state} entry correctly`,
                  );
              }
              if (modeId === "json") {
                const document = Schema.decodeUnknownSync(
                  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
                )(result.stdout);
                const values = Schema.decodeUnknownSync(
                  Schema.Record(Schema.String, Schema.Unknown),
                )(document["result"]);
                if (action === "status" && values["entries"] !== 3)
                  throw new Error("Cache status did not count all fixture entries");
                if (
                  action === "verify" &&
                  (values["checked"] !== 3 ||
                    values["valid"] !== 2 ||
                    values["corruptRemoved"] !== 1)
                )
                  throw new Error("Cache verification did not report actual integrity results");
                if (action === "prune" && (values["removed"] !== 1 || values["remaining"] !== 2))
                  throw new Error("Cache pruning did not report actual removal");
              }
            },
          };
        },
      });
    }
    for (const action of ["show", "export"]) {
      scenarios.push({
        id: `application:diagnostics ${action}:${modeId}`,
        operationId: `diagnostics ${action}`,
        modeId,
        dimensions: {
          scope: "none",
          source: "none",
          selection: "targeted",
          view: "filesystem",
          output: modeId === "json" ? "json" : "human",
          state: action === "show" ? "query" : "changed",
          format: modeId === "json" ? "result-json" : "terminal-text",
          kinds: [],
        },
        fixtureId: "retained-cli-failure-v1",
        description:
          "Review or export an actual retained CLI failure with the exact reviewed content digest",
        prepare: async (context) => {
          const diagnostic = await prepareDiagnostic(context);
          const destination = path.join(context.workspace, "reviewed-diagnostic.json");
          return {
            args: [
              "diagnostics",
              action,
              diagnostic.id,
              ...(action === "export" ? [destination, "--review-sha256", diagnostic.digest] : []),
              ...flags,
              "--non-interactive",
            ],
            expectedExitCode: 0,
            verify: async (result) => {
              assertOutput(result, diagnostic.id);
              if (action === "show") assertOutput(result, diagnostic.digest);
              else {
                if ((await fs.readFile(destination, "utf8")) !== diagnostic.content)
                  throw new Error("Diagnostic export changed reviewed content");
                if (
                  process.platform !== "win32" &&
                  ((await fs.stat(destination)).mode & 0o777) !== 0o600
                )
                  throw new Error("Diagnostic export was not restricted to its owner");
              }
            },
          };
        },
      });
    }
  }
  return scenarios;
};
