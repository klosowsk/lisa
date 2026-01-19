/**
 * Feedback Commands for Lisa Engine
 *
 * Submit feedback, update story status, manage blockers.
 */

import { StateManager } from "../state.js";
import {
  CommandResult,
  OutputSection,
  success,
  error,
  section,
} from "../types.js";
import { now, generateId, parseStoryId, timeAgo } from "../utils.js";
import {
  StoryStatus,
  FeedbackType,
  FeedbackItem,
  FeedbackQueue,
  StuckQueue,
} from "../schemas.js";
import {
  getMarkStoryGuidance,
  getAddFeedbackGuidance,
  getListFeedbackGuidance,
  getResolveFeedbackGuidance,
  getDismissFeedbackGuidance,
} from "../prompts/feedback.js";

// ============================================================================
// Types
// ============================================================================

export interface MarkStoryData {
  storyId: string;
  oldStatus: StoryStatus;
  newStatus: StoryStatus;
  reason?: string;
}

export interface FeedbackListData {
  pending: FeedbackItem[];
  stuck: StuckQueue["stuck"];
  recentlyIncorporated: FeedbackQueue["incorporated"];
}

export interface AddFeedbackData {
  feedback: FeedbackItem;
  markedBlocked?: boolean;
}

export interface ResolveFeedbackData {
  feedbackId: string;
  resolved: boolean;
  storyId?: string;
}

// ============================================================================
// Mark Story Status
// ============================================================================

export async function markStory(
  state: StateManager,
  options: { storyId: string; status: StoryStatus; reason?: string }
): Promise<CommandResult<MarkStoryData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const parsed = parseStoryId(options.storyId);
  if (!parsed) {
    return error(`Invalid story ID: ${options.storyId}`, "INVALID_ID");
  }

  // Find epic
  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${parsed.epicId}-`));

  if (!epicDir) {
    return error(`Epic ${parsed.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");
  const storiesFile = await state.readStories(parsed.epicId, slug);

  if (!storiesFile) {
    return error("Stories not found.", "NOT_FOUND");
  }

  const storyIndex = storiesFile.stories.findIndex((s) => s.id === options.storyId);
  if (storyIndex === -1) {
    return error(`Story ${options.storyId} not found.`, "NOT_FOUND");
  }

  const story = storiesFile.stories[storyIndex];
  const oldStatus = story.status;

  // Update story
  story.status = options.status;
  if (options.status === "blocked" && options.reason) {
    story.blocked_reason = options.reason;
  } else if (options.status !== "blocked") {
    story.blocked_reason = undefined;
  }

  storiesFile.stories[storyIndex] = story;
  await state.writeStories(parsed.epicId, slug, storiesFile);

  // Update project stats if marking done
  if (options.status === "done" && oldStatus !== "done") {
    const project = await state.readProject();
    if (project) {
      project.stats.completed_stories += 1;
      await state.writeProject(project);
    }
  } else if (oldStatus === "done" && options.status !== "done") {
    const project = await state.readProject();
    if (project) {
      project.stats.completed_stories = Math.max(0, project.stats.completed_stories - 1);
      await state.writeProject(project);
    }
  }

  const sections: OutputSection[] = [
    section.success(`${options.storyId} marked as ${options.status}`),
  ];

  if (options.status === "blocked" && options.reason) {
    sections.push(section.dim(`  Reason: ${options.reason}`));
  }

  if (options.status === "done") {
    sections.push(section.info("Great work! Check for next stories with 'status board'"));
  }

  const data: MarkStoryData = {
    storyId: options.storyId,
    oldStatus,
    newStatus: options.status,
    reason: options.reason,
  };

  const aiGuidance = getMarkStoryGuidance({
    storyId: options.storyId,
    oldStatus,
    newStatus: options.status,
    reason: options.reason,
  });

  return success(data, sections, aiGuidance);
}

// ============================================================================
// Add Feedback
// ============================================================================

export async function addFeedback(
  state: StateManager,
  options: { storyId: string; type: FeedbackType; message: string }
): Promise<CommandResult<AddFeedbackData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const parsed = parseStoryId(options.storyId);
  if (!parsed) {
    return error(`Invalid story ID: ${options.storyId}`, "INVALID_ID");
  }

  // Read feedback queue
  let feedbackQueue = await state.readFeedbackQueue();
  if (!feedbackQueue) {
    feedbackQueue = { feedback: [], incorporated: [] };
  }

  // Create feedback item
  const feedback: FeedbackItem = {
    id: generateId("fb"),
    type: options.type,
    source: {
      type: "execution",
      story_id: options.storyId,
    },
    summary: options.message,
    affects: [{ type: "story", id: options.storyId }],
    status: "pending",
    created: now(),
  };

  feedbackQueue.feedback.push(feedback);
  await state.writeFeedbackQueue(feedbackQueue);

  const sections: OutputSection[] = [
    section.success(`Feedback added: ${feedback.id}`),
    section.dim(`  Type: ${options.type}`),
    section.dim(`  Story: ${options.storyId}`),
    section.dim(`  Message: ${options.message}`),
  ];

  let markedBlocked = false;

  // If blocker, also mark story as blocked
  if (options.type === "blocker") {
    sections.push(section.blank());
    sections.push(section.info("Also marking story as blocked..."));

    // Mark story blocked
    await markStory(state, {
      storyId: options.storyId,
      status: "blocked",
      reason: options.message,
    });
    markedBlocked = true;
  }

  const aiGuidance = getAddFeedbackGuidance({
    feedbackId: feedback.id,
    type: options.type,
    storyId: options.storyId,
    markedBlocked,
  });

  return success({ feedback, markedBlocked }, sections, aiGuidance);
}

// ============================================================================
// List Feedback
// ============================================================================

export async function listFeedback(state: StateManager): Promise<CommandResult<FeedbackListData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const feedbackQueue = await state.readFeedbackQueue();
  const stuckQueue = await state.readStuckQueue();

  const pending = feedbackQueue?.feedback.filter((f) => f.status === "pending") || [];
  const stuck = stuckQueue?.stuck || [];
  const incorporated = feedbackQueue?.incorporated.slice(-5) || [];

  const sections: OutputSection[] = [section.header("Feedback & Blockers")];

  // Pending feedback
  if (pending.length > 0) {
    sections.push(section.subheader(`Pending Feedback (${pending.length})`));
    sections.push(section.blank());

    for (const fb of pending) {
      const typeIcon = fb.type === "blocker" ? "🚫" : fb.type === "gap" ? "📋" : "❓";
      sections.push(section.text(`  ${typeIcon} ${fb.id} [${fb.type}]`));
      sections.push(section.text(`     ${fb.summary}`));
      if (fb.source.story_id) {
        sections.push(section.dim(`     Story: ${fb.source.story_id}`));
      }
      sections.push(section.dim(`     Created: ${timeAgo(fb.created)}`));
      sections.push(section.blank());
    }
  } else {
    sections.push(section.info("No pending feedback"));
    sections.push(section.blank());
  }

  // Stuck items
  if (stuck.length > 0) {
    sections.push(section.subheader(`Stuck Items (${stuck.length})`));
    sections.push(section.blank());

    for (const item of stuck) {
      sections.push(section.text(`  ⚠️  ${item.id}`));
      sections.push(section.text(`     ${item.summary}`));
      sections.push(section.dim(`     Attempts: ${item.attempts.length}`));
      sections.push(section.dim(`     Priority: ${item.priority}`));
      if (item.suggested_options && item.suggested_options.length > 0) {
        sections.push(section.dim(`     Suggested options:`));
        for (const opt of item.suggested_options) {
          sections.push(section.dim(`       - ${opt.label}: ${opt.description}`));
        }
      }
      sections.push(section.blank());
    }
  }

  // Recently incorporated
  if (incorporated.length > 0) {
    sections.push(section.subheader("Recently Incorporated"));
    for (const fb of incorporated) {
      sections.push(section.success(`${fb.id}: ${fb.summary.slice(0, 50)}...`));
      sections.push(section.dim(`  Changes: ${fb.changes_made.join(", ")}`));
    }
  }

  const data: FeedbackListData = {
    pending,
    stuck,
    recentlyIncorporated: incorporated,
  };

  const blockerCount = pending.filter((f) => f.type === "blocker").length;
  const aiGuidance = getListFeedbackGuidance({
    pendingCount: pending.length,
    blockerCount,
    stuckCount: stuck.length,
    pendingItems: pending,
    stuckItems: stuck,
  });

  return success(data, sections, aiGuidance);
}

// ============================================================================
// Resolve Feedback
// ============================================================================

export async function resolveFeedback(
  state: StateManager,
  options: { feedbackId: string; resolution?: string }
): Promise<CommandResult<ResolveFeedbackData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const feedbackQueue = await state.readFeedbackQueue();
  if (!feedbackQueue) {
    return error("No feedback queue found.", "NOT_FOUND");
  }

  const index = feedbackQueue.feedback.findIndex((f) => f.id === options.feedbackId);
  if (index === -1) {
    return error(`Feedback ${options.feedbackId} not found.`, "NOT_FOUND");
  }

  const feedback = feedbackQueue.feedback[index];

  // Move to incorporated
  feedbackQueue.incorporated.push({
    id: feedback.id,
    summary: feedback.summary,
    incorporated: now(),
    changes_made: [options.resolution || "Resolved"],
  });

  // Remove from pending
  feedbackQueue.feedback.splice(index, 1);

  await state.writeFeedbackQueue(feedbackQueue);

  const sections: OutputSection[] = [section.success(`Feedback ${options.feedbackId} resolved`)];

  // If the feedback was for a blocked story, offer to unblock it
  if (feedback.type === "blocker" && feedback.source.story_id) {
    sections.push(section.blank());
    sections.push(section.info(`Story ${feedback.source.story_id} was blocked by this issue.`));
    sections.push(
      section.info(`To unblock, run: feedback mark ${feedback.source.story_id} todo`)
    );
  }

  const data: ResolveFeedbackData = {
    feedbackId: options.feedbackId,
    resolved: true,
    storyId: feedback.source.story_id,
  };

  const aiGuidance = getResolveFeedbackGuidance({
    feedbackId: options.feedbackId,
    feedbackType: feedback.type,
    storyId: feedback.source.story_id,
    wasBlocker: feedback.type === "blocker",
  });

  return success(data, sections, aiGuidance);
}

// ============================================================================
// Dismiss Feedback
// ============================================================================

export async function dismissFeedback(
  state: StateManager,
  options: { feedbackId: string }
): Promise<CommandResult<{ dismissed: boolean }>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const feedbackQueue = await state.readFeedbackQueue();
  if (!feedbackQueue) {
    return error("No feedback queue found.", "NOT_FOUND");
  }

  const index = feedbackQueue.feedback.findIndex((f) => f.id === options.feedbackId);
  if (index === -1) {
    return error(`Feedback ${options.feedbackId} not found.`, "NOT_FOUND");
  }

  feedbackQueue.feedback[index].status = "dismissed";
  await state.writeFeedbackQueue(feedbackQueue);

  const sections: OutputSection[] = [section.success(`Feedback ${options.feedbackId} dismissed`)];

  const aiGuidance = getDismissFeedbackGuidance(options.feedbackId);

  return success({ dismissed: true }, sections, aiGuidance);
}
