import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export type LogLevel = "message" | "info" | "success" | "step" | "warn" | "error";

export type LogMessage =
  | { readonly _tag: "message"; readonly message: string }
  | { readonly _tag: "info"; readonly message: string }
  | { readonly _tag: "success"; readonly message: string }
  | { readonly _tag: "step"; readonly message: string }
  | { readonly _tag: "warn"; readonly message: string }
  | { readonly _tag: "error"; readonly message: string };

export interface TreeNode<T> {
  readonly data: T;
  readonly children?: ReadonlyArray<TreeNode<T>>;
}

export interface TreeDef<T> {
  readonly label: (item: T) => string;
  readonly detail?: (item: T) => string | undefined;
  readonly icon?: (item: T) => string | undefined;
}

export interface ListPayload<T extends object> extends SuccessOptions {
  readonly items: ReadonlyArray<T>;
  readonly count?: number;
  readonly emptyMessage?: string;
}

export interface DetailOptions extends SuggestionOptions {
  readonly title?: string;
}

export interface TreePayload<T extends object> extends SuccessOptions {
  readonly roots: ReadonlyArray<TreeNode<T>>;
}

export interface BoxOptions {
  readonly contentAlignment?: "left" | "center" | "right";
  readonly titleAlignment?: "left" | "center" | "right";
  readonly width?: number;
  readonly padding?: number;
  readonly rounded?: boolean;
}

export interface SuggestionOptions {
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly withoutSuggestions?: boolean;
}

export interface SuccessOptions extends SuggestionOptions {
  readonly summary?: string;
}

export interface ResultOptions extends SuccessOptions {
  readonly ok?: boolean;
}
