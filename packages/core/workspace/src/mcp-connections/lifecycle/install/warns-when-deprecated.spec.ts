import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  installRequest,
  makeInstallWorld,
  previewInstall,
} from "../../../lifecycle/install/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/install/warns-when-deprecated",
  title: "Direct MCP installation warns about deprecation",
  statement:
    "Installing a deprecated Registry MCP connection directly shall report its deprecation in the planned step and in the preview result without blocking the install.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Deprecated Registry MCP connections", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("warns during a direct install preview", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    world.registry.writeMcp("context", [{ version: "1.0.0" }]);
    const indexPath = path.join(
      world.registry.root,
      "extensions",
      "@acme",
      "mcps",
      "context",
      "index.json",
    );
    const index = fs.readFileSync(indexPath, "utf8");
    const deprecated = index.replace(
      '"deprecation": null',
      '"deprecation": {"deprecatedAt":"2026-03-01T00:00:00.000Z","reason":"other","message":"Use a newer context server."}',
    );
    expect(deprecated).not.toBe(index);
    fs.writeFileSync(indexPath, deprecated);

    return world.workspace
      .provide(
        Effect.gen(function* () {
          const preview = yield* previewInstall(
            installRequest({
              type: "mcp-server",
              subject: { kind: "source", source: "@acme/mcps/context" },
            }),
          );
          expect(preview.units.flatMap((unit) => unit.warnings ?? []).join("\n")).toContain(
            "@acme/mcps/context is deprecated",
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
