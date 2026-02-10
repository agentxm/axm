import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ConfirmConfig } from "./types.js";

interface Props {
  readonly config: ConfirmConfig;
  readonly onSubmit: (value: boolean) => void;
  readonly onCancel: () => void;
}

export function ConfirmPrompt({ config, onSubmit, onCancel }: Props) {
  const [selected, setSelected] = useState(config.initialValue ?? true);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onSubmit(selected);
      return;
    }
    if (key.leftArrow || key.rightArrow || key.tab) {
      setSelected((prev) => !prev);
      return;
    }
    if (input === "y" || input === "Y") {
      setSelected(true);
      return;
    }
    if (input === "n" || input === "N") {
      setSelected(false);
      return;
    }
  });

  return (
    <Box>
      <Text color="cyan">? </Text>
      <Text bold>{config.message} </Text>
      {selected ? (
        <Text color="green" bold>
          Yes
        </Text>
      ) : (
        <Text>Yes</Text>
      )}
      <Text> / </Text>
      {!selected ? (
        <Text color="green" bold>
          No
        </Text>
      ) : (
        <Text>No</Text>
      )}
    </Box>
  );
}
