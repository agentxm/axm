/**
 * Managed-file banner insertion for materialized extension artifacts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { parseFrontmatterSync } from "./frontmatter.js";

export type ManagedFileFormat = "markdown" | "toml";

export interface ManagedFileBannerOptions {
  readonly editPath: string;
  readonly helpTopic: string;
  readonly format: ManagedFileFormat;
}

const MANAGED_FILE_BANNER_MARKER = "AXM managed file";

export const managedFileFormatForPath = (filePath: string): ManagedFileFormat | undefined => {
  if (filePath.endsWith(".md")) return "markdown";
  if (filePath.endsWith(".toml")) return "toml";
  return undefined;
};

const makeMarkdownBanner = (options: ManagedFileBannerOptions): string =>
  `<!-- AXM managed file — do not edit directly, instead:
     1. Edit: ${options.editPath}
     2. Sync: \`axm sync\`
     Learn more: \`axm help ${options.helpTopic}\` -->`;

const makeTomlBanner = (options: ManagedFileBannerOptions): string =>
  `# AXM managed file — do not edit directly, instead:
# 1. Edit: ${options.editPath}
# 2. Sync: \`axm sync\`
# Learn more: \`axm help ${options.helpTopic}\``;

const insertMarkdownBanner = (content: string, options: ManagedFileBannerOptions): string => {
  const parsed = parseFrontmatterSync(content);
  const insertAt = parsed.frontmatter === undefined ? 0 : content.length - parsed.body.length;
  const banner = `${makeMarkdownBanner(options)}\n\n`;
  return `${content.slice(0, insertAt)}${banner}${content.slice(insertAt)}`;
};

export const insertManagedFileBanner = (
  content: string,
  options: ManagedFileBannerOptions,
): string => {
  if (content.includes(MANAGED_FILE_BANNER_MARKER)) return content;

  switch (options.format) {
    case "markdown":
      return insertMarkdownBanner(content, options);
    case "toml":
      return `${makeTomlBanner(options)}\n\n${content}`;
  }
};
