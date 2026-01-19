/**
 * FileSystemStateAdapter Tests
 *
 * Tests for the filesystem-based state adapter implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { z } from "zod";
import {
  FileSystemStateAdapter,
  createFileSystemAdapter,
  LISA_DIR,
} from "../filesystem.js";

// =============================================================================
// Test Schemas
// =============================================================================

const TestDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number(),
});

const ConfigSchema = z.object({
  setting: z.string(),
  enabled: z.boolean(),
});

// =============================================================================
// Test Setup
// =============================================================================

describe("FileSystemStateAdapter", () => {
  let testDir: string;
  let adapter: FileSystemStateAdapter;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "lisa-fs-adapter-test-"));
    adapter = new FileSystemStateAdapter({ root: testDir });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // Lifecycle Tests
  // ===========================================================================

  describe("Lifecycle", () => {
    it("isInitialized returns false when .lisa does not exist", async () => {
      expect(await adapter.isInitialized()).toBe(false);
    });

    it("isInitialized returns true when .lisa exists", async () => {
      await fs.mkdir(path.join(testDir, LISA_DIR), { recursive: true });
      expect(await adapter.isInitialized()).toBe(true);
    });

    it("getRootDir returns the root directory", () => {
      expect(adapter.getRootDir()).toBe(testDir);
    });

    it("uses process.cwd() when no root is provided", () => {
      const defaultAdapter = new FileSystemStateAdapter();
      expect(defaultAdapter.getRootDir()).toBe(process.cwd());
    });
  });

  // ===========================================================================
  // JSON Operations Tests
  // ===========================================================================

  describe("JSON Operations", () => {
    describe("readJson", () => {
      it("returns null when file does not exist", async () => {
        const result = await adapter.readJson("test.json", TestDataSchema);
        expect(result).toBeNull();
      });

      it("reads and parses JSON file", async () => {
        const data = { id: "123", name: "Test", count: 42 };
        const filePath = path.join(testDir, LISA_DIR, "test.json");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(data));

        const result = await adapter.readJson("test.json", TestDataSchema);
        expect(result).toEqual(data);
      });

      it("validates data against schema", async () => {
        const invalidData = { id: "123", name: "Test" }; // missing count
        const filePath = path.join(testDir, LISA_DIR, "test.json");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(invalidData));

        await expect(adapter.readJson("test.json", TestDataSchema)).rejects.toThrow();
      });

      it("reads nested paths", async () => {
        const data = { id: "456", name: "Nested", count: 10 };
        const filePath = path.join(testDir, LISA_DIR, "discovery", "data.json");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(data));

        const result = await adapter.readJson("discovery/data.json", TestDataSchema);
        expect(result).toEqual(data);
      });

      it("throws on invalid JSON", async () => {
        const filePath = path.join(testDir, LISA_DIR, "bad.json");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, "not valid json {");

        await expect(adapter.readJson("bad.json", TestDataSchema)).rejects.toThrow();
      });
    });

    describe("writeJson", () => {
      it("writes JSON to file", async () => {
        const data = { id: "789", name: "Written", count: 99 };
        await adapter.writeJson("output.json", data);

        const filePath = path.join(testDir, LISA_DIR, "output.json");
        const content = await fs.readFile(filePath, "utf-8");
        expect(JSON.parse(content)).toEqual(data);
      });

      it("creates parent directories", async () => {
        const data = { id: "abc", name: "Deep", count: 1 };
        await adapter.writeJson("deep/nested/path/data.json", data);

        const filePath = path.join(testDir, LISA_DIR, "deep/nested/path/data.json");
        const content = await fs.readFile(filePath, "utf-8");
        expect(JSON.parse(content)).toEqual(data);
      });

      it("overwrites existing file", async () => {
        const initial = { id: "1", name: "Initial", count: 1 };
        const updated = { id: "1", name: "Updated", count: 2 };

        await adapter.writeJson("data.json", initial);
        await adapter.writeJson("data.json", updated);

        const result = await adapter.readJson("data.json", TestDataSchema);
        expect(result).toEqual(updated);
      });

      it("formats JSON with indentation", async () => {
        const data = { id: "fmt", name: "Formatted", count: 0 };
        await adapter.writeJson("formatted.json", data);

        const filePath = path.join(testDir, LISA_DIR, "formatted.json");
        const content = await fs.readFile(filePath, "utf-8");
        expect(content).toContain("\n"); // Should be formatted
        expect(content).toContain("  "); // Should have indentation
      });
    });
  });

  // ===========================================================================
  // YAML Operations Tests
  // ===========================================================================

  describe("YAML Operations", () => {
    describe("readYaml", () => {
      it("returns null when file does not exist", async () => {
        const result = await adapter.readYaml("config.yaml", ConfigSchema);
        expect(result).toBeNull();
      });

      it("reads and parses YAML file", async () => {
        const yamlContent = `setting: test\nenabled: true\n`;
        const filePath = path.join(testDir, LISA_DIR, "config.yaml");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, yamlContent);

        const result = await adapter.readYaml("config.yaml", ConfigSchema);
        expect(result).toEqual({ setting: "test", enabled: true });
      });

      it("validates data against schema", async () => {
        const yamlContent = `setting: test\n`; // missing enabled
        const filePath = path.join(testDir, LISA_DIR, "config.yaml");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, yamlContent);

        await expect(adapter.readYaml("config.yaml", ConfigSchema)).rejects.toThrow();
      });
    });

    describe("writeYaml", () => {
      it("writes YAML to file", async () => {
        const data = { setting: "value", enabled: false };
        await adapter.writeYaml("output.yaml", data);

        const filePath = path.join(testDir, LISA_DIR, "output.yaml");
        const content = await fs.readFile(filePath, "utf-8");
        expect(content).toContain("setting: value");
        expect(content).toContain("enabled: false");
      });

      it("creates parent directories", async () => {
        const data = { setting: "nested", enabled: true };
        await adapter.writeYaml("config/nested/app.yaml", data);

        const filePath = path.join(testDir, LISA_DIR, "config/nested/app.yaml");
        const stat = await fs.stat(filePath);
        expect(stat.isFile()).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Text Operations Tests
  // ===========================================================================

  describe("Text Operations", () => {
    describe("readText", () => {
      it("returns null when file does not exist", async () => {
        const result = await adapter.readText("readme.md");
        expect(result).toBeNull();
      });

      it("reads text file content", async () => {
        const content = "# Hello World\n\nThis is a test file.";
        const filePath = path.join(testDir, LISA_DIR, "readme.md");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);

        const result = await adapter.readText("readme.md");
        expect(result).toBe(content);
      });
    });

    describe("writeText", () => {
      it("writes text to file", async () => {
        const content = "# PRD Document\n\nFeature description.";
        await adapter.writeText("epics/E1/prd.md", content);

        const filePath = path.join(testDir, LISA_DIR, "epics/E1/prd.md");
        const result = await fs.readFile(filePath, "utf-8");
        expect(result).toBe(content);
      });

      it("creates parent directories", async () => {
        await adapter.writeText("deep/path/file.txt", "content");

        const filePath = path.join(testDir, LISA_DIR, "deep/path/file.txt");
        const stat = await fs.stat(filePath);
        expect(stat.isFile()).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Utility Operations Tests
  // ===========================================================================

  describe("Utility Operations", () => {
    describe("exists", () => {
      it("returns false when file does not exist", async () => {
        expect(await adapter.exists("missing.json")).toBe(false);
      });

      it("returns true when file exists", async () => {
        const filePath = path.join(testDir, LISA_DIR, "exists.json");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, "{}");

        expect(await adapter.exists("exists.json")).toBe(true);
      });

      it("returns true for directories", async () => {
        const dirPath = path.join(testDir, LISA_DIR, "epics");
        await fs.mkdir(dirPath, { recursive: true });

        expect(await adapter.exists("epics")).toBe(true);
      });
    });

    describe("delete", () => {
      it("deletes existing file", async () => {
        const filePath = path.join(testDir, LISA_DIR, "to-delete.json");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, "{}");

        await adapter.delete("to-delete.json");

        expect(await adapter.exists("to-delete.json")).toBe(false);
      });

      it("does not throw when file does not exist", async () => {
        await expect(adapter.delete("nonexistent.json")).resolves.not.toThrow();
      });
    });

    describe("list", () => {
      it("returns empty array when directory does not exist", async () => {
        const result = await adapter.list("missing");
        expect(result).toEqual([]);
      });

      it("lists files in directory", async () => {
        const dirPath = path.join(testDir, LISA_DIR, "epics");
        await fs.mkdir(dirPath, { recursive: true });
        await fs.writeFile(path.join(dirPath, "epic1.json"), "{}");
        await fs.writeFile(path.join(dirPath, "epic2.json"), "{}");
        await fs.mkdir(path.join(dirPath, "E1-auth"));

        const result = await adapter.list("epics");
        expect(result).toContain("epic1.json");
        expect(result).toContain("epic2.json");
        expect(result).toContain("E1-auth");
      });
    });

    describe("listDirectories", () => {
      it("returns empty array when directory does not exist", async () => {
        const result = await adapter.listDirectories("missing");
        expect(result).toEqual([]);
      });

      it("lists only directories", async () => {
        const dirPath = path.join(testDir, LISA_DIR, "epics");
        await fs.mkdir(dirPath, { recursive: true });
        await fs.writeFile(path.join(dirPath, "index.json"), "{}");
        await fs.mkdir(path.join(dirPath, "E1-auth"));
        await fs.mkdir(path.join(dirPath, "E2-payments"));

        const result = await adapter.listDirectories("epics");
        expect(result).toEqual(["E1-auth", "E2-payments"]);
        expect(result).not.toContain("index.json");
      });

      it("returns sorted directories", async () => {
        const dirPath = path.join(testDir, LISA_DIR, "items");
        await fs.mkdir(dirPath, { recursive: true });
        await fs.mkdir(path.join(dirPath, "zebra"));
        await fs.mkdir(path.join(dirPath, "alpha"));
        await fs.mkdir(path.join(dirPath, "beta"));

        const result = await adapter.listDirectories("items");
        expect(result).toEqual(["alpha", "beta", "zebra"]);
      });
    });

    describe("ensureDirectory", () => {
      it("creates directory if it does not exist", async () => {
        await adapter.ensureDirectory("new/nested/dir");

        const dirPath = path.join(testDir, LISA_DIR, "new/nested/dir");
        const stat = await fs.stat(dirPath);
        expect(stat.isDirectory()).toBe(true);
      });

      it("does not throw if directory already exists", async () => {
        const dirPath = path.join(testDir, LISA_DIR, "existing");
        await fs.mkdir(dirPath, { recursive: true });

        await expect(adapter.ensureDirectory("existing")).resolves.not.toThrow();
      });
    });
  });

  // ===========================================================================
  // Lock Operations Tests
  // ===========================================================================

  describe("Lock Operations", () => {
    describe("acquireLock", () => {
      it("acquires lock when no lock exists", async () => {
        const result = await adapter.acquireLock("worker", "test task");
        expect(result).toBe(true);
      });

      it("fails to acquire when lock is held", async () => {
        await adapter.acquireLock("worker", "task 1");
        const result = await adapter.acquireLock("user", "task 2");
        expect(result).toBe(false);
      });

      it("acquires lock when existing lock is expired", async () => {
        // Write an expired lock directly
        const expiredLock = {
          holder: "worker",
          task: "old task",
          started: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          timeout: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        };
        await adapter.writeJson(".lock", expiredLock);

        const result = await adapter.acquireLock("user", "new task");
        expect(result).toBe(true);
      });

      it("creates lock with correct structure", async () => {
        await adapter.acquireLock("system", "initialization");

        const lock = await adapter.readLock();
        expect(lock).not.toBeNull();
        expect(lock!.holder).toBe("system");
        expect(lock!.task).toBe("initialization");
        expect(lock!.started).toBeDefined();
        expect(lock!.timeout).toBeDefined();
      });

      it("lock task is optional", async () => {
        await adapter.acquireLock("worker");

        const lock = await adapter.readLock();
        expect(lock).not.toBeNull();
        expect(lock!.holder).toBe("worker");
        expect(lock!.task).toBeUndefined();
      });
    });

    describe("releaseLock", () => {
      it("releases existing lock", async () => {
        await adapter.acquireLock("worker", "task");
        await adapter.releaseLock();

        const lock = await adapter.readLock();
        expect(lock).toBeNull();
      });

      it("does not throw when no lock exists", async () => {
        await expect(adapter.releaseLock()).resolves.not.toThrow();
      });
    });

    describe("readLock", () => {
      it("returns null when no lock exists", async () => {
        const lock = await adapter.readLock();
        expect(lock).toBeNull();
      });

      it("returns lock data when lock exists", async () => {
        await adapter.acquireLock("user", "editing");

        const lock = await adapter.readLock();
        expect(lock).not.toBeNull();
        expect(lock!.holder).toBe("user");
        expect(lock!.task).toBe("editing");
      });
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe("createFileSystemAdapter", () => {
    it("creates adapter with specified root", () => {
      const adapter = createFileSystemAdapter("/custom/path");
      expect(adapter.getRootDir()).toBe("/custom/path");
    });

    it("creates adapter with cwd when no root provided", () => {
      const adapter = createFileSystemAdapter();
      expect(adapter.getRootDir()).toBe(process.cwd());
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    it("handles special characters in keys", async () => {
      const data = { id: "special", name: "Test", count: 1 };
      const key = "data with spaces.json";

      await adapter.writeJson(key, data);
      const result = await adapter.readJson(key, TestDataSchema);

      expect(result).toEqual(data);
    });

    it("handles empty JSON objects", async () => {
      const EmptySchema = z.object({});
      await adapter.writeJson("empty.json", {});

      const result = await adapter.readJson("empty.json", EmptySchema);
      expect(result).toEqual({});
    });

    it("handles empty arrays", async () => {
      const ArraySchema = z.array(z.string());
      await adapter.writeJson("array.json", []);

      const result = await adapter.readJson("array.json", ArraySchema);
      expect(result).toEqual([]);
    });

    it("handles large files", async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`,
        count: i,
      }));
      const LargeSchema = z.array(TestDataSchema);

      await adapter.writeJson("large.json", largeArray);
      const result = await adapter.readJson("large.json", LargeSchema);

      expect(result).toHaveLength(1000);
      expect(result![0].id).toBe("item-0");
      expect(result![999].id).toBe("item-999");
    });

    it("preserves unicode characters", async () => {
      const content = "# 日本語テスト\n\nEmoji: 🚀 ✅ ❌";
      await adapter.writeText("unicode.md", content);

      const result = await adapter.readText("unicode.md");
      expect(result).toBe(content);
    });
  });
});
