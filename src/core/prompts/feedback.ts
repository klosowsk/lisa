/**
 * Feedback Prompts for Lisa Engine
 *
 * AI guidance templates for feedback, story status, and blocker management.
 */

import { AIGuidance, CommandSuggestion } from "../types.js";
import { StoryStatus, FeedbackType, FeedbackItem, StuckItem } from "../schemas.js";
import { enhanceWithContext } from "./context-helpers.js";

// ============================================================================
// Mark Story Guidance
// ============================================================================

export interface MarkStoryState {
  storyId: string;
  oldStatus: StoryStatus;
  newStatus: StoryStatus;
  reason?: string;
}

export function getMarkStoryGuidance(state: MarkStoryState): AIGuidance {
  const { storyId, newStatus, reason } = state;

  let situation: string;
  let instructions: string[];
  const commands: CommandSuggestion[] = [];

  switch (newStatus) {
    case "done":
      situation = `Story ${storyId} marked as done`;
      instructions = [
        "Celebrate the completion",
        "Check board for next available stories",
        "Consider if any dependent stories are now unblocked",
      ];
      commands.push({
        command: "status board",
        description: "Check kanban board",
        when: "To see next available work",
      });
      break;

    case "blocked":
      situation = `Story ${storyId} marked as blocked: ${reason || "No reason given"}`;
      instructions = [
        "Record the blocker details in feedback",
        "Look for workarounds or alternative approaches",
        "Consider if this impacts other stories",
        "Escalate if needed",
      ];
      commands.push(
        {
          command: "feedback add",
          args: `--story ${storyId} --type blocker --message '<details>'`,
          description: "Record blocker details",
          when: "If not already recorded",
        },
        {
          command: "status board",
          description: "Check other available stories",
          when: "To continue work elsewhere",
        }
      );
      break;

    case "in_progress":
      situation = `Story ${storyId} is now in progress`;
      instructions = [
        "Start implementation",
        "Refer to acceptance criteria as checklist",
        "Check architecture for technical guidance",
      ];
      commands.push(
        {
          command: "status how",
          args: storyId,
          description: "Get implementation guidance",
          when: "For detailed implementation checklist",
        },
        {
          command: "status context",
          args: storyId,
          description: "View full context",
          when: "For architecture and requirements",
        }
      );
      break;

    case "review":
      situation = `Story ${storyId} submitted for review`;
      instructions = [
        "Verify all acceptance criteria are met",
        "Run tests if applicable",
        "Wait for review feedback",
      ];
      commands.push({
        command: "feedback mark",
        args: `${storyId} done`,
        description: "Mark as done",
        when: "When review passes",
      });
      break;

    case "todo":
      situation = `Story ${storyId} moved to todo`;
      instructions = ["Story is ready to be picked up", "Check dependencies before starting"];
      commands.push({
        command: "feedback mark",
        args: `${storyId} in_progress`,
        description: "Start working",
        when: "When ready to begin",
      });
      break;

    default:
      situation = `Story ${storyId} status changed to ${newStatus}`;
      instructions = ["Continue with the workflow"];
      commands.push({
        command: "status board",
        description: "Check kanban board",
        when: "To see project status",
      });
  }

  // Extract epic ID from story ID (e.g., "E1.S2" -> "E1")
  const epicId = storyId.split(".")[0];

  return enhanceWithContext(
    { situation, instructions, commands },
    { target: { type: "story", id: storyId, epicId } }
  );
}

// ============================================================================
// Add Feedback Guidance
// ============================================================================

export interface AddFeedbackState {
  feedbackId: string;
  type: FeedbackType;
  storyId: string;
  markedBlocked: boolean;
}

export function getAddFeedbackGuidance(state: AddFeedbackState): AIGuidance {
  const { feedbackId, type, storyId, markedBlocked } = state;

  let situation: string;
  let instructions: string[];
  const commands: CommandSuggestion[] = [];

  switch (type) {
    case "blocker":
      situation = markedBlocked
        ? `Blocker recorded (${feedbackId}) and story ${storyId} marked blocked`
        : `Blocker recorded: ${feedbackId}`;
      instructions = [
        "Document what you tried and why it's blocked",
        "Look for alternative approaches",
        "Consider if other stories can proceed",
        "Escalate if this blocks critical path",
      ];
      commands.push({
        command: "status board",
        description: "Find other stories to work on",
        when: "To continue with unblocked work",
      });
      break;

    case "gap":
      situation = `Gap identified: ${feedbackId}`;
      instructions = [
        "This indicates missing requirements or unclear specs",
        "Consider if planning needs revision",
        "Clarify with stakeholders if needed",
      ];
      commands.push({
        command: "plan epic",
        args: storyId.split(".")[0],
        description: "Review epic planning",
        when: "If PRD needs updates",
      });
      break;

    case "scope":
      situation = `Scope concern recorded: ${feedbackId}`;
      instructions = [
        "Story may need to be split or rescoped",
        "Review acceptance criteria for clarity",
        "Consider breaking into smaller stories",
      ];
      break;

    case "conflict":
      situation = `Conflict detected: ${feedbackId}`;
      instructions = [
        "Resolve the conflict before proceeding",
        "Check if architectural changes are needed",
        "May need to update dependent stories",
      ];
      break;

    case "question":
      situation = `Question recorded: ${feedbackId}`;
      instructions = [
        "Get clarification before proceeding",
        "Document the answer when received",
        "Update requirements if needed",
      ];
      break;

    default:
      situation = `Feedback recorded: ${feedbackId}`;
      instructions = ["Review and address the feedback"];
  }

  commands.push({
    command: "feedback list",
    description: "View all feedback",
    when: "To see pending items",
  });

  // Extract epic ID from story ID (e.g., "E1.S2" -> "E1")
  const epicId = storyId.split(".")[0];

  return enhanceWithContext(
    { situation, instructions, commands },
    { target: { type: "story", id: storyId, epicId } }
  );
}

// ============================================================================
// List Feedback Guidance
// ============================================================================

export interface ListFeedbackState {
  pendingCount: number;
  blockerCount: number;
  stuckCount: number;
  pendingItems: FeedbackItem[];
  stuckItems: StuckItem[];
}

export function getListFeedbackGuidance(state: ListFeedbackState): AIGuidance {
  const { pendingCount, blockerCount, stuckCount, pendingItems, stuckItems } = state;

  let situation: string;
  const instructions: string[] = [];
  const commands: CommandSuggestion[] = [];

  if (pendingCount === 0 && stuckCount === 0) {
    situation = "No pending feedback or blockers";
    instructions.push("Continue with implementation");
    commands.push({
      command: "status board",
      description: "View available stories",
      when: "To pick next work",
    });
    return { situation, instructions, commands };
  }

  situation =
    blockerCount > 0
      ? `${blockerCount} blockers and ${pendingCount - blockerCount} other feedback items`
      : `${pendingCount} feedback items pending`;

  if (stuckCount > 0) {
    situation += `, ${stuckCount} stuck items need resolution`;
  }

  // Prioritize blockers
  if (blockerCount > 0) {
    instructions.push("Address blockers first - they're blocking progress");
    const blockers = pendingItems.filter((f) => f.type === "blocker");
    for (const blocker of blockers.slice(0, 3)) {
      instructions.push(`  - ${blocker.id}: ${blocker.summary.slice(0, 50)}...`);
    }
  }

  // Then stuck items
  if (stuckCount > 0) {
    instructions.push("Resolve stuck items - AI needs human input");
    for (const stuck of stuckItems.slice(0, 2)) {
      instructions.push(`  - ${stuck.id}: ${stuck.summary.slice(0, 50)}...`);
      if (stuck.suggested_options && stuck.suggested_options.length > 0) {
        instructions.push(`    Options: ${stuck.suggested_options.map((o) => o.label).join(", ")}`);
      }
    }
  }

  // Then other feedback
  const nonBlockers = pendingItems.filter((f) => f.type !== "blocker");
  if (nonBlockers.length > 0) {
    instructions.push("Review other feedback when blockers are resolved");
  }

  commands.push({
    command: "feedback resolve",
    args: "<id>",
    description: "Resolve a feedback item",
    when: "After addressing the issue",
  });

  if (blockerCount > 0) {
    const firstBlocker = pendingItems.find((f) => f.type === "blocker");
    if (firstBlocker?.source.story_id) {
      commands.push({
        command: "feedback mark",
        args: `${firstBlocker.source.story_id} todo`,
        description: "Unblock the story",
        when: "After resolving the blocker",
      });
    }
  }

  return { situation, instructions, commands };
}

// ============================================================================
// Resolve Feedback Guidance
// ============================================================================

export interface ResolveFeedbackState {
  feedbackId: string;
  feedbackType: FeedbackType;
  storyId?: string;
  wasBlocker: boolean;
}

export function getResolveFeedbackGuidance(state: ResolveFeedbackState): AIGuidance {
  const { feedbackId, storyId, wasBlocker } = state;

  let situation = `Feedback ${feedbackId} resolved`;
  const instructions: string[] = [];
  const commands: CommandSuggestion[] = [];

  if (wasBlocker && storyId) {
    situation += ` - story ${storyId} may be ready to unblock`;
    instructions.push(`Story ${storyId} was blocked by this issue`);
    instructions.push("Unblock the story if the issue is fully resolved");
    commands.push({
      command: "feedback mark",
      args: `${storyId} todo`,
      description: "Unblock the story",
      when: "If blocker is fully resolved",
    });
  }

  instructions.push("Check if other feedback items need attention");

  commands.push({
    command: "feedback list",
    description: "View remaining feedback",
    when: "To check for other items",
  });

  commands.push({
    command: "status board",
    description: "View kanban board",
    when: "To continue with available work",
  });

  // Enhance with context if we have a story
  if (storyId) {
    const epicId = storyId.split(".")[0];
    return enhanceWithContext(
      { situation, instructions, commands },
      { target: { type: "story", id: storyId, epicId } }
    );
  }

  return { situation, instructions, commands };
}

// ============================================================================
// Dismiss Feedback Guidance
// ============================================================================

export function getDismissFeedbackGuidance(feedbackId: string): AIGuidance {
  return {
    situation: `Feedback ${feedbackId} dismissed`,
    instructions: [
      "Feedback has been dismissed but not resolved",
      "Consider documenting why it was dismissed",
      "Continue with other work",
    ],
    commands: [
      {
        command: "feedback list",
        description: "View remaining feedback",
        when: "To check for other items",
      },
    ],
  };
}
