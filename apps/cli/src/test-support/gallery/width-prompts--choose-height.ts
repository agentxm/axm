import type { Doc } from "../../screen/doc.js";
import type { ChooseAsk } from "../../screen/ask/ask.js";
import { chooseDoc } from "../../screen/ask/choose.js";
import { liveRows, type TerminalSize } from "../../screen/scene.js";

const packages = [
  "api",
  "billing",
  "cli",
  "console",
  "docs",
  "emails",
  "gateway",
  "identity",
  "indexer",
  "ingest",
  "jobs",
  "ledger",
  "mailer",
  "metrics",
  "notifier",
  "payments",
  "registry",
  "reports",
  "search",
  "storage",
  "sync",
  "ui",
  "web",
  "webhooks",
];

const [firstPackage, ...remainingPackages] = packages;
if (firstPackage === undefined)
  throw new Error("The package gallery requires at least one option.");

/** A source list longer than any terminal it opens in, caret partway down. */
const longSource: ChooseAsk<string> = {
  _tag: "Choose",
  question: "Instructions source",
  note: "AXM will sync its contents to the selected agents' instruction files.",
  options: [
    {
      title: `packages/${firstPackage}/AGENTS.md`,
      details: ["existing"],
      value: firstPackage,
    },
    ...remainingPackages.map((name) => ({
      title: `packages/${name}/AGENTS.md`,
      details: ["existing"],
      value: name,
    })),
  ],
};

/**
 * A list's page follows the terminal height, so it never scrolls the screen
 * (*Width and height*, board `Width-prompts`, frame *list page size follows
 * terminal height*): the window keeps the caret in view and names the rest.
 */
export const widthPromptsChooseHeight = (terminal: TerminalSize): Doc =>
  chooseDoc(longSource, { index: 17 }, liveRows(terminal.rows));
