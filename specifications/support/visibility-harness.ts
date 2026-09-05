import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { makeSpecWorkspace } from "./install-harness.js";
import { writeAuthoredSkill } from "./publish-harness.js";
import { observedRevision, registryTarget } from "./registry-management-harness.js";

export const makeVisibilityWorkspace = (
  options: {
    readonly manifest?: "public" | "private";
    readonly workspace?: "public" | "private";
    readonly scope?: "project" | "user";
  } = {},
) => {
  const workspace = makeSpecWorkspace({
    machine: true,
    scope: options.scope ?? "project",
    ...(options.scope === "user" ? { userSettings: {} } : {}),
    settings: {
      skills: { review: "workspace" },
    },
  });
  if (options.workspace !== undefined) {
    workspace.writeSettings({
      owner: "@acme",
      agents: [],
      skills: { review: "workspace" },
      publish: { defaultVisibility: options.workspace },
    });
  }
  writeAuthoredSkill(workspace.root, { name: "review" });
  if (options.manifest !== undefined) {
    fs.writeFileSync(
      path.join(workspace.root, "skills", "review", "skill.json"),
      JSON.stringify({
        owner: "@acme",
        type: "skill",
        name: "review",
        version: "1.0.0",
        publish: { visibility: options.manifest },
      }),
    );
  }
  return workspace;
};

export const visibilityIntent = (
  source: "manifest" | "workspace",
  value: "public" | "private",
) => ({
  value,
  source,
  fingerprint: crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        source,
        value,
        material: JSON.stringify({
          publish: source === "manifest" ? { visibility: value } : { defaultVisibility: value },
        }),
      }),
    )
    .digest("hex"),
});

export const visibilityEvaluation = (
  intent: ReturnType<typeof visibilityIntent> | null = null,
  actual: "public" | "private" | null = "public",
) => ({
  target: registryTarget,
  intent,
  request: null,
  resolved: null,
  actual: actual === null ? null : { value: actual, revision: observedRevision },
  comparison:
    actual === null
      ? "not-established"
      : intent === null
        ? "unconfigured"
        : intent.value === actual
          ? "match"
          : "drift",
  findings: [],
});
