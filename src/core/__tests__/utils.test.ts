import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateId,
  slugify,
  now,
  formatDate,
  formatDateTime,
  timeAgo,
  LisaError,
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
} from "../utils.js";

describe("ID Generation", () => {
  describe("generateId", () => {
    it("should generate id with prefix", () => {
      const id = generateId("test");
      expect(id).toMatch(/^test-/);
    });

    it("should generate unique ids", () => {
      const id1 = generateId("test");
      const id2 = generateId("test");
      expect(id1).not.toBe(id2);
    });

    it("should include timestamp component", () => {
      const id = generateId("fb");
      expect(id.length).toBeGreaterThan(5);
    });
  });

  describe("slugify", () => {
    it("should convert to lowercase", () => {
      expect(slugify("Hello World")).toBe("hello-world");
    });

    it("should replace spaces with hyphens", () => {
      expect(slugify("hello world")).toBe("hello-world");
    });

    it("should remove special characters", () => {
      expect(slugify("hello!@#world")).toBe("hello-world");
    });

    it("should remove leading and trailing hyphens", () => {
      expect(slugify("--hello--")).toBe("hello");
    });

    it("should truncate to 30 characters", () => {
      const longString = "this is a very long string that should be truncated";
      expect(slugify(longString).length).toBeLessThanOrEqual(30);
    });

    it("should handle consecutive special chars", () => {
      expect(slugify("hello   world")).toBe("hello-world");
    });
  });
});

describe("Date/Time", () => {
  describe("now", () => {
    it("should return ISO string", () => {
      const result = now();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
  });

  describe("formatDate", () => {
    it("should format date correctly", () => {
      const result = formatDate("2024-01-15T10:00:00.000Z");
      expect(result).toContain("Jan");
      expect(result).toContain("15");
      expect(result).toContain("2024");
    });
  });

  describe("formatDateTime", () => {
    it("should format date and time", () => {
      const result = formatDateTime("2024-01-15T10:30:00.000Z");
      expect(result).toContain("Jan");
      expect(result).toContain("15");
      expect(result).toContain("2024");
    });
  });

  describe("timeAgo", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return 'just now' for recent timestamps", () => {
      const now = new Date("2024-01-15T10:00:00.000Z");
      vi.setSystemTime(now);
      const timestamp = new Date(now.getTime() - 30 * 1000).toISOString();
      expect(timeAgo(timestamp)).toBe("just now");
    });

    it("should return minutes ago", () => {
      const now = new Date("2024-01-15T10:00:00.000Z");
      vi.setSystemTime(now);
      const timestamp = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      expect(timeAgo(timestamp)).toBe("5m ago");
    });

    it("should return hours ago", () => {
      const now = new Date("2024-01-15T10:00:00.000Z");
      vi.setSystemTime(now);
      const timestamp = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
      expect(timeAgo(timestamp)).toBe("3h ago");
    });

    it("should return days ago", () => {
      const now = new Date("2024-01-15T10:00:00.000Z");
      vi.setSystemTime(now);
      const timestamp = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
      expect(timeAgo(timestamp)).toBe("2d ago");
    });

    it("should return formatted date for old timestamps", () => {
      const now = new Date("2024-01-15T10:00:00.000Z");
      vi.setSystemTime(now);
      const timestamp = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = timeAgo(timestamp);
      expect(result).toContain("Dec");
    });
  });
});

describe("LisaError", () => {
  it("should create error with message and code", () => {
    const error = new LisaError("Test error", "TEST_CODE");
    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.name).toBe("LisaError");
  });

  it("should include details if provided", () => {
    const error = new LisaError("Test", "CODE", { key: "value" });
    expect(error.details).toEqual({ key: "value" });
  });
});

describe("Validation Helpers", () => {
  describe("validateStoryId", () => {
    it("should validate correct story IDs", () => {
      expect(validateStoryId("E1.S1")).toBe(true);
      expect(validateStoryId("E12.S34")).toBe(true);
      expect(validateStoryId("E999.S999")).toBe(true);
    });

    it("should reject invalid story IDs", () => {
      expect(validateStoryId("E1")).toBe(false);
      expect(validateStoryId("S1")).toBe(false);
      expect(validateStoryId("E1S1")).toBe(false);
      expect(validateStoryId("e1.s1")).toBe(false);
      expect(validateStoryId("")).toBe(false);
    });
  });

  describe("validateEpicId", () => {
    it("should validate correct epic IDs", () => {
      expect(validateEpicId("E1")).toBe(true);
      expect(validateEpicId("E123")).toBe(true);
    });

    it("should reject invalid epic IDs", () => {
      expect(validateEpicId("E1.S1")).toBe(false);
      expect(validateEpicId("e1")).toBe(false);
      expect(validateEpicId("Epic1")).toBe(false);
    });
  });

  describe("validateMilestoneId", () => {
    it("should validate correct milestone IDs", () => {
      expect(validateMilestoneId("M1")).toBe(true);
      expect(validateMilestoneId("M99")).toBe(true);
    });

    it("should reject invalid milestone IDs", () => {
      expect(validateMilestoneId("m1")).toBe(false);
      expect(validateMilestoneId("Milestone1")).toBe(false);
    });
  });

  describe("validateRequirementId", () => {
    it("should validate correct requirement IDs", () => {
      expect(validateRequirementId("E1.R1")).toBe(true);
      expect(validateRequirementId("E12.R34")).toBe(true);
    });

    it("should reject invalid requirement IDs", () => {
      expect(validateRequirementId("R1")).toBe(false);
      expect(validateRequirementId("E1.S1")).toBe(false);
    });
  });

  describe("parseStoryId", () => {
    it("should parse valid story IDs", () => {
      const result = parseStoryId("E1.S2");
      expect(result).toEqual({ epicId: "E1", storyNum: 2 });
    });

    it("should parse multi-digit IDs", () => {
      const result = parseStoryId("E12.S345");
      expect(result).toEqual({ epicId: "E12", storyNum: 345 });
    });

    it("should return null for invalid IDs", () => {
      expect(parseStoryId("invalid")).toBeNull();
      expect(parseStoryId("E1")).toBeNull();
    });
  });

  describe("parseEpicId", () => {
    it("should parse valid epic IDs", () => {
      const result = parseEpicId("E5");
      expect(result).toEqual({ num: 5 });
    });

    it("should return null for invalid IDs", () => {
      expect(parseEpicId("invalid")).toBeNull();
      expect(parseEpicId("E1.S1")).toBeNull();
    });
  });
});

describe("String Helpers", () => {
  describe("truncate", () => {
    it("should not truncate short strings", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("should truncate long strings", () => {
      expect(truncate("hello world", 8)).toBe("hello...");
    });

    it("should handle exact length", () => {
      expect(truncate("hello", 5)).toBe("hello");
    });
  });

  describe("indent", () => {
    it("should indent single line", () => {
      expect(indent("hello", 2)).toBe("  hello");
    });

    it("should indent multiple lines", () => {
      expect(indent("line1\nline2", 2)).toBe("  line1\n  line2");
    });

    it("should handle zero indent", () => {
      expect(indent("hello", 0)).toBe("hello");
    });
  });

  describe("wrap", () => {
    it("should not wrap short text", () => {
      expect(wrap("hello world", 20)).toBe("hello world");
    });

    it("should wrap long text", () => {
      const result = wrap("hello beautiful world today", 10);
      expect(result).toContain("\n");
    });

    it("should handle single word longer than width", () => {
      const result = wrap("superlongword", 5);
      expect(result).toBe("superlongword");
    });
  });
});

describe("Status Helpers", () => {
  describe("statusIcon", () => {
    it("should return correct icons for epic statuses", () => {
      expect(statusIcon("planned")).toBe("○");
      expect(statusIcon("in_progress")).toBe("▶");
      expect(statusIcon("done")).toBe("✓");
    });

    it("should return correct icons for story statuses", () => {
      expect(statusIcon("todo")).toBe("○");
      expect(statusIcon("blocked")).toBe("⚠");
    });

    it("should return correct icons for validation", () => {
      expect(statusIcon("covered")).toBe("✓");
      expect(statusIcon("gap")).toBe("✗");
      expect(statusIcon("error")).toBe("✗");
      expect(statusIcon("warning")).toBe("⚠");
    });

    it("should return default for unknown status", () => {
      expect(statusIcon("unknown")).toBe("○");
    });
  });

  describe("statusCategory", () => {
    it("should return positive for completed statuses", () => {
      expect(statusCategory("done")).toBe("positive");
      expect(statusCategory("complete")).toBe("positive");
      expect(statusCategory("covered")).toBe("positive");
    });

    it("should return in_progress for active statuses", () => {
      expect(statusCategory("in_progress")).toBe("in_progress");
      expect(statusCategory("assigned")).toBe("in_progress");
      expect(statusCategory("drafting")).toBe("in_progress");
    });

    it("should return attention for review statuses", () => {
      expect(statusCategory("review")).toBe("attention");
      expect(statusCategory("needs_review")).toBe("attention");
      expect(statusCategory("warning")).toBe("attention");
    });

    it("should return negative for blocked statuses", () => {
      expect(statusCategory("blocked")).toBe("negative");
      expect(statusCategory("error")).toBe("negative");
      expect(statusCategory("gap")).toBe("negative");
    });

    it("should return neutral for pending statuses", () => {
      expect(statusCategory("planned")).toBe("neutral");
      expect(statusCategory("todo")).toBe("neutral");
      expect(statusCategory("pending")).toBe("neutral");
    });

    it("should return neutral for unknown status", () => {
      expect(statusCategory("unknown")).toBe("neutral");
    });
  });
});
