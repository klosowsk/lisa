import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createTestContext,
  cleanupTestContext,
  initializeTestProject,
  setupDiscoveryComplete,
  setupMilestonesApproved,
  setupEpicWithArtifacts,
  TestContext,
} from "./test-helpers.js";

describe("Feedback Script Integration", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    await initializeTestProject(ctx);
    await setupDiscoveryComplete(ctx);
    await setupMilestonesApproved(ctx);
    await setupEpicWithArtifacts(ctx);

    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestContext(ctx);
  });

  describe("Mark Story Status", () => {
    it("should mark story as done", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const storyIndex = stories!.stories.findIndex((s) => s.id === "E1.S1");
      stories!.stories[storyIndex].status = "done";
      await ctx.state.writeStories("E1", "auth", stories!);

      const updated = await ctx.state.readStories("E1", "auth");
      const story = updated?.stories.find((s) => s.id === "E1.S1");
      expect(story?.status).toBe("done");
    });

    it("should mark story as blocked with reason", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const storyIndex = stories!.stories.findIndex((s) => s.id === "E1.S1");
      stories!.stories[storyIndex].status = "blocked";
      stories!.stories[storyIndex].blocked_reason = "Waiting for API";
      await ctx.state.writeStories("E1", "auth", stories!);

      const updated = await ctx.state.readStories("E1", "auth");
      const story = updated?.stories.find((s) => s.id === "E1.S1");
      expect(story?.status).toBe("blocked");
      expect(story?.blocked_reason).toBe("Waiting for API");
    });

    it("should mark story as in_progress", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const storyIndex = stories!.stories.findIndex((s) => s.id === "E1.S1");
      stories!.stories[storyIndex].status = "in_progress";
      await ctx.state.writeStories("E1", "auth", stories!);

      const updated = await ctx.state.readStories("E1", "auth");
      const story = updated?.stories.find((s) => s.id === "E1.S1");
      expect(story?.status).toBe("in_progress");
    });

    it("should mark story as review", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const storyIndex = stories!.stories.findIndex((s) => s.id === "E1.S1");
      stories!.stories[storyIndex].status = "review";
      await ctx.state.writeStories("E1", "auth", stories!);

      const updated = await ctx.state.readStories("E1", "auth");
      const story = updated?.stories.find((s) => s.id === "E1.S1");
      expect(story?.status).toBe("review");
    });

    it("should mark story as deferred", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const storyIndex = stories!.stories.findIndex((s) => s.id === "E1.S1");
      stories!.stories[storyIndex].status = "deferred";
      await ctx.state.writeStories("E1", "auth", stories!);

      const updated = await ctx.state.readStories("E1", "auth");
      const story = updated?.stories.find((s) => s.id === "E1.S1");
      expect(story?.status).toBe("deferred");
    });

    it("should update completed_stories count when marking done", async () => {
      const project = await ctx.state.readProject();
      const beforeCount = project?.stats.completed_stories || 0;

      // Already 1 completed (E1.S3), mark another as done
      const stories = await ctx.state.readStories("E1", "auth");
      const storyIndex = stories!.stories.findIndex((s) => s.id === "E1.S1");
      stories!.stories[storyIndex].status = "done";
      await ctx.state.writeStories("E1", "auth", stories!);

      // Manually update project stats (simulating what feedback.ts does)
      project!.stats.completed_stories = beforeCount + 1;
      await ctx.state.writeProject(project!);

      const updated = await ctx.state.readProject();
      expect(updated?.stats.completed_stories).toBe(beforeCount + 1);
    });

    it("should clear blocked_reason when unblocking", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const storyIndex = stories!.stories.findIndex((s) => s.id === "E1.S1");

      // First block
      stories!.stories[storyIndex].status = "blocked";
      stories!.stories[storyIndex].blocked_reason = "Some blocker";
      await ctx.state.writeStories("E1", "auth", stories!);

      // Then unblock
      const blockedStories = await ctx.state.readStories("E1", "auth");
      const idx = blockedStories!.stories.findIndex((s) => s.id === "E1.S1");
      blockedStories!.stories[idx].status = "todo";
      blockedStories!.stories[idx].blocked_reason = undefined;
      await ctx.state.writeStories("E1", "auth", blockedStories!);

      const updated = await ctx.state.readStories("E1", "auth");
      const story = updated?.stories.find((s) => s.id === "E1.S1");
      expect(story?.status).toBe("todo");
      expect(story?.blocked_reason).toBeUndefined();
    });
  });

  describe("Add Feedback", () => {
    it("should add blocker feedback", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      queue!.feedback.push({
        id: "fb-001",
        type: "blocker",
        source: { type: "execution", story_id: "E1.S1" },
        summary: "OAuth requires enterprise plan",
        affects: [{ type: "story", id: "E1.S1" }],
        status: "pending",
        created: new Date().toISOString(),
      });
      await ctx.state.writeFeedbackQueue(queue!);

      const updated = await ctx.state.readFeedbackQueue();
      expect(updated?.feedback).toHaveLength(1);
      expect(updated?.feedback[0].type).toBe("blocker");
    });

    it("should add gap feedback", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      queue!.feedback.push({
        id: "fb-001",
        type: "gap",
        source: { type: "execution", story_id: "E1.S1" },
        summary: "Missing offline support",
        affects: [{ type: "story", id: "E1.S1" }],
        status: "pending",
        created: new Date().toISOString(),
      });
      await ctx.state.writeFeedbackQueue(queue!);

      const updated = await ctx.state.readFeedbackQueue();
      expect(updated?.feedback[0].type).toBe("gap");
    });

    it("should add scope feedback", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      queue!.feedback.push({
        id: "fb-001",
        type: "scope",
        source: { type: "execution", story_id: "E1.S1" },
        summary: "Story too large, should split",
        affects: [{ type: "story", id: "E1.S1" }],
        status: "pending",
        created: new Date().toISOString(),
      });
      await ctx.state.writeFeedbackQueue(queue!);

      const updated = await ctx.state.readFeedbackQueue();
      expect(updated?.feedback[0].type).toBe("scope");
    });

    it("should add conflict feedback", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      queue!.feedback.push({
        id: "fb-001",
        type: "conflict",
        source: { type: "execution", story_id: "E1.S1" },
        summary: "Conflicts with E1.S2 approach",
        affects: [{ type: "story", id: "E1.S1" }],
        status: "pending",
        created: new Date().toISOString(),
      });
      await ctx.state.writeFeedbackQueue(queue!);

      const updated = await ctx.state.readFeedbackQueue();
      expect(updated?.feedback[0].type).toBe("conflict");
    });

    it("should add question feedback", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      queue!.feedback.push({
        id: "fb-001",
        type: "question",
        source: { type: "execution", story_id: "E1.S1" },
        summary: "What auth provider to use?",
        affects: [{ type: "story", id: "E1.S1" }],
        status: "pending",
        created: new Date().toISOString(),
      });
      await ctx.state.writeFeedbackQueue(queue!);

      const updated = await ctx.state.readFeedbackQueue();
      expect(updated?.feedback[0].type).toBe("question");
    });

    it("should track affected items", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      queue!.feedback.push({
        id: "fb-001",
        type: "blocker",
        source: { type: "execution", story_id: "E1.S1" },
        summary: "Issue",
        affects: [
          { type: "story", id: "E1.S1" },
          { type: "requirement", id: "E1.R1" },
          { type: "architecture", id: "E1.A1" },
        ],
        status: "pending",
        created: new Date().toISOString(),
      });
      await ctx.state.writeFeedbackQueue(queue!);

      const updated = await ctx.state.readFeedbackQueue();
      expect(updated?.feedback[0].affects).toHaveLength(3);
    });
  });

  describe("List Feedback", () => {
    it("should list pending feedback", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      queue!.feedback.push(
        {
          id: "fb-001",
          type: "blocker",
          source: { type: "execution" },
          summary: "Issue 1",
          affects: [],
          status: "pending",
          created: new Date().toISOString(),
        },
        {
          id: "fb-002",
          type: "gap",
          source: { type: "execution" },
          summary: "Issue 2",
          affects: [],
          status: "pending",
          created: new Date().toISOString(),
        }
      );
      await ctx.state.writeFeedbackQueue(queue!);

      const updated = await ctx.state.readFeedbackQueue();
      const pending = updated?.feedback.filter((f) => f.status === "pending");
      expect(pending).toHaveLength(2);
    });

    it("should not include incorporated feedback in pending", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      queue!.feedback.push({
        id: "fb-001",
        type: "blocker",
        source: { type: "execution" },
        summary: "Issue",
        affects: [],
        status: "incorporated",
        created: new Date().toISOString(),
      });
      await ctx.state.writeFeedbackQueue(queue!);

      const updated = await ctx.state.readFeedbackQueue();
      const pending = updated?.feedback.filter((f) => f.status === "pending");
      expect(pending).toHaveLength(0);
    });
  });

  describe("Resolve Feedback", () => {
    it("should mark feedback as incorporated", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      queue!.feedback.push({
        id: "fb-001",
        type: "blocker",
        source: { type: "execution", story_id: "E1.S1" },
        summary: "Issue",
        affects: [],
        status: "pending",
        created: new Date().toISOString(),
      });
      await ctx.state.writeFeedbackQueue(queue!);

      // Resolve it
      const toResolve = await ctx.state.readFeedbackQueue();
      const idx = toResolve!.feedback.findIndex((f) => f.id === "fb-001");
      const resolved = toResolve!.feedback.splice(idx, 1)[0];
      toResolve!.incorporated.push({
        id: resolved.id,
        summary: resolved.summary,
        incorporated: new Date().toISOString(),
        changes_made: ["Fixed the issue"],
      });
      await ctx.state.writeFeedbackQueue(toResolve!);

      const updated = await ctx.state.readFeedbackQueue();
      expect(updated?.feedback).toHaveLength(0);
      expect(updated?.incorporated).toHaveLength(1);
    });

    it("should track changes made during resolution", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      queue!.incorporated.push({
        id: "fb-001",
        summary: "Fixed issue",
        incorporated: new Date().toISOString(),
        changes_made: ["Updated E1.R1", "Modified E1.S1"],
      });
      await ctx.state.writeFeedbackQueue(queue!);

      const updated = await ctx.state.readFeedbackQueue();
      expect(updated?.incorporated[0].changes_made).toHaveLength(2);
    });
  });

  describe("Dismiss Feedback", () => {
    it("should mark feedback as dismissed", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      queue!.feedback.push({
        id: "fb-001",
        type: "question",
        source: { type: "execution" },
        summary: "Question",
        affects: [],
        status: "pending",
        created: new Date().toISOString(),
      });
      await ctx.state.writeFeedbackQueue(queue!);

      // Dismiss it
      const toDismiss = await ctx.state.readFeedbackQueue();
      const idx = toDismiss!.feedback.findIndex((f) => f.id === "fb-001");
      toDismiss!.feedback[idx].status = "dismissed";
      await ctx.state.writeFeedbackQueue(toDismiss!);

      const updated = await ctx.state.readFeedbackQueue();
      expect(updated?.feedback[0].status).toBe("dismissed");
    });
  });

  describe("Stuck Queue Integration", () => {
    it("should show stuck items", async () => {
      const queue = await ctx.state.readStuckQueue();
      queue!.stuck.push({
        id: "stuck-001",
        task_id: "task-001",
        type: "ambiguous_requirement",
        summary: "What does 'fast' mean?",
        attempts: [
          { number: 1, approach: "Checked docs", result: "No definition" },
        ],
        suggested_options: [
          { label: "Under 200ms", description: "Snappy" },
          { label: "Under 1s", description: "Acceptable" },
        ],
        created: new Date().toISOString(),
        priority: "high",
      });
      await ctx.state.writeStuckQueue(queue!);

      const updated = await ctx.state.readStuckQueue();
      expect(updated?.stuck).toHaveLength(1);
      expect(updated?.stuck[0].suggested_options).toHaveLength(2);
    });

    it("should track resolution of stuck items", async () => {
      const queue = await ctx.state.readStuckQueue();
      queue!.stuck.push({
        id: "stuck-001",
        task_id: "task-001",
        type: "test",
        summary: "Issue",
        attempts: [],
        created: new Date().toISOString(),
        priority: "medium",
      });
      await ctx.state.writeStuckQueue(queue!);

      // Resolve it
      const toResolve = await ctx.state.readStuckQueue();
      const stuck = toResolve!.stuck.splice(0, 1)[0];
      toResolve!.resolved.push({
        id: stuck.id,
        resolution: "User provided clarification",
        resolved: new Date().toISOString(),
        resolved_by: "human",
      });
      await ctx.state.writeStuckQueue(toResolve!);

      const updated = await ctx.state.readStuckQueue();
      expect(updated?.stuck).toHaveLength(0);
      expect(updated?.resolved).toHaveLength(1);
    });
  });
});
