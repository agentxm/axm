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

export type ManagedFileSource =
  | { readonly kind: "workspace-authored"; readonly path: string }
  | { readonly kind: "workspace-config"; readonly path: string }
  | { readonly kind: "acquired"; readonly path: string }
  | { readonly kind: "bundled"; readonly path: string };

export interface ManagedFileProvenance {
  readonly ext: string;
  readonly source: ManagedFileSource;
}

export interface ManagedFileBannerOptions extends ManagedFileProvenance {
  readonly helpTopic: string;
  readonly format: ManagedFileFormat;
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

const markerLine = (options: ManagedFileBannerOptions): string =>
  serializeMarker(
    {
      kind: MARKER_KIND_FILE,
      v: MARKER_VERSION,
      ext: options.ext,
      src: options.source.path,
    },
    styleFor(options.format),
  );

const guidanceLines = (options: ManagedFileBannerOptions): ReadonlyArray<string> => {
  switch (options.source.kind) {
    case "workspace-authored":
      return [
        "AXM managed projection — do not edit directly.",
        `Source: ${options.source.path}`,
        "Change the source, then run `axm sync`.",
      ];
    case "workspace-config":
      return [
        "AXM managed projection — do not edit directly.",
        `Configuration source: ${options.source.path}`,
        "Change the configuration source, then run `axm sync`.",
      ];
    case "acquired":
      return [
        "AXM managed projection — do not edit directly.",
        `Source: ${options.source.path} (acquired, immutable)`,
        "Use `axm fork` to create an authored copy before customizing.",
      ];
    case "bundled":
      return [
        "AXM managed projection — do not edit directly.",
        `Source: ${options.source.path} (bundled with AXM)`,
        "Manage this source through AXM; do not modify it directly.",
      ];
  }
};

const makeMarkdownBanner = (options: ManagedFileBannerOptions): string => {
  const marker = markerLine(options);
  const guidance = guidanceLines(options)
    .map((line) => `     ${line}`)
    .join("\n");
  return `${marker.slice(0, -" -->".length)}
${guidance}
     Learn more: \`axm help ${options.helpTopic}\` -->`;
};

const makeTomlBanner = (options: ManagedFileBannerOptions): string => {
  const guidance = guidanceLines(options)
    .map((line) => `# ${line}`)
    .join("\n");
  return `${markerLine(options)}
${guidance}
# Learn more: \`axm help ${options.helpTopic}\``;
};

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
