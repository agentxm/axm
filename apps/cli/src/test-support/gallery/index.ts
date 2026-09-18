import { aReadInventoryTable } from "./a-read--inventory-table.js";
import { refSmallDiscover } from "./ref-small--discover.js";
import { refSmallEmptyStates } from "./ref-small--empty-states.js";
import { refViewDeprecated } from "./ref-view--deprecated.js";
import { refViewIdentity } from "./ref-view--identity.js";
import { refViewOneField } from "./ref-view--one-field.js";
import { detail } from "./detail.js";
import { everyNode } from "./every-node.js";
import type { GalleryFixture } from "./fixture.js";
import { asciiGlyphs } from "../../screen/paint-text.js";
import { inventory } from "./inventory.js";
import { inventoryAltRows } from "./inventory-alt-rows.js";
import { inventoryAltStacked } from "./inventory-alt-stacked.js";
import { mutationResult } from "./mutation-result.js";
import { mutationResultAltTable } from "./mutation-result-alt-table.js";
import { mutationResultAltTree } from "./mutation-result-alt-tree.js";
import { planPreview } from "./plan-preview.js";
import { promptsChooseAnswered } from "./prompts--choose-answered.js";
import { promptsConfirmAnswered } from "./prompts--confirm-answered.js";
import { promptsInputAnswered } from "./prompts--input-answered.js";
import { promptsInputError } from "./prompts--input-error.js";
import { refLintClean } from "./ref-lint--clean.js";
import { refMidflightBusyWorkspace } from "./ref-midflight--busy-workspace.js";
import { refMidflightErrorFamily1 } from "./ref-midflight--error-family-1.js";
import { refMidflightErrorFamily2 } from "./ref-midflight--error-family-2.js";
import { refMidflightInterrupted } from "./ref-midflight--interrupted.js";
import { refLintDefault } from "./ref-lint--default.js";
import { refLintDrifted } from "./ref-lint--drifted.js";
import { refLintFix } from "./ref-lint--fix.js";
import { refLintManyFindings } from "./ref-lint--many-findings.js";
import { refLintQuiet } from "./ref-lint--quiet.js";
import { refPickAnswered } from "./ref-pick--answered.js";
import { refPickFiltered } from "./ref-pick--filtered.js";
import { refPickGrouped } from "./ref-pick--grouped.js";
import { refPickShortTerminal } from "./ref-pick--short-terminal.js";
import { refPublishBlocked } from "./ref-publish--blocked.js";
import { refSyncMixedOperations } from "./ref-sync--mixed-operations.js";
import { refSyncNothingToDo } from "./ref-sync--nothing-to-do.js";
import { refSyncUninstallKeptReference } from "./ref-sync--uninstall-kept-reference.js";
import { refSyncVerboseChildren } from "./ref-sync--verbose-children.js";
import { widthGateFourWidths } from "./width-gate--four-widths.js";
import { widthKeepLongNames } from "./width-keep--long-names.js";
import { widthKeepNeverCut } from "./width-keep--never-cut.js";
import { widthLiveHeightCap } from "./width-live--height-cap.js";
import { widthPromptsChoose } from "./width-prompts--choose.js";
import { widthPromptsChooseHeight } from "./width-prompts--choose-height.js";
import { widthPromptsConfirm } from "./width-prompts--confirm.js";
import { widthPromptsPick } from "./width-prompts--pick.js";
import { widthPromptsPickWithLedger } from "./width-prompts--pick-with-ledger.js";
import { waitOpen, waitStatic } from "./wait-open.js";
import { waitSettledFixture } from "./wait-settled.js";

/**
 * The terminal design gallery: one typed document or live scene per key use
 * case, plus the alternatives considered for each (`*-alt-*`). Every document
 * is painted at each gallery width, and every scene at each gallery width and
 * height, and snapshot-tested; the accepted rendering for each use case is
 * recorded in the terminal design documentation.
 *
 * A fixture drawn from the design canvas is named `<board>--<frame>`: the
 * board's file stem and the frame's caption, in kebab case, so its snapshots
 * can be held against the mock they implement.
 */
export const gallery: ReadonlyArray<GalleryFixture> = [
  { _tag: "document", name: "inventory", doc: inventory },
  { _tag: "document", name: "inventory-alt-rows", doc: inventoryAltRows },
  { _tag: "document", name: "inventory-alt-stacked", doc: inventoryAltStacked },
  { _tag: "document", name: "detail", doc: detail },
  { _tag: "document", name: "mutation-result", doc: mutationResult },
  { _tag: "document", name: "mutation-result-alt-tree", doc: mutationResultAltTree },
  { _tag: "document", name: "mutation-result-alt-table", doc: mutationResultAltTable },
  { _tag: "document", name: "plan-preview", doc: planPreview },
  { _tag: "document", name: "ref-sync--mixed-operations", doc: refSyncMixedOperations },
  { _tag: "document", name: "ref-sync--verbose-children", doc: refSyncVerboseChildren },
  { _tag: "document", name: "ref-sync--nothing-to-do", doc: refSyncNothingToDo },
  {
    _tag: "document",
    name: "ref-sync--uninstall-kept-reference",
    doc: refSyncUninstallKeptReference,
  },
  { _tag: "document", name: "a-read--inventory-table", doc: aReadInventoryTable },
  { _tag: "document", name: "ref-view--identity", doc: refViewIdentity },
  { _tag: "document", name: "ref-view--deprecated", doc: refViewDeprecated },
  { _tag: "document", name: "ref-view--one-field", doc: refViewOneField },
  { _tag: "document", name: "ref-small--empty-states", doc: refSmallEmptyStates },
  { _tag: "document", name: "ref-small--discover", doc: refSmallDiscover },
  { _tag: "document", name: "ref-lint--default", doc: refLintDefault },
  { _tag: "document", name: "ref-lint--many-findings", doc: refLintManyFindings },
  { _tag: "document", name: "ref-lint--fix", doc: refLintFix },
  { _tag: "document", name: "ref-lint--clean", doc: refLintClean },
  { _tag: "document", name: "ref-lint--drifted", doc: refLintDrifted },
  { _tag: "document", name: "ref-lint--quiet", doc: refLintQuiet },
  { _tag: "document", name: "ref-midflight--interrupted", doc: refMidflightInterrupted },
  { _tag: "document", name: "ref-midflight--error-family-1", doc: refMidflightErrorFamily1 },
  { _tag: "document", name: "ref-midflight--error-family-2", doc: refMidflightErrorFamily2 },
  { _tag: "document", name: "ref-publish--blocked", doc: refPublishBlocked },
  { _tag: "document", name: "prompts--confirm-answered", doc: promptsConfirmAnswered },
  { _tag: "document", name: "prompts--choose-answered", doc: promptsChooseAnswered },
  { _tag: "document", name: "prompts--input-answered", doc: promptsInputAnswered },
  { _tag: "document", name: "prompts--input-error", doc: promptsInputError },
  { _tag: "document", name: "ref-pick--grouped", doc: refPickGrouped },
  { _tag: "document", name: "ref-pick--filtered", doc: refPickFiltered },
  { _tag: "document", name: "ref-pick--short-terminal", doc: refPickShortTerminal },
  { _tag: "document", name: "ref-pick--answered", doc: refPickAnswered },
  { _tag: "document", name: "ref-pick--ascii", doc: refPickGrouped, glyphs: asciiGlyphs },
  { _tag: "document", name: "wait-open", doc: waitOpen },
  { _tag: "document", name: "wait-static", doc: waitStatic },
  { _tag: "document", name: "wait-settled", doc: waitSettledFixture },
  { _tag: "document", name: "every-node", doc: everyNode },
  {
    _tag: "document",
    name: "width-gate--four-widths",
    doc: widthGateFourWidths,
    // The widths the canvas draws this gate at, so each frame has a snapshot.
    widths: [100, 80, 60, 44],
  },
  {
    _tag: "document",
    name: "width-keep--never-cut",
    doc: widthKeepNeverCut,
    // The width the canvas draws this frame at, where both values overflow.
    widths: [60],
  },
  {
    _tag: "document",
    name: "width-keep--long-names",
    doc: widthKeepLongNames,
    widths: [60],
  },
  {
    _tag: "document",
    name: "width-prompts--confirm",
    doc: widthPromptsConfirm,
    // The widths the canvas draws the three chip fallbacks at.
    widths: [80, 48, 30],
  },
  {
    _tag: "document",
    name: "width-prompts--choose",
    doc: widthPromptsChoose,
    // The confirmation's three widths, where details show, drop, and titles hold.
    widths: [80, 48, 30],
  },
  {
    _tag: "document",
    name: "width-prompts--pick",
    doc: widthPromptsPick,
    // The widths the canvas draws the list at, with and without descriptions.
    widths: [80, 48],
  },
  { _tag: "scene", name: "width-live--height-cap", scene: widthLiveHeightCap },
  { _tag: "scene", name: "ref-midflight--busy-workspace", scene: refMidflightBusyWorkspace },
  {
    _tag: "scene",
    name: "width-prompts--choose-height",
    scene: widthPromptsChooseHeight,
    widths: [80],
  },
  {
    _tag: "composed",
    name: "width-prompts--pick-with-ledger",
    scene: widthPromptsPickWithLedger,
    widths: [80],
  },
];

export const galleryWidths = [40, 80, 120, 200] as const;

/** Terminal heights a live scene must fit; settled documents are not height-bound. */
export const galleryHeights = [16, 24] as const;
