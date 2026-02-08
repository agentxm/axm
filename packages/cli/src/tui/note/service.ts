import pc from "picocolors";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface NoteService {
  readonly display: (message: string, title?: string) => Effect.Effect<void>;
}

export class Note extends Context.Tag("@axm.sh/cli/tui/Note")<Note, NoteService>() {}

const PADDING = 2;

function renderBox(message: string, title?: string): string {
  const lines = message.split("\n");
  const maxLineWidth = Math.max(...lines.map((l) => l.length));
  const titleWidth = title ? title.length + 2 : 0; // " Title " with spaces around
  const innerWidth = Math.max(maxLineWidth + PADDING * 2, titleWidth + 2);

  const topBorder =
    title !== undefined
      ? `${pc.gray("╭─")} ${pc.bold(title)} ${pc.gray("─".repeat(innerWidth - titleWidth - 2) + "╮")}`
      : pc.gray(`╭${"─".repeat(innerWidth)}╮`);

  const emptyLine = `${pc.gray("│")}${" ".repeat(innerWidth)}${pc.gray("│")}`;

  const contentLines = lines.map((line) => {
    const pad = " ".repeat(PADDING);
    const rightPad = " ".repeat(innerWidth - PADDING - line.length);
    return `${pc.gray("│")}${pad}${line}${rightPad}${pc.gray("│")}`;
  });

  const bottomBorder = pc.gray(`╰${"─".repeat(innerWidth)}╯`);

  return [topBorder, emptyLine, ...contentLines, emptyLine, bottomBorder, ""].join("\n");
}

const makeLiveNoteService = (): NoteService => ({
  display: (message, title) =>
    Effect.sync(() => {
      process.stdout.write(renderBox(message, title));
    }),
});

export const NoteLive: Layer.Layer<Note> = Layer.succeed(Note, makeLiveNoteService());
