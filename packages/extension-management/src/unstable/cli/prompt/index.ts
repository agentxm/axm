/**
 * Custom prompts built on the two-argument `Prompt.custom` form.
 *
 * Evaluated against the three-argument events-dequeue overload (effect
 * beta.99+): not adopted. The events overload exists for re-rendering on
 * background events; these prompts' state machines are cursor/selection
 * reducers driven purely by key input, so the overload deletes no state
 * code here. Re-evaluate if a prompt ever needs background-driven redraws.
 */
import { autocompleteMultiselect } from "./autocomplete-multiselect.js";
import { groupMultiselect } from "./group-multiselect.js";
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
export { requireInteractive } from "./helpers.js";
export { selectKey, type SelectKeyChoice, type SelectKeyOptions } from "./select-key.js";

export const AxmPrompt = {
  selectKey,
  groupMultiselect,
  autocompleteMultiselect,
} as const;
