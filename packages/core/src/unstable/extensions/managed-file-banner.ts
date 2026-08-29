/** Managed-file banner insertion for materialized extension artifacts. */

import * as Option from "effect/Option";
import {
  MARKER_KIND_FILE,
  MARKER_VERSION,
  markerForFile,
  serializeMarker,
  type FileCommentStyle,
  type ManagedMarker,
} from "../projection/marker-grammar.js";
import { parseFrontmatterSync } from "./frontmatter.js";

export type ManagedFileFormat = "markdown" | "toml";

export interface ManagedFileBannerOptions {
  readonly editPath: string;
  readonly helpTopic: string;
  readonly format: ManagedFileFormat;
  readonly ext?: string | undefined;
}

export const managedFileFormatForPath = (filePath: string): ManagedFileFormat | undefined => {
  if (filePath.endsWith(".md")) return "markdown";
  if (filePath.endsWith(".toml")) return "toml";
  return undefined;
};

const styleFor = (format: ManagedFileFormat): FileCommentStyle =>
  format === "markdown"
    ? { kind: "block", open: "<!--", close: "-->" }
    : { kind: "line", prefix: "#" };

const extFromEditPath = (options: ManagedFileBannerOptions): string => {
  if (options.ext !== undefined) return options.ext;
  const match = options.editPath
    .replaceAll("\\", "/")
    .match(
      /(?:^|\/)agent_extensions\/[^/]+\/(@[^/]+)\/(skills|subagents|mcps|rules|hooks|knowledge|packs)\/([^/]+)/u,
    );
  const owner = match?.[1];
  const type = match?.[2];
  const name = match?.[3];
  return owner !== undefined && type !== undefined && name !== undefined
    ? `${owner}/${type}/${name}`
    : `@agentxm/${options.helpTopic}/managed-file`;
};

const markerLine = (options: ManagedFileBannerOptions): string =>
  serializeMarker(
    {
      kind: MARKER_KIND_FILE,
      v: MARKER_VERSION,
      ext: extFromEditPath(options),
      src: options.editPath,
    },
    styleFor(options.format),
  );

const makeMarkdownBanner = (options: ManagedFileBannerOptions): string => {
  const marker = markerLine(options);
  return `${marker.slice(0, -" -->".length)}
     AXM managed file — do not edit directly, instead:
     1. Edit: ${options.editPath}
     2. Sync: \`axm sync\`
     Learn more: \`axm help ${options.helpTopic}\` -->`;
};

const makeTomlBanner = (options: ManagedFileBannerOptions): string =>
  `${markerLine(options)}
# AXM managed file — do not edit directly, instead:
# 1. Edit: ${options.editPath}
# 2. Sync: \`axm sync\`
# Learn more: \`axm help ${options.helpTopic}\``;

const markdownBodyStart = (content: string): number => {
  const parsed = parseFrontmatterSync(content);
  return parsed.frontmatter === undefined ? 0 : content.length - parsed.body.length;
};

/** The `axm:file` ownership marker a managed file carries, when it has one. */
export const managedFileMarker = (
  content: string,
  format: ManagedFileFormat,
): Option.Option<Extract<ManagedMarker, { readonly kind: typeof MARKER_KIND_FILE }>> => {
  const body = format === "markdown" ? content.slice(markdownBodyStart(content)) : content;
  return markerForFile(body, styleFor(format));
};

const hasFileMarker = (content: string, format: ManagedFileFormat): boolean =>
  Option.isSome(managedFileMarker(content, format));

const insertMarkdownBanner = (content: string, options: ManagedFileBannerOptions): string => {
  const insertAt = markdownBodyStart(content);
  return `${content.slice(0, insertAt)}${makeMarkdownBanner(options)}\n\n${content.slice(insertAt)}`;
};

const stripMarkdownBanner = (content: string): string => {
  const insertAt = markdownBodyStart(content);
  const prefix = content.slice(0, insertAt);
  const body = content.slice(insertAt);
  if (!hasFileMarker(content, "markdown")) return content;
  const end = body.indexOf("-->");
  if (end < 0) return content;
  const remainder = body.slice(end + "-->".length).replace(/^(?:\r?\n){1,2}/u, "");
  return `${prefix}${remainder}`;
};

const stripTomlBanner = (content: string): string => {
  if (!hasFileMarker(content, "toml")) return content;
  const lines = content.split(/(?<=\n)/u);
  let index = 0;
  while (index < lines.length && lines[index]?.trimStart().startsWith("#")) index += 1;
  while (index < lines.length && lines[index]?.trim().length === 0) index += 1;
  return lines.slice(index).join("");
};

export const insertManagedFileBanner = (
  content: string,
  options: ManagedFileBannerOptions,
): string => {
  if (hasFileMarker(content, options.format)) return content;
  return options.format === "markdown"
    ? insertMarkdownBanner(content, options)
    : `${makeTomlBanner(options)}\n\n${content}`;
};

export const stripManagedFileBanner = (content: string, format: ManagedFileFormat): string =>
  format === "markdown" ? stripMarkdownBanner(content) : stripTomlBanner(content);

export const hasManagedFileBanner = (content: string): boolean =>
  hasFileMarker(content, "markdown") || hasFileMarker(content, "toml");
