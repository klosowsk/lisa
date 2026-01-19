/**
 * Lisa Core Engine
 *
 * Main export for the Lisa planning engine.
 */

// Engine
export { LisaEngine, createEngine } from "./engine.js";

// Types
export type {
  CommandResult,
  CommandStatus,
  OutputSection,
  AIGuidance,
  CommandSuggestion,
  CommandOptions,
} from "./types.js";
export { success, error, needsInput, section } from "./types.js";

// State
export { StateManager, getStateManager, LISA_DIR, PATHS } from "./state.js";

// Utils
export {
  LisaError,
  generateId,
  slugify,
  now,
  formatDate,
  formatDateTime,
  timeAgo,
  validateStoryId,
  validateEpicId,
  validateMilestoneId,
  validateRequirementId,
  parseStoryId,
  parseEpicId,
  truncate,
  indent,
  wrap,
  statusIcon,
  statusCategory,
} from "./utils.js";

// Schemas (re-export commonly used types)
export type {
  Project,
  DiscoveryContext,
  DiscoveryHistory,
  DiscoveryHistoryEntry,
  Constraints,
  Constraint,
  DiscoveryDepth,
  ElementDiscovery,
  Milestone,
  MilestoneIndex,
  Epic,
  Story,
  StoriesFile,
  Config,
  DerivedEpicStatus,
  DerivedMilestoneStatus,
  StoryStatus,
} from "./schemas.js";

// Commands
export * as commands from "./commands/index.js";

// Prompts
export * as prompts from "./prompts/index.js";
