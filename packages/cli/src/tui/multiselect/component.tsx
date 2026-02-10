import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import * as Option from "effect/Option";
import type { MultiselectConfig } from "./types.js";

interface Props<T> {
  readonly config: MultiselectConfig<T>;
  readonly onSubmit: (indices: readonly number[]) => void;
  readonly onCancel: () => void;
}

export function MultiselectPrompt<T>({ config, onSubmit, onCancel }: Props<T>) {
  const initialSelected = Option.match(config.initialValues, {
    onNone: () => new Set<number>(),
    onSome: (values) => {
      const set = new Set<number>();
      config.items.forEach((item, index) => {
        if (values.includes(config.toOption(item).value)) {
          set.add(index);
        }
      });
      return set;
    },
  });

  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState(initialSelected);
  const [error, setError] = useState<string | undefined>();

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const isRequired = Option.getOrElse(config.required, () => false);
      if (isRequired && selected.size === 0) {
        setError("At least one selection is required");
        return;
      }
      onSubmit(Array.from(selected));
      return;
    }
    if (key.upArrow) {
      setCursor((prev) => (prev > 0 ? prev - 1 : config.items.length - 1));
      setError(undefined);
      return;
    }
    if (key.downArrow) {
      setCursor((prev) => (prev < config.items.length - 1 ? prev + 1 : 0));
      setError(undefined);
      return;
    }
    if (input === " ") {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(cursor)) {
          next.delete(cursor);
        } else {
          next.add(cursor);
        }
        return next;
      });
      setError(undefined);
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">? </Text>
        <Text bold>{config.message}</Text>
        <Text dimColor> (space to toggle, enter to submit)</Text>
      </Box>
      {config.items.map((item, index) => {
        const opt = config.toOption(item);
        const isSelected = selected.has(index);
        const isCursor = index === cursor;
        return (
          <Box key={index}>
            <Text {...(isCursor ? { color: "cyan" as const } : {})}>
              {isCursor ? "❯ " : "  "}
              {isSelected ? "◉ " : "◯ "}
              {opt.label}
            </Text>
            {Option.isSome(opt.hint) && <Text dimColor> ({opt.hint.value})</Text>}
          </Box>
        );
      })}
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
