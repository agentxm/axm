import { Command } from "effect/unstable/cli";

import { boxCommand } from "./box.js";
import { detailCommand } from "./detail.js";
import { introCommand } from "./intro.js";
import { logCommand } from "./log.js";
import { noteCommand } from "./note.js";
import { progressCommand } from "./progress.js";
import { rawCommand } from "./raw.js";
import { resultCommand } from "./result.js";
import { runTasksCommand } from "./run-tasks.js";
import { sinkCommand } from "./sink.js";
import { spinnerCommand } from "./spinner.js";
import { streamLogCommand } from "./stream-log.js";
import { tableCommand } from "./table.js";
import { taskLogCommand } from "./task-log.js";
import { treeCommand } from "./tree.js";

export const outputsCommand = Command.make("outputs").pipe(
  Command.withDescription("Demo output renderer methods"),
  Command.withExamples([
    {
      command: 'axm-spike outputs log "Build succeeded" --level success',
      description: "Render a single log message",
    },
    {
      command: 'axm-spike outputs box "Hello from axm-spike" --title Demo',
      description: "Render bordered content with flags",
    },
    {
      command: "axm-spike outputs raw --json",
      description: "Inspect the JSON contract for a renderer demo",
    },
  ]),
  Command.withSubcommands([
    logCommand,
    introCommand,
    noteCommand,
    boxCommand,
    spinnerCommand,
    progressCommand,
    taskLogCommand,
    runTasksCommand,
    tableCommand,
    detailCommand,
    treeCommand,
    streamLogCommand,
    resultCommand,
    rawCommand,
    sinkCommand,
  ]),
);
