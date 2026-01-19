/**
 * Context Helpers for Lisa Prompts
 *
 * Utility functions that enhance AI guidance with context-fetching commands.
 * When an AI agent is working on a task and may need more context, these
 * helpers proactively suggest commands to fetch relevant information.
 */

import { AIGuidance, CommandSuggestion } from "../types.js";

// ============================================================================
// Target Types
// ============================================================================

export interface GuidanceTarget {
  /** Type of target: project, milestone, epic, or story */
  type: "project" | "milestone" | "epic" | "story";
  /** ID if applicable (M1, E1, E1.S2) */
  id?: string;
  /** Epic ID if this is a story */
  epicId?: string;
}

// ============================================================================
// Context Command Builders
// ============================================================================

/**
 * Get context commands relevant to a specific target
 */
export function getContextCommands(target: GuidanceTarget): CommandSuggestion[] {
  const commands: CommandSuggestion[] = [];

  switch (target.type) {
    case "project":
      commands.push({
        command: "status context",
        description: "View project context and discovery summary",
        when: "To understand the project background",
      });
      commands.push({
        command: "status overview",
        description: "View project structure and progress",
        when: "To see milestones and epics",
      });
      break;

    case "milestone":
      commands.push({
        command: "status context",
        args: target.id,
        description: `View milestone ${target.id} context`,
        when: "To understand this milestone's goals",
      });
      commands.push({
        command: "status overview",
        description: "View project structure",
        when: "To see related milestones and epics",
      });
      break;

    case "epic":
      commands.push({
        command: "status context",
        args: target.id,
        description: `View epic ${target.id} context and requirements`,
        when: "To understand what this epic is about",
      });
      commands.push({
        command: "status board",
        args: target.id,
        description: `View story board for ${target.id}`,
        when: "To see all stories in this epic",
      });
      break;

    case "story":
      commands.push({
        command: "status show",
        args: target.id,
        description: `View full story details for ${target.id}`,
        when: "To see story requirements and acceptance criteria",
      });
      if (target.epicId) {
        commands.push({
          command: "status context",
          args: target.epicId,
          description: `View epic ${target.epicId} context`,
          when: "To understand the broader context",
        });
      }
      commands.push({
        command: "status why",
        args: target.id,
        description: `Understand why ${target.id} exists`,
        when: "To see requirements and goals this story implements",
      });
      commands.push({
        command: "status how",
        args: target.id,
        description: `Get implementation guidance for ${target.id}`,
        when: "To see architecture and patterns to follow",
      });
      break;
  }

  return commands;
}

/**
 * Add context-fetching commands to existing guidance.
 * Adds commands that aren't already present.
 */
export function withContextCommands(
  guidance: AIGuidance,
  target: GuidanceTarget
): AIGuidance {
  const contextCommands = getContextCommands(target);

  // Get existing command signatures for deduplication
  const existingCommands = new Set(
    guidance.commands.map((c) => `${c.command}${c.args ? ` ${c.args}` : ""}`)
  );

  // Filter out commands that already exist
  const newCommands = contextCommands.filter(
    (c) => !existingCommands.has(`${c.command}${c.args ? ` ${c.args}` : ""}`)
  );

  if (newCommands.length === 0) {
    return guidance;
  }

  // Add context commands at the end with a visual separator
  return {
    ...guidance,
    commands: [
      ...guidance.commands,
      ...newCommands.map((c) => ({
        ...c,
        // Mark as context command for potential UI differentiation
        description: `[Context] ${c.description}`,
      })),
    ],
  };
}

/**
 * Parse a target string into a GuidanceTarget
 * Examples: "M1", "E1", "E1.S2", or undefined for project
 */
export function parseTarget(target: string | undefined): GuidanceTarget {
  if (!target) {
    return { type: "project" };
  }

  const normalized = target.toUpperCase();

  // Story: E1.S2
  const storyMatch = normalized.match(/^(E\d+)\.S\d+$/);
  if (storyMatch) {
    return {
      type: "story",
      id: normalized,
      epicId: storyMatch[1],
    };
  }

  // Epic: E1
  if (/^E\d+$/.test(normalized)) {
    return { type: "epic", id: normalized };
  }

  // Milestone: M1
  if (/^M\d+$/.test(normalized)) {
    return { type: "milestone", id: normalized };
  }

  // Default to project
  return { type: "project" };
}

/**
 * Enhance guidance with context commands based on the situation.
 * This is the main entry point - analyzes the guidance and adds
 * relevant context commands.
 */
export function enhanceWithContext(
  guidance: AIGuidance,
  options: {
    /** Current target being worked on */
    target?: GuidanceTarget;
    /** Explicit epic ID for story context */
    epicId?: string;
    /** Whether to include project-level context commands */
    includeProjectContext?: boolean;
  } = {}
): AIGuidance {
  const { target, epicId, includeProjectContext = false } = options;

  // If no target specified, try to infer from guidance context
  let effectiveTarget = target;
  if (!effectiveTarget && guidance.context) {
    const ctx = guidance.context as Record<string, unknown>;
    if (ctx.storyId && typeof ctx.storyId === "string") {
      effectiveTarget = {
        type: "story",
        id: ctx.storyId,
        epicId: epicId || (ctx.epicId as string | undefined),
      };
    } else if (ctx.epicId && typeof ctx.epicId === "string") {
      effectiveTarget = { type: "epic", id: ctx.epicId };
    } else if (ctx.milestoneId && typeof ctx.milestoneId === "string") {
      effectiveTarget = { type: "milestone", id: ctx.milestoneId };
    }
  }

  // If we have a target, add its context commands
  if (effectiveTarget) {
    guidance = withContextCommands(guidance, effectiveTarget);
  }

  // Optionally add project-level context
  if (includeProjectContext && effectiveTarget?.type !== "project") {
    guidance = withContextCommands(guidance, { type: "project" });
  }

  return guidance;
}

// ============================================================================
// Common Context Instructions
// ============================================================================

/**
 * Get instructions for fetching context before starting work
 */
export function getContextFetchInstructions(target: GuidanceTarget): string[] {
  const instructions: string[] = [];

  switch (target.type) {
    case "story":
      instructions.push(`Before implementing, run "status how ${target.id}" to get implementation guidance`);
      if (target.epicId) {
        instructions.push(`If unclear on requirements, run "status context ${target.epicId}" for epic context`);
      }
      break;

    case "epic":
      instructions.push(`Run "status context ${target.id}" to review the epic's PRD and architecture`);
      instructions.push(`Run "status board ${target.id}" to see story priorities and dependencies`);
      break;

    case "milestone":
      instructions.push(`Run "status context ${target.id}" to understand milestone goals`);
      break;

    case "project":
      instructions.push('Run "status overview" to see project structure');
      instructions.push('Run "status context" to see discovery context');
      break;
  }

  return instructions;
}
