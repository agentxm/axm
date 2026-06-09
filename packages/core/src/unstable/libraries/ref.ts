import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  EXTENSION_NAME_PATTERN,
  ExtensionNameSchema,
  type ExtensionName,
} from "../extensions/index.js";
import { HANDLE_PATTERN_SOURCE, HandleSchema, type Handle } from "../extensions/handle.js";

const LIBRARY_REF_PATTERN = new RegExp(
  `^(${HANDLE_PATTERN_SOURCE})\\/libraries\\/(${EXTENSION_NAME_PATTERN.source.slice(1, -1)})$`,
);

const INVALID_LIBRARY_REF_MESSAGE = "Expected Library ref in @handle/libraries/name form";

export const LibraryRefPartsSchema = Schema.Struct({
  owner: HandleSchema,
  name: ExtensionNameSchema,
}).annotate({
  identifier: "LibraryRefParts",
  title: "Library Ref Parts",
  description: "The owner and name parts of a Library reference.",
});

export type LibraryRefParts = Schema.Schema.Type<typeof LibraryRefPartsSchema>;

const decodeLibraryRefParts = Schema.decodeUnknownResult(LibraryRefPartsSchema);

export const LibraryRefSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(LIBRARY_REF_PATTERN, { message: INVALID_LIBRARY_REF_MESSAGE })),
  Schema.annotate({
    identifier: "LibraryRef",
    title: "Library Ref",
    description: "Canonical Library reference in @owner/libraries/<name> form.",
    examples: ["@acme/libraries/frontend"],
    message: INVALID_LIBRARY_REF_MESSAGE,
  }),
);

export type LibraryRef = Schema.Schema.Type<typeof LibraryRefSchema>;

export const parseLibraryRef = (input: string): LibraryRefParts | undefined => {
  const parts = input.split("/");
  if (parts.length !== 3) {
    return undefined;
  }

  const [owner, segment, name] = parts;
  if (owner === undefined || segment !== "libraries" || name === undefined) {
    return undefined;
  }

  const result = decodeLibraryRefParts({ owner, name });
  return Result.isSuccess(result) ? result.success : undefined;
};

export const parseLibraryRefOrThrow = (input: string): LibraryRefParts => {
  const parsed = parseLibraryRef(input);
  if (parsed === undefined) {
    throw new Error(INVALID_LIBRARY_REF_MESSAGE);
  }
  return parsed;
};

export const formatLibraryRef = (ref: {
  readonly owner: Handle;
  readonly name: ExtensionName;
}): string => `${ref.owner}/libraries/${ref.name}`;
