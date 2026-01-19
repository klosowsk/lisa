/**
 * State Adapter Interface
 *
 * Defines the contract for state persistence operations.
 * Implementations can store state in various backends:
 * - FileSystemStateAdapter: .lisa folder (default)
 * - DatabaseStateAdapter: PostgreSQL, SQLite, etc. (future)
 * - ApiStateAdapter: Remote server (future)
 */

import { z } from "zod";
import { Lock } from "../../core/schemas.js";

/**
 * Core persistence adapter interface.
 *
 * Uses abstract "keys" instead of file paths. Each adapter interprets keys
 * according to its storage mechanism:
 * - Filesystem: keys are relative paths (e.g., "project.json", "epics/E1-auth/prd.md")
 * - Database: keys map to table/column identifiers
 * - API: keys become URL segments
 */
export interface StateAdapter {
  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Check if state storage is initialized.
   * For filesystem: checks if .lisa directory exists.
   * For database: checks if schema/tables exist.
   */
  isInitialized(): Promise<boolean>;

  /**
   * Get the root directory (for filesystem adapter) or identifier.
   * This is used by StateManager for path helpers.
   */
  getRootDir(): string;

  // ==========================================================================
  // Generic Read/Write Operations
  // ==========================================================================

  /**
   * Read JSON data from storage.
   * @param key - Storage key (e.g., "project.json", "discovery/context.json")
   * @param schema - Zod schema for validation
   * @returns Parsed and validated data, or null if not found
   */
  readJson<T extends z.ZodTypeAny>(key: string, schema: T): Promise<z.output<T> | null>;

  /**
   * Write JSON data to storage.
   * @param key - Storage key
   * @param data - Data to write (will be JSON serialized)
   */
  writeJson<T>(key: string, data: T): Promise<void>;

  /**
   * Read YAML data from storage.
   * @param key - Storage key (e.g., "config.yaml")
   * @param schema - Zod schema for validation
   * @returns Parsed and validated data, or null if not found
   */
  readYaml<T extends z.ZodTypeAny>(key: string, schema: T): Promise<z.output<T> | null>;

  /**
   * Write YAML data to storage.
   * @param key - Storage key
   * @param data - Data to write (will be YAML serialized)
   */
  writeYaml<T>(key: string, data: T): Promise<void>;

  /**
   * Read raw text from storage (for markdown files, etc.).
   * @param key - Storage key (e.g., "epics/E1-auth/prd.md")
   * @returns Text content, or null if not found
   */
  readText(key: string): Promise<string | null>;

  /**
   * Write raw text to storage.
   * @param key - Storage key
   * @param content - Text content to write
   */
  writeText(key: string, content: string): Promise<void>;

  // ==========================================================================
  // Utility Operations
  // ==========================================================================

  /**
   * Check if a key exists in storage.
   * @param key - Storage key to check
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete a key from storage.
   * @param key - Storage key to delete
   */
  delete(key: string): Promise<void>;

  /**
   * List all keys under a prefix.
   * For filesystem: lists directory contents.
   * For database: queries keys matching prefix.
   * @param prefix - Key prefix to filter by (e.g., "epics/")
   * @returns Array of keys (not full paths, just names)
   */
  list(prefix: string): Promise<string[]>;

  /**
   * List directories under a prefix.
   * @param prefix - Key prefix to filter by
   * @returns Array of directory names
   */
  listDirectories(prefix: string): Promise<string[]>;

  /**
   * Ensure a directory/container exists.
   * For filesystem: creates directory recursively.
   * For database: may be a no-op.
   * @param key - Directory key to create
   */
  ensureDirectory(key: string): Promise<void>;

  // ==========================================================================
  // Lock Operations
  // ==========================================================================

  /**
   * Acquire an exclusive lock.
   * Used to prevent concurrent modifications.
   * @param holder - Who is acquiring the lock
   * @param task - Optional description of the task
   * @returns true if lock acquired, false if already locked
   */
  acquireLock(holder: "worker" | "user" | "system", task?: string): Promise<boolean>;

  /**
   * Release the current lock.
   */
  releaseLock(): Promise<void>;

  /**
   * Read the current lock state.
   * @returns Lock info, or null if no lock
   */
  readLock(): Promise<Lock | null>;
}

/**
 * Options for creating a state adapter.
 */
export interface StateAdapterOptions {
  /**
   * Root directory for filesystem adapter.
   * Connection string for database adapter.
   * Base URL for API adapter.
   */
  root?: string;
}
