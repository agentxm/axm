import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

export type DetectionSource =
  | "executable-path"
  | "resolved-executable-path"
  | "module-url"
  | "package-layout"
  | "package-manager-query"
  | "install-metadata"
  | "conflicting"
  | "unknown";

interface DetectionFields {
  readonly detectionSource?: DetectionSource;
  readonly evidence?: ReadonlyArray<string>;
  readonly confidence?: "high" | "medium" | "low";
  readonly managerOwnedExecutable?: string;
}

export class Script extends Data.TaggedClass("Script")<
  DetectionFields & { readonly execPath: string }
> {}

export class Homebrew extends Data.TaggedClass("Homebrew")<
  DetectionFields & { readonly execPath: string }
> {}

export class Npm extends Data.TaggedClass("Npm")<
  DetectionFields & { readonly importUrl: string }
> {}

export class Pnpm extends Data.TaggedClass("Pnpm")<
  DetectionFields & { readonly importUrl: string }
> {}

export class Yarn extends Data.TaggedClass("Yarn")<
  DetectionFields & {
    readonly importUrl: string;
    readonly managerMajorVersion?: number;
  }
> {}

export type UnknownReason = "ambiguous" | "conflicting" | "unsupported" | "unknown";

export class Unknown extends Data.TaggedClass("Unknown")<
  DetectionFields & { readonly reason?: UnknownReason }
> {
  constructor(props: DetectionFields & { readonly reason?: UnknownReason } = {}) {
    super(props);
  }
}

export type InstallMethodType = Script | Homebrew | Npm | Pnpm | Yarn | Unknown;

export const InstallMethodLiteral = Schema.Literals([
  "script",
  "homebrew",
  "npm",
  "pnpm",
  "yarn",
] as const).annotate({
  identifier: "InstallMethodLiteral",
  title: "Install Method",
  description: "The installer or package manager that owns AXM.",
});
export type InstallMethodName = typeof InstallMethodLiteral.Type;

export const methodName = (method: InstallMethodType): InstallMethodName | "unknown" => {
  switch (method._tag) {
    case "Script":
      return "script";
    case "Homebrew":
      return "homebrew";
    case "Npm":
      return "npm";
    case "Pnpm":
      return "pnpm";
    case "Yarn":
      return "yarn";
    case "Unknown":
      return "unknown";
  }
};

export const methodExecutablePath = (method: InstallMethodType): string | null => {
  switch (method._tag) {
    case "Script":
    case "Homebrew":
      return method.execPath;
    case "Npm":
    case "Pnpm":
    case "Yarn":
      return method.managerOwnedExecutable ?? null;
    case "Unknown":
      return null;
  }
};
