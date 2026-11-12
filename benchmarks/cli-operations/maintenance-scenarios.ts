import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  assertOutput,
  assertSuccessful,
  writeJson,
  type BenchmarkScenario,
  type ScenarioContext,
} from "./fixtures.js";

const installedBinary = async (context: ScenarioContext) => {
  const result = await context.run(["--version"]);
  assertSuccessful(result);
  const version = result.stdout.trim();
  const binary = path.join(
    context.home,
    ".axm",
    "bin",
    process.platform === "win32" ? "axm.exe" : "axm",
  );
  await fs.mkdir(path.dirname(binary), { recursive: true });
  await fs.copyFile(context.binary, binary);
  await fs.chmod(binary, 0o755);
  await writeJson(path.join(context.home, ".axm", "install-meta.json"), {
    schemaVersion: 2,
    method: "script",
    installedAt: "2026-01-01T00:00:00.000Z",
    executablePath: binary,
  });
  return { binary, version };
};

export const maintenanceScenarios = (): ReadonlyArray<BenchmarkScenario> => {
  const scenarios: BenchmarkScenario[] = [];
  for (const modeId of ["default", "json", "preview"]) {
    scenarios.push({
      id: `maintenance:upgrade:${modeId}:current`,
      dimensions: {
        scope: "none",
        source: "none",
        selection: "targeted",
        view: "filesystem",
        output: modeId === "json" ? "json" : "human",
        state: "no-op",
        format: modeId === "json" ? "upgrade-assessment-json" : "terminal-text",
        kinds: [],
      },
      operationId: "upgrade",
      modeId,
      fixtureId: "installed-current-binary-v1",
      description: "Assess a disposable script installation already at the exact requested release",
      prepare: async (context) => {
        const { binary, version } = await installedBinary(context);
        return {
          binary,
          args: [
            "upgrade",
            version,
            ...(modeId === "default" ? [] : [`--${modeId}`]),
            "--non-interactive",
          ],
          expectedExitCode: 0,
          env: { npm_config_user_agent: "" },
          verify: (result) => {
            assertSuccessful(result);
            assertOutput(result, version);
          },
        };
      },
    });
    if (process.platform === "win32") continue;
    for (const reinstall of [false, true]) {
      scenarios.push({
        id: `maintenance:upgrade:${modeId}:${reinstall ? "reinstall" : "delegated"}`,
        dimensions: {
          scope: "none",
          source: "none",
          selection: "targeted",
          view: "filesystem",
          output: modeId === "json" ? "json" : "human",
          state: "changed",
          format: modeId === "json" ? "upgrade-assessment-json" : "terminal-text",
          kinds: [],
        },
        operationId: "upgrade",
        modeId,
        fixtureId: "controlled-homebrew-v1",
        description:
          "Execute a compiled CLI upgrade against a disposable, deterministic package-manager process; no remote distribution traffic",
        prepare: async (context) => {
          const versionResult = await context.run(["--version"]);
          assertSuccessful(versionResult);
          const version = versionResult.stdout.trim();
          const major = /^(\d+)\./u.exec(version)?.[1];
          if (major === undefined) throw new Error(`Invalid CLI version ${version}`);
          const target = reinstall ? version : `${String(Number(major) + 1)}.0.0`;
          const prefix = path.join(context.root, "homebrew");
          const commands = path.join(context.root, "commands");
          const state = path.join(context.root, "installed-version");
          const log = path.join(context.root, "manager-commands");
          const binary = path.join(prefix, "Cellar", "axm", version, "bin", "axm");
          await Promise.all([
            fs.mkdir(path.dirname(binary), { recursive: true }),
            fs.mkdir(path.join(prefix, "bin"), { recursive: true }),
            fs.mkdir(commands),
          ]);
          await fs.copyFile(context.binary, binary);
          await fs.chmod(binary, 0o755);
          await fs.writeFile(state, `${version}\n`);
          await fs.writeFile(log, "");
          const versionScript = '#!/bin/sh\ncat "$AXM_BENCHMARK_INSTALLED_VERSION"\n';
          await fs.writeFile(path.join(commands, "axm"), versionScript, { mode: 0o755 });
          await fs.writeFile(path.join(prefix, "bin", "axm"), versionScript, { mode: 0o755 });
          await fs.writeFile(
            path.join(commands, "brew"),
            `#!/bin/sh
printf '%s\\n' "$*" >> "$AXM_BENCHMARK_MANAGER_LOG"
case "$1" in
  tap) printf '%s\\n' 'agentxm/tap' ;;
  update) ;;
  info) printf '{"formulae":[{"full_name":"agentxm/tap/axm","versions":{"stable":"%s"}}]}\\n' "$AXM_BENCHMARK_TARGET" ;;
  --prefix) printf '%s\\n' "$AXM_BENCHMARK_PREFIX" ;;
  upgrade|reinstall) printf '%s\\n' "$AXM_BENCHMARK_TARGET" > "$AXM_BENCHMARK_INSTALLED_VERSION" ;;
  *) exit 1 ;;
esac
`,
            { mode: 0o755 },
          );
          await writeJson(path.join(context.home, ".axm", "install-meta.json"), {
            schemaVersion: 2,
            method: "homebrew",
            installedAt: "2026-01-01T00:00:00.000Z",
            executablePath: binary,
          });
          return {
            binary,
            args: [
              "upgrade",
              target,
              ...(reinstall ? ["--reinstall"] : []),
              ...(modeId === "default" ? [] : [`--${modeId}`]),
              "--non-interactive",
            ],
            expectedExitCode: 0,
            env: {
              PATH: `${commands}${path.delimiter}${process.env["PATH"] ?? ""}`,
              AXM_BENCHMARK_INSTALLED_VERSION: state,
              AXM_BENCHMARK_MANAGER_LOG: log,
              AXM_BENCHMARK_TARGET: target,
              AXM_BENCHMARK_PREFIX: prefix,
              npm_config_user_agent: "",
            },
            verify: async (result) => {
              assertSuccessful(result);
              assertOutput(result, target);
              const observed = (await fs.readFile(state, "utf8")).trim();
              if (observed !== (modeId === "preview" ? version : target))
                throw new Error(`Upgrade fixture observed unexpected version ${observed}`);
              const invocations = await fs.readFile(log, "utf8");
              if (
                modeId !== "preview" &&
                !invocations.includes(`${reinstall ? "reinstall" : "upgrade"} agentxm/tap/axm`)
              )
                throw new Error("Upgrade did not invoke the selected package manager");
              if (modeId === "preview" && /^(?:upgrade|reinstall) /mu.test(invocations))
                throw new Error("Upgrade preview invoked package-manager mutation");
            },
          };
        },
      });
    }
  }
  return scenarios;
};
