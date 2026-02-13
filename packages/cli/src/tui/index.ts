import * as Layer from "effect/Layer";
import { ConfirmLive } from "./confirm/index.js";
import { LogLive } from "./log/index.js";
import { MultiselectLive } from "./multiselect/index.js";
import { NoteLive } from "./note/index.js";
import { PasswordInputLive } from "./password-input/index.js";
import { SelectLive } from "./select/index.js";
import { SpinnerLive } from "./spinner/index.js";
import { TextInputLive } from "./text-input/index.js";

// Errors
export { PromptCancelled } from "./errors.js";

// Log
export { Log, LogLive, type LogService } from "./log/index.js";
export { type LogRecords, makeLogTestLayer, type MockLogService } from "./log/index.js";

// Spinner
export { Spinner, SpinnerLive, type SpinnerHandle } from "./spinner/index.js";
export { makeSpinnerTestLayer, type MockSpinnerService } from "./spinner/index.js";

// Note
export { Note, NoteLive, type NoteService } from "./note/index.js";
export { type MockNoteService, makeNoteTestLayer, type NoteRecord } from "./note/index.js";

// Text Input
export { TextInput, TextInputLive, type TextInputService } from "./text-input/index.js";
export type { TextInputConfig } from "./text-input/index.js";
export {
  type TextInputBehavior,
  makeTextInputTestLayer,
  type MockTextInputService,
} from "./text-input/index.js";

// Password Input
export {
  PasswordInput,
  PasswordInputLive,
  type PasswordInputConfig,
  type PasswordInputService,
} from "./password-input/index.js";
export {
  type PasswordInputBehavior,
  makePasswordInputTestLayer,
  type MockPasswordInputService,
} from "./password-input/index.js";

// Confirm
export { Confirm, ConfirmLive, type ConfirmConfig, type ConfirmService } from "./confirm/index.js";
export {
  type ConfirmBehavior,
  makeConfirmTestLayer,
  type MockConfirmService,
} from "./confirm/index.js";

// Select
export {
  Select,
  SelectLive,
  type SelectConfig,
  type SelectOption,
  type SelectService,
} from "./select/index.js";
export {
  type SelectBehavior,
  makeSelectTestLayer,
  type MockSelectService,
} from "./select/index.js";

// Multiselect
export {
  Multiselect,
  MultiselectLive,
  type MultiselectConfig,
  type MultiselectOption,
  type MultiselectService,
} from "./multiselect/index.js";
export {
  type MultiselectBehavior,
  makeMultiselectTestLayer,
  type MockMultiselectCall,
  type MockMultiselectService,
} from "./multiselect/index.js";

// Convenience layer: merges all live layers
export const TuiLive = Layer.mergeAll(
  LogLive,
  SpinnerLive,
  NoteLive,
  TextInputLive,
  PasswordInputLive,
  ConfirmLive,
  SelectLive,
  MultiselectLive,
);
