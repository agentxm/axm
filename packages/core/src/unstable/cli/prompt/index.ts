import { autocompleteMultiselect } from "./autocomplete-multiselect.js";
import { groupMultiselect } from "./group-multiselect.js";
import { autoConfirm, unless } from "./helpers.js";
import { selectKey } from "./select-key.js";

export {
  autocompleteMultiselect,
  type AutocompleteMultiselectChoice,
  type AutocompleteMultiselectOptions,
} from "./autocomplete-multiselect.js";
export {
  groupMultiselect,
  type GroupMultiselectChoice,
  type GroupMultiselectGroup,
  type GroupMultiselectOptions,
} from "./group-multiselect.js";
export { autoConfirm, unless } from "./helpers.js";
export { selectKey, type SelectKeyChoice, type SelectKeyOptions } from "./select-key.js";

export const AxmPrompt = {
  unless,
  autoConfirm,
  selectKey,
  groupMultiselect,
  autocompleteMultiselect,
} as const;
