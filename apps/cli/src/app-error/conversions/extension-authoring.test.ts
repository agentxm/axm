/**
 * Byte-for-byte conversion table for the extension-authoring typed failure family.
 * Each row travels the real `toAppError` path and pins the envelope its
 * construction site rendered before decoupling; a wording change in the
 * producing module fails here rather than silently reaching the terminal.
 */

import { describe, expect, it } from "vitest";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { AppError, type AppErrorCode } from "../app-error.js";
import { isKnownFailure, toAppError, type KnownFailure } from "../conversions.js";
import {
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
} from "@agentxm/extension-authoring";

const ioCause = new Error("EACCES");

interface ConversionCase {
  readonly name: string;
  readonly failure: KnownFailure;
  readonly code: AppErrorCode;
  readonly detail: string;
  readonly title?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  /** Expected `cause`; "self" pins the typed failure itself as the cause. */
  readonly cause?: unknown | "self";
}

const cases: ReadonlyArray<ConversionCase> = [
  {
    name: "CreateNameConfigured",
    failure: new CreateNameConfigured({ subject: "Skill", name: "demo" }),
    code: "conflict",
    detail: "Skill 'demo' already exists in settings",
    suggestions: [{ description: "Choose a different name or remove the existing skill first" }],
  },
  {
    name: "CreateDestinationInspectionFailed",
    failure: new CreateDestinationInspectionFailed({ path: "/w/skills/demo", cause: ioCause }),
    code: "internal",
    detail: "Failed to inspect create destination: /w/skills/demo",
    cause: ioCause,
  },
  {
    name: "ForkPackageInvalid",
    failure: new ForkPackageInvalid({
      detail: "Manifest could not be read: /w/pkg/skill.json",
      cause: ioCause,
    }),
    code: "validation",
    detail: "Manifest could not be read: /w/pkg/skill.json",
    cause: ioCause,
  },
  {
    name: "ForkPackageConflict",
    failure: new ForkPackageConflict({ detail: "Fork target already exists: /w/authored/demo" }),
    code: "conflict",
    detail: "Fork target already exists: /w/authored/demo",
  },
  {
    name: "ForkPackageFailed",
    failure: new ForkPackageFailed({
      detail: "Fork target manifest could not be written: /w/authored/demo/skill.json",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Fork target manifest could not be written: /w/authored/demo/skill.json",
    cause: ioCause,
  },
  {
    name: "NativeImportUnsupported",
    failure: new NativeImportUnsupported({ type: "rule" }),
    code: "usage",
    detail: "Native package import is not supported for rule",
  },
  {
    name: "NativeImportInvalid",
    failure: new NativeImportInvalid({
      detail: "Native content must contain YAML frontmatter: /w/src/SKILL.md",
    }),
    code: "validation",
    detail: "Native content must contain YAML frontmatter: /w/src/SKILL.md",
  },
  {
    name: "NativeImportConflict",
    failure: new NativeImportConflict({ targetDir: "/w/authored/demo" }),
    code: "conflict",
    detail: "Import target already exists: /w/authored/demo",
  },
  {
    name: "NativeImportFailed",
    failure: new NativeImportFailed({
      detail: "Native import failed for /source",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Native import failed for /source",
    cause: ioCause,
  },
];

describe("extension-authoring conversions", () => {
  it.each(cases.map((entry) => [entry.name, entry] as const))(
    "converts %s byte-identically",
    (_name, entry) => {
      const converted = toAppError(entry.failure);
      expect(converted).toBeInstanceOf(AppError);
      expect(converted.code).toBe(entry.code);
      expect(converted.detail).toBe(entry.detail);
      if (entry.title !== undefined) {
        expect(converted.title).toBe(entry.title);
      }
      if (entry.suggestions === undefined) {
        expect(converted.suggestions).toBeUndefined();
      } else {
        expect(converted.suggestions).toEqual(entry.suggestions);
      }
      if (entry.cause === "self") {
        expect(converted.cause).toBe(entry.failure);
      } else {
        expect(converted.cause).toEqual(entry.cause);
      }
    },
  );

  it("registers every table row as a known failure", () => {
    for (const entry of cases) {
      expect(isKnownFailure(entry.failure)).toBe(true);
    }
  });
});
