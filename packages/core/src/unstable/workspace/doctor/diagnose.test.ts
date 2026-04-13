// TODO: (#51) Uses node:fs/node:os/node:path directly. Migrate to @effect/platform
// test utilities when available.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { CodingAgentRepositoryLive } from "../../agents/index.js";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  type SourceHostProvidersService,
  SourceHostProviders,
} from "../../source-resolution/index.js";
import { Workspace } from "../service-interface.js";
import { makeBaseWorkspaceMock } from "../test-stubs.js";
import { diagnoseWorkspaceDoctor } from "./diagnose.js";

describe("diagnoseWorkspaceDoctor", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-doctor-diagnose-"));
    axmDir = path.join(tempDir, ".axm");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () => {
    const registrySources = [
      {
        name: "default",
        type: "registry" as const,
        location: new URL("https://registry.agentxm.ai"),
      },
    ];
    const workspaceLayer = Workspace.layer(
      makeBaseWorkspaceMock(axmDir, {
        getConfiguredSources: () => Effect.succeed(registrySources),
        getRegistrySourceHosts: () => Effect.succeed(registrySources),
      }),
    );
    const providers: SourceHostProvidersService = {
      find: () => Effect.succeed([]),
      fetch: () => Effect.die("unused in diagnoseWorkspaceDoctor tests"),
      cloneUrl: () => Option.none(),
      origin: () => "test",
    };
    return Layer.mergeAll(
      NodeServices.layer,
      workspaceLayer,
      CodingAgentRepositoryLive,
      Layer.succeed(SourceHostProviders, providers),
    );
  };

  it.effect("returns a healthy report for a clean minimal workspace", () =>
    Effect.gen(function* () {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(
        path.join(axmDir, "settings.json"),
        JSON.stringify({ agents: ["claude-code"] }),
      );

      const report = yield* diagnoseWorkspaceDoctor();

      expect(report.healthy).toBe(true);
      expect(report.summary.findings.errors).toBe(0);
      expect(report.checks).toHaveLength(4);
      expect(report.checks[0]?.id).toBe("workspace-ready");
      expect(report.checks[1]?.id).toBe("settings-validation");
      expect(report.checks[2]?.id).toBe("lockfile-validation");
      expect(report.checks[3]?.id).toBe("agent-readiness");
      expect(report.checks[0]?.status).toBe("pass");
      expect(report.checks[1]?.status).toBe("pass");
      expect(report.checks[2]?.status).toBe("pass");
      expect(report.checks[3]?.status).toBe("pass");
      expect(report.workspacePath).toBe(axmDir);
    }).pipe(Effect.provide(makeLayers())),
  );

  it.effect("returns an unhealthy report when .axm is missing", () =>
    Effect.gen(function* () {
      const report = yield* diagnoseWorkspaceDoctor();

      expect(report.healthy).toBe(false);
      expect(report.summary.findings.errors).toBeGreaterThanOrEqual(1);
      expect(report.checks[0]?.status).toBe("fail");
      expect(report.checks[1]?.status).toBe("skip");
      expect(
        report.checks[0]?.findings.some((f) => f.id === "workspace-ready.directory-missing"),
      ).toBe(true);
    }).pipe(Effect.provide(makeLayers())),
  );

  it.effect("returns a single settings-unparseable finding for broken JSON", () =>
    Effect.gen(function* () {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(path.join(axmDir, "settings.json"), "{oops");

      const report = yield* diagnoseWorkspaceDoctor();

      expect(report.healthy).toBe(false);
      expect(report.checks[1]?.status).toBe("skip");
      const unparseable = report.checks[0]?.findings.filter(
        (f) => f.id === "workspace-ready.settings-unparseable",
      );
      expect(unparseable?.length).toBe(1);
      expect(unparseable?.[0]?.details).toBeDefined();
      expect(unparseable?.[0]?.details?.length ?? 0).toBeGreaterThan(0);
    }).pipe(Effect.provide(makeLayers())),
  );

  it.effect("reports unresolved settings entries after workspace-ready passes", () =>
    Effect.gen(function* () {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(
        path.join(axmDir, "settings.json"),
        JSON.stringify({
          agents: ["claude-code"],
          skills: {
            "example-skill": "@axm/skills/example-skill",
          },
        }),
      );

      const report = yield* diagnoseWorkspaceDoctor();
      const check = report.checks[1];

      expect(report.healthy).toBe(false);
      expect(check?.id).toBe("settings-validation");
      expect(check?.status).toBe("fail");
      expect(
        check?.findings.some((finding) => finding.id === "settings-validation.source-not-found"),
      ).toBe(true);
    }).pipe(Effect.provide(makeLayers())),
  );
});
