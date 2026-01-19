/**
 * Filesystem State Adapter
 *
 * Implements StateAdapter for local filesystem storage.
 * State is stored in a .lisa directory structure.
 */

import * as fs from "fs/promises";
import * as path from "path";
import YAML from "yaml";
import { z } from "zod";
import { StateAdapter, StateAdapterOptions } from "./types.js";
import { Lock, LockSchema } from "../../core/schemas.js";

/**
 * Default directory name for Lisa state.
 */
export const LISA_DIR = ".lisa";

/**
 * Filesystem-based state adapter.
 *
 * Stores state in a local .lisa directory with the following structure:
 * ```
 * .lisa/
 * ├── project.json
 * ├── config.yaml
 * ├── task_queue.json
 * ├── stuck_queue.json
 * ├── feedback_queue.json
 * ├── .lock
 * ├── discovery/
 * │   ├── context.json
 * │   ├── constraints.json
 * │   ├── history.json
 * │   └── codebase.json
 * ├── milestones/
 * │   ├── index.json
 * │   └── {milestoneId}/
 * │       └── discovery.json
 * ├── epics/
 * │   └── {epicId}-{slug}/
 * │       ├── epic.json
 * │       ├── prd.md
 * │       ├── architecture.md
 * │       ├── stories.json
 * │       └── discovery.json
 * └── validation/
 *     ├── coverage.json
 *     ├── links.json
 *     └── issues.json
 * ```
 */
export class FileSystemStateAdapter implements StateAdapter {
  private rootDir: string;
  private lisaDir: string;

  constructor(options: StateAdapterOptions = {}) {
    this.rootDir = options.root ?? process.cwd();
    this.lisaDir = path.join(this.rootDir, LISA_DIR);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async isInitialized(): Promise<boolean> {
    try {
      await fs.access(this.lisaDir);
      return true;
    } catch {
      return false;
    }
  }

  getRootDir(): string {
    return this.rootDir;
  }

  // ==========================================================================
  // Path Helpers (internal)
  // ==========================================================================

  /**
   * Convert a storage key to an absolute filesystem path.
   */
  private getPath(key: string): string {
    return path.join(this.lisaDir, key);
  }

  // ==========================================================================
  // Generic Read/Write Operations
  // ==========================================================================

  async readJson<T extends z.ZodTypeAny>(key: string, schema: T): Promise<z.output<T> | null> {
    try {
      const fullPath = this.getPath(key);
      const content = await fs.readFile(fullPath, "utf-8");
      const data = JSON.parse(content);
      return schema.parse(data) as z.output<T>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async writeJson<T>(key: string, data: T): Promise<void> {
    const fullPath = this.getPath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, JSON.stringify(data, null, 2), "utf-8");
  }

  async readYaml<T extends z.ZodTypeAny>(key: string, schema: T): Promise<z.output<T> | null> {
    try {
      const fullPath = this.getPath(key);
      const content = await fs.readFile(fullPath, "utf-8");
      const data = YAML.parse(content);
      return schema.parse(data) as z.output<T>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async writeYaml<T>(key: string, data: T): Promise<void> {
    const fullPath = this.getPath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, YAML.stringify(data), "utf-8");
  }

  async readText(key: string): Promise<string | null> {
    try {
      const fullPath = this.getPath(key);
      return await fs.readFile(fullPath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async writeText(key: string, content: string): Promise<void> {
    const fullPath = this.getPath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  // ==========================================================================
  // Utility Operations
  // ==========================================================================

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.getPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.getPath(key));
    } catch {
      // File doesn't exist, that's fine
    }
  }

  async list(prefix: string): Promise<string[]> {
    try {
      return await fs.readdir(this.getPath(prefix));
    } catch {
      return [];
    }
  }

  async listDirectories(prefix: string): Promise<string[]> {
    try {
      const dirPath = this.getPath(prefix);
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  async ensureDirectory(key: string): Promise<void> {
    await fs.mkdir(this.getPath(key), { recursive: true });
  }

  // ==========================================================================
  // Lock Operations
  // ==========================================================================

  private readonly LOCK_KEY = ".lock";
  private readonly LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  async acquireLock(holder: "worker" | "user" | "system", task?: string): Promise<boolean> {
    try {
      // Check for existing lock
      const existingLock = await this.readJson(this.LOCK_KEY, LockSchema);
      if (existingLock) {
        const timeout = new Date(existingLock.timeout);
        if (timeout > new Date()) {
          // Lock is still valid
          return false;
        }
        // Lock expired, can override
      }
    } catch {
      // No lock exists
    }

    const now = new Date();
    const lock: Lock = {
      holder,
      task,
      started: now.toISOString(),
      timeout: new Date(now.getTime() + this.LOCK_TIMEOUT_MS).toISOString(),
    };

    await this.writeJson(this.LOCK_KEY, lock);
    return true;
  }

  async releaseLock(): Promise<void> {
    await this.delete(this.LOCK_KEY);
  }

  async readLock(): Promise<Lock | null> {
    return this.readJson(this.LOCK_KEY, LockSchema);
  }
}

/**
 * Create a filesystem state adapter.
 */
export function createFileSystemAdapter(rootDir?: string): FileSystemStateAdapter {
  return new FileSystemStateAdapter({ root: rootDir });
}
