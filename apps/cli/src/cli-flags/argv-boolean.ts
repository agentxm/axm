import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

// Effect documents this vocabulary on Primitive.Boolean; its literal schema
// is internal. A parser conformance specification checks this startup reader.
const decodeLiteral = Schema.decodeUnknownOption(
  Schema.Literals(["true", "yes", "on", "1", "y", "false", "no", "off", "0", "n"]),
);
const decodeBoolean = (value: unknown): Option.Option<boolean> =>
  Option.map(
    decodeLiteral(value),
    (literal) =>
      literal === "true" ||
      literal === "yes" ||
      literal === "on" ||
      literal === "1" ||
      literal === "y",
  );

/** Read a Boolean flag before parsing, using Effect's literal vocabulary. */
export const booleanOptionFromArgv = (
  argv: ReadonlyArray<string>,
  names: ReadonlyArray<string>,
): Option.Option<boolean> => {
  let selected: Option.Option<boolean> = Option.none();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--") break;
    if (argument === undefined) continue;
    const equals = argument.indexOf("=");
    const name = equals === -1 ? argument : argument.slice(0, equals);
    if (names.includes(name)) {
      if (equals !== -1) selected = decodeBoolean(argument.slice(equals + 1));
      else {
        const next = decodeBoolean(argv[index + 1]);
        selected = Option.isSome(next) ? next : Option.some(true);
        if (Option.isSome(next)) index++;
      }
    } else if (equals === -1 && name.startsWith("--no-") && names.includes(`--${name.slice(5)}`)) {
      selected = Option.some(false);
    }
  }
  return selected;
};
