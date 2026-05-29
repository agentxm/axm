import * as ServiceMap from "effect/Context";
import { Command } from "effect/unstable/cli";

export const CLI_DOC_CATEGORIES = ["extensions", "workspace", "authentication", "help"] as const;

export const CLI_DOC_PAGE_MODES = ["parent-page", "own-page", "hidden"] as const;

export type CliDocCategory = (typeof CLI_DOC_CATEGORIES)[number];
export type CliDocPageMode = (typeof CLI_DOC_PAGE_MODES)[number];

export interface CommandRequirements {
  readonly auth?: boolean;
  readonly workspace?: boolean;
  readonly registry?: boolean;
  readonly network?: boolean;
  readonly configuredAgents?: boolean;
}

export interface CommandSideEffects {
  readonly writesFiles?: boolean;
  readonly mutatesWorkspace?: boolean;
  readonly writesLockfile?: boolean;
  readonly mutatesRegistry?: boolean;
  readonly destructive?: boolean;
}

export interface DocsCallout {
  readonly kind: "note" | "tip" | "warning";
  readonly text: string;
}

export interface RelatedReference {
  readonly label: string;
  readonly href: string;
}

export interface CommandDocsMeta {
  readonly navLabel?: string;
  readonly slug?: string;
  readonly order?: number;
  readonly category?: CliDocCategory;
  readonly summary?: string;
  readonly whenToUse?: string;
  readonly notes?: ReadonlyArray<DocsCallout>;
  readonly requirements?: CommandRequirements;
  readonly sideEffects?: CommandSideEffects;
  readonly related?: ReadonlyArray<RelatedReference>;
  readonly pageMode?: CliDocPageMode;
}

export const CommandDocs: ServiceMap.Reference<CommandDocsMeta> = ServiceMap.Reference(
  "axm/cli-reference/command-docs",
  {
    defaultValue: () => ({}),
  },
);

export const withCommandDocs = (meta: CommandDocsMeta) => Command.annotate(CommandDocs, meta);
