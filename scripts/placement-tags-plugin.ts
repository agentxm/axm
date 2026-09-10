import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createNodesFromFiles } from "nx/src/devkit-exports";
import type { CreateNodesResultV2, CreateNodesV2 } from "nx/src/devkit-exports";

/**
 * Placement is the single authority for a library's strategic domain.
 *
 * `packages/<tier>/<name>` contributes `domain:<tier>` to the project graph;
 * `apps/*` and `tools/*` carry no domain. A `packages/*` project outside a
 * tier, or a project that authors its own `domain:*` tag, fails graph
 * construction so the layout can never drift from the tags that the module
 * boundary rules enforce.
 */
export const placementGlob = "{apps,packages,tools}/**/project.json";

const DOMAIN_TIERS = ["core", "supporting", "generic"] as const;

const isDomainTier = (segment: string): segment is (typeof DOMAIN_TIERS)[number] =>
  DOMAIN_TIERS.some((tier) => tier === segment);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readAuthoredTags = (projectFile: string): ReadonlyArray<string> => {
  const parsed: unknown = JSON.parse(readFileSync(projectFile, "utf8"));
  const tags = isRecord(parsed) ? parsed["tags"] : undefined;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
};

/**
 * The `domain:*` tag a project root implies: one of the tiers for
 * `packages/<tier>/<name>`, none for `apps/<name>` and `tools/<name>`.
 * Any other placement is unclassified and is an error.
 */
export const inferDomainTag = (projectRoot: string): string | undefined => {
  const [top, second, third, ...rest] = projectRoot.split("/");
  if (top === "packages") {
    if (second !== undefined && isDomainTier(second) && third !== undefined && rest.length === 0) {
      return `domain:${second}`;
    }
    throw new Error(
      `Unclassified placement: ${projectRoot} must live under packages/{${DOMAIN_TIERS.join(",")}}/<name>.`,
    );
  }
  if ((top === "apps" || top === "tools") && second !== undefined && third === undefined) {
    return undefined;
  }
  throw new Error(
    `Unclassified placement: ${projectRoot} is not an apps/<name>, packages/<tier>/<name>, or tools/<name> project.`,
  );
};

/** Tags the plugin contributes for a project root, given the tags it authors. */
export const placementTags = (
  projectRoot: string,
  authoredTags: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const inferred = inferDomainTag(projectRoot);
  const authoredDomains = authoredTags.filter((tag) => tag.startsWith("domain:"));
  if (authoredDomains.length > 0) {
    throw new Error(
      `${projectRoot}/project.json authors ${authoredDomains.join(", ")}; domain:* is inferred from placement` +
        `${inferred === undefined ? "" : ` (${inferred})`} and must not be authored.`,
    );
  }
  return inferred === undefined ? [] : [inferred];
};

export const createNodesV2: CreateNodesV2 = [
  placementGlob,
  (configFiles, options, context): Promise<CreateNodesResultV2> =>
    createNodesFromFiles(
      (configFile) => {
        const projectRoot = dirname(configFile);
        const tags = placementTags(
          projectRoot,
          readAuthoredTags(join(context.workspaceRoot, configFile)),
        );
        return { projects: { [projectRoot]: { tags: [...tags] } } };
      },
      configFiles,
      options,
      context,
    ),
];
