/**
 * Core Types for Lisa Engine
 *
 * These types define the interface between the engine and adapters.
 * Commands return CommandResult, which adapters format for their target (CLI, web, etc.)
 */

// ============================================================================
// Command Result Types
// ============================================================================

/**
 * Status of a command execution
 */
export type CommandStatus = "success" | "error" | "needs_input";

/**
 * A section of output to display
 */
export interface OutputSection {
  type:
    | "header"
    | "subheader"
    | "text"
    | "list"
    | "numbered_list"
    | "table"
    | "status"
    | "progress"
    | "context"
    | "divider"
    | "blank";
  title?: string;
  content?: unknown;
  style?: "success" | "error" | "warning" | "info" | "dim";
}

/**
 * A command suggestion for AI guidance
 */
export interface CommandSuggestion {
  command: string;
  args?: string;
  description: string;
  when?: string;
}

/**
 * AI guidance - the "prompt contract" for what AI should do next
 */
export interface AIGuidance {
  /** Current situation/state description */
  situation: string;

  /** Step-by-step instructions for the AI */
  instructions: string[];

  /** Available commands the AI can use */
  commands: CommandSuggestion[];

  /** Optional context data the AI might need */
  context?: Record<string, unknown>;

  /** Whether user input is required before proceeding */
  needsUserInput?: boolean;

  /** Specific question to ask the user (if needsUserInput is true) */
  userPrompt?: string;
}

/**
 * Base properties shared by all command results
 */
interface CommandResultBase {
  /** Sections to display (adapters format these) */
  sections: OutputSection[];

  /** AI guidance for what to do next (the prompt contract) */
  aiGuidance?: AIGuidance;
}

/**
 * Successful command result
 */
export interface SuccessResult<T> extends CommandResultBase {
  status: "success";
  data: T;
  error?: undefined;
  errorCode?: undefined;
}

/**
 * Error command result
 */
export interface ErrorResult extends CommandResultBase {
  status: "error";
  data: null;
  error: string;
  errorCode: string;
}

/**
 * Needs input command result
 */
export interface NeedsInputResult<T> extends CommandResultBase {
  status: "needs_input";
  data: T;
  error?: undefined;
  errorCode?: undefined;
}

/**
 * The result of executing a command - discriminated union by status
 */
export type CommandResult<T = unknown> =
  | SuccessResult<T>
  | ErrorResult
  | NeedsInputResult<T>;

// ============================================================================
// Command Types
// ============================================================================

/**
 * Base interface for command options
 */
export interface CommandOptions {
  /** Working directory (defaults to cwd) */
  rootDir?: string;
}

/**
 * Discovery command options
 */
export interface DiscoverOptions extends CommandOptions {
  depth?: "quick" | "standard" | "deep";
}

export interface DiscoverInitOptions extends CommandOptions {
  name: string;
}

export interface DiscoverAddEntryOptions extends CommandOptions {
  category: "problem" | "vision" | "users" | "values" | "constraints" | "success" | "other";
  question: string;
  answer: string;
}

export interface DiscoverElementOptions extends CommandOptions {
  elementType: "epic" | "milestone";
  elementId: string;
}

export interface DiscoverAddEntryElementOptions extends DiscoverAddEntryOptions {
  elementType: "epic" | "milestone";
  elementId: string;
}

/**
 * Plan command options
 */
export interface PlanMilestoneAddOptions extends CommandOptions {
  name: string;
  description: string;
}

export interface PlanEpicAddOptions extends CommandOptions {
  milestoneId: string;
  name: string;
  description: string;
}

export interface PlanEpicOptions extends CommandOptions {
  epicId: string;
}

export interface PlanSavePrdOptions extends CommandOptions {
  epicId: string;
  content: string;
}

export interface PlanSaveArchOptions extends CommandOptions {
  epicId: string;
  content: string;
}

export interface PlanStoriesOptions extends CommandOptions {
  epicId: string;
}

/**
 * Status command options
 */
export interface StatusContextOptions extends CommandOptions {
  target?: string; // M1, E1, E1.S2, or undefined for project
  full?: boolean;
  format?: "text" | "json";
}

/**
 * Feedback command options
 */
export interface FeedbackMarkOptions extends CommandOptions {
  storyId: string;
  status: "todo" | "assigned" | "in_progress" | "review" | "done" | "blocked" | "deferred";
  reason?: string;
}

export interface FeedbackAddOptions extends CommandOptions {
  storyId: string;
  type: "blocker" | "gap" | "scope" | "conflict" | "question";
  message: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a successful command result
 */
export function success<T>(
  data: T,
  sections: OutputSection[] = [],
  aiGuidance?: AIGuidance
): SuccessResult<T> {
  return {
    status: "success",
    data,
    sections,
    aiGuidance,
  };
}

/**
 * Create an error command result.
 * The result is typed as CommandResult<T> to allow it to be returned from any function.
 */
export function error<T = unknown>(
  message: string,
  code: string,
  sections?: OutputSection[]
): CommandResult<T> {
  return {
    status: "error",
    data: null,
    sections: sections ?? [{ type: "text", content: message, style: "error" }],
    error: message,
    errorCode: code,
  };
}

/**
 * Create a needs-input command result
 */
export function needsInput<T>(
  data: T,
  sections: OutputSection[],
  aiGuidance: AIGuidance
): NeedsInputResult<T> {
  return {
    status: "needs_input",
    data,
    sections,
    aiGuidance: { ...aiGuidance, needsUserInput: true },
  };
}

// ============================================================================
// Section Builders (for cleaner command code)
// ============================================================================

export const section = {
  header: (title: string): OutputSection => ({ type: "header", title }),
  subheader: (title: string): OutputSection => ({ type: "subheader", title }),
  text: (content: string, style?: OutputSection["style"]): OutputSection => ({
    type: "text",
    content,
    style,
  }),
  list: (items: string[], title?: string): OutputSection => ({
    type: "list",
    title,
    content: items,
  }),
  numberedList: (items: string[], title?: string): OutputSection => ({
    type: "numbered_list",
    title,
    content: items,
  }),
  table: (
    rows: string[][],
    headers?: string[],
    title?: string
  ): OutputSection => ({
    type: "table",
    title,
    content: { rows, headers },
  }),
  progress: (current: number, total: number, label?: string): OutputSection => ({
    type: "progress",
    content: { current, total, label },
  }),
  divider: (): OutputSection => ({ type: "divider" }),
  blank: (): OutputSection => ({ type: "blank" }),
  success: (content: string): OutputSection => ({
    type: "text",
    content,
    style: "success",
  }),
  error: (content: string): OutputSection => ({
    type: "text",
    content,
    style: "error",
  }),
  warning: (content: string): OutputSection => ({
    type: "text",
    content,
    style: "warning",
  }),
  info: (content: string): OutputSection => ({
    type: "text",
    content,
    style: "info",
  }),
  dim: (content: string): OutputSection => ({
    type: "text",
    content,
    style: "dim",
  }),
};
