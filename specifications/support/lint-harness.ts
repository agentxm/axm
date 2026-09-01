/**
 * Lint-specification workspace harness.
 *
 * Extends the shared install workspace with the skill-compatibility policy
 * service the lint runner consumes, so lint specifications can drive the real
 * lint entry against the same temporary workspace the install entries mutate.
 */

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  handleSkillsInstall,
  loadVersion,
  makeEffectProvide,
  makeAxmSkillCompatibilityPolicyLayer,
} from "axm.sh/specification-harness";

import { makeSpecWorkspace, type SpecWorkspaceOptions } from "./install-harness.js";

/**
 * Installs the bundled official AXM skill — the workspace state lint expects
 * of every set-up workspace before it can report clean.
 */
export const installBundledAxmSkill = handleSkillsInstall(
  { source: Option.some("@agentxm/skills/axm"), skills: [], all: false, bundled: true },
  { yes: true, force: false, preview: false },
);

export const makeLintSpecWorkspace = (options: SpecWorkspaceOptions = {}) => {
  const workspace = makeSpecWorkspace(options);
  const layer = Layer.merge(workspace.layer, makeAxmSkillCompatibilityPolicyLayer(loadVersion()));
  return {
    ...workspace,
    layer,
    provide: makeEffectProvide(layer),
  };
};
