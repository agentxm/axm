import * as Effect from "effect/Effect";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { withNativeInstallerFixture } from "../test-support/native-installer-fixture.js";

export const specification = defineSpecification({
  requirement: "system/installability/native-installers-probe-without-telemetry",
  title: "Installer-owned version probes disable telemetry only in their children",
  statement:
    "Every installer-owned AXM version probe shall receive AXM_TELEMETRY=0, including downloaded, existing, installed and PATH-resolved executables, and the installer shall preserve the caller's telemetry environment, including on probe failure.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "The public installer executes version-answering programs that record their child environment against a loopback artifact server.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe.skipIf(process.platform === "win32")("Installer probe privacy", () => {
  for (const failingProbe of [false, true]) {
    it.effect(
      `disables every probe with a ${failingProbe ? "failing" : "working"} PATH shadow`,
      () =>
        Effect.promise((signal) =>
          withNativeInstallerFixture(async (fixture) => {
            const options = { telemetry: "all", shadowOnPath: true, failingProbe };
            for (let attempt = 0; attempt < 2; attempt += 1) {
              const installed = await fixture.install(options);
              expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
            }
            const probes = fixture.probes();
            expect(probes.length).toBeGreaterThanOrEqual(7);
            expect(
              probes.every((probe) => probe.endsWith("|0")),
              probes.join("\n"),
            ).toBe(true);
            expect(probes.some((probe) => probe.includes("/shadow/axm|0"))).toBe(true);
          }, signal),
        ),
    );
  }
  it.effect("disables a failing downloaded probe and preserves the existing installation", () =>
    Effect.promise((signal) =>
      withNativeInstallerFixture(async (fixture) => {
        const options = { telemetry: "all", shadowOnPath: true };
        const initial = await fixture.install(options);
        expect(initial.exitCode, initial.stdout + initial.stderr).toBe(0);
        const target = path.join(fixture.userHome, ".axm/bin/axm");
        const before = fs.readFileSync(target);
        const failed = await fixture.install({ ...options, failingDownloadedProbe: true });
        expect(failed.exitCode).not.toBe(0);
        expect(fixture.probes().every((probe) => probe.endsWith("|0"))).toBe(true);
        expect(fs.readFileSync(target)).toEqual(before);
      }, signal),
    ),
  );
});
