import { describe, expect, it } from "vitest";

import {
  describeUndeclaredTypeDependency,
  findUndeclaredTypeDependencies,
  owningPackage,
  referencedGuardedPackages,
  withoutComments,
  type DeclarationSubject,
} from "./declared-type-dependencies.js";

const subject = (overrides: Partial<DeclarationSubject> = {}): DeclarationSubject => ({
  packageName: "@fixture/workspace-sync",
  manifestPath: "packages/fixture/workspace-sync/package.json",
  declared: new Set(["@agentxm/workspace"]),
  declarations: [],
  ...overrides,
});

describe("emitted declaration references", () => {
  it("reads every module-specifier position a declaration file uses", () => {
    const declaration = [
      'import type { A } from "@agentxm/workspace/desired-state";',
      'export declare const a: import("@agentxm/registry-client").RegistryProblem;',
      'export * from "@agentxm/extension-model/unstable/extensions";',
      'import "@agentxm/workspace/projection/agent-adapters";',
      'declare module "@agentxm/workspace/resolution/sources" {}',
      '/// <reference types="@agentxm/extension-content" />',
    ].join("\n");
    expect([...referencedGuardedPackages(declaration)].sort()).toEqual([
      "@agentxm/extension-content",
      "@agentxm/extension-model",
      "@agentxm/registry-client",
      "@agentxm/workspace",
    ]);
  });

  it("judges specifiers, not prose", () => {
    // Nearly every module header in this repository names its neighbours;
    // a scanner that read raw text would report documentation as a defect.
    const declaration = [
      "/**",
      ' * Reconciliation reads the bundle from "@agentxm/extension-content",',
      " * not that bundle's loader.",
      " */",
      '// Superseded by "@agentxm/registry-client".',
      'const url = "https://example.test/from \\"@agentxm/workspace/resolution/sources\\"";',
      'import type { A } from "@agentxm/workspace/desired-state";',
    ].join("\n");
    expect([...referencedGuardedPackages(declaration)]).toEqual(["@agentxm/workspace"]);
  });

  it("keeps offsets stable while blanking comments", () => {
    const source = 'const a = 1; /* from "@agentxm/x" */ const b = 2;';
    const blanked = withoutComments(source);
    expect(blanked).toHaveLength(source.length);
    expect(blanked.startsWith("const a = 1; ")).toBe(true);
    expect(blanked.endsWith(" const b = 2;")).toBe(true);
    expect(blanked.replace(/ +/gu, " ")).toBe("const a = 1; const b = 2;");
  });

  it("attributes a subpath specifier to the package that owns it", () => {
    expect(owningPackage("@agentxm/extension-model/unstable/extensions/refs/skill")).toBe(
      "@agentxm/extension-model",
    );
    expect(owningPackage("effect/Effect")).toBe("effect");
    expect(owningPackage("./errors.js")).toBeUndefined();
    expect(owningPackage("#internal")).toBeUndefined();
    expect(owningPackage("not that bundle")).toBeUndefined();
  });
});

describe("undeclared type dependencies", () => {
  it("reports a reference the emitting manifest does not declare", () => {
    const findings = findUndeclaredTypeDependencies([
      subject({
        declarations: [
          {
            path: "packages/fixture/workspace-sync/dist/src/plan.d.ts",
            text: 'export declare const a: import("@agentxm/registry-client").RegistryProblem;',
          },
          {
            path: "packages/fixture/workspace-sync/dist/src/materialize.d.ts",
            text: 'export declare const b: import("@agentxm/registry-client").RegistryProblem;',
          },
        ],
      }),
    ]);
    expect(findings).toEqual([
      {
        packageName: "@fixture/workspace-sync",
        manifestPath: "packages/fixture/workspace-sync/package.json",
        referenced: "@agentxm/registry-client",
        declarations: [
          "packages/fixture/workspace-sync/dist/src/materialize.d.ts",
          "packages/fixture/workspace-sync/dist/src/plan.d.ts",
        ],
      },
    ]);
    expect(findings.map(describeUndeclaredTypeDependency).join("\n")).toContain(
      "@fixture/workspace-sync emits a reference to @agentxm/registry-client",
    );
  });

  it("accepts a declared reference and a package's own name", () => {
    expect(
      findUndeclaredTypeDependencies([
        subject({
          declarations: [
            {
              path: "packages/fixture/workspace-sync/dist/src/index.d.ts",
              text: [
                'import type { A } from "@agentxm/workspace/desired-state";',
                'import type { B } from "@fixture/workspace-sync";',
                'import type { C } from "effect/Effect";',
              ].join("\n"),
            },
          ],
        }),
      ]),
    ).toEqual([]);
  });
});
