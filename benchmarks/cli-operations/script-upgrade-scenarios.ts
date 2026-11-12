import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { assertOutput, assertSuccessful, writeJson, type BenchmarkScenario } from "./fixtures.js";
import { startReleaseProxy } from "./release-proxy.js";

/** Reinstall downloads and replaces the real subject artifact, despite its equal release version. */
export const scriptUpgradeScenarios = (): ReadonlyArray<BenchmarkScenario> => {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const assetName = `axm-${platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`;
  const cases = [
    { modeId: "default", refusal: false },
    { modeId: "json", refusal: false },
    { modeId: "preview", refusal: false },
    { modeId: "json", refusal: true },
  ];
  return cases.map(({ modeId, refusal }): BenchmarkScenario => ({
    id: `maintenance:upgrade:${modeId}:script-${refusal ? "bad-checksum" : "reinstall"}`,
    operationId: "upgrade",
    modeId,
    fixtureId: "script-release-tls-proxy-v1",
    description: refusal
      ? "Reject a downloaded release with a mismatching checksum while preserving the installed executable"
      : "Download, verify and reinstall the actual compiled subject through a process-local trusted TLS fixture",
    dimensions: {
      scope: "none",
      source: "none",
      selection: "targeted",
      view: "filesystem",
      output: modeId === "json" ? "json" : "human",
      state: refusal ? "refused" : "changed",
      format: "script-release-native-executable",
      kinds: [],
    },
    prepare: async (context) => {
      const versionResult = await context.run(["--version"]);
      assertSuccessful(versionResult);
      const version = versionResult.stdout.trim();
      const binary = path.join(
        context.home,
        ".axm",
        "bin",
        process.platform === "win32" ? "axm.exe" : "axm",
      );
      const meta = path.join(context.home, ".axm", "install-meta.json");
      await fs.mkdir(path.dirname(binary), { recursive: true });
      await fs.copyFile(context.binary, binary);
      await fs.chmod(binary, 0o755);
      await writeJson(meta, {
        schemaVersion: 2,
        method: "script",
        installedAt: "2026-01-01T00:00:00.000Z",
        executablePath: binary,
      });
      const before = await fs.stat(binary, { bigint: true });
      const metadata = await fs.readFile(meta, "utf8");
      const release = await Effect.runPromise(
        startReleaseProxy({
          directory: path.join(context.root, "release-tls"),
          binary: context.binary,
          version,
          assetName,
          badChecksum: refusal,
        }),
      );
      return {
        binary,
        args: [
          "upgrade",
          version,
          "--reinstall",
          ...(modeId === "default" ? [] : [`--${modeId}`]),
          "--non-interactive",
        ],
        expectedExitCode: refusal ? 9 : 0,
        env: { ...release.environment, npm_config_user_agent: "" },
        metrics: release.metrics,
        dispose: release.close,
        verify: async (result) => {
          assertOutput(result, refusal ? "Checksum mismatch" : version);
          const counts = release.metrics();
          if (
            counts["releaseDeniedConnections"] !== 0 ||
            counts["releaseUnexpectedRequests"] !== 0 ||
            counts["releaseTlsErrors"] !== 0
          )
            throw new Error("Release fixture observed unexpected or untrusted traffic");
          const downloaded = modeId !== "preview";
          if (
            counts["releaseBinaryRequests"] !== Number(downloaded) ||
            counts["releaseChecksumRequests"] !== Number(downloaded) ||
            counts["releaseLatestRequests"] !== 0 ||
            counts["releasePayloadBytes"] !== (downloaded ? release.payloadBytes : 0)
          )
            throw new Error("Script upgrade did not exercise the expected release downloads");
          const bytes = await fs.readFile(binary);
          if (createHash("sha256").update(bytes).digest("hex") !== release.checksum)
            throw new Error("Installed executable differs from the verified subject artifact");
          const after = await fs.stat(binary, { bigint: true });
          const preserved = after.ino === before.ino && after.mtimeNs === before.mtimeNs;
          if (modeId === "preview" || refusal) {
            if (!preserved || (await fs.readFile(meta, "utf8")) !== metadata)
              throw new Error("Refusal or preview changed the installed executable or metadata");
          } else {
            if (preserved || (await fs.readFile(meta, "utf8")) === metadata)
              throw new Error("Script reinstall did not replace and record the executable");
            assertOutput(result, modeId === "default" ? "Reinstalled" : "reinstalled");
          }
          const installed = await context.run(["--version"], { binary });
          assertSuccessful(installed);
          if (installed.stdout.trim() !== version)
            throw new Error("Installed artifact execution did not report the selected version");
          if (
            (await fs.readdir(path.dirname(binary))).some(
              (entry) => entry !== path.basename(binary),
            )
          )
            throw new Error("Script upgrade left a staging, backup, or lock artifact");
        },
      };
    },
  }));
};
