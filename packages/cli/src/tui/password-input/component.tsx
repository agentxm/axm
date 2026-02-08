import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInputComponent from "ink-text-input";
import type { PasswordInputConfig } from "./types.js";

interface Props {
  readonly config: PasswordInputConfig;
  readonly onSubmit: (value: string) => void;
  readonly onCancel: () => void;
}

export function PasswordInputPrompt({ config, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState("");

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">? </Text>
        <Text bold>{config.message} </Text>
      </Box>
      <Box>
        <TextInputComponent
          value={value}
          onChange={setValue}
          onSubmit={onSubmit}
          mask={config.mask ?? "*"}
        />
      </Box>
    </Box>
  );
}
