import { withDetailedWork } from "../../locations/testing.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Tracer from "effect/Tracer";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import type {
  HookExtensionRef,
  LocalHookRef,
  RegistryHookRef,
} from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  computeMaterializedTreeIntegrity,
  HooksLockMapSchema,
  type Lockfile,
} from "../../workspace-state/index.js";
import { WorkspaceReadTest } from "../../workspace-state/testing.js";
import { CurrentOperationUnit, type Plan, type PlannedJobStep } from "../../operations/index.js";
import type { NativeLocationOutcome } from "../../locations/index.js";
import { SourceHostProvidersTest } from "../../sources/testing.js";
import { executionExposureRisks } from "./execution-exposure.js";

describe("External execution review facts", () => {
  for (const scenario of [
    {
      name: "first exposure",
      accepted: false,
      state: "created",
      changedBytes: false,
      changedConfiguration: false,
      review: true,
    },
    {
      name: "present unchanged registration",
      accepted: true,
      state: "unchanged",
      changedBytes: false,
      changedConfiguration: false,
      review: false,
    },
    {
      name: "restored missing registration",
      accepted: true,
      state: "created",
      changedBytes: false,
      changedConfiguration: false,
      review: true,
    },
    {
      name: "script body changed with the same command",
      accepted: true,
      state: "unchanged",
      changedBytes: true,
      changedConfiguration: false,
      review: true,
    },
    {
      name: "symbolic secret reference changed",
      accepted: true,
      state: "unchanged",
      changedBytes: false,
      changedConfiguration: true,
      review: true,
    },
  ] as const) {
    it.effect(scenario.name, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-exposure-facts-" });
        const source = `${directory}/source`;
        yield* fs.makeDirectory(`${source}/src`, { recursive: true });
        yield* fs.writeFileString(
          `${source}/hook.json`,
          JSON.stringify({
            owner: "@acme",
            type: "hook",
            name: "audit",
            version: "1.0.0",
            configuration: { token: { type: "string", secret: true } },
            implementations: [
              {
                id: "claude",
                protocol: "claude-code",
                bindings: [
                  {
                    id: "stop",
                    event: "Stop",
                    handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
                  },
                ],
              },
            ],
          }),
        );
        yield* fs.writeFileString(`${source}/src/hook.sh`, "echo original\n");
        const tree = yield* computeMaterializedTreeIntegrity(source);
        const name = decodeExtensionNameSync("audit");
        const ref: LocalHookRef = {
          type: "hook",
          refType: "local",
          name,
          owner: decodeHandleSync("@acme"),
          hook: { name },
          source: { type: "local", path: source },
          location: `file://${source}`,
        };
        const lockfile: Lockfile = {
          lockfileVersion: 1,
          skills: {},
          ...(scenario.accepted
            ? {
                hooks: Schema.decodeUnknownSync(HooksLockMapSchema)({
                  audit: {
                    source: { type: "path", path: source },
                    identity: { owner: "@acme", name: "audit" },
                    resolved: { tree },
                    treeIntegrity: tree,
                  },
                }),
              }
            : {}),
        };
        if (scenario.changedBytes)
          yield* fs.writeFileString(`${source}/src/hook.sh`, "echo changed\n");
        const native: NativeLocationOutcome = {
          scope: "project",
          address: {
            kind: "hook-registrations",
            path: `${directory}/.claude/settings.json`,
            settingsKey: "hooks",
            scriptRoots: [source],
          },
          aliases: [],
          configuredConsumers: ["claude-code"],
          potentialReaders: ["claude-code"],
          policyReasons: [],
          availability: [],
          ownership: scenario.accepted ? "owned" : "absent",
          state: scenario.state,
        };
        const plan: Plan = {
          _tag: "Plan",
          name: "Expose audit",
          description: Option.none(),
          jobs: [
            {
              concurrency: 1,
              steps: [
                {
                  readiness: "ready",
                  label: "audit",
                  exposureRefs: [ref],
                  artifact: {
                    path: native.address.path,
                    change: "updated",
                    scope: "project",
                    nativeLocations: [native],
                  },
                  ...(scenario.changedConfiguration
                    ? {
                        executionPreferences: [
                          {
                            type: "hook" as const,
                            name: "audit",
                            configuration: { token: { env: "NEW_TOKEN" } },
                          },
                        ],
                      }
                    : {}),
                  run: Effect.succeed({ result: "success", message: "unused" }),
                },
              ],
            },
          ],
        };
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const risks = yield* executionExposureRisks(plan).pipe(
          withDetailedWork(tracer),
          Effect.provide(
            WorkspaceReadTest({
              baseDir: directory,
              lockfile,
              settings: {
                agents: ["claude-code"],
                hooks: {
                  audit: {
                    kind: "configuration",
                    enabled: true,
                    configuration: { token: { env: "OLD_TOKEN" } },
                  },
                },
              },
            }),
          ),
        );
        expect(risks.length).toBe(scenario.review ? 1 : 0);
        const hashes = spans.filter((span) => span.name === "axm.hash.execution-configuration");
        expect(hashes.map((span) => span.attributes.get("axm.work.count"))).toEqual(
          scenario.review ? [1] : [],
        );
        expect(hashes.map((span) => span.attributes.get("axm.work.bytes"))).toEqual(
          scenario.review ? [29] : [],
        );
        if (scenario.review) {
          const change = risks[0]?.executionChanges?.[0];
          expect(change?.name).toBe("audit");
          expect(change?.contentIdentity).toContain(
            `configuration-sha256:${scenario.changedConfiguration ? "8fa066aa9d8402caca6b9c80cfb85e17e93c15475e746fcf76f9d9c484523b78" : "02a0ea1a61e4af875878916e2414d623fd375fa5c461bfa5672fb77e9dbad96a"}`,
          );
          expect(change?.targets).toEqual(["claude-code"]);
          expect(change?.details).toContain("claude-code: Stop, bash src/hook.sh");
          expect(change?.secretReferences).toEqual([
            scenario.changedConfiguration ? "NEW_TOKEN" : "OLD_TOKEN",
          ]);
          expect(change?.contentIdentity).toContain(
            yield* computeMaterializedTreeIntegrity(source),
          );
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }
});

const hookManifest = JSON.stringify({
  owner: "@acme",
  type: "hook",
  name: "audit",
  version: "1.0.0",
  implementations: [
    {
      id: "claude",
      protocol: "claude-code",
      bindings: [
        {
          id: "stop",
          event: "Stop",
          handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
        },
      ],
    },
  ],
});

const auditName = decodeExtensionNameSync("audit");

/** A fresh object per call, so a duplicate entry is structurally equal but never the same object. */
const registryAudit = (overrides: Partial<RegistryHookRef> = {}): RegistryHookRef => ({
  type: "hook",
  refType: "registry",
  source: {
    type: "registry",
    name: "agentxm",
    location: decodeRegistryEndpointSync("https://registry.example.test"),
    owner: Option.none(),
  },
  owner: decodeHandleSync("@acme"),
  publisherBindingId: "hbnd_audit",
  name: auditName,
  version: decodeVersionSync("1.0.0"),
  integrity: Option.some("sha512-audit"),
  packages: [],
  hook: { name: auditName },
  ...overrides,
});

const reviewStep = (refs: ReadonlyArray<HookExtensionRef>): PlannedJobStep => ({
  readiness: "ready",
  label: "audit",
  exposureRefs: refs,
  artifact: { path: "/unused/.claude/settings.json", change: "updated", scope: "project" },
  run: Effect.succeed({ result: "success", message: "unused" }),
});

const reviewPlan = (steps: ReadonlyArray<PlannedJobStep>): Plan => ({
  _tag: "Plan",
  name: "Expose audit",
  description: Option.none(),
  jobs: [{ concurrency: 1, steps }],
});

/**
 * Review a plan against a workspace with no accepted Hook, counting the source fetches and
 * the reviews themselves (each review of a changed Hook hashes its configuration once).
 * The stub fetch logs each lifecycle warning the way the Registry provider does, so a
 * review that is skipped would also drop its warning.
 */
const reviewCounting = (plan: Plan, within: "no unit" | "operation unit" = "no unit") =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-exposure-duplicates-" });
    const source = `${directory}/fetched`;
    yield* fs.makeDirectory(`${source}/src`, { recursive: true });
    yield* fs.writeFileString(`${source}/hook.json`, hookManifest);
    yield* fs.writeFileString(`${source}/src/hook.sh`, "echo audit\n");
    const fetched: HookExtensionRef[] = [];
    const warnings: string[] = [];
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const logger = Logger.make((entry) => {
      if (entry.logLevel === "Warn") warnings.push(String(entry.message));
    });
    const review = executionExposureRisks(plan).pipe(
      withDetailedWork(tracer),
      Effect.provide(
        Layer.mergeAll(
          WorkspaceReadTest({
            baseDir: directory,
            lockfile: { lockfileVersion: 1, skills: {} },
            settings: { agents: ["claude-code"] },
          }),
          SourceHostProvidersTest({
            fetch: (ref) =>
              Effect.gen(function* () {
                if (ref.type === "hook") fetched.push(ref);
                if (ref.refType === "registry")
                  yield* Effect.forEach(ref.lifecycleWarnings ?? [], (warning) =>
                    Effect.logWarning(warning),
                  );
                return { directory: source };
              }),
          }),
          Logger.layer([logger]),
        ),
      ),
    );
    const risks = yield* within === "operation unit"
      ? review.pipe(Effect.provideService(CurrentOperationUnit, { unitId: "unit" }))
      : review;
    return {
      risks,
      fetched,
      warnings,
      reviews: spans.filter((span) => span.name === "axm.hash.execution-configuration").length,
    };
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("Duplicate exposure refs within one step", () => {
  it.effect("an exact warning-free Registry ref listed twice is fetched and reviewed once", () =>
    Effect.gen(function* () {
      const twice = yield* reviewCounting(
        reviewPlan([reviewStep([registryAudit(), registryAudit()])]),
      );
      const once = yield* reviewCounting(reviewPlan([reviewStep([registryAudit()])]));
      expect(twice.fetched.length).toBe(1);
      expect(twice.reviews).toBe(1);
      expect(twice.warnings).toEqual([]);
      expect(twice.risks).toEqual(once.risks);
      expect(twice.risks.length).toBe(1);
    }),
  );

  it.effect("a duplicate carrying lifecycle warnings is fetched again and warns again", () =>
    Effect.gen(function* () {
      const warned = { lifecycleWarnings: ["audit@1.0.0 is deprecated: use audit@2"] };
      const twice = yield* reviewCounting(
        reviewPlan([reviewStep([registryAudit(warned), registryAudit(warned)])]),
      );
      expect(twice.fetched.length).toBe(2);
      expect(twice.reviews).toBe(2);
      expect(twice.warnings).toEqual([
        "audit@1.0.0 is deprecated: use audit@2",
        "audit@1.0.0 is deprecated: use audit@2",
      ]);
      expect(twice.risks[0]?.executionChanges?.length).toBe(1);
    }),
  );

  it.effect("a duplicate without an exact integrity is fetched again", () =>
    Effect.gen(function* () {
      const inexact = { integrity: Option.none<string>() };
      const twice = yield* reviewCounting(
        reviewPlan([reviewStep([registryAudit(inexact), registryAudit(inexact)])]),
      );
      expect(twice.fetched.length).toBe(2);
      expect(twice.reviews).toBe(2);
    }),
  );

  it.effect("a duplicate reviewed inside an operation unit is fetched again", () =>
    Effect.gen(function* () {
      const twice = yield* reviewCounting(
        reviewPlan([reviewStep([registryAudit(), registryAudit()])]),
        "operation unit",
      );
      expect(twice.fetched.length).toBe(2);
      expect(twice.reviews).toBe(2);
    }),
  );

  it.effect("distinct refs in one step are each fetched", () =>
    Effect.gen(function* () {
      const distinct = yield* reviewCounting(
        reviewPlan([
          reviewStep([registryAudit(), registryAudit({ version: decodeVersionSync("1.0.1") })]),
        ]),
      );
      expect(distinct.fetched.map((ref) => ref.refType === "registry" && ref.version)).toEqual([
        "1.0.0",
        "1.0.1",
      ]);
      expect(distinct.reviews).toBe(2);
    }),
  );

  it.effect("the same ref in two steps is fetched for each step", () =>
    Effect.gen(function* () {
      const steps = yield* reviewCounting(
        reviewPlan([reviewStep([registryAudit()]), reviewStep([registryAudit()])]),
      );
      expect(steps.fetched.length).toBe(2);
      expect(steps.reviews).toBe(2);
    }),
  );

  it.effect("a duplicated local ref is reviewed twice", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-exposure-local-" });
      yield* fs.makeDirectory(`${directory}/src`, { recursive: true });
      yield* fs.writeFileString(`${directory}/hook.json`, hookManifest);
      yield* fs.writeFileString(`${directory}/src/hook.sh`, "echo audit\n");
      const local = (): LocalHookRef => ({
        type: "hook",
        refType: "local",
        name: auditName,
        owner: decodeHandleSync("@acme"),
        hook: { name: auditName },
        source: { type: "local", path: directory },
        location: `file://${directory}`,
      });
      const twice = yield* reviewCounting(reviewPlan([reviewStep([local(), local()])]));
      expect(twice.fetched.length).toBe(0);
      expect(twice.reviews).toBe(2);
      expect(twice.risks[0]?.executionChanges?.length).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
