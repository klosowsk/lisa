/**
 * Status Prompts for Lisa Engine
 *
 * AI guidance templates for status, board, and context commands.
 */

import { AIGuidance, CommandSuggestion } from "../types.js";
import { Story, StoryStatus, DerivedEpicStatus } from "../schemas.js";
import { enhanceWithContext } from "./context-helpers.js";

// ============================================================================
// Overview Guidance
// ============================================================================

export interface OverviewState {
  projectStatus: string;
  milestonesCount: number;
  epicsCount: number;
  storiesTotal: number;
  storiesCompleted: number;
  stuckCount: number;
  feedbackCount: number;
  hasBlockedStories: boolean;
}

export function getOverviewGuidance(state: OverviewState): AIGuidance {
  const { stuckCount, feedbackCount, hasBlockedStories, storiesTotal, storiesCompleted } = state;
  const hasAttentionItems = stuckCount > 0 || feedbackCount > 0 || hasBlockedStories;

  let situation: string;
  if (storiesTotal === 0) {
    situation = "Project initialized but no stories yet - continue planning";
  } else if (storiesCompleted === storiesTotal) {
    situation = "All stories complete!";
  } else if (hasAttentionItems) {
    situation = `Project in progress with ${stuckCount + feedbackCount} items needing attention`;
  } else {
    situation = `Project in progress: ${storiesCompleted}/${storiesTotal} stories complete`;
  }

  const instructions: string[] = [];
  const commands: CommandSuggestion[] = [];

  if (stuckCount > 0) {
    instructions.push(`Address ${stuckCount} stuck item(s) first`);
    commands.push({
      command: "feedback list",
      description: "View stuck items",
      when: "To see what's blocked",
    });
  }

  if (feedbackCount > 0) {
    instructions.push(`Review ${feedbackCount} pending feedback item(s)`);
  }

  if (hasBlockedStories) {
    instructions.push("Some stories are blocked - check board for details");
    commands.push({
      command: "status board",
      description: "View kanban board",
      when: "To see blocked stories",
    });
  }

  if (!hasAttentionItems && storiesTotal > 0) {
    instructions.push("Continue with available stories");
    commands.push({
      command: "status board",
      description: "View kanban board",
      when: "To pick next story",
    });
  }

  if (storiesTotal === 0) {
    instructions.push("Continue with milestone and epic planning");
    commands.push({
      command: "plan milestones",
      description: "View/edit milestones",
      when: "To continue planning",
    });
  }

  return { situation, instructions, commands };
}

// ============================================================================
// Board Guidance
// ============================================================================

export interface BoardState {
  todoCount: number;
  inProgressCount: number;
  reviewCount: number;
  doneCount: number;
  blockedCount: number;
  blockedStories: Array<{ id: string; reason?: string }>;
}

export function getBoardGuidance(state: BoardState): AIGuidance {
  const { todoCount, inProgressCount, blockedCount, blockedStories } = state;

  let situation: string;
  if (blockedCount > 0) {
    situation = `${blockedCount} blocked stories need attention`;
  } else if (inProgressCount > 0) {
    situation = `${inProgressCount} stories in progress`;
  } else if (todoCount > 0) {
    situation = `${todoCount} stories ready to start`;
  } else {
    situation = "All stories complete or no stories found";
  }

  const instructions: string[] = [];
  const commands: CommandSuggestion[] = [];

  if (blockedCount > 0) {
    instructions.push("Resolve blocked stories first");
    for (const story of blockedStories.slice(0, 3)) {
      instructions.push(`  - ${story.id}: ${story.reason || "No reason given"}`);
    }
    commands.push({
      command: "feedback mark",
      args: "<storyId> todo",
      description: "Unblock a story",
      when: "After resolving the blocker",
    });
  }

  if (todoCount > 0 && inProgressCount < 3) {
    instructions.push("Pick a story from TODO to work on");
    commands.push({
      command: "status show",
      args: "<storyId>",
      description: "View story details",
      when: "To understand the story",
    });
    commands.push({
      command: "feedback mark",
      args: "<storyId> in_progress",
      description: "Start working on a story",
      when: "When beginning work",
    });
  }

  if (inProgressCount > 0) {
    commands.push({
      command: "feedback mark",
      args: "<storyId> done",
      description: "Mark story complete",
      when: "When story is finished",
    });
  }

  return { situation, instructions, commands };
}

// ============================================================================
// Story Guidance
// ============================================================================

export interface StoryState {
  story: Story;
  epicName: string;
  hasDependencies: boolean;
  dependenciesComplete: boolean;
}

export function getStoryGuidance(state: StoryState): AIGuidance {
  const { story, hasDependencies, dependenciesComplete } = state;

  let situation: string;
  if (story.status === "blocked") {
    situation = `Story blocked: ${story.blocked_reason || "No reason"}`;
  } else if (story.status === "done") {
    situation = "Story complete";
  } else if (hasDependencies && !dependenciesComplete) {
    situation = "Story has incomplete dependencies";
  } else {
    situation = `Story is ${story.status}`;
  }

  const instructions: string[] = [];
  const commands: CommandSuggestion[] = [];

  if (story.status === "blocked") {
    instructions.push("Resolve the blocker before continuing");
    commands.push({
      command: "feedback mark",
      args: `${story.id} todo`,
      description: "Unblock story",
      when: "After resolving blocker",
    });
  } else if (story.status === "todo") {
    if (hasDependencies && !dependenciesComplete) {
      instructions.push("Complete dependencies first");
    } else {
      instructions.push("Ready to start implementation");
      commands.push({
        command: "status how",
        args: story.id,
        description: "Get implementation guidance",
        when: "Before starting work",
      });
      commands.push({
        command: "feedback mark",
        args: `${story.id} in_progress`,
        description: "Start working",
        when: "When beginning implementation",
      });
    }
  } else if (story.status === "in_progress") {
    instructions.push("Continue implementation");
    instructions.push("Check acceptance criteria as you go");
    commands.push({
      command: "feedback mark",
      args: `${story.id} review`,
      description: "Submit for review",
      when: "When implementation is complete",
    });
    commands.push({
      command: "feedback add",
      args: `--story ${story.id} --type blocker --message '<issue>'`,
      description: "Report a blocker",
      when: "If you encounter a blocking issue",
    });
  } else if (story.status === "review") {
    instructions.push("Story is in review");
    commands.push({
      command: "feedback mark",
      args: `${story.id} done`,
      description: "Mark as done",
      when: "When review passes",
    });
  }

  // Extract epic ID from story ID (e.g., "E1.S2" -> "E1")
  const epicId = story.id.split(".")[0];

  return enhanceWithContext(
    { situation, instructions, commands },
    { target: { type: "story", id: story.id, epicId } }
  );
}

// ============================================================================
// Context Guidance
// ============================================================================

export function getContextGuidance(target: string | undefined): AIGuidance {
  const instructions = [
    "Context provides all relevant information for planning or implementation",
    "Use this to understand the full picture before making decisions",
  ];

  const commands: CommandSuggestion[] = [];

  if (!target) {
    commands.push({
      command: "status context",
      args: "E1",
      description: "View epic context",
      when: "To see epic-specific context",
    });
    commands.push({
      command: "status context",
      args: "E1.S1 --full",
      description: "View full story context",
      when: "To see story with architecture",
    });
  }

  return {
    situation: target ? `Showing context for ${target}` : "Showing project context",
    instructions,
    commands,
  };
}

// ============================================================================
// Why/How Guidance
// ============================================================================

export function getWhyGuidance(storyId: string): AIGuidance {
  const epicId = storyId.split(".")[0];

  return enhanceWithContext(
    {
      situation: `Showing lineage for ${storyId}`,
      instructions: [
        "This shows why this story exists",
        "Trace from story → requirements → epic → milestone → project",
        "Use this to understand the business context",
      ],
      commands: [
        {
          command: "status how",
          args: storyId,
          description: "Get implementation guidance",
          when: "To see how to implement",
        },
      ],
    },
    { target: { type: "story", id: storyId, epicId } }
  );
}

export function getHowGuidance(storyId: string, hasArchitecture: boolean): AIGuidance {
  const epicId = storyId.split(".")[0];

  const instructions = [
    "Use acceptance criteria as implementation checklist",
    "Reference architecture for technical approach",
  ];

  if (!hasArchitecture) {
    instructions.push("Note: No architecture found - consider generating it first");
  }

  return enhanceWithContext(
    {
      situation: `Implementation guidance for ${storyId}`,
      instructions,
      commands: [
        {
          command: "feedback mark",
          args: `${storyId} in_progress`,
          description: "Start working",
          when: "When beginning implementation",
        },
        {
          command: "status why",
          args: storyId,
          description: "See story lineage",
          when: "To understand business context",
        },
      ],
    },
    { target: { type: "story", id: storyId, epicId } }
  );
}
