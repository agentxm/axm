/**
 * Unit tests for extension operation helpers.
 */

import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  buildInstallOperation,
  formatPackageUrlParts,
  toLabelWithCompanions,
  toStepKey,
} from "./operations.js";
import { exactVersion, extensionName, handle, packageUrl } from "../test-helpers.js";
import type { ExtensionManager } from "../workspace/service-interface.js";
import type { RegistrySkillRef, SkillExtensionRef } from "../skills/refs.js";

describe("formatPackageUrlParts", () => {
  it("formats type and name", () => {
    const parts = packageUrl("pkg:npm/react");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/react");
  });

  it("includes namespace when present", () => {
    const parts = packageUrl("pkg:npm/%40angular/core");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/@angular/core");
  });

  it("includes version when present", () => {
    const parts = packageUrl("pkg:npm/react@18.2.0");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/react@18.2.0");
  });

  it("includes namespace and version together", () => {
    const parts = packageUrl("pkg:npm/%40angular/core@18.0.0");
    expect(formatPackageUrlParts(parts)).toBe("pkg:npm/@angular/core@18.0.0");
  });

  it("handles pypi type", () => {
    const parts = packageUrl("pkg:pypi/django");
    expect(formatPackageUrlParts(parts)).toBe("pkg:pypi/django");
  });
});

describe("toLabelWithCompanions", () => {
  it("returns base label when packages is empty", () => {
    const result = toLabelWithCompanions({ type: "skill", name: "my-skill" }, []);
    expect(result).toBe("my-skill");
  });

  it("appends single companionPackage in parentheses", () => {
    const result = toLabelWithCompanions({ type: "skill", name: "react-testing" }, [
      packageUrl("pkg:npm/react"),
    ]);
    expect(result).toBe("react-testing (pkg:npm/react)");
  });

  it("appends multiple packages comma-separated", () => {
    const result = toLabelWithCompanions({ type: "skill", name: "fullstack" }, [
      packageUrl("pkg:npm/react"),
      packageUrl("pkg:npm/typescript"),
    ]);
    expect(result).toBe("fullstack (pkg:npm/react, pkg:npm/typescript)");
  });

  it("works with pack targets", () => {
    const result = toLabelWithCompanions(
      { type: "pack", name: "frontend", owner: handle("@acme") },
      [packageUrl("pkg:npm/react")],
    );
    expect(result).toBe("@acme/frontend (pkg:npm/react)");
  });
});

describe("toStepKey", () => {
  it("includes the extension type for non-pack targets", () => {
    expect(toStepKey({ type: "skill", name: "lint" })).toBe("skill:lint");
    expect(toStepKey({ type: "command", name: "lint" })).toBe("command:lint");
  });

  it("includes the owner for pack targets", () => {
    expect(toStepKey({ type: "pack", name: "frontend", owner: handle("@acme") })).toBe(
      "pack:@acme/frontend",
    );
  });
});

describe("buildInstallOperation", () => {
  it("rejects installing over a workspace source before materialization", async () => {
    const materializeInstall = vi.fn(() => Effect.void);
    const manager = {
      type: "skill",
      isInstalled: () => Effect.succeed(true),
      materializeInstall,
      getConfiguredSource: () => Effect.succeed(Option.some("workspace:@acme/skills/review")),
      listMaterializable: () => Effect.succeed([]),
      materializeUninstall: () => Effect.void,
      upsertSettingsEntry: () => Effect.void,
      removeSettingsEntry: () => Effect.void,
      upsertLockfileEntry: () => Effect.void,
      removeLockfileEntry: () => Effect.void,
    } satisfies ExtensionManager<SkillExtensionRef>;
    const name = extensionName("review");
    const ref: RegistrySkillRef = {
      type: "skill",
      refType: "registry",
      source: {
        type: "registry",
        location: new URL("https://registry.agentxm.ai"),
        owner: Option.some(handle("@acme")),
      },
      owner: handle("@acme"),
      name,
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
      packages: [],
      skill: { name, description: Option.none(), metadata: Option.none() },
    };

    const operation = buildInstallOperation(manager, {
      ref,
      versionRange: Option.none(),
    });
    if (operation.readiness !== "ready") {
      throw new Error("Expected install operation to be ready");
    }
    const result = await Effect.runPromise(
      operation.run.pipe(
        Effect.match({
          onFailure: (error) => ({ type: "failure", error }) as const,
          onSuccess: () => ({ type: "success" }) as const,
        }),
      ),
    );
    if (result.type !== "failure") {
      throw new Error("Expected workspace source protection to reject the install");
    }

    expect(result.error.code).toBe("conflict");
    expect(result.error.detail).toContain("Cannot install over workspace-sourced skill");
    expect(materializeInstall).not.toHaveBeenCalled();
  });
});
