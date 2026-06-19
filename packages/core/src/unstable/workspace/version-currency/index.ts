/**
 * Version currency assessment for installed extensions.
 *
 * Shared module providing currency checks used by doctor, outdated, and update commands.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { checkCurrency, type CurrencyResult, type CurrencyStatus } from "./check-currency.js";
export {
  collectAllCurrencyEntries,
  collectAllUpdateEntries,
  collectCommandCurrency,
  collectMcpServerCurrency,
  collectPackCurrency,
  collectSkillSourceFreshness,
  collectSkillCurrency,
  collectSubagentCurrency,
  type ExtensionCurrencyEntry,
  type ExtensionSourceFreshnessEntry,
  type ExtensionUpdateEntry,
} from "./collectors.js";
