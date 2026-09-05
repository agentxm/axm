import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as DateTime from "effect/DateTime";
import * as ConfigProvider from "effect/ConfigProvider";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  CredentialStore,
  CredentialStoreLive,
  PendingDeviceLoginStore,
  PendingDeviceLoginStoreLive,
  InstallMeta,
  InstallMetaLive,
} from "axm.sh/specification-harness";
import { makeEnvironmentProcessFixture } from "../support/environment-process-fixture.js";
import { makeInstallerSelectionFixture } from "../support/installer-selection-fixture.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

afterEach(() => vi.unstubAllEnvs());
export const specification = defineSpecification({
  requirement: "cli/environment-relocates-user-resources",
  title: "The selected application home contains user resources",
  statement:
    "When AXM_USER_HOME is non-empty, AXM shall use that home for its user workspace, restricted-file credentials, pending device login, install metadata, and default self-managed executable without falling back to the platform home for those resources.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  boundary: "process",
  boundaryRationale:
    "Fresh CLI setup invocations establish relocated workspace placement; real credential, pending-login, and install-metadata services read and write disposable homes; the installer control establishes executable placement.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/help/topics/environment.md",
    "packages/workspace-state/src/workspace/paths.internal.test.ts",
    "packages/registry-auth/src/credential-store.internal.test.ts",
    "packages/registry-auth/src/pending-device-login-store.internal.test.ts",
    "packages/cli/src/install-meta/install-meta.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "What is the canonical restricted-file credential subdirectory? Earlier environment help named the .axm application home, while current storage uses .config/axm.",
    "Should an empty AXM_USER_HOME use the platform home consistently for credentials and pending login as earlier environment help promised? Their current environment reader preserves an empty string.",
    "Does AXM_USER_HOME also relocate platform-style caches? The cache resolver and its internal witness do so, while earlier environment help said platform caches keep platform locations.",
  ],
  limitations: [
    {
      limitation:
        "The default executable example runs the actual shell installer only on macOS/Linux and uses a version-answering executable fixture. These examples supply no Windows process evidence for user-workspace, PowerShell/cmd default executable, or install-metadata relocation; direct live-adapter cases do not establish that process population.",
      retirementCondition:
        "Add equivalent populated platform-versus-application-home process controls for the supported Windows installer shells and built CLI, while retaining actual installed-binary evidence for product startup.",
    },
    {
      limitation:
        "This owner concerns application resources, not the OS keychain. It does not claim that AXM_USER_HOME changes the logged-in operating-system account or keychain namespace.",
      retirementCondition:
        "Retain that ownership distinction while changes to the application-home implementation are reviewed.",
    },
  ],
});

describe("Application-resource home", () => {
  it.skipIf(process.platform === "win32")(
    "the shell installer puts its default executable and metadata under the override",
    async () => {
      const fixture = makeInstallerSelectionFixture();
      try {
        const before = snapshotWorkspaceContent(fixture.platformHome);
        const result = await fixture.install(fixture.selectedVersion, AbortSignal.timeout(30_000));
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        const executable = path.join(fixture.applicationHome, ".axm/bin/axm");
        expect(fs.readFileSync(executable)).toEqual(fixture.selectedBytes);
        const metadata: unknown = JSON.parse(
          fs.readFileSync(path.join(fixture.applicationHome, ".axm/install-meta.json"), "utf8"),
        );
        expect(metadata).toMatchObject({ method: "script", executablePath: executable });
        expect(snapshotWorkspaceContent(fixture.platformHome)).toEqual(before);
      } finally {
        fixture.cleanup();
      }
    },
  );
  it("creates the user workspace under the override and leaves the platform home untouched", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      fs.mkdirSync(path.join(fixture.platformHome, ".axm", "workspace"), { recursive: true });
      fs.writeFileSync(
        path.join(fixture.platformHome, ".axm", "workspace", "axm.json"),
        "invalid platform settings must not be consulted",
      );
      // The process runner uses Bun, whose first launch populates its own cache.
      // Establish that runtime precondition before comparing application writes.
      const warmup = await fixture.run(["--version"]);
      expect(warmup.exitCode, warmup.stdout + warmup.stderr).toBe(0);
      const platformBefore = snapshotWorkspaceContent(fixture.platformHome);
      const projectBefore = snapshotWorkspaceContent(fixture.invoking);
      const result = await fixture.run([
        "setup",
        "--scope",
        "user",
        "--agent",
        "claude-code",
        "--yes",
        "--json",
        "--non-interactive",
      ]);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const settings: unknown = JSON.parse(
        fs.readFileSync(path.join(fixture.applicationHome, ".axm/workspace/axm.json"), "utf8"),
      );
      expect(settings).toMatchObject({ agents: ["claude-code"] });
      expect(snapshotWorkspaceContent(fixture.platformHome)).toEqual(platformBefore);
      expect(snapshotWorkspaceContent(fixture.invoking)).toEqual(projectBefore);
    } finally {
      fixture.cleanup();
    }
  });

  it.effect(
    "live file services read back the selected home and do not consult populated platform resources",
    () => {
      const fixture = makeEnvironmentProcessFixture();
      const registry = "https://home-isolation.example.test";
      const handle = normalizeHandle("@fixture");
      const pending = {
        version: 2,
        registryUrl: registry,
        deviceCode: "fixture-device",
        userCode: "CODE-1234",
        verificationUri: "https://identity.example.test/device",
        verificationUriComplete: "https://identity.example.test/device?code=CODE-1234",
        requestedScopes: ["extensions:read"],
        interval: 5,
        expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
      };
      for (const [key, value] of Object.entries({
        HOME: fixture.platformHome,
        USERPROFILE: fixture.platformHome,
        HOMEPATH: fixture.platformHome,
        AXM_USER_HOME: fixture.applicationHome,
        SSH_CLIENT: "environment-spec",
        CI: "",
      }))
        vi.stubEnv(key, value);
      // Preserve the existing platform-resource families as adversarial inputs.
      const platformResources = {
        ".config/axm/credentials.json": {
          version: 1,
          registries: {
            [registry]: {
              accounts: {
                [handle]: {
                  access_token: "platform-only-access",
                  refresh_token: "platform-only-refresh",
                  expires_at: "2099-01-01T00:00:00.000Z",
                  active: true,
                },
              },
            },
          },
        },
        ".axm/pending-login.json": {
          ...pending,
          expiresAt: "2099-01-01T00:00:00.000Z",
          deviceCode: "platform-only-device",
        },
        ".axm/install-meta.json": {
          schemaVersion: 2,
          method: "homebrew",
          installedAt: "2026-01-01T00:00:00.000Z",
        },
      };
      for (const [file, content] of Object.entries(platformResources)) {
        const target = path.join(fixture.platformHome, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify(content));
      }
      const platformBefore = snapshotWorkspaceContent(fixture.platformHome);
      const platform = Layer.mergeAll(
        NodeServices.layer,
        ConfigProvider.layer(
          ConfigProvider.fromEnv({ env: { AXM_USER_HOME: fixture.applicationHome } }),
        ),
      );
      const services = Layer.mergeAll(
        CredentialStoreLive,
        PendingDeviceLoginStoreLive,
        InstallMetaLive,
      ).pipe(Layer.provide(platform));
      return Effect.gen(function* () {
        const credentials = yield* CredentialStore;
        // The supported SSH file tier is selected before any credential action;
        // no operating-system keychain entry is read, written, or cleared.
        expect(credentials.tier).toBe("restricted-file");
        const pendingStore = yield* PendingDeviceLoginStore;
        const metadata = yield* InstallMeta;
        expect(Option.isNone(yield* credentials.load(registry))).toBe(true);
        expect(Option.isNone(yield* pendingStore.load())).toBe(true);
        expect(Option.isNone(yield* metadata.read())).toBe(true);
        yield* credentials.save(registry, handle, {
          access_token: "fixture-access",
          refresh_token: "fixture-refresh",
          expires_at: pending.expiresAt,
        });
        yield* pendingStore.save({ ...pending, version: 2 });
        yield* metadata.write({
          schemaVersion: 2,
          method: "script",
          installedAt: DateTime.makeUnsafe("2026-09-05T00:00:00Z"),
        });
        expect(Option.getOrThrow(yield* credentials.load(registry)).access_token).toBe(
          "fixture-access",
        );
        expect(Option.getOrThrow(yield* pendingStore.load()).deviceCode).toBe(pending.deviceCode);
        expect(Option.getOrThrow(yield* metadata.read()).method).toBe("script");
        // The reviewed promise is containment in the selected home. The exact
        // restricted credential subdirectory remains a documented conflict.
        expect(
          Object.values(snapshotWorkspaceContent(fixture.applicationHome)).some(
            (value) =>
              value.startsWith("file:") &&
              Buffer.from(value.slice(5), "base64").toString("utf8").includes("fixture-access"),
          ),
        ).toBe(true);
        expect(fs.existsSync(path.join(fixture.applicationHome, ".axm/pending-login.json"))).toBe(
          true,
        );
        expect(fs.existsSync(path.join(fixture.applicationHome, ".axm/install-meta.json"))).toBe(
          true,
        );
        expect(snapshotWorkspaceContent(fixture.platformHome)).toEqual(platformBefore);
      }).pipe(Effect.provide(services), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );
});
