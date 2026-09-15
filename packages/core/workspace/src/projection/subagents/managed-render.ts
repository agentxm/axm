/**
 * Ownership decoration for one agent-native Subagent document projection.
 *
 * The projection owns the provenance token and the banner wording; the agent
 * adapter owns where a banner may sit in its own format, so the banner text
 * crosses into `@agentxm/agent-integration` as plain data.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  renderSubagent,
  type OwnershipBannerText,
  type SubagentRenderInput,
  type SubagentRenderOutcome,
} from "@agentxm/agent-integration";
import { managedFileBanners, type ManagedFileProvenance } from "../managed-file-banner.js";
import { projectionGeneration } from "../generation.js";

export interface ManagedSubagentRenderArgs {
  readonly managedFile: ManagedFileProvenance;
  readonly input: SubagentRenderInput;
}

/** Generation provenance for one agent-specific Subagent document projection. */
export const subagentProjectionGeneration = (args: ManagedSubagentRenderArgs): string =>
  projectionGeneration([
    "subagent-document-v1",
    args.managedFile.ext,
    args.managedFile.source.kind,
    args.managedFile.source.path,
    args.input.agentId,
    args.input.name,
    args.input.body,
    JSON.stringify(args.input.frontmatter),
    JSON.stringify(args.input.agentOverrides ?? null),
  ]);

/** The ownership banner an agent adapter stamps into this Subagent projection. */
export const subagentOwnershipBanner = (args: ManagedSubagentRenderArgs): OwnershipBannerText =>
  managedFileBanners({
    ...args.managedFile,
    helpTopic: "subagents",
    generation: subagentProjectionGeneration(args),
  });

/** The render input an agent adapter receives, carrying its ownership banner. */
export const managedSubagentRenderInput = (
  args: ManagedSubagentRenderArgs,
): SubagentRenderInput => ({
  ...args.input,
  ownershipBanner: subagentOwnershipBanner(args),
});

/** Render the exact managed bytes the standard file adapter writes. */
export const renderManagedSubagentOutputs = (
  args: ManagedSubagentRenderArgs,
): SubagentRenderOutcome | undefined => renderSubagent(managedSubagentRenderInput(args));
