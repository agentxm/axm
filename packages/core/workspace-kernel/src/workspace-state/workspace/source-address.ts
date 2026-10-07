/** Portable, reversible spelling of source coordinates, independent of snapshots. */
import * as Data from "effect/Data";
import * as Result from "effect/Result";

export class SourceAddressInvalid extends Data.TaggedError("SourceAddressInvalid")<{
  readonly detail: string;
}> {}

const invalid = (detail: string) => Result.fail(new SourceAddressInvalid({ detail }));
const reservedWindowsName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const safeByte = (byte: number): boolean =>
  (byte >= 65 && byte <= 90) ||
  (byte >= 97 && byte <= 122) ||
  (byte >= 48 && byte <= 57) ||
  byte === 64 ||
  byte === 95 ||
  byte === 45 ||
  byte === 46;

/** Escape UTF-8 bytes with ~hh; the escape marker itself is always escaped. */
export const encodeSourceSegment = (
  segment: string,
): Result.Result<string, SourceAddressInvalid> => {
  if (
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    segment.includes("\u0000") ||
    /[/\\]/u.test(segment)
  )
    return invalid(
      "Source coordinates must contain non-empty segments without traversal or separators",
    );
  const bytes = new TextEncoder().encode(segment);
  if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) !== segment)
    return invalid("Source coordinate contains an invalid Unicode sequence");
  const reserved =
    reservedWindowsName.test(segment) ||
    segment === "_local" ||
    /^(?:\.axm|axm\.json)$/iu.test(segment);
  const operationalSuffix = /\.axm-(?:staging|backup)$/iu.exec(segment);
  const operationalDot =
    operationalSuffix === null
      ? -1
      : new TextEncoder().encode(segment.slice(0, operationalSuffix.index)).length;
  const trailing = segment.length - (segment.match(/[. ]+$/u)?.[0].length ?? 0);
  const trailingBytes = new TextEncoder().encode(segment.slice(0, trailing)).length;
  const encoded = Array.from(bytes, (byte, index) =>
    safeByte(byte) &&
    !(reserved && index === 0) &&
    index !== operationalDot &&
    index < trailingBytes
      ? String.fromCharCode(byte)
      : `~${byte.toString(16).padStart(2, "0")}`,
  ).join("");
  return encoded.length <= 255
    ? Result.succeed(encoded)
    : invalid(
        "Encoded source segment exceeds the filesystem's 255-byte limit; select a shorter source coordinate",
      );
};

/** Strict inverse: reject alternate spellings rather than accepting ambiguous decoding. */
export const decodeSourceSegment = (
  encoded: string,
): Result.Result<string, SourceAddressInvalid> => {
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    const character = encoded[index];
    if (character === "~") {
      const hex = encoded.slice(index + 1, index + 3);
      if (!/^[0-9a-f]{2}$/u.test(hex)) return invalid("Invalid source-coordinate escape");
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
    } else if (character !== undefined && character.charCodeAt(0) < 128) {
      bytes.push(character.charCodeAt(0));
    } else return invalid("Source-coordinate spelling must be ASCII");
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      new Uint8Array(bytes),
    );
  } catch {
    return invalid("Invalid UTF-8 source-coordinate escape");
  }
  const canonical = encodeSourceSegment(decoded);
  return Result.isSuccess(canonical) && canonical.success === encoded
    ? Result.succeed(decoded)
    : invalid("Non-canonical or unsafe source-coordinate spelling");
};

export const encodeSourcePath = (
  segments: ReadonlyArray<string>,
): Result.Result<string, SourceAddressInvalid> => {
  const encoded: string[] = [];
  for (const segment of segments) {
    const result = encodeSourceSegment(segment);
    if (Result.isFailure(result)) return result;
    encoded.push(result.success);
  }
  const joined = encoded.join("/");
  return joined.length <= 4095
    ? Result.succeed(joined)
    : invalid(
        "Encoded source path exceeds the filesystem path limit; select shorter source coordinates",
      );
};

export const sourceUrlCoordinates = (
  url: URL,
): Result.Result<ReadonlyArray<string>, SourceAddressInvalid> => {
  if (
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.username !== "" && url.protocol !== "ssh:")
  )
    return invalid("Source address must not contain credentials, query parameters or fragments");
  if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol) || url.hostname === "")
    return invalid("Source address requires a supported network transport and host");
  const segments: string[] = [];
  const hostname = url.hostname.toLowerCase();
  const defaultPort =
    (url.protocol === "ssh:" && url.port === "22") ||
    (url.protocol === "git:" && url.port === "9418");
  segments.push(`${hostname}${url.port === "" || defaultPort ? "" : `:${url.port}`}`);
  const path = url.pathname.replace(/^\//u, "").replace(/\/$/u, "");
  if (path !== "") {
    for (const raw of path.split("/")) {
      let decoded: string;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        return invalid("Source address contains invalid percent encoding");
      }
      if (/%(?:2e|2f|5c)/iu.test(decoded))
        return invalid("Source address contains ambiguous encoded traversal or separators");
      const encoded = encodeSourceSegment(decoded);
      if (Result.isFailure(encoded)) return Result.fail(encoded.failure);
      segments.push(decoded);
    }
  }
  return Result.succeed(segments);
};

/** A file endpoint retains absolute local or volume identity, never a fabricated host. */
export const fileSourceCoordinates = (
  url: URL,
): Result.Result<ReadonlyArray<string>, SourceAddressInvalid> => {
  if (
    url.protocol !== "file:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  )
    return invalid(
      "File source address must not contain credentials, query parameters or fragments",
    );
  const segments: string[] = [];
  for (const segment of url.pathname.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return invalid("File source address contains invalid percent encoding");
    }
    if (decoded.includes("/") || decoded.includes("\\") || decoded === ".." || decoded === ".")
      return invalid("File source address contains encoded separators or traversal");
    segments.push(decoded);
  }
  let filePath = segments.join("/");
  if (/^\/[A-Za-z]:\//u.test(filePath)) filePath = filePath.slice(1);
  if (url.hostname !== "") filePath = `//${url.hostname}${filePath}`;
  return localSourceCoordinates(filePath);
};

/** Local addresses retain the project anchor or the external filesystem root. */
export const localSourceCoordinates = (
  value: string,
): Result.Result<ReadonlyArray<string>, SourceAddressInvalid> => {
  const normalized = value.replaceAll("\\", "/");
  if (/^[A-Za-z]:(?!\/)/u.test(normalized))
    return invalid("External local sources require an absolute drive path");
  let coordinates: ReadonlyArray<string>;
  if (normalized.startsWith("//"))
    coordinates = ["absolute", "unc", ...normalized.slice(2).split("/")];
  else {
    const drive = /^([A-Za-z]):\/(.*)$/u.exec(normalized);
    coordinates =
      drive !== null
        ? [
            "absolute",
            `drive-${drive[1]?.toUpperCase()}`,
            ...(drive[2] ?? "").split("/").filter(Boolean),
          ]
        : normalized.startsWith("/")
          ? ["absolute", "root", ...normalized.slice(1).split("/").filter(Boolean)]
          : [
              "project",
              ...normalized.split("/").filter((segment) => segment !== "." && segment !== ""),
            ];
  }
  return Result.map(encodeSourcePath(coordinates), () => coordinates);
};
