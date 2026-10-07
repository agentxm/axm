import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createTempDir } from "@agentxm/client-e2e-utils";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { resolveHostBinaryPath } from "./distribution-targets.js";

const outputSchema = Schema.Struct({ diagnosticId: Schema.String });
const recordSchema = Schema.Struct({
  eventId: Schema.String,
  failure: Schema.Struct({
    frames: Schema.Array(
      Schema.Struct({
        module: Schema.String,
        filename: Schema.String,
        line: Schema.Int,
        column: Schema.Int,
      }),
    ),
  }),
});
const builtEntry = fileURLToPath(new URL("../../cli/dist/src/main.js", import.meta.url));
const source = fileURLToPath(
  new URL(
    "../../../packages/core/workspace-kernel/src/workspace-state/observed/state.ts",
    import.meta.url,
  ),
);

describe("production artifact source attribution", () => {
  it.each(["node", "compiled"])(
    "maps an actual %s CLI failure to its owned TypeScript source",
    async (runtime) => {
      const temporary = createTempDir("axm-source-frame-artifact-");
      try {
        const home = path.join(temporary.path, "home");
        const project = path.join(temporary.path, "project");
        fs.mkdirSync(home);
        fs.mkdirSync(project);
        fs.writeFileSync(path.join(project, "axm.json"), "{\n");
        const options = {
          cwd: project,
          env: {
            AXM_USER_HOME: home,
            DISABLE_TELEMETRY: "1",
            DO_NOT_TRACK: "1",
            AXM_NO_UPDATE_CHECK: "1",
            AXM_TOKEN: "",
            AXM_TOKEN_FILE: "",
          },
        };
        const args = ["list", "--scope", "project", "--json"];
        // File descriptors exercise real artifacts without depending on a
        // host's captured-pipe support. Both streams remain within this trial.
        const stdoutPath = path.join(temporary.path, "stdout");
        const stderrPath = path.join(temporary.path, "stderr");
        const stdout = fs.openSync(stdoutPath, "wx", 0o600);
        const stderr = fs.openSync(stderrPath, "wx", 0o600);
        let status: number | null;
        try {
          const result = spawnSync(
            runtime === "compiled" ? resolveHostBinaryPath() : process.execPath,
            runtime === "compiled" ? args : [builtEntry, ...args],
            { ...options, stdio: ["ignore", stdout, stderr], timeout: 60_000 },
          );
          expect(result.error).toBeUndefined();
          status = result.status;
        } finally {
          fs.closeSync(stdout);
          fs.closeSync(stderr);
        }
        expect(fs.statSync(stdoutPath).size).toBeLessThan(64 * 1024);
        expect(fs.statSync(stderrPath).size).toBeLessThan(64 * 1024);
        const output = fs.readFileSync(stdoutPath, "utf8");
        expect(status, output + fs.readFileSync(stderrPath, "utf8")).toBe(9);
        expect(output).toContain('"diagnosticId"');
        const { diagnosticId } = Schema.decodeUnknownSync(Schema.fromJsonString(outputSchema))(
          output,
        );
        const record = Schema.decodeUnknownSync(Schema.fromJsonString(recordSchema))(
          fs.readFileSync(path.join(home, ".axm", "diagnostics", `${diagnosticId}.json`), "utf8"),
        );
        expect(record.eventId).toBe(diagnosticId);
        const creationLine =
          fs
            .readFileSync(source, "utf8")
            .split("\n")
            .findIndex((line) => line.includes("new SettingsParseError(")) + 1;
        expect(creationLine).toBeGreaterThan(0);
        expect(record.failure.frames).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              module: "@agentxm/workspace-kernel",
              filename: "src/workspace-state/observed/state.ts",
              line: creationLine,
            }),
          ]),
        );
        expect(JSON.stringify(record.failure.frames)).not.toContain(temporary.path);
        expect(JSON.stringify(record.failure.frames)).not.toContain("dist/src/");
      } finally {
        temporary.cleanup();
      }
    },
  );
});
