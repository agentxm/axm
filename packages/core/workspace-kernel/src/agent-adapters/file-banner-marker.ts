/**
 * Whole-file banner marker of Subagent projections and instruction copies.
 *
 * Region fences no longer use this grammar. It remains only until whole-file
 * projections stop carrying banners, when this module is deleted.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";

const FILE_BANNER_VERSION = "1";

export type FileBannerSyntax = "markdown" | "toml";

export interface FileBannerMarker {
  readonly kind: "axm:file";
  readonly ext: string;
  readonly src: string;
  readonly generation?: string | undefined;
}

export const fileBannerSyntaxForPath = (filePath: string): Option.Option<FileBannerSyntax> =>
  filePath.endsWith(".md")
    ? Option.some("markdown")
    : filePath.endsWith(".toml")
      ? Option.some("toml")
      : Option.none();

const encodeValue = (value: string): string =>
  /[\s%=~]/u.test(value) ? `~${encodeURIComponent(JSON.stringify(value))}` : value;

const decodeValue = (value: string): Option.Option<string> => {
  if (!value.startsWith("~")) return Option.some(value);
  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(value.slice(1)));
    return typeof decoded === "string" ? Option.some(decoded) : Option.none();
  } catch {
    return Option.none();
  }
};

/** Serialize one banner marker line. */
export const serializeFileBannerMarker = (
  marker: FileBannerMarker,
  syntax: FileBannerSyntax,
): string => {
  const attributes = [
    `v=${FILE_BANNER_VERSION}`,
    `ext=${encodeValue(marker.ext)}`,
    `src=${encodeValue(marker.src)}`,
    ...(marker.generation === undefined ? [] : [`gen=${encodeValue(marker.generation)}`]),
  ].join(" ");
  return syntax === "markdown" ? `<!-- axm:file ${attributes} -->` : `# axm:file ${attributes}`;
};

const parseLine = (line: string, syntax: FileBannerSyntax): Option.Option<FileBannerMarker> => {
  const trimmed = line.trim();
  const payload =
    syntax === "toml"
      ? trimmed.startsWith("#")
        ? trimmed.slice(1).trim()
        : undefined
      : trimmed.startsWith("<!--")
        ? trimmed.slice("<!--".length, trimmed.endsWith("-->") ? -"-->".length : undefined).trim()
        : undefined;
  if (payload === undefined) return Option.none();
  const [head, ...parts] = payload.split(/\s+/u);
  if (head !== "axm:file") return Option.none();
  const attributes = new Map<string, string>();
  for (const part of parts) {
    const equalsIndex = part.indexOf("=");
    if (equalsIndex <= 0 || equalsIndex === part.length - 1) return Option.none();
    const key = part.slice(0, equalsIndex);
    if (attributes.has(key)) return Option.none();
    const value = decodeValue(part.slice(equalsIndex + 1));
    if (Option.isNone(value)) return Option.none();
    attributes.set(key, value.value);
  }
  const ext = attributes.get("ext");
  const src = attributes.get("src");
  const generation = attributes.get("gen");
  return attributes.get("v") !== FILE_BANNER_VERSION || ext === undefined || src === undefined
    ? Option.none()
    : Option.some({
        kind: "axm:file",
        ext,
        src,
        ...(generation === undefined ? {} : { generation }),
      });
};

/** The banner marker within the first lines of `content`, when it carries one. */
export const fileBannerMarker = (
  content: string,
  syntax: FileBannerSyntax,
): Option.Option<FileBannerMarker> => {
  for (const line of content.split(/\r?\n/u).slice(0, 12)) {
    const parsed = parseLine(line, syntax);
    if (Option.isSome(parsed)) return parsed;
  }
  return Option.none();
};
