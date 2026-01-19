import { describe, it, expect } from "vitest";
import {
  parseTarget,
  getContextCommands,
  withContextCommands,
  enhanceWithContext,
  getContextFetchInstructions,
  GuidanceTarget,
} from "../prompts/context-helpers.js";
import { AIGuidance } from "../types.js";

describe("context-helpers", () => {
  // ==========================================================================
  // parseTarget
  // ==========================================================================

  describe("parseTarget", () => {
    it("should return project target for undefined input", () => {
      const result = parseTarget(undefined);
      expect(result).toEqual({ type: "project" });
    });

    it("should return project target for empty string", () => {
      const result = parseTarget("");
      expect(result).toEqual({ type: "project" });
    });

    it("should parse milestone ID (M1)", () => {
      const result = parseTarget("M1");
      expect(result).toEqual({ type: "milestone", id: "M1" });
    });

    it("should parse milestone ID with larger number (M12)", () => {
      const result = parseTarget("M12");
      expect(result).toEqual({ type: "milestone", id: "M12" });
    });

    it("should parse milestone ID case-insensitively", () => {
      const result = parseTarget("m3");
      expect(result).toEqual({ type: "milestone", id: "M3" });
    });

    it("should parse epic ID (E1)", () => {
      const result = parseTarget("E1");
      expect(result).toEqual({ type: "epic", id: "E1" });
    });

    it("should parse epic ID with larger number (E25)", () => {
      const result = parseTarget("E25");
      expect(result).toEqual({ type: "epic", id: "E25" });
    });

    it("should parse epic ID case-insensitively", () => {
      const result = parseTarget("e7");
      expect(result).toEqual({ type: "epic", id: "E7" });
    });

    it("should parse story ID (E1.S2)", () => {
      const result = parseTarget("E1.S2");
      expect(result).toEqual({
        type: "story",
        id: "E1.S2",
        epicId: "E1",
      });
    });

    it("should parse story ID with larger numbers (E12.S34)", () => {
      const result = parseTarget("E12.S34");
      expect(result).toEqual({
        type: "story",
        id: "E12.S34",
        epicId: "E12",
      });
    });

    it("should parse story ID case-insensitively", () => {
      const result = parseTarget("e5.s10");
      expect(result).toEqual({
        type: "story",
        id: "E5.S10",
        epicId: "E5",
      });
    });

    it("should return project target for invalid format", () => {
      expect(parseTarget("invalid")).toEqual({ type: "project" });
      expect(parseTarget("X1")).toEqual({ type: "project" });
      expect(parseTarget("E1S2")).toEqual({ type: "project" }); // missing dot
      expect(parseTarget("E.S1")).toEqual({ type: "project" }); // missing epic number
    });
  });

  // ==========================================================================
  // getContextCommands
  // ==========================================================================

  describe("getContextCommands", () => {
    it("should return project context commands", () => {
      const commands = getContextCommands({ type: "project" });

      expect(commands).toHaveLength(2);
      expect(commands[0].command).toBe("status context");
      expect(commands[0].args).toBeUndefined();
      expect(commands[1].command).toBe("status overview");
    });

    it("should return milestone context commands with ID", () => {
      const commands = getContextCommands({ type: "milestone", id: "M1" });

      expect(commands).toHaveLength(2);
      expect(commands[0].command).toBe("status context");
      expect(commands[0].args).toBe("M1");
      expect(commands[1].command).toBe("status overview");
    });

    it("should return epic context commands with ID", () => {
      const commands = getContextCommands({ type: "epic", id: "E3" });

      expect(commands).toHaveLength(2);
      expect(commands[0].command).toBe("status context");
      expect(commands[0].args).toBe("E3");
      expect(commands[1].command).toBe("status board");
      expect(commands[1].args).toBe("E3");
    });

    it("should return story context commands without epicId", () => {
      const commands = getContextCommands({ type: "story", id: "E1.S2" });

      expect(commands).toHaveLength(3);
      expect(commands[0].command).toBe("status show");
      expect(commands[0].args).toBe("E1.S2");
      expect(commands[1].command).toBe("status why");
      expect(commands[1].args).toBe("E1.S2");
      expect(commands[2].command).toBe("status how");
      expect(commands[2].args).toBe("E1.S2");
    });

    it("should return story context commands with epicId", () => {
      const commands = getContextCommands({
        type: "story",
        id: "E1.S2",
        epicId: "E1",
      });

      expect(commands).toHaveLength(4);
      expect(commands[0].command).toBe("status show");
      expect(commands[1].command).toBe("status context");
      expect(commands[1].args).toBe("E1");
      expect(commands[2].command).toBe("status why");
      expect(commands[3].command).toBe("status how");
    });

    it("should include descriptions and when hints", () => {
      const commands = getContextCommands({ type: "project" });

      expect(commands[0].description).toBeDefined();
      expect(commands[0].when).toBeDefined();
      expect(commands[0].description).toContain("context");
    });
  });

  // ==========================================================================
  // withContextCommands
  // ==========================================================================

  describe("withContextCommands", () => {
    const baseGuidance: AIGuidance = {
      situation: "Test situation",
      instructions: ["Do something"],
      commands: [
        { command: "plan epic", args: "E1", description: "Plan epic" },
      ],
    };

    it("should add context commands to guidance", () => {
      const result = withContextCommands(baseGuidance, { type: "project" });

      expect(result.commands.length).toBeGreaterThan(baseGuidance.commands.length);
      expect(result.commands[0]).toEqual(baseGuidance.commands[0]); // Original preserved
    });

    it("should prefix new commands with [Context]", () => {
      const result = withContextCommands(baseGuidance, { type: "project" });

      const newCommands = result.commands.slice(1);
      for (const cmd of newCommands) {
        expect(cmd.description).toMatch(/^\[Context\]/);
      }
    });

    it("should not duplicate existing commands", () => {
      const guidanceWithExisting: AIGuidance = {
        situation: "Test",
        instructions: [],
        commands: [
          { command: "status context", description: "Already exists" },
        ],
      };

      const result = withContextCommands(guidanceWithExisting, { type: "project" });

      // Should only have status overview added (status context already exists)
      const contextCommands = result.commands.filter((c) => c.command === "status context");
      expect(contextCommands).toHaveLength(1);
      expect(contextCommands[0].description).toBe("Already exists");
    });

    it("should not duplicate commands with same args", () => {
      const guidanceWithExisting: AIGuidance = {
        situation: "Test",
        instructions: [],
        commands: [
          { command: "status context", args: "E1", description: "Already exists" },
        ],
      };

      const result = withContextCommands(guidanceWithExisting, {
        type: "epic",
        id: "E1",
      });

      const contextCommands = result.commands.filter((c) => c.command === "status context");
      expect(contextCommands).toHaveLength(1);
    });

    it("should return unchanged guidance when all commands exist", () => {
      const fullGuidance: AIGuidance = {
        situation: "Test",
        instructions: [],
        commands: [
          { command: "status context", description: "Exists" },
          { command: "status overview", description: "Exists" },
        ],
      };

      const result = withContextCommands(fullGuidance, { type: "project" });

      expect(result).toBe(fullGuidance); // Same reference - unchanged
    });

    it("should preserve original instruction array", () => {
      const result = withContextCommands(baseGuidance, { type: "epic", id: "E1" });

      expect(result.instructions).toEqual(baseGuidance.instructions);
    });
  });

  // ==========================================================================
  // enhanceWithContext
  // ==========================================================================

  describe("enhanceWithContext", () => {
    const baseGuidance: AIGuidance = {
      situation: "Test situation",
      instructions: ["Start here"],
      commands: [],
    };

    it("should return unchanged guidance when no target and no context", () => {
      const result = enhanceWithContext(baseGuidance);

      expect(result.commands).toHaveLength(0);
    });

    it("should add commands for explicit target", () => {
      const result = enhanceWithContext(baseGuidance, {
        target: { type: "epic", id: "E1" },
      });

      expect(result.commands.length).toBeGreaterThan(0);
    });

    it("should infer story target from guidance context", () => {
      const guidanceWithContext: AIGuidance = {
        situation: "Test",
        instructions: [],
        commands: [],
        context: {
          storyId: "E1.S3",
          epicId: "E1",
        },
      };

      const result = enhanceWithContext(guidanceWithContext);

      // Should have story commands added
      const showCommand = result.commands.find((c) => c.command === "status show");
      expect(showCommand).toBeDefined();
      expect(showCommand?.args).toBe("E1.S3");
    });

    it("should infer epic target from guidance context", () => {
      const guidanceWithContext: AIGuidance = {
        situation: "Test",
        instructions: [],
        commands: [],
        context: { epicId: "E5" },
      };

      const result = enhanceWithContext(guidanceWithContext);

      const contextCommand = result.commands.find((c) => c.command === "status context");
      expect(contextCommand?.args).toBe("E5");
    });

    it("should infer milestone target from guidance context", () => {
      const guidanceWithContext: AIGuidance = {
        situation: "Test",
        instructions: [],
        commands: [],
        context: { milestoneId: "M2" },
      };

      const result = enhanceWithContext(guidanceWithContext);

      const contextCommand = result.commands.find((c) => c.command === "status context");
      expect(contextCommand?.args).toBe("M2");
    });

    it("should use explicit epicId for story when provided", () => {
      const guidanceWithContext: AIGuidance = {
        situation: "Test",
        instructions: [],
        commands: [],
        context: { storyId: "E1.S1" },
      };

      const result = enhanceWithContext(guidanceWithContext, {
        epicId: "E1",
      });

      // Should include epic context command
      const epicContextCmd = result.commands.find(
        (c) => c.command === "status context" && c.args === "E1"
      );
      expect(epicContextCmd).toBeDefined();
    });

    it("should add project context when includeProjectContext is true", () => {
      const result = enhanceWithContext(baseGuidance, {
        target: { type: "epic", id: "E1" },
        includeProjectContext: true,
      });

      // Should have both epic and project commands
      const overviewCommand = result.commands.find((c) => c.command === "status overview");
      expect(overviewCommand).toBeDefined();
    });

    it("should not add project context for project target even if requested", () => {
      const result = enhanceWithContext(baseGuidance, {
        target: { type: "project" },
        includeProjectContext: true,
      });

      // Project commands added only once
      const overviewCommands = result.commands.filter((c) => c.command === "status overview");
      expect(overviewCommands).toHaveLength(1);
    });

    it("should prefer explicit target over inferred context", () => {
      const guidanceWithContext: AIGuidance = {
        situation: "Test",
        instructions: [],
        commands: [],
        context: { epicId: "E1" },
      };

      const result = enhanceWithContext(guidanceWithContext, {
        target: { type: "milestone", id: "M2" },
      });

      // Should have milestone context, not epic context
      const contextCommand = result.commands.find((c) => c.command === "status context");
      expect(contextCommand?.args).toBe("M2");
    });
  });

  // ==========================================================================
  // getContextFetchInstructions
  // ==========================================================================

  describe("getContextFetchInstructions", () => {
    it("should return project instructions", () => {
      const instructions = getContextFetchInstructions({ type: "project" });

      expect(instructions).toHaveLength(2);
      expect(instructions[0]).toContain("status overview");
      expect(instructions[1]).toContain("status context");
    });

    it("should return milestone instructions with ID", () => {
      const instructions = getContextFetchInstructions({
        type: "milestone",
        id: "M3",
      });

      expect(instructions).toHaveLength(1);
      expect(instructions[0]).toContain("status context M3");
    });

    it("should return epic instructions with ID", () => {
      const instructions = getContextFetchInstructions({
        type: "epic",
        id: "E2",
      });

      expect(instructions).toHaveLength(2);
      expect(instructions[0]).toContain("status context E2");
      expect(instructions[1]).toContain("status board E2");
    });

    it("should return story instructions without epicId", () => {
      const instructions = getContextFetchInstructions({
        type: "story",
        id: "E1.S5",
      });

      expect(instructions).toHaveLength(1);
      expect(instructions[0]).toContain("status how E1.S5");
    });

    it("should return story instructions with epicId", () => {
      const instructions = getContextFetchInstructions({
        type: "story",
        id: "E1.S5",
        epicId: "E1",
      });

      expect(instructions).toHaveLength(2);
      expect(instructions[0]).toContain("status how E1.S5");
      expect(instructions[1]).toContain("status context E1");
    });
  });
});
