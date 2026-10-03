import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  LockfileSchema,
  SettingsSchema,
  resolveProjectWorkspaceLayout,
} from "../workspace-state/index.js";
import { deriveAgentOutputAuthority, deriveSkillOutputSources } from "./output-authority.js";

describe("selected skill output authority", () => {
  it.effect("retains accepted and authored sources without inspecting unrelated rows", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const settings = Schema.decodeUnknownSync(SettingsSchema)({
        owner: "@acme",
        skills: { review: "workspace", other: "workspace" },
      });
      const acceptedResolutions = Schema.decodeUnknownSync(LockfileSchema)({
        lockfileVersion: 10,
        skills: {
          review: {
            source: { type: "registry", url: "https://registry.example/" },
            identity: { owner: "@acme", name: "review" },
            resolved: { version: "1.0.0", integrity: "sha512-test", publisherBindingId: "binding" },
            treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
          },
        },
      });
      const baseDir = "/workspace";
      const layout = yield* resolveProjectWorkspaceLayout(
        decodeAbsolutePathSync(baseDir),
        settings,
      );
      const args = { path, baseDir, layout, settings, acceptedResolutions, desired: { nodes: [] } };
      const expected = deriveAgentOutputAuthority(args).expectedSkillSources["review"];
      expect(expected).toHaveLength(2);
      const reject = () => {
        throw new Error("Unrelated authority was inspected");
      };
      const selected = deriveSkillOutputSources(
        {
          ...args,
          acceptedResolutions: {
            ...acceptedResolutions,
            skills: {
              ...acceptedResolutions.skills,
              get unrelated() {
                return reject();
              },
            },
            get rules() {
              return reject();
            },
            get hooks() {
              return reject();
            },
            get mcpServers() {
              return reject();
            },
            get subagents() {
              return reject();
            },
            get knowledge() {
              return reject();
            },
          },
          settings: {
            ...settings,
            get hooks() {
              return reject();
            },
            get mcpServers() {
              return reject();
            },
          },
        },
        "review",
      );
      expect(selected).toEqual({ review: expected });
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
