import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";
import { CreateExtension, ForkExtension, AdoptExtension } from "./index.js";
import { authoringTypeFor, writeAuthoringPackage } from "./test-support/authoring-packages.js";
import {
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "./test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/authoring/refuses-incompatible-native-readers-before-source-publication",
  title: "Authored content is preflighted against native co-readers before publication",
  statement:
    "Before creating, forking, or adopting enabled Hook, Rule, or Knowledge content, AXM shall validate the complete proposed native projection against each reader of its physical file and shall refuse incompatible projections without changing source content, canonical content, settings, or accepted resolutions.",
  class: "functional",
  role: "supporting",
  goals: ["authoring-and-creation", "workspace-intent-fidelity", "agent-interoperability"],
  methods: ["decision-table"],
  boundary: "platform",
  boundaryRationale:
    "Real staged packages and physical aliases expose whether validation precedes publication or source movement.",
  derivedFrom: ["cli/install/preserves-unrelated-and-unowned-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("authored native projection preflight", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const type of ["rule", "knowledge", "hook"] as const) {
    for (const operation of ["create", "fork", "adopt"] as const) {
      it.effect(`refuses ${operation} of ${type} before publishing or moving content`, () =>
        Effect.gen(function* () {
          const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
          cleanups.push(created.cleanup);
          created.writeSettings({ owner: "@acme", agents: ["claude-code"], instructionFiles: {} });
          const row = authoringTypeFor(type);
          const source =
            operation === "create"
              ? undefined
              : writeAuthoringPackage(created.root, row, "review", {
                  parent:
                    operation === "adopt"
                      ? `agent_extensions/registry/@acme/${row.plural}`
                      : "source",
                });
          if (type === "hook") {
            created.write(".codex/config.toml", "");
            fs.mkdirSync(path.join(created.root, ".claude"), { recursive: true });
            fs.symlinkSync(
              "../.codex/config.toml",
              path.join(created.root, ".claude/settings.json"),
            );
          } else {
            created.write(".mcp.json", "{}");
            fs.symlinkSync(".mcp.json", path.join(created.root, "AGENTS.md"));
          }
          const before = created.snapshot();
          const prepare = Effect.gen(function* () {
            if (operation === "create") {
              if (type === "rule")
                yield* CreateExtension.prepare({
                  type,
                  name: "review",
                  owner: Option.none(),
                  title: Option.none(),
                });
              else if (type === "knowledge")
                yield* CreateExtension.prepare({
                  type,
                  name: "review",
                  owner: Option.none(),
                  description: Option.none(),
                });
              else
                yield* CreateExtension.prepare({
                  type,
                  name: "review",
                  owner: Option.none(),
                  runtime: "bash",
                  event: "session.start",
                  matcher: Option.none(),
                });
            } else if (operation === "fork") {
              yield* ForkExtension.prepare({
                source: source ?? "",
                target: `@acme/${row.plural}/review-fork`,
                from: Option.none(),
                enable: true,
                nonInteractive: true,
              });
            } else {
              yield* AdoptExtension.prepare({
                fqn: `@acme/${row.plural}/review`,
                nonInteractive: true,
              });
            }
          });
          const result = yield* prepare.pipe(
            Effect.asVoid,
            Effect.result,
            Effect.scoped,
            Effect.provide(authoringWorkspaceLayer(created)),
          );
          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure")
            expect(result.failure).toMatchObject({
              _tag: type === "hook" ? "HookConfigInvalid" : "ManagedRegionViolation",
            });
          expect(created.snapshot()).toEqual(before);
        }),
      );
    }
  }
});
