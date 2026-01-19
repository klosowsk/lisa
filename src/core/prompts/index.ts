/**
 * Prompts Index for Lisa Engine
 *
 * Re-exports all prompt templates - the "prompt contract" for AI guidance.
 *
 * ## Architecture
 *
 * Each prompt file contains `get*Guidance()` functions that return `AIGuidance` objects.
 * These are called by commands to generate context-aware AI instructions.
 *
 * Pattern: command calls -> guidance function -> AIGuidance { situation, instructions, commands }
 *
 * Files:
 * - discovery.ts: Project and element discovery guidance
 * - planning.ts: Milestone, epic, and story planning guidance
 * - status.ts: Overview, board, story viewing guidance
 * - feedback.ts: Story status changes and feedback guidance
 * - validate.ts: Validation results guidance
 * - context-helpers.ts: Utility functions for context commands
 *
 * To find what guidance a command returns, search for the guidance function
 * call in the corresponding command file (e.g., discover.ts -> getDiscoveryGuidance).
 */

export * from "./discovery.js";
export * from "./planning.js";
export * from "./status.js";
export * from "./feedback.js";
export * from "./validate.js";
export * from "./context-helpers.js";
