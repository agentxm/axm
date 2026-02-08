import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  ConfirmLive,
  LogLive,
  MultiselectLive,
  NoteLive,
  PasswordInputLive,
  SelectLive,
  SpinnerLive,
  TextInputLive,
  Log,
  Spinner,
  Note,
  TextInput,
  PasswordInput,
  Confirm,
  Select,
  Multiselect,
} from "../tui/index.js";

const runLogDemo = () => {
  const program = Effect.gen(function* () {
    const log = yield* Log;
    yield* log.info("This is an info message");
    yield* log.warn("This is a warning message");
    yield* log.error("This is an error message");
    yield* log.success("This is a success message");
    yield* log.message("This is a plain message");
  });
  Effect.runPromise(program.pipe(Effect.provide(LogLive)));
};

const runSpinnerDemo = () => {
  const program = Effect.gen(function* () {
    const spinner = yield* Spinner;
    const handle = yield* spinner.start("Loading something...");
    yield* Effect.sleep("2 seconds");
    yield* handle.stop("Done loading!");
  });
  Effect.runPromise(program.pipe(Effect.provide(SpinnerLive)));
};

const runNoteDemo = () => {
  const program = Effect.gen(function* () {
    const note = yield* Note;
    yield* note.display("This is a note with a title.", "Welcome");
    yield* note.display("This is a note without a title.");
  });
  Effect.runPromise(program.pipe(Effect.provide(NoteLive)));
};

const runTextInputDemo = () => {
  const program = Effect.gen(function* () {
    const textInput = yield* TextInput;
    const log = yield* Log;
    const name = yield* textInput.prompt({
      message: "What is your name?",
      placeholder: "Enter your name...",
    });
    yield* log.success(`Hello, ${name}!`);
  });
  Effect.runPromise(program.pipe(Effect.provide(Layer.mergeAll(TextInputLive, LogLive))));
};

const runPasswordInputDemo = () => {
  const program = Effect.gen(function* () {
    const passwordInput = yield* PasswordInput;
    const log = yield* Log;
    const token = yield* passwordInput.prompt({ message: "Enter your token:" });
    yield* log.success(`Token received (${String(token.length)} chars)`);
  });
  Effect.runPromise(program.pipe(Effect.provide(Layer.mergeAll(PasswordInputLive, LogLive))));
};

const runConfirmDemo = () => {
  const program = Effect.gen(function* () {
    const confirm = yield* Confirm;
    const log = yield* Log;
    const result = yield* confirm.prompt({ message: "Do you want to continue?" });
    yield* log.success(`You chose: ${result ? "Yes" : "No"}`);
  });
  Effect.runPromise(program.pipe(Effect.provide(Layer.mergeAll(ConfirmLive, LogLive))));
};

const runSelectDemo = () => {
  const program = Effect.gen(function* () {
    const select = yield* Select;
    const log = yield* Log;
    const choice = yield* select.prompt({
      message: "Pick a color:",
      items: ["Red", "Green", "Blue"],
      toOption: (item) => ({ label: item, hint: Option.none() }),
    });
    yield* log.success(`You picked: ${choice}`);
  });
  Effect.runPromise(program.pipe(Effect.provide(Layer.mergeAll(SelectLive, LogLive))));
};

const runMultiselectDemo = () => {
  const program = Effect.gen(function* () {
    const multiselect = yield* Multiselect;
    const log = yield* Log;
    const choices = yield* multiselect.prompt({
      message: "Pick your favorite fruits:",
      items: ["Apple", "Banana", "Cherry", "Date", "Elderberry"],
      toOption: (item) => ({ label: item, value: item, hint: Option.none() }),
      initialValues: Option.none(),
      required: Option.some(true),
    });
    yield* log.success(`You picked: ${choices.join(", ")}`);
  });
  Effect.runPromise(program.pipe(Effect.provide(Layer.mergeAll(MultiselectLive, LogLive))));
};

yargs(hideBin(process.argv))
  .command("log", "Demo log output variants", {}, runLogDemo)
  .command("spinner", "Demo spinner animation", {}, runSpinnerDemo)
  .command("note", "Demo boxed note", {}, runNoteDemo)
  .command("text-input", "Demo text input", {}, runTextInputDemo)
  .command("password-input", "Demo password input", {}, runPasswordInputDemo)
  .command("confirm", "Demo confirm prompt", {}, runConfirmDemo)
  .command("select", "Demo select prompt", {}, runSelectDemo)
  .command("multiselect", "Demo multiselect prompt", {}, runMultiselectDemo)
  .demandCommand(1, "Please specify a demo sub-command")
  .strict()
  .parse();
