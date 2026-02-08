import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInputComponent from "ink-text-input";
import type { TextInputConfig } from "./types.js";

interface Props {
  readonly config: TextInputConfig;
  readonly onSubmit: (value: string) => void;
  readonly onCancel: () => void;
}

export function TextInputPrompt({ config, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(config.defaultValue ?? "");
  const [error, setError] = useState<string | undefined>();

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleSubmit = (submitValue: string) => {
    if (config.validate) {
      const validationError = config.validate(submitValue);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    onSubmit(submitValue);
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">? </Text>
        <Text bold>{config.message} </Text>
      </Box>
      <Box>
        <TextInputComponent
          value={value}
          onChange={(newValue) => {
            setValue(newValue);
            setError(undefined);
          }}
          onSubmit={handleSubmit}
          {...(config.placeholder && { placeholder: config.placeholder })}
        />
      </Box>
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
