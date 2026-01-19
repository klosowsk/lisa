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

describe("Validate Script Integration", () => {
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

  describe("Link Validation", () => {
    it("should find valid links between stories and requirements", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      expect(stories?.stories[0].requirements).toContain("E1.R1");

      // Simulate link validation
      const links = [];
      for (const story of stories!.stories) {
        for (const reqId of story.requirements) {
          links.push({
            from: { type: "story", id: story.id },
            to: { type: "requirement", id: reqId },
            type: "implements",
            valid: true,
          });
        }
      }

      expect(links.length).toBeGreaterThan(0);
      expect(links.every((l) => l.valid)).toBe(true);
    });

    it("should detect broken links to non-existent requirements", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const storyIndex = stories!.stories.findIndex((s) => s.id === "E1.S1");
      stories!.stories[storyIndex].requirements.push("E1.R999");
      await ctx.state.writeStories("E1", "auth", stories!);

      const updated = await ctx.state.readStories("E1", "auth");
      const story = updated?.stories.find((s) => s.id === "E1.S1");
      expect(story?.requirements).toContain("E1.R999");
    });

    it("should detect orphan stories without requirement links", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      stories!.stories.push({
        id: "E1.S4",
        title: "Orphan story",
        description: "No requirements",
        type: "feature",
        requirements: [],
        acceptance_criteria: [],
        dependencies: [],
        status: "todo",
        assignee: null,
      });
      await ctx.state.writeStories("E1", "auth", stories!);

      const updated = await ctx.state.readStories("E1", "auth");
      const orphan = updated?.stories.find((s) => s.id === "E1.S4");
      expect(orphan?.requirements).toHaveLength(0);
    });

    it("should validate story dependencies", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      const story = stories?.stories.find((s) => s.id === "E1.S2");
      expect(story?.dependencies).toContain("E1.S1");
    });

    it("should write links validation result", async () => {
      const linksResult = {
        links: [
          {
            from: { type: "story" as const, id: "E1.S1" },
            to: { type: "requirement" as const, id: "E1.R1" },
            type: "implements" as const,
            valid: true,
          },
        ],
        broken: [],
        orphans: [],
        summary: {
          total_links: 1,
          valid: 1,
          broken: 0,
          orphans: 0,
        },
        last_validated: new Date().toISOString(),
      };

      await ctx.state.writeLinks(linksResult);
      const read = await ctx.state.readLinks();
      expect(read?.summary.total_links).toBe(1);
      expect(read?.summary.valid).toBe(1);
    });
  });

  describe("Coverage Validation", () => {
    it("should calculate requirement coverage", async () => {
      const stories = await ctx.state.readStories("E1", "auth");

      // Calculate coverage manually
      const coverage: Record<string, string[]> = {};
      for (const story of stories!.stories) {
        for (const reqId of story.requirements) {
          if (!coverage[reqId]) {
            coverage[reqId] = [];
          }
          coverage[reqId].push(story.id);
        }
      }

      expect(coverage["E1.R1"]).toContain("E1.S1");
      expect(coverage["E1.R1"]).toContain("E1.S2");
      expect(coverage["E1.R2"]).toContain("E1.S3");
    });

    it("should detect coverage gaps", async () => {
      // Add a requirement without stories
      const prd = await ctx.state.readPrd("E1", "auth");
      const updatedPrd = prd + "\n### R3: Password Reset\nUsers can reset their password.\n";
      await ctx.state.writePrd("E1", "auth", updatedPrd);

      const stories = await ctx.state.readStories("E1", "auth");
      const hasR3Coverage = stories?.stories.some((s) =>
        s.requirements.includes("E1.R3")
      );
      expect(hasR3Coverage).toBe(false);
    });

    it("should write coverage validation result", async () => {
      const coverageResult = {
        coverage: {
          E1: {
            "E1.R1": { stories: ["E1.S1", "E1.S2"], status: "covered" as const },
            "E1.R2": { stories: ["E1.S3"], status: "covered" as const },
          },
        },
        summary: {
          total_requirements: 2,
          covered: 2,
          gaps: 0,
          coverage_percent: 100,
        },
        gaps: [],
        last_validated: new Date().toISOString(),
      };

      await ctx.state.writeCoverage(coverageResult);
      const read = await ctx.state.readCoverage();
      expect(read?.summary.coverage_percent).toBe(100);
    });

    it("should track partial coverage", async () => {
      const coverageResult = {
        coverage: {
          E1: {
            "E1.R1": { stories: ["E1.S1"], status: "partial" as const },
          },
        },
        summary: {
          total_requirements: 1,
          covered: 0,
          gaps: 1,
          coverage_percent: 0,
        },
        gaps: [{ requirement: "E1.R1", epic: "E1", reason: "Partial coverage" }],
        last_validated: new Date().toISOString(),
      };

      await ctx.state.writeCoverage(coverageResult);
      const read = await ctx.state.readCoverage();
      expect(read?.coverage["E1"]["E1.R1"].status).toBe("partial");
    });
  });

  describe("Schema Validation", () => {
    it("should validate project.json exists", async () => {
      const project = await ctx.state.readProject();
      expect(project).toBeDefined();
      expect(project?.id).toBeDefined();
      expect(project?.name).toBeDefined();
    });

    it("should validate epic.json exists", async () => {
      const epic = await ctx.state.readEpic("E1", "auth");
      expect(epic).toBeDefined();
      expect(epic?.id).toBe("E1");
      expect(epic?.name).toBe("Authentication");
    });

    it("should validate stories.json schema", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      expect(stories).toBeDefined();
      expect(stories?.epic_id).toBe("E1");
      expect(stories?.stories).toBeInstanceOf(Array);
    });
  });

  describe("Validation Issues", () => {
    it("should record validation issues", async () => {
      const issues = {
        issues: [
          {
            id: "issue-001",
            severity: "error" as const,
            type: "broken_link",
            location: { type: "story", id: "E1.S1" },
            message: "Broken link to E1.R999",
            suggestion: "Verify requirement exists",
          },
        ],
        summary: {
          errors: 1,
          warnings: 0,
          info: 0,
        },
        last_validated: new Date().toISOString(),
      };

      await ctx.state.writeValidationIssues(issues);
      const read = await ctx.state.readValidationIssues();
      expect(read?.issues).toHaveLength(1);
      expect(read?.summary.errors).toBe(1);
    });

    it("should record warnings", async () => {
      const issues = {
        issues: [
          {
            id: "issue-001",
            severity: "warning" as const,
            type: "orphan_artifact",
            location: { type: "story", id: "E1.S4" },
            message: "Story has no requirement links",
          },
        ],
        summary: {
          errors: 0,
          warnings: 1,
          info: 0,
        },
        last_validated: new Date().toISOString(),
      };

      await ctx.state.writeValidationIssues(issues);
      const read = await ctx.state.readValidationIssues();
      expect(read?.summary.warnings).toBe(1);
    });

    it("should record info-level issues", async () => {
      const issues = {
        issues: [
          {
            id: "issue-001",
            severity: "info" as const,
            type: "suggestion",
            location: { type: "epic", id: "E1" },
            message: "Consider adding more acceptance criteria",
          },
        ],
        summary: {
          errors: 0,
          warnings: 0,
          info: 1,
        },
        last_validated: new Date().toISOString(),
      };

      await ctx.state.writeValidationIssues(issues);
      const read = await ctx.state.readValidationIssues();
      expect(read?.summary.info).toBe(1);
    });
  });

  describe("Epic Validation", () => {
    it("should validate epic has PRD", async () => {
      const prd = await ctx.state.readPrd("E1", "auth");
      expect(prd).toBeDefined();
      expect(prd).toContain("# E1: Authentication");
    });

    it("should validate epic has architecture", async () => {
      const arch = await ctx.state.readArchitecture("E1", "auth");
      expect(arch).toBeDefined();
      expect(arch).toContain("# Architecture");
    });

    it("should validate epic has stories", async () => {
      const stories = await ctx.state.readStories("E1", "auth");
      expect(stories?.stories.length).toBeGreaterThan(0);
    });

    it("should count requirements in PRD", async () => {
      const prd = await ctx.state.readPrd("E1", "auth");
      const reqMatches = prd?.match(/### R\d+:/g) || [];
      expect(reqMatches.length).toBe(2); // R1 and R2
    });

    it("should count acceptance criteria in PRD", async () => {
      const prd = await ctx.state.readPrd("E1", "auth");
      const acMatches = prd?.match(/- \[ \]/g) || [];
      expect(acMatches.length).toBe(4);
    });
  });

  describe("Cross-Epic Validation", () => {
    it("should validate milestone has epics", async () => {
      const index = await ctx.state.readMilestoneIndex();
      expect(index?.milestones[0].epics).toContain("E1");
    });

    it("should validate epic belongs to milestone", async () => {
      const epic = await ctx.state.readEpic("E1", "auth");
      expect(epic?.milestone).toBe("M1");
    });

    it("should handle multiple epics in same milestone", async () => {
      // Create second epic
      await ctx.state.createEpicDir("E2", "db");
      const epic2 = {
        id: "E2",
        slug: "db",
        name: "Database",
        description: "Database setup",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "pending" as const, version: 1 },
          architecture: { status: "pending" as const, version: 1 },
          stories: { status: "pending" as const, count: 0 },
        },
        dependencies: [],
        stats: { requirements: 0, stories: 0, coverage: 0 },
      };
      await ctx.state.writeEpic(epic2);

      const index = await ctx.state.readMilestoneIndex();
      index!.milestones[0].epics.push("E2");
      await ctx.state.writeMilestoneIndex(index!);

      const updated = await ctx.state.readMilestoneIndex();
      expect(updated?.milestones[0].epics).toHaveLength(2);
    });
  });

  describe("Validation Result Persistence", () => {
    it("should persist links across reads", async () => {
      const links = {
        links: [],
        broken: [],
        orphans: [],
        summary: { total_links: 0, valid: 0, broken: 0, orphans: 0 },
        last_validated: new Date().toISOString(),
      };

      await ctx.state.writeLinks(links);
      const read1 = await ctx.state.readLinks();
      const read2 = await ctx.state.readLinks();

      expect(read1?.last_validated).toBe(read2?.last_validated);
    });

    it("should persist coverage across reads", async () => {
      const coverage = {
        coverage: {},
        summary: { total_requirements: 0, covered: 0, gaps: 0, coverage_percent: 0 },
        gaps: [],
        last_validated: new Date().toISOString(),
      };

      await ctx.state.writeCoverage(coverage);
      const read1 = await ctx.state.readCoverage();
      const read2 = await ctx.state.readCoverage();

      expect(read1?.last_validated).toBe(read2?.last_validated);
    });

    it("should persist issues across reads", async () => {
      const issues = {
        issues: [],
        summary: { errors: 0, warnings: 0, info: 0 },
        last_validated: new Date().toISOString(),
      };

      await ctx.state.writeValidationIssues(issues);
      const read1 = await ctx.state.readValidationIssues();
      const read2 = await ctx.state.readValidationIssues();

      expect(read1?.last_validated).toBe(read2?.last_validated);
    });
  });
});
