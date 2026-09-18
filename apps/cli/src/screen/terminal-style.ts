const ESC = "\u001b[";

export const ANSI_BOLD = `${ESC}1m`;
export const ANSI_DIM = `${ESC}2m`;
export const ANSI_CYAN = `${ESC}36m`;
const ANSI_GREEN = `${ESC}32m`;
const ANSI_RESET = `${ESC}0m`;
export const CURSOR_SHOW = `${ESC}?25h`;

const styled = (start: string, text: string): string => `${start}${text}${ANSI_RESET}`;

export const boldText = (text: string): string => styled(ANSI_BOLD, text);
export const cyanText = (text: string): string => styled(ANSI_CYAN, text);
export const dimText = (text: string): string => styled(ANSI_DIM, text);
export const greenText = (text: string): string => styled(ANSI_GREEN, text);
