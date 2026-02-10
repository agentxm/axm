import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import * as Option from "effect/Option";
import type { SelectConfig } from "./types.js";

interface Props<T> {
  readonly config: SelectConfig<T>;
  readonly onSelect: (index: number) => void;
  readonly onCancel: () => void;
}

export function SelectPrompt<T>({ config, onSelect, onCancel }: Props<T>) {
  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const items = config.items.map((item, index) => {
    const opt = config.toOption(item);
    return {
      label: Option.isSome(opt.hint) ? `${opt.label} (${opt.hint.value})` : opt.label,
      value: index,
    };
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">? </Text>
        <Text bold>{config.message}</Text>
      </Box>
      <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
    </Box>
  );
}
