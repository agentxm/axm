/**
 * The official AXM skill this executable carries.
 *
 * The content is generated into the binary at build time from `skills/axm`,
 * so the generator belongs to the application; the lifecycle reads it through
 * this port and decides everything else about installing it.
 */

import * as Layer from "effect/Layer";

import { BundledAxmSkillAsset } from "@agentxm/extension-lifecycle";

import {
  AXM_SKILL_CLI_VERSION,
  AXM_SKILL_CLI_VERSION_RANGE,
  AXM_SKILL_JSON,
  AXM_SKILL_SOURCE_FILES,
  AXM_SKILL_VERSION,
} from "../__generated__/bundled-axm-skill.js";
import { loadVersion } from "../version.js";

export const BundledAxmSkillAssetLive = Layer.sync(BundledAxmSkillAsset)(() => ({
  manifestJson: AXM_SKILL_JSON,
  version: AXM_SKILL_VERSION,
  cliVersion: AXM_SKILL_CLI_VERSION,
  cliVersionRange: AXM_SKILL_CLI_VERSION_RANGE,
  sourceFiles: AXM_SKILL_SOURCE_FILES,
  runningCliVersion: loadVersion(),
}));
