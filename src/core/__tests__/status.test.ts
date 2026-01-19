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
import { overview } from "../commands/status.js";

describe("Status Script Integration", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    await initializeTestProject(ctx);

    vi.spyOn(process, "cwd").mockReturnValue(ctx.testDir);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestContext(ctx);
  });

  describe("Project Overview", () => {
    it("should show basic project info", async () => {
      const project = await ctx.state.readProject();

      expect(project?.name).toBe("Test Project");
      expect(project?.status).toBe("active");
    });

    it("should show project stats", async () => {
      const project = await ctx.state.readProject();

      expect(project?.stats.milestones).toBe(0);
      expect(project?.stats.epics).toBe(0);
      expect(project?.stats.stories).toBe(0);
      expect(project?.stats.completed_stories).toBe(0);
    });

    it("should show updated stats after setup", async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);

      const project = await ctx.state.readProject();

      expect(project?.stats.epics).toBe(1);
      expect(project?.stats.stories).toBe(3);
      expect(project?.stats.completed_stories).toBe(1);
    });
  });

  describe("Overview Command Stats Calculation", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should calculate stats dynamically from actual stories", async () => {
      const result = await overview(ctx.state);

      expect(result.status).toBe("success");
      expect(result.data.project.stats.stories).toBe(3);
      expect(result.data.project.stats.completedStories).toBe(1);
      expect(result.data.project.stats.epics).toBe(1);
      expect(result.data.project.stats.milestones).toBe(1);
    });

    it("should show correct stats even when project.stats is stale", async () => {
      // Simulate stale project.stats (e.g., stories=0 but completed_stories=4)
      const project = await ctx.state.readProject();
      if (project) {
        project.stats.stories = 0;
        project.stats.completed_stories = 99;
        project.stats.epics = 0;
        project.stats.milestones = 0;
        await ctx.state.writeProject(project);
      }

      // Overview should calculate dynamically, not use stale values
      const result = await overview(ctx.state);

      expect(result.status).toBe("success");
      // Should reflect actual data, not stale project.stats
      expect(result.data.project.stats.stories).toBe(3);
      expect(result.data.project.stats.completedStories).toBe(1);
      expect(result.data.project.stats.epics).toBe(1);
      expect(result.data.project.stats.milestones).toBe(1);
    });

    it("should update completed count when story status changes", async () => {
      // Mark another story as done
      const stories = await ctx.state.readStories("E1", "auth");
      if (stories) {
        const story = stories.stories.find((s) => s.id === "E1.S1");
        if (story) {
          story.status = "done";
        }
        await ctx.state.writeStories("E1", "auth", stories);
      }

      const result = await overview(ctx.state);

      expect(result.status).toBe("success");
      expect(result.data.project.stats.stories).toBe(3);
      expect(result.data.project.stats.completedStories).toBe(2); // Now 2 done
    });

    it("should count stories across multiple epics", async () => {
      // Add a second epic with stories
      await ctx.state.createEpicDir("E2", "profile");
      const epic2 = {
        id: "E2",
        slug: "profile",
        name: "User Profile",
        description: "User profile management",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "complete" as const, version: 1 },
          architecture: { status: "complete" as const, version: 1 },
          stories: { status: "complete" as const, count: 2 },
        },
        dependencies: [],
        stats: { requirements: 1, stories: 2, coverage: 100 },
      };
      await ctx.state.writeEpic(epic2);

      const stories2 = {
        epic_id: "E2",
        stories: [
          {
            id: "E2.S1",
            title: "View profile",
            description: "View user profile",
            type: "feature" as const,
            requirements: ["E2.R1"],
            acceptance_criteria: ["Profile displayed"],
            dependencies: [],
            status: "done" as const,
            assignee: null,
          },
          {
            id: "E2.S2",
            title: "Edit profile",
            description: "Edit user profile",
            type: "feature" as const,
            requirements: ["E2.R1"],
            acceptance_criteria: ["Profile updated"],
            dependencies: ["E2.S1"],
            status: "todo" as const,
            assignee: null,
          },
        ],
        coverage: { "E2.R1": ["E2.S1", "E2.S2"] },
        validation: { coverage_complete: true, all_links_valid: true },
      };
      await ctx.state.writeStories("E2", "profile", stories2);

      // Add E2 to milestone
      const index = await ctx.state.readMilestoneIndex();
      if (index && index.milestones.length > 0) {
        index.milestones[0].epics.push("E2");
        await ctx.state.writeMilestoneIndex(index);
      }

      const result = await overview(ctx.state);

      expect(result.status).toBe("success");
      expect(result.data.project.stats.epics).toBe(2);
      expect(result.data.project.stats.stories).toBe(5); // 3 from E1 + 2 from E2
      expect(result.data.project.stats.completedStories).toBe(2); // 1 from E1 + 1 from E2
    });
  });

  describe("Milestone Progress", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
    });

    it("should show milestone list", async () => {
      const index = await ctx.state.readMilestoneIndex();

      expect(index?.milestones).toHaveLength(1);
      expect(index?.milestones[0].name).toBe("Foundation");
    });

    it("should calculate story progress per milestone", async () => {
      await setupEpicWithArtifacts(ctx);

      const index = await ctx.state.readMilestoneIndex();
      const milestone = index?.milestones[0];

      expect(milestone?.epics).toContain("E1");

      // Get stories for the epic
      const stories = await ctx.state.readStories("E1", "auth");
      const total = stories?.stories.length || 0;
      const completed = stories?.stories.filter((s) => s.status === "done").length || 0;

      expect(total).toBe(3);
      expect(completed).toBe(1);
    });
  });

  describe("Epic Status", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should show epic list", async () => {
      const epicDirs = await ctx.state.listEpicDirs();
      expect(epicDirs).toHaveLength(1);
      expect(epicDirs[0]).toBe("E1-auth");
    });

    it("should show epic details", async () => {
      const result = await ctx.state.getEpicWithStatus("E1", "auth");

      expect(result?.epic.name).toBe("Authentication");
      // Status is derived: test helper creates a story with status "in_progress"
      expect(result?.status).toBe("in_progress");
      expect(result?.epic.artifacts.prd.status).toBe("complete");
    });
  });

  describe("Board View", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should group stories by status", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const byStatus: Record<string, number> = {};

      stories?.stories.forEach((s) => {
        byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      });

      expect(byStatus.todo).toBe(1);
      expect(byStatus.in_progress).toBe(1);
      expect(byStatus.done).toBe(1);
    });
  });

  describe("Story Details", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should show story by ID", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const story = stories?.stories.find((s) => s.id === "E1.S1");

      expect(story).toBeDefined();
      expect(story?.title).toBe("Implement login API");
      expect(story?.type).toBe("feature");
    });

    it("should show acceptance criteria", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const story = stories?.stories[0];

      expect(story?.acceptance_criteria).toBeDefined();
      expect(story?.acceptance_criteria.length).toBeGreaterThan(0);
    });

    it("should show requirement links", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const story = stories?.stories[0];

      expect(story?.requirements).toContain("E1.R1");
    });

    it("should show dependencies", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const story = stories?.stories.find((s) => s.id === "E1.S2");

      expect(story?.dependencies).toContain("E1.S1");
    });
  });

  describe("Story Context", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should provide full context for implementation", async () => {
      // Read all context pieces
      const epic = await ctx.state.readEpic("E1", "auth");
      const prd = await ctx.state.readPrd("E1", "auth");
      const arch = await ctx.state.readArchitecture("E1", "auth");
      const stories = await ctx.state.readStories("E1", "auth");
      const discoveryContext = await ctx.state.readDiscoveryContext();
      const constraints = await ctx.state.readConstraints();

      // All should be available
      expect(epic).toBeDefined();
      expect(prd).toBeDefined();
      expect(arch).toBeDefined();
      expect(stories).toBeDefined();
      expect(discoveryContext).toBeDefined();

      // Should have business context
      expect(discoveryContext?.problem).toBe("Test problem");
      expect(discoveryContext?.vision).toBe("Test vision");
    });
  });

  describe("Story Lineage (Why)", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should trace story back to requirements", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const story = stories?.stories[0];

      expect(story?.requirements).toBeDefined();
      expect(story?.requirements.length).toBeGreaterThan(0);
    });

    it("should trace story back to epic", async () => {
      const epic = await ctx.state.readEpic("E1", "auth");

      expect(epic?.name).toBe("Authentication");
      expect(epic?.description).toBeDefined();
    });

    it("should trace epic back to milestone", async () => {
      const epic = await ctx.state.readEpic("E1", "auth");
      const index = await ctx.state.readMilestoneIndex();
      const milestone = index?.milestones.find((m) => m.id === epic?.milestone);

      expect(milestone).toBeDefined();
      expect(milestone?.name).toBe("Foundation");
    });

    it("should include business context", async () => {
      const context = await ctx.state.readDiscoveryContext();

      expect(context?.problem).toBeDefined();
      expect(context?.values?.length).toBeGreaterThan(0);
    });
  });

  describe("Architecture Guidance (How)", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should provide architecture reference", async () => {
      const arch = await ctx.state.readArchitecture("E1", "auth");

      expect(arch).toContain("# Architecture");
      expect(arch).toContain("Data Model");
      expect(arch).toContain("API");
    });

    it("should show story dependencies status", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const story = stories?.stories.find((s) => s.id === "E1.S2");

      // S2 depends on S1
      const dependencyId = story?.dependencies[0];
      const dependency = stories?.stories.find((s) => s.id === dependencyId);

      expect(dependency?.status).toBe("todo");
    });
  });

  describe("Hierarchical Context Display", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    describe("Project Context", () => {
      it("should assemble project context with discovery", async () => {
        const context = await ctx.state.assembleProjectContext();

        expect(context.project.name).toBe("Test Project");
        expect(context.project.status).toBe("active");
        expect(context.discovery?.problem).toBe("Test problem");
        expect(context.discovery?.vision).toBe("Test vision");
        expect(context.discovery?.values).toHaveLength(1);
        expect(context.discovery?.values?.[0].name).toBe("Simplicity");
      });

      it("should include constraints when present", async () => {
        // Add constraints
        const constraints = await ctx.state.readConstraints();
        if (constraints) {
          constraints.constraints = [
            {
              id: "C1",
              type: "technical",
              constraint: "Must use TypeScript",
              impact: ["All code"],
            },
          ];
          await ctx.state.writeConstraints(constraints);
        }

        const context = await ctx.state.assembleProjectContext();

        expect(context.constraints?.constraints).toHaveLength(1);
        expect(context.constraints?.constraints[0].constraint).toBe("Must use TypeScript");
      });

      it("should return null discovery when not complete", async () => {
        // Reset discovery
        const history = await ctx.state.readDiscoveryHistory();
        if (history) {
          history.is_complete = false;
          history.completed = undefined;
          await ctx.state.writeDiscoveryHistory(history);
        }

        const discContext = await ctx.state.readDiscoveryContext();
        if (discContext) {
          discContext.problem = undefined;
          discContext.vision = undefined;
          discContext.gathered = undefined;
          await ctx.state.writeDiscoveryContext(discContext);
        }

        const context = await ctx.state.assembleProjectContext();

        // Discovery context should still exist but with undefined values
        expect(context.discovery?.problem).toBeUndefined();
        expect(context.discovery?.vision).toBeUndefined();
      });
    });

    describe("Milestone Context", () => {
      it("should assemble milestone context with inherited project", async () => {
        const context = await ctx.state.assembleMilestoneContext("M1");

        expect(context.milestone.id).toBe("M1");
        expect(context.milestone.name).toBe("Foundation");
        expect(context.project.project.name).toBe("Test Project");
        expect(context.project.discovery?.problem).toBe("Test problem");
      });

      it("should include sibling epics", async () => {
        const context = await ctx.state.assembleMilestoneContext("M1");

        expect(context.siblingEpics).toHaveLength(1);
        expect(context.siblingEpics[0].id).toBe("E1");
        expect(context.siblingEpics[0].name).toBe("Authentication");
      });

      it("should return null milestone discovery when not done", async () => {
        const context = await ctx.state.assembleMilestoneContext("M1");

        // No milestone discovery was set up
        expect(context.milestoneDiscovery).toBeNull();
      });

      it("should include milestone discovery when available", async () => {
        // Add milestone discovery
        const now = new Date().toISOString();
        await ctx.state.writeMilestoneDiscovery("M1", {
          status: "complete",
          problem: undefined,
          scope: [],
          out_of_scope: [],
          success_criteria: ["Milestone M1 is done when auth works"],
          constraints: [],
          created: now,
          updated: now,
          source: "user_added",
          element_type: "milestone",
          element_id: "M1",
          history: [],
        });

        const context = await ctx.state.assembleMilestoneContext("M1");

        expect(context.milestoneDiscovery?.status).toBe("complete");
        expect(context.milestoneDiscovery?.success_criteria).toContain("Milestone M1 is done when auth works");
      });
    });

    describe("Epic Context", () => {
      it("should assemble epic context with all inherited context", async () => {
        const context = await ctx.state.assembleEpicContext("E1");

        expect(context.epic.id).toBe("E1");
        expect(context.epic.name).toBe("Authentication");
        expect(context.milestone.id).toBe("M1");
        expect(context.project.project.name).toBe("Test Project");
        expect(context.project.discovery?.problem).toBe("Test problem");
      });

      it("should include artifact status in epic context", async () => {
        const context = await ctx.state.assembleEpicContext("E1");

        // Artifacts should be included (from EpicSchema)
        expect(context.epic.artifacts).toBeDefined();
        expect(context.epic.artifacts.prd.status).toBe("complete");
        expect(context.epic.artifacts.prd.version).toBe(1);
        expect(context.epic.artifacts.architecture.status).toBe("complete");
        expect(context.epic.artifacts.stories.status).toBe("complete");
        expect(context.epic.artifacts.stories.count).toBe(3);

        // Stats should also be included
        expect(context.epic.stats).toBeDefined();
        expect(context.epic.stats.requirements).toBe(2);
        expect(context.epic.stats.stories).toBe(3);
        expect(context.epic.stats.coverage).toBe(100);
      });

      it("should include epic discovery when available", async () => {
        // Add epic discovery
        const now = new Date().toISOString();
        await ctx.state.writeEpicDiscovery("E1", "auth", {
          status: "complete",
          problem: "Need secure authentication",
          scope: ["Login", "Logout", "Session management"],
          out_of_scope: ["OAuth", "SSO"],
          success_criteria: ["Users can log in securely"],
          constraints: [
            { id: "EC1", type: "technical", constraint: "Use JWT", impact: [] },
          ],
          created: now,
          updated: now,
          source: "user_added",
          element_type: "epic",
          element_id: "E1",
          history: [],
        });

        const context = await ctx.state.assembleEpicContext("E1");

        expect(context.epicDiscovery?.status).toBe("complete");
        expect(context.epicDiscovery?.problem).toBe("Need secure authentication");
        expect(context.epicDiscovery?.scope).toContain("Login");
        expect(context.epicDiscovery?.out_of_scope).toContain("OAuth");
        expect(context.epicDiscovery?.constraints).toHaveLength(1);
      });

      it("should include dependencies with PRD/arch status", async () => {
        // Create a second epic that E1 depends on
        await ctx.state.createEpicDir("E2", "core");
        const epic2 = {
          id: "E2",
          slug: "core",
          name: "Core Framework",
          description: "Core application framework",
          milestone: "M1",
          deferred: false,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          artifacts: {
            prd: { status: "complete" as const, version: 1 },
            architecture: { status: "pending" as const, version: 0 },
            stories: { status: "pending" as const, count: 0 },
          },
          dependencies: [],
          stats: { requirements: 0, stories: 0, coverage: 0 },
        };
        await ctx.state.writeEpic(epic2);
        await ctx.state.writePrd("E2", "core", "# Core PRD");

        // Update E1 to depend on E2
        const e1 = await ctx.state.readEpic("E1", "auth");
        if (e1) {
          e1.dependencies = ["E2"];
          await ctx.state.writeEpic(e1);
        }

        const context = await ctx.state.assembleEpicContext("E1");

        expect(context.dependencies).toHaveLength(1);
        expect(context.dependencies[0].id).toBe("E2");
        expect(context.dependencies[0].hasPrd).toBe(true);
        expect(context.dependencies[0].hasArchitecture).toBe(false);
      });
    });

    describe("Story Context", () => {
      it("should assemble story context with full hierarchy", async () => {
        const context = await ctx.state.assembleStoryContext("E1");

        expect(context.epic.id).toBe("E1");
        expect(context.milestone.id).toBe("M1");
        expect(context.project.project.name).toBe("Test Project");
        expect(context.prd).toContain("# E1: Authentication");
        expect(context.architecture).toContain("# Architecture");
      });

      it("should include requirements extracted from PRD", async () => {
        const context = await ctx.state.assembleStoryContext("E1");

        expect(context.requirements.length).toBeGreaterThan(0);
        expect(context.requirements.find(r => r.id === "E1.R1")).toBeDefined();
        expect(context.requirements.find(r => r.id === "E1.R2")).toBeDefined();
      });

      it("should inherit all project context", async () => {
        const context = await ctx.state.assembleStoryContext("E1");

        expect(context.project.discovery?.problem).toBe("Test problem");
        expect(context.project.discovery?.vision).toBe("Test vision");
        expect(context.project.discovery?.values?.[0].name).toBe("Simplicity");
      });
    });

    describe("JSON Output Format", () => {
      it("should output valid JSON for project context", async () => {
        const context = await ctx.state.assembleProjectContext();
        const json = JSON.stringify(context);
        const parsed = JSON.parse(json);

        expect(parsed.project.name).toBe("Test Project");
        expect(parsed.discovery.problem).toBe("Test problem");
      });

      it("should output valid JSON for epic context with artifacts", async () => {
        const context = await ctx.state.assembleEpicContext("E1");
        const json = JSON.stringify(context);
        const parsed = JSON.parse(json);

        expect(parsed.epic.id).toBe("E1");
        expect(parsed.epic.artifacts).toBeDefined();
        expect(parsed.epic.artifacts.prd.status).toBe("complete");
        expect(parsed.epic.artifacts.architecture.status).toBe("complete");
        expect(parsed.epic.artifacts.stories.count).toBe(3);
        expect(parsed.epic.stats.coverage).toBe(100);
      });

      it("should output valid JSON for milestone context", async () => {
        const context = await ctx.state.assembleMilestoneContext("M1");
        const json = JSON.stringify(context);
        const parsed = JSON.parse(json);

        expect(parsed.milestone.id).toBe("M1");
        expect(parsed.siblingEpics).toHaveLength(1);
        expect(parsed.project.project.name).toBe("Test Project");
      });

      it("should output valid JSON for story context", async () => {
        const context = await ctx.state.assembleStoryContext("E1");
        const json = JSON.stringify(context);
        const parsed = JSON.parse(json);

        expect(parsed.prd).toContain("# E1: Authentication");
        expect(parsed.architecture).toContain("# Architecture");
        expect(parsed.requirements.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Engine Status Commands", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    describe("status.context", () => {
      it("should return project context by default", async () => {
        const result = await ctx.engine.status.context({});

        expect(result.status).toBe("success");
        expect((result.data as any).project).toBeDefined();
      });

      it("should return milestone context when targeting M1", async () => {
        const result = await ctx.engine.status.context({ target: "M1" });

        expect(result.status).toBe("success");
        expect((result.data as any).milestone).toBeDefined();
        expect((result.data as any).milestone.id).toBe("M1");
      });

      it("should return epic context when targeting E1", async () => {
        const result = await ctx.engine.status.context({ target: "E1" });

        expect(result.status).toBe("success");
        expect((result.data as any).epic).toBeDefined();
        expect((result.data as any).epic.id).toBe("E1");
      });

      it("should return story context when targeting E1.S1", async () => {
        const result = await ctx.engine.status.context({ target: "E1.S1" });

        expect(result.status).toBe("success");
        expect((result.data as any).story).toBeDefined();
        expect((result.data as any).story.id).toBe("E1.S1");
      });

      it("should return error for invalid target", async () => {
        const result = await ctx.engine.status.context({ target: "E999" });

        expect(result.status).toBe("error");
      });
    });

    describe("status.why", () => {
      it("should trace story lineage", async () => {
        const result = await ctx.engine.status.why("E1.S1");
        const data = result.data as any;

        expect(result.status).toBe("success");
        expect(data.story.id).toBe("E1.S1");
        expect(data.epic.id).toBe("E1");
        expect(data.milestone.id).toBe("M1");
        expect(data.project).toBeDefined();
      });

      it("should include requirements linked to story", async () => {
        const result = await ctx.engine.status.why("E1.S1");
        const data = result.data as any;

        // Requirements are in story.requirements
        expect(data.story.requirements).toBeDefined();
        expect(data.story.requirements.length).toBeGreaterThan(0);
      });

      it("should return error for invalid story", async () => {
        const result = await ctx.engine.status.why("E99.S99");

        expect(result.status).toBe("error");
      });
    });

    describe("status.how", () => {
      it("should provide implementation guidance", async () => {
        const result = await ctx.engine.status.how("E1.S1");
        const data = result.data as any;

        expect(result.status).toBe("success");
        expect(data.story.id).toBe("E1.S1");
        expect(data.architecture).toBeDefined();
      });

      it("should include story details", async () => {
        const result = await ctx.engine.status.how("E1.S1");
        const data = result.data as any;

        expect(data.story).toBeDefined();
        expect(data.story.title).toBe("Implement login API");
      });

      it("should return error for invalid story", async () => {
        const result = await ctx.engine.status.how("E99.S99");

        expect(result.status).toBe("error");
      });
    });

    describe("status.board", () => {
      it("should return board with stories grouped by status", async () => {
        const result = await ctx.engine.status.board();

        expect(result.status).toBe("success");
        expect(result.data.columns).toBeDefined();
      });

      it("should filter by epic when provided", async () => {
        const result = await ctx.engine.status.board("E1");

        expect(result.status).toBe("success");
        // Should only have stories from E1
        const allStories = Object.values(result.data.columns).flat() as any[];
        for (const story of allStories) {
          expect(story.id).toMatch(/^E1\./);
        }
      });
    });
  });

  describe("Queue Status", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
    });

    it("should show stuck queue", async () => {
      const queue = await ctx.state.readStuckQueue();
      expect(queue?.stuck).toEqual([]);
    });

    it("should show feedback queue", async () => {
      const queue = await ctx.state.readFeedbackQueue();
      expect(queue?.feedback).toEqual([]);
    });

    it("should show pending items count", async () => {
      // Add stuck item
      const stuckQueue = await ctx.state.readStuckQueue();
      stuckQueue!.stuck.push({
        id: "stuck-001",
        task_id: "task-001",
        type: "ambiguous",
        summary: "Unclear requirement",
        attempts: [],
        created: new Date().toISOString(),
        priority: "high",
      });
      await ctx.state.writeStuckQueue(stuckQueue!);

      // Add feedback item
      const feedbackQueue = await ctx.state.readFeedbackQueue();
      feedbackQueue!.feedback.push({
        id: "fb-001",
        type: "blocker",
        source: { type: "execution" },
        summary: "API unavailable",
        affects: [],
        status: "pending",
        created: new Date().toISOString(),
      });
      await ctx.state.writeFeedbackQueue(feedbackQueue!);

      const stuck = await ctx.state.readStuckQueue();
      const feedback = await ctx.state.readFeedbackQueue();

      expect(stuck?.stuck).toHaveLength(1);
      expect(feedback?.feedback).toHaveLength(1);
    });
  });
});
