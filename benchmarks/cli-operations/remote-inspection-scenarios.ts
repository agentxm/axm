import { startBenchmarkRegistry } from "./http-fixture.js";
import * as Schema from "effect/Schema";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fixtureArchive } from "@agentxm/client-e2e-utils/registry";
import {
  assertOutput,
  assertSuccessful,
  configureWorkspace,
  extensionKinds,
  packageFiles,
  type BenchmarkScenario,
  type ExtensionKind,
} from "./fixtures.js";
import { wrapPrepared } from "./verification.js";

const AssessmentDocument = Schema.Struct({
  filter: Schema.Literals(["outdated", "deprecated", "archived", "lifecycle"]),
  count: Schema.Number,
  items: Schema.Array(
    Schema.Struct({
      type: Schema.String,
      name: Schema.String,
      assessment: Schema.Struct({
        state: Schema.String,
        installedVersion: Schema.optionalKey(Schema.String),
        latestMatching: Schema.optionalKey(Schema.String),
        archival: Schema.optionalKey(
          Schema.Struct({ archivedAt: Schema.String, message: Schema.optionalKey(Schema.String) }),
        ),
        deprecation: Schema.optionalKey(
          Schema.Struct({ reason: Schema.String, message: Schema.optionalKey(Schema.String) }),
        ),
      }),
    }),
  ),
  coverage: Schema.Struct({
    eligible: Schema.Number,
    checked: Schema.Number,
    unknown: Schema.Number,
  }),
});

const inspectionScenario = (
  filter: "outdated" | "deprecated" | "archived" | "lifecycle",
  selected: ReadonlyArray<ExtensionKind>,
  output: "human" | "json",
  bulk: boolean,
): BenchmarkScenario => ({
  id: `list-${filter}-${bulk ? "all-kinds" : selected.map((kind) => kind.type).join("-")}-${output}`,
  operationId: "list",
  modeId: filter === "lifecycle" ? "deprecated-archived" : filter,
  fixtureId: filter === "lifecycle" ? "registry-lifecycle-union-v1" : "registry-inspection-v1",
  dimensions: {
    scope: "project",
    source: "registry",
    selection: bulk ? "bulk" : "targeted",
    view: "filesystem",
    output,
    state: "query",
    format: "remote-assessment",
    kinds: selected.map((kind) => kind.type),
  },
  description: `Assess ${bulk ? "all seven installed kinds" : selected.map((kind) => kind.type).join(", ")} against fresh ${filter === "outdated" ? "newer Registry versions" : `Registry ${filter} metadata`} (${output}).`,
  prepare: async (context) => {
    const registry = await startBenchmarkRegistry();
    try {
      await configureWorkspace(context, {
        agents: ["claude-code"],
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
        sources: [{ name: "benchmark", type: "registry", location: registry.url }],
        defaultRegistry: "benchmark",
        minimumReleaseAge: "0s",
      });
      const states =
        filter === "lifecycle"
          ? [
              { name: "deprecated-only", deprecated: true, archived: false },
              { name: "archived-only", deprecated: false, archived: true },
              { name: "both", deprecated: true, archived: true },
            ]
          : [
              {
                name: "sample",
                deprecated: filter === "deprecated",
                archived: filter === "archived",
              },
            ];
      const expected = selected.flatMap((kind) => states.map((state) => ({ kind, ...state })));
      for (const { kind, name } of expected) {
        registry.seed({
          owner: "@benchmark",
          plural: kind.plural,
          name,
          version: "1.0.0",
          archive: fixtureArchive(packageFiles(kind, name)),
        });
        assertSuccessful(
          await context.run([
            "install",
            `@benchmark/${kind.plural}/${name}@^1.0.0`,
            "--accept-execution-changes",
            "--non-interactive",
            "--json",
          ]),
        );
      }
      // Apply lifecycle changes after every installation so setup observes active packages.
      for (const { kind, name, deprecated, archived } of expected) {
        if (filter === "outdated")
          registry.seed({
            owner: "@benchmark",
            plural: kind.plural,
            name,
            version: "1.1.0",
            archive: fixtureArchive(packageFiles(kind, name, "1.1.0")),
          });
        if (deprecated)
          registry.setDeprecation("@benchmark", kind.plural, name, {
            deprecatedAt: "2026-01-01T00:00:00.000Z",
            reason: "unmaintained",
            message: "Fixture is no longer maintained",
          });
        if (archived)
          registry.setArchival("@benchmark", kind.plural, name, {
            archivedAt: "2026-01-02T00:00:00.000Z",
            message: "Fixture publication is closed",
          });
      }
      const beforeRequests = registry.requests.length;
      const mode = {
        id: filter === "lifecycle" ? "deprecated-archived" : filter,
        flags: [
          ...(filter === "lifecycle" ? ["--deprecated", "--archived"] : [`--${filter}`]),
          ...(output === "json" ? ["--json"] : []),
        ],
      };
      return await wrapPrepared(
        context,
        mode,
        {
          args: [
            "list",
            ...mode.flags,
            ...(bulk ? [] : selected.flatMap((kind) => ["--type", kind.type])),
            "--non-interactive",
          ],
          expectedExitCode: 0,
          verify: (result) => {
            for (const state of states) assertOutput(result, state.name);
            const requests = registry.requests.slice(beforeRequests);
            for (const { kind, name } of expected) {
              if (
                !requests.some(
                  (request) =>
                    request.method === "GET" &&
                    decodeURIComponent(request.path) ===
                      `/v1/extensions/@benchmark/${kind.plural}/${name}`,
                )
              )
                throw new Error(`No current Registry observation for ${kind.type}`);
            }
            if (requests.some((request) => !["GET", "HEAD"].includes(request.method)))
              throw new Error("Remote inspection mutated Registry state");
            if (output === "json") {
              const { result: document } = Schema.decodeUnknownSync(
                Schema.fromJsonString(
                  Schema.Struct({ ok: Schema.Literal(true), result: AssessmentDocument }),
                ),
              )(result.stdout);
              if (
                document.filter !== filter ||
                document.count !== expected.length ||
                document.items.length !== expected.length ||
                document.coverage.eligible !== expected.length ||
                document.coverage.checked !== expected.length ||
                document.coverage.unknown !== 0
              )
                throw new Error("Remote inspection did not assess the complete selected inventory");
              for (const { kind, name, deprecated, archived } of expected) {
                const matching = document.items.filter(
                  (candidate) => candidate.type === kind.type && candidate.name === name,
                );
                const item = matching[0];
                if (matching.length !== 1 || item === undefined)
                  throw new Error(`Expected exactly one ${kind.type}/${name} assessment`);
                if (filter === "outdated") {
                  if (
                    item.assessment.state !== "available" ||
                    item.assessment.installedVersion !== "1.0.0" ||
                    item.assessment.latestMatching !== "1.1.0"
                  )
                    throw new Error(`Unexpected ${kind.type} outdated assessment`);
                } else if (
                  item.assessment.state !== (archived ? "archived" : "deprecated") ||
                  (item.assessment.deprecation !== undefined) !== deprecated ||
                  (item.assessment.archival !== undefined) !== archived ||
                  (deprecated &&
                    (item.assessment.deprecation?.reason !== "unmaintained" ||
                      item.assessment.deprecation.message !== "Fixture is no longer maintained")) ||
                  (archived &&
                    (item.assessment.archival?.archivedAt !== "2026-01-02T00:00:00.000Z" ||
                      item.assessment.archival.message !== "Fixture publication is closed"))
                )
                  throw new Error(`Unexpected ${kind.type}/${name} ${filter} assessment`);
              }
            }
          },
          dispose: registry.close,
          metrics: () => ({ requests: registry.requests.length - beforeRequests }),
        },
        { noDurableChange: true },
      );
    } catch (cause) {
      await registry.close();
      throw cause;
    }
  },
});

const cachedAcquisitionScenario = (
  typed: boolean,
  authorization: "allowed" | "revoked",
): BenchmarkScenario => ({
  id: `acquisition:cached:${typed ? "skills-install" : "install"}:${authorization}`,
  operationId: typed ? "skills install" : "install",
  modeId: "json",
  fixtureId: "authenticated-cached-archive-v1",
  dimensions: {
    scope: "project",
    source: "registry",
    selection: "targeted",
    view: "filesystem",
    output: "json",
    state: authorization === "allowed" ? "changed" : "refused",
    format: "cached-registry-archive",
    kinds: ["skill"],
  },
  description:
    "Acquire already cached bytes into a fresh workspace only after a current authenticated Registry archive check",
  prepare: async (context) => {
    const token = "axm_pat_disposable_cached_acquisition";
    const archivePath = "/v1/extensions/@benchmark/skills/sample/1.0.0/archive";
    let revoked = false;
    const registry = await startBenchmarkRegistry({
      tokenOwners: { [token]: "@benchmark" },
      handleRequest: async (request, response) => {
        if (
          !revoked ||
          !decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname).endsWith(
            "/archive",
          )
        )
          return false;
        response.writeHead(403, { "content-type": "application/problem+json" });
        response.end(
          JSON.stringify({
            type: "about:blank",
            title: "Forbidden",
            status: 403,
            detail: "Cached fixture archive access has been revoked",
          }),
        );
        return true;
      },
    });
    try {
      const files = packageFiles(extensionKinds[0]);
      const skillText = files["src/SKILL.md"];
      if (skillText === undefined) throw new Error("Missing fixture Skill source");
      registry.seed({
        owner: "@benchmark",
        plural: "skills",
        name: "sample",
        version: "1.0.0",
        archive: fixtureArchive(files),
      });
      const settings = {
        agents: ["claude-code"],
        sources: [{ name: "benchmark", type: "registry", location: registry.url }],
        defaultRegistry: "benchmark",
        minimumReleaseAge: "0s",
      };
      await configureWorkspace(context, settings);
      const args = [
        ...(typed ? ["skills", "install"] : ["install"]),
        "@benchmark/skills/sample@1.0.0",
        "--accept-execution-changes",
        "--non-interactive",
        "--json",
      ];
      const env = { AXM_TOKEN: token };
      assertSuccessful(await context.run(args, { env }));
      if (
        !registry.requests.some(
          (request) => request.method === "GET" && decodeURIComponent(request.path) === archivePath,
        )
      )
        throw new Error("Cache preparation did not download the actual Registry archive");
      // Remove every selected-workspace authority and projection while retaining only
      // the disposable home's actual application cache from the successful acquisition.
      await fs.rm(context.workspace, { recursive: true });
      await fs.mkdir(context.workspace);
      await configureWorkspace(context, settings);
      revoked = authorization === "revoked";
      const requestsBefore = registry.requests.length;
      const measuredRequests = () => registry.requests.slice(requestsBefore);
      const measuredArchives = () =>
        measuredRequests().filter((request) => decodeURIComponent(request.path) === archivePath);
      return await wrapPrepared(
        context,
        { id: "json", flags: ["--json"] },
        {
          args,
          env,
          expectedExitCode: revoked ? 5 : 0,
          dispose: registry.close,
          metrics: () => ({
            requests: measuredRequests().length,
            archiveHeads: measuredArchives().filter((request) => request.method === "HEAD").length,
            archiveGets: measuredArchives().filter((request) => request.method === "GET").length,
          }),
          verify: (result) => {
            const requests = measuredArchives();
            if (
              !requests.some(
                (request) =>
                  request.method === "HEAD" &&
                  request.authorization === `Bearer ${token}` &&
                  request.status === (revoked ? 403 : 200),
              )
            )
              throw new Error(
                "Cached acquisition did not validate current authenticated archive access",
              );
            if (requests.some((request) => request.method === "GET"))
              throw new Error("Cached acquisition unexpectedly downloaded the archive again");
            assertOutput(result, revoked ? "forbidden" : "sample");
          },
        },
        revoked
          ? {
              noDurableChange: true,
              output: {
                envelope: "raw",
                json: [
                  { at: ["ok"], equals: false },
                  { at: ["result", "failure", "code"], equals: "forbidden" },
                  { at: ["result", "counts", "committed"], equals: 0 },
                ],
              },
            }
          : {
              artifacts: [
                { kind: "text", path: ".claude/skills/sample/SKILL.md", equals: skillText },
                { kind: "text", path: "axm.lock", includes: ['version = "1.0.0"', "sample"] },
              ],
            },
      );
    } catch (cause) {
      await registry.close();
      throw cause;
    }
  },
});

const sharedPackGraphScenario = (
  operation: "sync" | "update",
  changed: boolean,
): BenchmarkScenario => ({
  id: `graph:shared-registry-member:${operation}:${changed ? "changed" : "no-op"}`,
  operationId: operation,
  modeId: "json",
  fixtureId: "two-registry-packs-one-member-v1",
  dimensions: {
    scope: "project",
    source: "registry",
    selection: "bulk",
    view: "filesystem",
    output: "json",
    state: changed ? "changed" : "no-op",
    format: "shared-pack-graph",
    kinds: ["skill", "pack"],
  },
  description:
    "Resolve two configured Registry Packs that share one member, then verify both constraints and one native materialization",
  prepare: async (context) => {
    const registry = await startBenchmarkRegistry();
    try {
      const member = "@benchmark/skills/shared";
      const memberFiles = packageFiles(extensionKinds[0], "shared");
      const memberText = memberFiles["src/SKILL.md"];
      if (memberText === undefined) throw new Error("Missing shared member source");
      registry.seed({
        owner: "@benchmark",
        plural: "skills",
        name: "shared",
        version: "1.0.0",
        archive: fixtureArchive(memberFiles),
      });
      const constraints = [
        { name: "first-pack", range: "^1.0.0" },
        { name: "second-pack", range: ">=1.0.0 <2.0.0" },
      ];
      for (const { name, range } of constraints) {
        const files = packageFiles(extensionKinds[6], name);
        const manifest = files["pack.json"];
        if (manifest === undefined) throw new Error("Missing Pack fixture manifest");
        const fields = Schema.decodeUnknownSync(
          Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
        )(manifest);
        registry.seed({
          owner: "@benchmark",
          plural: "packs",
          name,
          version: "1.0.0",
          archive: fixtureArchive({
            ...files,
            "pack.json": JSON.stringify({ ...fields, dependencies: { [member]: range } }),
          }),
        });
      }
      await configureWorkspace(context, {
        agents: ["claude-code"],
        sources: [{ name: "benchmark", type: "registry", location: registry.url }],
        defaultRegistry: "benchmark",
        minimumReleaseAge: "0s",
        packs: Object.fromEntries(
          constraints.map(({ name }) => [name, `@benchmark/packs/${name}`]),
        ),
      });
      if (!changed) {
        assertSuccessful(
          await context.run(["sync", "--json", "--non-interactive", "--accept-execution-changes"]),
        );
        if (operation === "sync")
          registry.seed({
            owner: "@benchmark",
            plural: "skills",
            name: "shared",
            version: "1.1.0",
            archive: fixtureArchive(packageFiles(extensionKinds[0], "shared", "1.1.0")),
          });
      }
      const requestsBefore = registry.requests.length;
      const metadataBefore = registry.metadataRequests.length;
      const measuredRequests = () => registry.requests.slice(requestsBefore);
      const metadataItems = () =>
        registry.metadataRequests.slice(metadataBefore).flatMap((batch, batchIndex) =>
          batch.map((identity, itemIndex) => ({
            identity,
            purpose: registry.metadataPurposes[metadataBefore + batchIndex]?.[itemIndex],
          })),
        );
      const memberPlanning = () =>
        metadataItems().filter(
          (item) => item.identity === "@benchmark/skill/shared" && item.purpose !== "restore-exact",
        );
      const memberArchives = () =>
        measuredRequests().filter((request) =>
          /\/skills\/shared\/[^/]+\/archive$/u.test(request.path),
        );
      return await wrapPrepared(
        context,
        { id: "json", flags: ["--json"] },
        {
          args: [operation, "--json", "--non-interactive", "--accept-execution-changes"],
          expectedExitCode: 0,
          dispose: registry.close,
          metrics: () => ({
            requests: measuredRequests().length,
            metadataBatches: registry.metadataRequests.length - metadataBefore,
            metadataItems: metadataItems().length,
            memberPlanningReads: memberPlanning().length,
            memberAccessChecks: metadataItems().filter(
              (item) =>
                item.identity === "@benchmark/skill/shared" && item.purpose === "restore-exact",
            ).length,
            memberArchiveGets: memberArchives().filter((request) => request.method === "GET")
              .length,
            memberArchiveHeads: memberArchives().filter((request) => request.method === "HEAD")
              .length,
          }),
          verify: async (result) => {
            assertOutput(result, changed ? "applied" : "no-op");
            if (changed) {
              if (
                !registry.metadataRequests
                  .slice(metadataBefore)
                  .some(
                    (batch) =>
                      batch.includes("@benchmark/pack/first-pack") &&
                      batch.includes("@benchmark/pack/second-pack"),
                  )
              )
                throw new Error("Configured Packs were not resolved together in a metadata batch");
              if (
                memberPlanning().length !== 1 ||
                memberArchives().filter((request) => request.method === "GET").length !== 1
              )
                throw new Error("Shared member planning/acquisition was duplicated or omitted");
            } else {
              if (operation === "sync" && measuredRequests().length !== 0)
                throw new Error("Repeated sync unnecessarily resolved the accepted Pack choices");
              if (
                memberPlanning().length > 1 ||
                memberArchives().some((request) => request.method === "GET")
              )
                throw new Error(
                  "Unchanged shared graph duplicated planning or downloaded accepted content",
                );
            }
            const manifests: Array<
              Readonly<{ name: string; dependencies: Readonly<Record<string, string>> }>
            > = [];
            const visit = async (directory: string): Promise<void> => {
              for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
                const file = path.join(directory, entry.name);
                if (entry.isDirectory()) await visit(file);
                else if (entry.isFile() && entry.name === "pack.json")
                  manifests.push(
                    Schema.decodeUnknownSync(
                      Schema.fromJsonString(
                        Schema.Struct({
                          name: Schema.String,
                          dependencies: Schema.Record(Schema.String, Schema.String),
                        }),
                      ),
                    )(await fs.readFile(file, "utf8")),
                  );
              }
            };
            await visit(path.join(context.workspace, "agent_extensions"));
            for (const constraint of constraints)
              if (
                manifests.find((manifest) => manifest.name === constraint.name)?.dependencies[
                  member
                ] !== constraint.range
              )
                throw new Error(`Acquired Pack lost ${constraint.name}'s shared member constraint`);
          },
        },
        {
          readonlyPaths: changed
            ? ["axm.json"]
            : ["axm.json", "axm.lock", "agent_extensions", ".claude", "AGENTS.md", "CLAUDE.md"],
          artifacts: [
            { kind: "text", path: ".claude/skills/shared/SKILL.md", equals: memberText },
            {
              kind: "text",
              path: "axm.lock",
              includes: ["first-pack", "second-pack", "shared", 'version = "1.0.0"'],
            },
          ],
        },
      );
    } catch (cause) {
      await registry.close();
      throw cause;
    }
  },
});

/** Typed list routes do not register remote filters; root --type selects each kind. */
export const remoteInspectionScenarios = (): ReadonlyArray<BenchmarkScenario> => [
  ...(["outdated", "deprecated", "archived", "lifecycle"] as const).flatMap((filter) =>
    (["human", "json"] as const).flatMap((output) => [
      ...extensionKinds.map((kind) => inspectionScenario(filter, [kind], output, false)),
      inspectionScenario(filter, extensionKinds, output, true),
    ]),
  ),
  cachedAcquisitionScenario(false, "allowed"),
  cachedAcquisitionScenario(true, "allowed"),
  cachedAcquisitionScenario(false, "revoked"),
  ...(["sync", "update"] as const).flatMap((operation) =>
    [true, false].map((changed) => sharedPackGraphScenario(operation, changed)),
  ),
];
