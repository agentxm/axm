import { pickAsk, type AskKey, type PickOption } from "../../screen/ask/ask.js";
import { initialPickState, reducePick, type PickState } from "../../screen/ask/pick.js";

const skill = (title: string, description: string, selected?: true): PickOption<string> => ({
  title,
  details: [description],
  value: title,
  group: "Skills",
  ...(selected === undefined ? {} : { selected }),
});

const subagent = (title: string, description: string): PickOption<string> => ({
  title,
  details: [description],
  value: title,
  group: "Subagents",
});

/** The canvas's toolkit: four skills, two of them picked, and two subagents. */
export const toolkitPick = pickAsk({
  question: "Which extensions should be installed?",
  label: "Extensions",
  noun: { one: "extension", other: "extensions" },
  options: [
    skill("code-review", "Reviews a diff before you open a pull request", true),
    skill("triage", "Sorts incoming issues by severity", true),
    skill("changelog", "Drafts release notes from merged work"),
    skill("standup", "Summarises yesterday from your commits"),
    subagent("reviewer", "A second reader for risky changes"),
    subagent("planner", "Breaks a goal into ordered tasks"),
  ],
});

const agent = (title: string, details: ReadonlyArray<string>, selected?: true) => ({
  title,
  details,
  value: title,
  ...(selected === undefined ? {} : { selected }),
});

/** Setup's agents as the canvas draws them: three found and picked, the rest offered. */
export const agentsPick = pickAsk({
  question: "Which agents should AXM configure?",
  label: "Agents",
  noun: { one: "agent", other: "agents" },
  min: 1,
  options: [
    agent("Claude Code", ["detected in project", "suggested"], true),
    agent("Codex", ["detected in project", "suggested"], true),
    agent("Cursor", ["detected on workstation"], true),
    agent("Gemini CLI", ["detected on workstation"]),
    ...["Cline", "Windsurf", "GitHub Copilot", "Amp", "OpenCode", "Goose", "Roo Code", "Kiro"].map(
      (title) => agent(title, []),
    ),
  ],
});

const press = (name: string): AskKey => ({
  name,
  ...(name.length === 1 ? { char: name } : {}),
  ctrl: false,
});

/** Where `keys` leave the toolkit list, from where it opens. */
export const toolkitAfter = (keys: ReadonlyArray<string>): PickState =>
  keys.reduce((state, name) => {
    const action = reducePick(toolkitPick, state, press(name));
    return action._tag === "Next" ? action.state : state;
  }, initialPickState(toolkitPick));
