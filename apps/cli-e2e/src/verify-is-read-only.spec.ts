import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { expect, it } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { snapshotProtectedState } from "@agentxm/test-support";
import { startHttpRegistry } from "@agentxm/client-e2e-utils/http-registry";
import { createTempDir } from "@agentxm/client-e2e-utils";
import { runCli } from "./utils.js";
import { initRegistryWorkspace } from "./test-support/registry-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/verify/is-read-only",
  title: "Release verification reads the Registry without changing any state",
  statement:
    "Verify shall send only Registry selection, content admission and archive download requests, and shall not upload, preview or settle a publication, change Registry lifecycle state, or write workspace content, settings, lockfile or native agent state.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution", "safe-repetition"],
  boundary: "process",
  boundaryRationale:
    "Separate CLI processes verify releases from a native workspace while an independent HTTP Registry journals every request and keeps its stored versions, and protected-state snapshots detect workspace, settings and credential writes.",
  methods: ["example"],
  derivedFrom: ["docs/architecture/commands/overview.md"],
  supersedes: [],
  assumptions: [
    "Startup update checks and telemetry are disabled in this isolated fixture; their separately owned delivery does not read the Registry on behalf of verify.",
    "The local archive cache may receive a verified copy; it is reusable acquisition state, not workspace, settings or Registry state.",
  ],
  openQuestions: [],
});

const VerifyAnswer = Schema.Struct({
  ok: Schema.Boolean,
  mode: Schema.Literal("query"),
  outcome: Schema.Literal("completed"),
  result: Schema.Struct({ verdict: Schema.Struct({ ok: Schema.Boolean }) }),
});
const decode = (stdout: string) => Schema.decodeUnknownSync(VerifyAnswer)(JSON.parse(stdout));

const PublishedSkill = Schema.Struct({
  versions: Schema.Array(Schema.Struct({ version: Schema.String, integrity: Schema.String })),
});

it("verifies published releases from a workspace without changing workspace, home or Registry state", async () => {
  const workspace = createTempDir();
  const home = createTempDir();
  const saved = createTempDir();
  const registry = await startHttpRegistry();
  try {
    const env = {
      HOME: home.path,
      AXM_USER_HOME: home.path,
      AXM_TOKEN: "e2e-test-token",
      AXM_NO_UPDATE_CHECK: "1",
      AXM_TELEMETRY: "off",
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
    };
    const run = (args: ReadonlyArray<string>) =>
      runCli([...args, "--non-interactive", "--json"], { cwd: workspace.path, env });
    // Author and publish through public commands before observing the
    // read-only boundary, so the workspace holds settings, a lockfile and
    // native projections that verify must leave alone.
    await initRegistryWorkspace({
      path: workspace.path,
      location: registry.url,
      owner: "@test",
      env,
    });
    const created = await run(["skills", "new", "review", "--owner", "@test"]);
    expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    const published = await run(["publish", "@test/skills/review"]);
    expect(published.exitCode, published.stdout + published.stderr).toBe(0);
    const publishResult = path.join(saved.path, "publish.json");
    fs.writeFileSync(publishResult, published.stdout);

    // The Registry's own index document, read outside the verify journal
    // window, carries its stored versions, digests and lifecycle facts.
    const storedState = () =>
      new Promise<unknown>((resolve, reject) => {
        http
          .get(`${registry.url}/v1/extensions/@test/skills/review`, (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
              body += chunk;
            });
            response.on("end", () => resolve(JSON.parse(body)));
            response.on("error", reject);
          })
          .on("error", reject);
      });
    const storedBefore = await storedState();
    const [release] = Schema.decodeUnknownSync(PublishedSkill)(storedBefore).versions;
    if (release === undefined) throw new Error("Expected the published version");
    const reference = `@test/skills/review@${release.version}`;
    const publishedBefore = registry.publishes.length;
    const before = snapshotProtectedState(workspace.path);
    const homePaths = [".axm/workspace", ".config/axm/credentials.json"];
    const homeBefore = snapshotProtectedState(home.path, homePaths);
    const journalStart = registry.requests.length;
    const metadataStart = registry.metadataPurposes.length;

    for (const args of [
      ["verify", reference, "--integrity", release.integrity],
      ["verify", "--publish-result", publishResult],
    ]) {
      const result = await run(args);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(decode(result.stdout)).toMatchObject({ ok: true, result: { verdict: { ok: true } } });
    }
    const negative = await run(["verify", reference, "@test/skills/absent@1.0.0"]);
    expect(negative.exitCode, negative.stdout + negative.stderr).toBe(1);
    expect(decode(negative.stdout)).toMatchObject({
      ok: false,
      result: { verdict: { ok: false } },
    });

    const sent = registry.requests.slice(journalStart);
    expect(sent.length).toBeGreaterThan(0);
    expect(
      sent.filter(
        (request) =>
          !(request.method === "POST" && request.path === "/v1/resolutions") &&
          !(request.method === "GET" && request.path.endsWith(`/${release.version}/archive`)),
      ),
    ).toEqual([]);
    expect(new Set(registry.metadataPurposes.slice(metadataStart).flat())).toEqual(
      new Set(["select", "authorize-exact"]),
    );
    expect(registry.publishes).toHaveLength(publishedBefore);
    expect(await storedState()).toEqual(storedBefore);
    expect(snapshotProtectedState(workspace.path)).toEqual(before);
    expect(snapshotProtectedState(home.path, homePaths)).toEqual(homeBefore);
  } finally {
    await registry.close();
    workspace.cleanup();
    home.cleanup();
    saved.cleanup();
  }
}, 90_000);
