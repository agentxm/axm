/**
 * The canonical spelling of a git, HTTP, or path source locator, so two
 * spellings of one source compare equal.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  forgeCloneUrl,
  parseForgeBrowserUrl,
  parseForgeCoordinate,
  type ForgeCoordinate,
} from "@agentxm/extension-model/unstable/sources/forge-grammar";
import { httpSourceKind } from "@agentxm/extension-model/unstable/sources/http-artifact";
import {
  parseInputPattern,
  type InputPattern,
} from "@agentxm/extension-model/unstable/sources/parser";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import type { SourceParams } from "@agentxm/extension-model/unstable/sources/types";

const decodeFragment = Option.liftThrowable(decodeURIComponent);

/** The ref a `#ref` fragment names, decoded when it is percent-encoded. */
const fragmentRef = (fragment: string): Option.Option<string> => {
  const raw = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return raw === "" ? Option.none() : Option.orElseSome(decodeFragment(raw), () => raw);
};

const forgeSource = (coordinate: ForgeCoordinate): SourceParams => ({
  type: "git",
  url: forgeCloneUrl(coordinate),
  ref: coordinate.ref,
  subPath: coordinate.subPath,
});

const parseUrl = Option.liftThrowable((href: string) => new URL(href));

const urlSource = (url: URL): Option.Option<SourceParams> => {
  if (url.protocol !== "https:" && url.protocol !== "ssh:" && url.protocol !== "git:")
    return Option.none();
  const kind = httpSourceKind(url);
  if (kind !== undefined) {
    const fragment = url.hash.slice(1);
    const bare = new URL(url.href);
    bare.hash = "";
    if (fragment === "") return Option.some({ type: "http", url: bare, kind });
    return fragment.startsWith("skill=")
      ? Option.map(decodeFragment(fragment.slice("skill=".length)), (entry) => ({
          type: "http" as const,
          url: bare,
          kind,
          entry,
        }))
      : Option.none();
  }
  if (url.hash.startsWith("#axm:")) {
    const selection = new URLSearchParams(url.hash.slice("#axm:".length));
    return Option.map(Option.fromNullishOr(selection.get("path")), (path) => ({
      type: "git" as const,
      url,
      ref: Option.fromNullishOr(selection.get("ref")),
      subPath: Option.some(path),
    }));
  }
  return Option.some(
    Option.match(parseForgeBrowserUrl(url), {
      onSome: (coordinate) => ({
        ...forgeSource(coordinate),
        ref: Option.orElse(coordinate.ref, () => fragmentRef(url.hash)),
      }),
      onNone: () => ({
        type: "git" as const,
        url,
        ref: fragmentRef(url.hash),
        subPath: Option.none(),
      }),
    }),
  );
};

/** The source a git, HTTP, or path locator spells, mirroring source resolution. */
const locatorSource = (pattern: InputPattern): Option.Option<SourceParams> => {
  switch (pattern.pattern) {
    case "shorthand-input":
      return Option.map(
        Result.getSuccess(parseForgeCoordinate(pattern.prefix, pattern.remainingInput)),
        forgeSource,
      );
    case "slash-pattern":
      return Option.some(forgeSource(pattern.coordinate));
    case "git-scp-address": {
      const refIndex = pattern.path.lastIndexOf("#");
      const path = refIndex < 0 ? pattern.path : pattern.path.slice(0, refIndex);
      return Option.map(
        parseUrl(`ssh://${pattern.user}@${pattern.host}/${path}`),
        (url): SourceParams => ({
          type: "git",
          url,
          ref: refIndex < 0 ? Option.none() : fragmentRef(pattern.path.slice(refIndex + 1)),
          subPath: Option.none(),
        }),
      );
    }
    case "url-input":
      return urlSource(pattern.url);
    case "file-path-pattern":
      return Option.some({ type: "local", path: pattern.path });
    case "name-input":
    case "registry-pattern-input":
    case "glob-input":
    case "workspace-pattern-input":
      return Option.none();
  }
};

/**
 * The canonical text of a source locator: the printed form of the source it
 * spells, so an authored clone URL, a forge shorthand, and a bare
 * `owner/repository` naming one repository agree. A locator that spells no
 * git, HTTP, or path source is kept as written.
 */
export const canonicalSourceLocator = (locator: string): string =>
  Option.match(
    Option.flatMap(parseInputPattern(locator), (parsed) => locatorSource(parsed.pattern)),
    { onNone: () => locator, onSome: printSourceParams },
  );
