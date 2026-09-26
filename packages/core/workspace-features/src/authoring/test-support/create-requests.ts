/**
 * The creation request for one extension type, with the per-type options a
 * specification does not vary.
 *
 * The rules that sweep every type — create-only refusal, workspace ownership —
 * are about what creation shares, not about what each scaffold takes, so the
 * type-specific fields are supplied once here rather than in every example.
 *
 * @internal Test-only. Not part of the package's public API.
 */

import * as Option from "effect/Option";

import type { CreatableExtensionType, CreateExtensionRequest } from "../create/create-extension.js";

/** A creation request for `type` under `name`, with an optional owner override. */
export const createRequestFor = (
  type: CreatableExtensionType,
  name: string,
  owner: Option.Option<string> = Option.none(),
): CreateExtensionRequest => {
  switch (type) {
    case "skill":
      return { type, name, owner };
    case "subagent":
      return { type, name, owner };
    case "pack":
      return { type, name, owner };
    case "rule":
      return { type, name, owner, title: Option.none() };
    case "knowledge":
      return { type, name, owner, description: Option.none() };
    case "hook":
      return { type, name, owner, runtime: "bash", event: "tool.pre", matcher: Option.none() };
    case "mcp-server":
      return { type, name, owner, description: Option.none(), nonInteractive: true };
  }
};
