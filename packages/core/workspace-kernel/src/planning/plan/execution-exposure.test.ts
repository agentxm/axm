import { withDetailedWork } from "../../locations/testing.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import type { LocalHookRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import {
  computeMaterializedTreeIntegrity,
  HooksLockMapSchema,
  type Lockfile,
} from "../../workspace-state/index.js";
import { WorkspaceReadTest } from "../../workspace-state/testing.js";
import type { Plan } from "../../operations/index.js";
import type { NativeLocationOutcome } from "../../locations/index.js";
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
