import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import type { FileRegistry } from "@agentxm/registry-client/testing";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  previewInstall,
} from "../../testing/install-world.js";

const contributors = [
  { type: "rule", plural: "rules", native: "AGENTS.md" },
  { type: "hook", plural: "hooks", native: ".claude/settings.json" },
  { type: "knowledge", plural: "knowledge", native: "AGENTS.md" },
] as const;

const publish = (
  registry: FileRegistry,
  type: (typeof contributors)[number]["type"],
  name: string,
) => {
  switch (type) {
    case "rule":
      registry.writeRule(name, [{ version: "1.0.0", body: `Guidance ${name}` }]);
      break;
    case "hook":
      registry.writeHook(name, [{ version: "1.0.0" }]);
      break;
    case "knowledge":
      registry.writeKnowledge(name, [{ version: "1.0.0", body: `Knowledge ${name}` }]);
      break;
  }
};

describe("Configured installs preflight the complete selected aggregate contributor set", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const row of contributors) {
    for (const route of ["root", "pack"] as const) {
      it.effect(`${route} install prepares ${row.type} contributors from two fresh Packs`, () => {
        const { workspace, registry, cleanup } = makeInstallWorld({
          settings: {
            instructionFiles: {},
            packs: { first: "@acme/packs/first", second: "@acme/packs/second" },
          },
        });
        cleanups.push(cleanup);
        for (const [pack, member] of [
          ["first", "alpha"],
          ["second", "beta"],
        ] as const) {
          publish(registry, row.type, member);
          registry.writePack(pack, [
            {
              version: "1.0.0",
              dependencies: {
                [`@acme/${row.plural}/${member}`]: "*",
              },
            },
          ]);
        }
        const request = installRequest({
          ...(route === "pack" ? { type: "pack" } : {}),
          subject: { kind: "configured" },
        });
        return workspace
          .provide(
            Effect.gen(function* () {
              const before = workspace.snapshot();
              const preview = yield* previewInstall(request);
              expect(deriveOperationOutcome(preview)).toBe("previewed");
              expect(workspace.snapshot()).toEqual(before);
              const result = yield* applyInstall(request);
              expect(deriveOperationOutcome(result)).toBe("applied");
              expect(result.units.map(({ id }) => id)).toEqual(preview.units.map(({ id }) => id));
              // Each Pack retains its own closure; the shared native unit renders after both.
              expect(result.units.filter(({ label }) => label.includes("packs/"))).toHaveLength(2);
              for (const name of ["alpha", "beta"]) {
                expect(
                  workspace.exists(`agent_extensions/registry/@acme/${row.plural}/${name}`),
                ).toBe(true);
                expect(workspace.readFile("axm-lock.yaml")).toContain(name);
                expect(workspace.readFile(row.native)).toContain(name);
              }
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      });
    }

    it.effect(`root install prepares a Pack and a direct ${row.type} contributor together`, () => {
      const { workspace, registry, cleanup } = makeInstallWorld({
        settings: {
          instructionFiles: {},
          packs: { first: "@acme/packs/first" },
          [row.plural]: { beta: `@acme/${row.plural}/beta` },
        },
      });
      cleanups.push(cleanup);
      publish(registry, row.type, "alpha");
      publish(registry, row.type, "beta");
      registry.writePack("first", [
        {
          version: "1.0.0",
          dependencies: {
            [`@acme/${row.plural}/alpha`]: "*",
          },
        },
      ]);
      return workspace
        .provide(
          Effect.gen(function* () {
            const request = installRequest({ subject: { kind: "configured" } });
            const before = workspace.snapshot();
            expect(deriveOperationOutcome(yield* previewInstall(request))).toBe("previewed");
            expect(workspace.snapshot()).toEqual(before);
            expect(deriveOperationOutcome(yield* applyInstall(request))).toBe("applied");
            for (const name of ["alpha", "beta"]) {
              expect(
                workspace.exists(`agent_extensions/registry/@acme/${row.plural}/${name}`),
              ).toBe(true);
              expect(workspace.readFile(row.native)).toContain(name);
            }
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });

    it.effect(
      `refuses an unsafe shared ${row.type} native route before publishing either Pack`,
      () => {
        const { workspace, registry, cleanup } = makeInstallWorld({
          settings: {
            instructionFiles: {},
            packs: { first: "@acme/packs/first", second: "@acme/packs/second" },
          },
        });
        cleanups.push(cleanup);
        for (const [pack, member] of [
          ["first", "alpha"],
          ["second", "beta"],
        ] as const) {
          publish(registry, row.type, member);
          registry.writePack(pack, [
            {
              version: "1.0.0",
              dependencies: {
                [`@acme/${row.plural}/${member}`]: "*",
              },
            },
          ]);
        }
        const external = fs.mkdtempSync(path.join(os.tmpdir(), "axm-foreign-native-"));
        cleanups.push(() => fs.rmSync(external, { recursive: true, force: true }));
        const target = path.join(external, "native");
        fs.writeFileSync(
          target,
          row.type === "hook" ? '{"foreign":true}\n' : "Foreign instructions\r\n",
        );
        const nativePath = path.join(workspace.root, row.native);
        fs.mkdirSync(path.dirname(nativePath), { recursive: true });
        fs.symlinkSync(target, nativePath);
        return workspace
          .provide(
            Effect.gen(function* () {
              const before = workspace.snapshot();
              const foreign = fs.readFileSync(target, "utf8");
              const result = yield* applyInstall(
                installRequest({ subject: { kind: "configured" } }),
              ).pipe(Effect.result);
              expect(result._tag).toBe("Failure");
              expect(workspace.snapshot()).toEqual(before);
              expect(fs.readFileSync(target, "utf8")).toBe(foreign);
              expect(workspace.exists("agent_extensions")).toBe(false);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
    );
  }

  it.effect("keeps an unresolved unselected direct contributor blocking Pack preflight", () => {
    const { workspace, registry, cleanup } = makeInstallWorld({
      settings: {
        instructionFiles: {},
        packs: { first: "@acme/packs/first" },
        rules: { beta: "@acme/rules/beta" },
      },
    });
    cleanups.push(cleanup);
    publish(registry, "rule", "alpha");
    publish(registry, "rule", "beta");
    registry.writePack("first", [{ version: "1.0.0", dependencies: { "@acme/rules/alpha": "*" } }]);
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();
          const result = yield* applyInstall(
            installRequest({ type: "pack", subject: { kind: "configured" } }),
          ).pipe(Effect.result);
          expect(result._tag).toBe("Failure");
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
