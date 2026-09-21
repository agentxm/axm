import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { withNativeInstallerFixture } from "../test-support/native-installer-fixture.js";

export const specification = defineSpecification({
  requirement: "system/installability/posix-installer-retries-release-downloads",
  title: "POSIX installer retries failed release downloads",
  statement:
    "When a release asset download fails transiently, the POSIX installer shall retry a bounded number of times and complete installation from a later checksum-valid response without a user restart.",
  class: "quality",
  characteristic: "installability",
  role: "experience",
  goals: ["platform-reach", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "The actual shell installer requests an artifact and its checksum from a fixture that first returns server errors and then valid bytes; filesystem readback establishes whether installation completed.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The fixture exercises the curl-backed installer on macOS/Linux; the wget fallback shares the shell retry loop but is not separately run.",
      retirementCondition: "Exercise the wget fallback with the same controlled response sequence.",
    },
  ],
});

describe.skipIf(process.platform === "win32")("POSIX release download retries", () => {
  it.effect("retries artifact and checksum responses before installing verified bytes", () =>
    Effect.promise((signal) =>
      withNativeInstallerFixture(async (fixture) => {
        const result = await fixture.install({
          transientArtifactFailures: 2,
          transientManifestFailures: 1,
        });
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        expect(
          fixture.requests.filter((request) => request.endsWith(`/${fixture.artifactName}`)),
        ).toHaveLength(3);
        expect(fixture.requests.filter((request) => request.endsWith("/SHA256SUMS"))).toHaveLength(
          2,
        );
        expect(fs.readFileSync(path.join(fixture.userHome, ".axm", "bin", "axm"))).toEqual(
          fixture.executable,
        );
      }, signal),
    ),
  );

  it.effect("stops after a bounded number of failures without replacing AXM", () =>
    Effect.promise((signal) =>
      withNativeInstallerFixture(async (fixture) => {
        const initial = await fixture.install();
        expect(initial.exitCode, initial.stdout + initial.stderr).toBe(0);
        const requestCount = fixture.requests.length;
        const result = await fixture.install({ transientArtifactFailures: 3 });
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Failed to download");
        expect(
          fixture.requests
            .slice(requestCount)
            .filter((request) => request.endsWith(`/${fixture.artifactName}`)),
        ).toHaveLength(3);
        expect(fs.readFileSync(path.join(fixture.userHome, ".axm", "bin", "axm"))).toEqual(
          fixture.executable,
        );
      }, signal),
    ),
  );
});
