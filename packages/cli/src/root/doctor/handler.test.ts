// TODO: (#51) Uses node:fs/node:os/node:path directly. Migrate to @effect/platform
// test utilities when available.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import {
  TestMachineRenderer,
  TestRenderer,
  logsByTag,
} from "@agentxm/client-core/unstable/cli-renderer";
import { isEffectCliExit } from "@agentxm/client-core/unstable/cli-runtime";
import {
  type SourceHostProvidersService,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";

import { writeWorkspaceFiles } from "../../test-stubs.js";
import { handleDoctor } from "./handler.js";

interface DoctorTestContextOptions {
  readonly machine?: boolean;
  readonly flags?: {
    verbose?: boolean;
    debug?: boolean;
    quiet?: boolean;
    nonInteractive?: boolean;
    json?: boolean;
  };
}

const makeDoctorTestContext = (opts?: DoctorTestContextOptions) => {
  const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
  const rendererState = renderer.state;

  const baseLayer = Layer.mergeAll(
    NodeServices.layer,
    renderer.layer,
    TestFlagsLayer({ nonInteractive: true, ...opts?.flags }),
  );

  const sourceProviders: SourceHostProvidersService = {
    find: () => Effect.succeed([]),
    fetch: () => Effect.die("unused in doctor handler tests"),
    cloneUrl: () => Option.none(),
    origin: () => "test",
  };

  const fullLayer = Layer.mergeAll(
    baseLayer,
    CodingAgentRepositoryLive,
    Layer.succeed(SourceHostProviders, sourceProviders),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper hides layer variance
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(fullLayer));

  return {
    provide,
    rendererState,
    logs: logsByTag(rendererState),
  };
};

const extractCliExitCode = (exit: Exit.Exit<unknown, unknown>): number => {
  if (exit._tag !== "Failure") {
    throw new Error(`Expected Failure, got ${exit._tag}`);
  }
  const squashed = Cause.squash(exit.cause);
  if (!isEffectCliExit(squashed)) {
    throw new Error(
      `Expected an EffectCliExit defect on the failure cause, got ${String(squashed)}`,
    );
  }
  return squashed.exitCode;
};

describe("doctor handler", () => {
  const builtInSources = [
    {
      name: "default",
      type: "registry" as const,
      location: new URL("https://registry.agentxm.ai"),
    },
  ];

  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createHealthyWorkspace = () => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
      profile: "@axm",
    });
    fs.mkdirSync(path.join(tempDir, ".claude", "skills"), { recursive: true });
  };

  describe("JSON mode", () => {
    it.effect("emits a healthy document for a valid workspace", () => {
      const { provide, rendererState } = makeDoctorTestContext({ machine: true });
      createHealthyWorkspace();

      return provide(
        Effect.gen(function* () {
          yield* handleDoctor({ scope: "project", builtInSources });

          expect(rendererState.results).toHaveLength(1);
          const entry = rendererState.results[0];
          expect(entry?.data).toMatchObject({
            _version: 1,
            command: "doctor",
            data: {
              scope: "project",
              healthy: true,
              summary: {
                findings: { errors: 0 },
              },
            },
          });
        }),
      );
    });

    it.effect("reports unhealthy workspace and exits 1 when .axm is missing", () => {
      const { provide, rendererState } = makeDoctorTestContext({
        machine: true,
      });

      return provide(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(handleDoctor({ scope: "project", builtInSources }));
          expect(extractCliExitCode(exit)).toBe(1);

          expect(rendererState.results).toHaveLength(1);
          const entry = rendererState.results[0];
          expect(entry?.data).toMatchObject({
            _version: 1,
            command: "doctor",
            data: {
              healthy: false,
              checks: expect.arrayContaining([
                expect.objectContaining({
                  id: "workspace-ready",
                  status: "fail",
                  findings: expect.arrayContaining([
                    expect.objectContaining({
                      id: "workspace-ready.directory-missing",
                      severity: "error",
                    }),
                  ]),
                }),
              ]),
            },
          });
        }),
      );
    });
  });

  describe("human mode", () => {
    it.effect(
      "default verbosity on a healthy workspace shows the health banner and summary",
      () => {
        const { provide, logs } = makeDoctorTestContext();
        createHealthyWorkspace();

        return provide(
          Effect.gen(function* () {
            yield* handleDoctor({ scope: "project", builtInSources });

            const text = logs.info.join("\n");
            expect(text).toContain("Workspace Health");
            expect(text).toContain("✓ Workspace is ready");
            expect(text).toContain("✓ Agents configured");
            expect(text).toContain("✓ Extensions are installed");
            expect(text).toContain("4 passed");
            expect(text).toContain("0 failed");
          }),
        );
      },
    );

    it.effect(
      "default verbosity on an unhealthy workspace renders findings and lifted action",
      () => {
        const { provide, logs } = makeDoctorTestContext();

        return provide(
          Effect.gen(function* () {
            const exit = yield* Effect.exit(handleDoctor({ scope: "project", builtInSources }));
            expect(extractCliExitCode(exit)).toBe(1);

            const text = logs.info.join("\n");
            expect(text).toContain("Workspace Health");
            expect(text).toContain("✗ Workspace is ready");
            expect(text).toContain(".axm directory not found");
            expect(text).toContain("→ axm init");
            expect(text).toContain("0 passed");
            expect(text).toContain("1 failed");
          }),
        );
      },
    );

    it.effect("quiet mode on a healthy workspace produces no info output", () => {
      const { provide, logs } = makeDoctorTestContext({ flags: { quiet: true } });
      createHealthyWorkspace();

      return provide(
        Effect.gen(function* () {
          yield* handleDoctor({ scope: "project", builtInSources });
          expect(logs.info).toEqual([]);
        }),
      );
    });

    it.effect("quiet mode on an unhealthy workspace omits healthy check output", () => {
      const { provide, logs } = makeDoctorTestContext({
        flags: { quiet: true },
      });

      return provide(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(handleDoctor({ scope: "project", builtInSources }));
          expect(extractCliExitCode(exit)).toBe(1);

          const text = logs.info.join("\n");
          expect(text).toContain("✗ Workspace is ready");
          expect(text).toContain("1 failed");
        }),
      );
    });

    it.effect("verbose mode still renders passing checks with just headers", () => {
      const { provide, logs } = makeDoctorTestContext({ flags: { verbose: true } });
      createHealthyWorkspace();

      return provide(
        Effect.gen(function* () {
          yield* handleDoctor({ scope: "project", builtInSources });

          const text = logs.info.join("\n");
          expect(text).toContain("✓ Workspace is ready");
          expect(text).toContain("✓ Agents configured");
          expect(text).toContain("✓ Extensions are installed");
          expect(text).toContain("4 passed");
        }),
      );
    });

    it.effect("action dedup: workspace-ready errors lift a single header action", () => {
      const { provide, logs } = makeDoctorTestContext();

      return provide(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(handleDoctor({ scope: "project", builtInSources }));
          expect(extractCliExitCode(exit)).toBe(1);

          const initOccurrences = logs.info.filter((line) => line.includes("→ axm init"));
          // directory-missing is a single error, so the action shows up exactly
          // once on the check header. Multi-error dedup is covered in
          // `render.test.ts`.
          expect(initOccurrences).toHaveLength(1);
        }),
      );
    });
  });
});
