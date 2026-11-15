import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as Schema from "effect/Schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { startHttpRegistry, type HttpRegistry } from "@agentxm/client-e2e-utils/http-registry";
import { createTempDir, runCli } from "./e2e/utils.js";
import { makeEnvironmentProcessFixture } from "./test-support/environment-process-fixture.js";
import { initRegistryWorkspace, publishSkill } from "./test-support/registry-workspace.js";

export const executionBinding = defineExecutionBinding({
  requirements: [
    "cli/verify/evidence-levels-are-independent",
    "cli/verify/verdict-requires-complete-evidence",
    "cli/verify/publish-result-supplies-expectations-only",
    "cli/verify/selection-is-exact-and-explicit",
  ],
  boundary: "process",
  rationale:
    "The built CLI verifies releases it published through its own publish command against an independent HTTP Registry and a file Registry; wire contracts validate every captured document against the published schema while the Registry journal records selection, admission and download traffic.",
});

const Assessment = Schema.Struct({
  coverage: Schema.Struct({ state: Schema.String }),
  conclusion: Schema.String,
  finding: Schema.optionalKey(Schema.String),
  failure: Schema.optionalKey(Schema.Struct({ category: Schema.String })),
});

const VerifyAnswer = Schema.Struct({
  ok: Schema.Boolean,
  mode: Schema.Literal("query"),
  outcome: Schema.Literal("completed"),
  result: Schema.Struct({
    contract: Schema.Literal("release-verification-v1"),
    registry: Schema.Struct({ endpoint: Schema.String, selectedBy: Schema.String }),
    selection: Schema.Struct({
      mode: Schema.String,
      requests: Schema.Array(Schema.Struct({ id: Schema.String, input: Schema.String })),
    }),
    releases: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        requestRefs: Schema.Array(Schema.String),
        expectation: Schema.optionalKey(
          Schema.Struct({ integrity: Schema.String, source: Schema.String }),
        ),
        reported: Schema.optionalKey(Schema.Struct({ participation: Schema.String })),
        observed: Schema.optionalKey(
          Schema.Struct({
            integrity: Schema.String,
            yanked: Schema.Boolean,
            yankedAt: Schema.optionalKey(Schema.String),
          }),
        ),
        presence: Assessment,
        identity: Assessment,
        archive: Assessment,
      }),
    ),
    verdict: Schema.Struct({
      ok: Schema.Boolean,
      reasons: Schema.Array(
        Schema.Struct({
          check: Schema.String,
          code: Schema.String,
          refs: Schema.Array(Schema.String),
        }),
      ),
    }),
  }),
});
const decode = (stdout: string) => Schema.decodeUnknownSync(VerifyAnswer)(JSON.parse(stdout));

const ErrorAnswer = Schema.Struct({ ok: Schema.Literal(false), code: Schema.String });

const HelpAnswer = Schema.Struct({ type: Schema.Literal("help"), usage: Schema.String });

const satisfied = { coverage: { state: "complete" }, conclusion: "satisfied" };
const unobservedArchive = { coverage: { state: "incomplete" }, conclusion: "unknown" };

/** A well-formed SHA-512 SRI value no published archive has. */
const otherIntegrity = `sha512-${createHash("sha512").update("not-the-release").digest("base64")}`;

/** One release as the Registry recorded it, read from the fixture rather than guessed. */
const publishedRelease = (registry: HttpRegistry, name: string) => {
  const record = registry.publishes.find((entry) => entry.name === name);
  if (record === undefined) throw new Error(`Expected ${name} to be published`);
  return {
    id: `@test/skills/${name}@${record.version}`,
    version: record.version,
    integrity: record.integrity,
  };
};

/** The requests one invocation sent, as method, path and declared purposes. */
const journal = (registry: HttpRegistry) => {
  const requests = registry.requests.length;
  const metadata = registry.metadataPurposes.length;
  return () => ({
    requests: registry.requests.slice(requests),
    purposes: registry.metadataPurposes.slice(metadata).map((purposes) => purposes[0]),
    archives: registry.requests
      .slice(requests)
      .filter((request) => request.path.endsWith("/archive")),
  });
};

describe("verify against an HTTP Registry", () => {
  let registry: HttpRegistry;
  let author: ReturnType<typeof createTempDir>;
  let firstPublish: string;
  let repeatedPublish: string;
  const readers: Array<ReturnType<typeof makeEnvironmentProcessFixture>> = [];
  /**
   * A reader whose `test` source is the HTTP Registry. `unreachable` makes the
   * default a loopback origin nothing answers, so any request that falls back
   * to the default Registry fails instead of reaching the recorded one.
   */
  const reader = (defaultRegistry: "test" | "unreachable" = "test") => {
    const fixture = makeEnvironmentProcessFixture();
    fixture.writeProjectSettings({
      agents: [],
      sources: [
        { name: "test", type: "registry", location: registry.url },
        ...(defaultRegistry === "unreachable"
          ? [{ name: "unreachable", type: "registry", location: "http://127.0.0.1:1" }]
          : []),
      ],
      defaultRegistry,
    });
    readers.push(fixture);
    return fixture;
  };

  beforeAll(async () => {
    registry = await startHttpRegistry();
    author = createTempDir();
    await initRegistryWorkspace({ path: author.path, location: registry.url, owner: "@test" });
    const run = (args: ReadonlyArray<string>) =>
      runCli(args, { cwd: author.path, env: { AXM_TOKEN: "e2e-test-token" } });
    for (const name of ["review", "withdrawn", "held"]) {
      const created = await run(["skills", "new", name, "--owner", "@test"]);
      expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    }
    const first = await run(["publish", "@test/skills/review", "--json"]);
    expect(first.exitCode, first.stdout + first.stderr).toBe(0);
    firstPublish = path.join(author.path, "first-publish.json");
    fs.writeFileSync(firstPublish, first.stdout);
    const others = await run(["publish", "@test/skills/withdrawn", "@test/skills/held", "--json"]);
    expect(others.exitCode, others.stdout + others.stderr).toBe(0);
    // Publishing an already published version again prepares no archive.
    const repeated = await run(["publish", "@test/skills/review", "--json"]);
    expect(repeated.exitCode, repeated.stdout + repeated.stderr).toBe(0);
    repeatedPublish = path.join(author.path, "repeated-publish.json");
    fs.writeFileSync(repeatedPublish, repeated.stdout);
  }, 180_000);

  afterAll(async () => {
    for (const fixture of readers) fixture.cleanup();
    author.cleanup();
    await registry.close();
  });

  it("verifies an intended release, then reuses its verified cached copy after fresh admission", async () => {
    const release = publishedRelease(registry, "review");
    const fixture = reader();
    const command = ["verify", release.id, "--integrity", release.integrity, "--json"];

    const cold = journal(registry);
    const verified = await fixture.run(command);
    expect(verified.exitCode, verified.stdout + verified.stderr).toBe(0);
    expect(decode(verified.stdout)).toMatchObject({
      ok: true,
      result: {
        registry: { endpoint: registry.url, selectedBy: "default" },
        releases: [
          {
            id: release.id,
            expectation: { integrity: release.integrity, source: "flag" },
            observed: { integrity: release.integrity, yanked: false },
            presence: satisfied,
            identity: satisfied,
            archive: satisfied,
          },
        ],
        verdict: { ok: true, reasons: [] },
      },
    });
    const first = cold();
    expect(first.purposes).toEqual(["select", "authorize-exact"]);
    expect(first.archives.map((request) => request.usagePurpose)).toEqual(["verification"]);

    const warm = journal(registry);
    const again = await fixture.run(command);
    expect(again.exitCode, again.stdout + again.stderr).toBe(0);
    expect(decode(again.stdout).result.releases[0]?.archive).toMatchObject(satisfied);
    const second = warm();
    expect(second.purposes).toEqual(["select", "authorize-exact"]);
    expect(second.archives).toEqual([]);
  });

  it("reports an unintended identity as a completed negative result with a satisfied archive", async () => {
    const release = publishedRelease(registry, "review");
    const result = await reader().run([
      "verify",
      release.id,
      "--integrity",
      otherIntegrity,
      "--json",
    ]);
    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    expect(decode(result.stdout)).toMatchObject({
      ok: false,
      outcome: "completed",
      result: {
        releases: [
          {
            expectation: { integrity: otherIntegrity, source: "flag" },
            observed: { integrity: release.integrity },
            presence: satisfied,
            identity: {
              coverage: { state: "complete" },
              conclusion: "attention-required",
              finding: "integrity-mismatch",
            },
            archive: satisfied,
          },
        ],
        verdict: {
          ok: false,
          reasons: [{ check: "identity", code: "attention-required", refs: [release.id] }],
        },
      },
    });
  });

  it("keeps a missing version and an unavailable extension distinct from a present release named twice", async () => {
    const release = publishedRelease(registry, "review");
    const missing = `@test/skills/review@99.0.0`;
    const absent = "@test/skills/absent@1.0.0";
    const sent = journal(registry);
    const result = await reader().run([
      "verify",
      release.id,
      missing,
      absent,
      release.id,
      "--json",
    ]);
    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    const answer = decode(result.stdout);
    expect(answer.result.selection.requests.map((request) => request.input)).toEqual([
      release.id,
      missing,
      absent,
      release.id,
    ]);
    expect(answer.result.releases).toMatchObject([
      {
        id: release.id,
        requestRefs: ["request-1", "request-4"],
        presence: satisfied,
        archive: satisfied,
      },
      {
        id: missing,
        presence: { conclusion: "attention-required", finding: "version-missing" },
        archive: unobservedArchive,
      },
      {
        id: absent,
        presence: { conclusion: "attention-required", finding: "extension-unavailable" },
        archive: unobservedArchive,
      },
    ]);
    expect(answer.result.verdict).toEqual({
      ok: false,
      reasons: [
        { check: "presence", code: "attention-required", refs: [missing, absent] },
        { check: "archive", code: "incomplete-assessment", refs: [missing, absent] },
      ],
    });
    // One selection exchange and one admission exchange; the release named
    // twice is read once.
    const requests = sent();
    expect(requests.purposes).toEqual(["select", "authorize-exact"]);
    expect(requests.archives).toHaveLength(1);
    expect(requests.archives[0]?.path.endsWith(`/review/${release.version}/archive`)).toBe(true);
  });

  it("keeps presence when content admission is refused and reports the archive incomplete", async () => {
    const release = publishedRelease(registry, "held");
    registry.denyContent("skills/held");
    const sent = journal(registry);
    const result = await reader().run(["verify", release.id, "--json"]);
    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    const [verified] = decode(result.stdout).result.releases;
    expect(verified).toMatchObject({
      observed: { integrity: release.integrity },
      presence: satisfied,
      identity: { conclusion: "not-applicable" },
      archive: { ...unobservedArchive, failure: { category: "not_found" } },
    });
    expect(sent().archives).toEqual([]);
  });

  it("treats a yanked release as present and reports its yank facts", async () => {
    const release = publishedRelease(registry, "withdrawn");
    registry.yank("@test", "skills", "withdrawn", release.version);
    const result = await reader().run(["verify", release.id, "--json"]);
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const [verified] = decode(result.stdout).result.releases;
    expect(verified).toMatchObject({
      observed: { yanked: true, yankedAt: expect.any(String) },
      presence: satisfied,
      archive: satisfied,
    });
  });

  it("verifies a saved publish result's admitted set against the expectations it records", async () => {
    const release = publishedRelease(registry, "review");
    // The default Registry is unreachable: only the Registry the result records can answer.
    const fixture = reader("unreachable");
    const recorded = journal(registry);
    const uploaded = await fixture.run(["verify", "--publish-result", firstPublish, "--json"]);
    expect(uploaded.exitCode, uploaded.stdout + uploaded.stderr).toBe(0);
    const reads = recorded();
    expect(reads.purposes).toEqual(["select", "authorize-exact"]);
    expect(reads.archives.map((request) => request.usagePurpose)).toEqual(["verification"]);
    expect(decode(uploaded.stdout)).toMatchObject({
      ok: true,
      result: {
        registry: { endpoint: registry.url, selectedBy: "publish-result" },
        selection: { mode: "publish-result", requests: [{ id: "request-1" }] },
        releases: [
          {
            id: release.id,
            expectation: { integrity: release.integrity, source: "publish-result" },
            reported: { participation: "publish" },
            presence: satisfied,
            identity: satisfied,
            archive: satisfied,
          },
        ],
      },
    });

    const repeated = await fixture.run(["verify", "--publish-result", repeatedPublish, "--json"]);
    expect(repeated.exitCode, repeated.stdout + repeated.stderr).toBe(0);
    const [unprepared] = decode(repeated.stdout).result.releases;
    expect(unprepared).not.toHaveProperty("expectation");
    expect(unprepared).toMatchObject({
      id: release.id,
      presence: satisfied,
      identity: { coverage: { state: "not-applicable" }, conclusion: "not-applicable" },
      archive: satisfied,
    });
  });

  it("refuses an inexact selection before any request and shows usage when nothing is selected", async () => {
    const fixture = reader();
    const sent = journal(registry);
    const range = await fixture.run(["verify", "@test/skills/review@^1.0.0", "--json"]);
    expect(range.exitCode, range.stdout + range.stderr).toBe(2);
    expect(Schema.decodeUnknownSync(ErrorAnswer)(JSON.parse(range.stdout)).code).toBe("usage");
    const usage = await fixture.run(["verify", "--json"]);
    expect(usage.exitCode, usage.stdout + usage.stderr).toBe(0);
    const help: unknown = JSON.parse(usage.stdout);
    expect(help).not.toHaveProperty("result");
    expect(Schema.decodeUnknownSync(HelpAnswer)(help).usage).toMatch(/^axm verify /u);
    expect(sent().requests).toEqual([]);
  });

  it("fails offline with the network error instead of a verdict and sends nothing", async () => {
    const release = publishedRelease(registry, "review");
    const sent = journal(registry);
    const result = await reader().run(["verify", release.id, "--offline", "--json"]);
    expect(result.exitCode, result.stdout + result.stderr).toBe(8);
    const failure: unknown = JSON.parse(result.stdout);
    expect(failure).not.toHaveProperty("result");
    expect(Schema.decodeUnknownSync(ErrorAnswer)(failure).code).toBe("network");
    expect(result.stdout + result.stderr).toContain("network-required");
    expect(sent().requests).toEqual([]);
  });
});

it("does not establish an archive whose stored bytes no longer match the recorded integrity", async () => {
  const storage = createTempDir("axm-registry-");
  const fixture = makeEnvironmentProcessFixture();
  try {
    const location = pathToFileURL(storage.path).href;
    await publishSkill({
      registryLocation: location,
      owner: "@test",
      name: "altered",
      body: "Original.",
    });
    const directory = path.join(storage.path, "extensions", "@test", "skills", "altered");
    const index = Schema.decodeUnknownSync(
      Schema.Struct({
        versions: Schema.Array(Schema.Struct({ version: Schema.String, integrity: Schema.String })),
      }),
    )(JSON.parse(fs.readFileSync(path.join(directory, "index.json"), "utf8")));
    const [recorded] = index.versions;
    if (recorded === undefined) throw new Error("Expected the published version");
    fs.writeFileSync(path.join(directory, `${recorded.version}.zip`), "not the published archive");
    fixture.writeProjectSettings({
      agents: [],
      sources: [{ name: "test", type: "registry", location }],
      defaultRegistry: "test",
    });
    const result = await fixture.run([
      "verify",
      `@test/skills/altered@${recorded.version}`,
      "--integrity",
      recorded.integrity,
      "--json",
    ]);
    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    const answer = decode(result.stdout);
    expect(answer.ok).toBe(false);
    expect(answer.result.releases[0]).toMatchObject({
      presence: satisfied,
      identity: satisfied,
      archive: { ...unobservedArchive, failure: { category: "conflict" } },
    });
  } finally {
    fixture.cleanup();
    storage.cleanup();
  }
});
