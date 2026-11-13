import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { OfflineHttpClient, RegistryClientFactoryTest } from "@agentxm/registry-client/testing";
import { SourceHostProvidersTest } from "../../sources/testing.js";
import { NativePlatformTest } from "../../locations/testing.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { WorkspaceStateLive } from "../../workspace-state/live.js";
import { withWorkspaceObservationReadView } from "../../workspace-state/index.js";
import { ConfiguredAgentOutcomesProviderTest } from "../../workspace-state/testing.js";
import type { Plan } from "../../operations/index.js";
import { prepareExecutionCandidate } from "../index.js";

export const specification = defineSpecification({
  requirement: "workspace/planning/execution-review-rejects-intervening-edits",
  title: "Execution review verifies current physical inputs independently",
  statement:
    "Execution candidate preparation shall independently observe physical inputs before and after external execution review and refuse a candidate whose inputs change during that review, including when preparation runs inside a cached observation phase.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Production candidate preparation and workspace readers use real files; filesystem and source-provider ports deterministically introduce an external script edit during review. Registry transport is substituted; no apply or remote acquisition is exercised.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

it.effect.each([
  { edit: false, registry: false },
  { edit: true, registry: false },
  { edit: false, registry: true },
  { edit: true, registry: true },
])("review under an observation phase (edit=$edit, registry=$registry)", ({ edit, registry }) =>
  Effect.gen(function* () {
    const live = yield* FileSystem.FileSystem;
    const root = yield* live.makeTempDirectoryScoped();
    const source = `${root}/source`;
    const manifest = `${source}/hook.json`;
    const script = `${source}/src/hook.sh`;
    yield* live.makeDirectory(`${source}/src`, { recursive: true });
    yield* live.writeFileString(`${root}/axm.json`, JSON.stringify({ agents: ["claude-code"] }));
    yield* live.writeFileString(`${root}/axm.lock`, "version = 1\n");
    yield* live.writeFileString(script, "echo original\n");
    yield* live.writeFileString(
      manifest,
      JSON.stringify({
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
      }),
    );
    let reviewed = false;
    const filesystem: FileSystem.FileSystem = {
      ...live,
      readFileString: (target, encoding) =>
        live.readFileString(target, encoding).pipe(
          Effect.tap(() =>
            !registry && target.endsWith("hook.json") && target !== manifest
              ? Effect.gen(function* () {
                  reviewed = true;
                  if (edit) yield* live.writeFileString(script, "echo changed!\n");
                })
              : Effect.void,
          ),
        ),
    };
    const name = decodeExtensionNameSync("audit");
    const common = {
      type: "hook" as const,
      name,
      owner: decodeHandleSync("@acme"),
      hook: { name },
    };
    const ref: HookExtensionRef = registry
      ? {
          ...common,
          refType: "registry",
          version: decodeVersionSync("1.0.0"),
          integrity: Option.some(`sha512-${"A".repeat(86)}==`),
          publisherBindingId: "publisher-1",
          packages: [],
          source: {
            type: "registry",
            name: "test",
            location: decodeRegistryEndpointSync("https://registry.example.test"),
            owner: Option.none(),
          },
        }
      : {
          ...common,
          refType: "local",
          source: { type: "local", path: source },
          location: `file://${source}`,
        };
    const plan: Plan = {
      _tag: "Plan",
      name: "Expose audit",
      description: Option.none(),
      materialPaths: [source],
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "audit",
              exposureRefs: [ref],
              artifact: {
                path: ".claude/settings.json",
                change: "created",
                scope: "project",
                agents: ["claude-code"],
              },
              run: Effect.die("Preparation never applies"),
            },
          ],
        },
      ],
    };
    const state = WorkspaceStateLive({
      projectRoot: decodeAbsolutePathSync(root),
      scope: "project",
      allowUninitialized: true,
    }).pipe(
      Layer.provide(RegistryClientFactoryTest(OfflineHttpClient)),
      Layer.provide(
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: `${root}/home` } })),
      ),
      Layer.provide(Layer.succeed(FileSystem.FileSystem, filesystem)),
    );
    yield* withWorkspaceObservationReadView(
      Effect.gen(function* () {
        const cached = yield* FileSystem.FileSystem;
        expect(new TextDecoder().decode(yield* cached.readFile(script))).toBe("echo original\n");
        const result = yield* prepareExecutionCandidate(plan).pipe(Effect.result);
        expect(reviewed, JSON.stringify(result)).toBe(true);
        if (edit) {
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result))
            expect(result.failure).toMatchObject({ _tag: "StaleExecutionCandidate" });
        } else {
          expect(Result.isSuccess(result)).toBe(true);
          if (Result.isSuccess(result))
            expect(
              result.success.plan.riskConditions?.some(
                (risk) =>
                  risk.level === "override-required" &&
                  risk.executionChanges?.some((change) => change.name === "audit"),
              ),
            ).toBe(true);
        }
      }),
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          state,
          ConfiguredAgentOutcomesProviderTest,
          SourceHostProvidersTest({
            fetch: () =>
              Effect.gen(function* () {
                reviewed = true;
                if (edit) yield* live.writeFileString(script, "echo changed!\n");
                return { directory: source };
              }).pipe(Effect.orDie),
          }),
        ),
      ),
    );
  }).pipe(
    Effect.scoped,
    Effect.provide(Layer.provideMerge(WorkspaceFileWriteLocksLive, NativePlatformTest)),
  ),
);
