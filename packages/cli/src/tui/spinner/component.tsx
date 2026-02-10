import React from "react";
import { Box, Text } from "ink";
import InkSpinner from "ink-spinner";

interface SpinnerComponentProps {
  readonly message: string;
}

export function SpinnerComponent({ message }: SpinnerComponentProps) {
  return (
    <Box>
      <Text color="cyan">
        <InkSpinner type="dots" />
      </Text>
      <Text> {message}</Text>
    </Box>
  );
}
