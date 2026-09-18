import * as Result from "effect/Result";

import type { ChooseAsk, ChooseOption, InputAsk } from "../../screen/ask/ask.js";

export const agentsSource: ChooseOption<string> = {
  title: "AGENTS.md",
  details: ["recommended", "existing", "128 lines"],
  value: "AGENTS.md",
  selected: true,
};

/** Setup's instructions-source list as the canvas draws it. */
export const instructionSource: ChooseAsk<string> = {
  _tag: "Choose",
  question: "Instructions source",
  options: [
    agentsSource,
    { title: "CLAUDE.md", details: ["existing", "64 lines"], value: "CLAUDE.md" },
    { title: "Other…", details: ["type a file name"], value: "other" },
  ],
};

/** Setup's question for a source file the list did not offer. */
export const instructionFileName: InputAsk<string> = {
  _tag: "Input",
  question: "Instructions file name",
  note: "Relative to the project root. It will be created if it does not exist.",
  placeholder: "docs/AGENTS.md",
  validate: (raw) =>
    raw.trim().startsWith("/")
      ? Result.fail("Enter a path relative to the project root.")
      : Result.succeed(raw.trim()),
};
