/**
 * Lisa API State Adapter
 *
 * Implements StateAdapter for cloud-based storage via the Lisa Cloud API.
 * Enables team collaboration with shared project state.
 *
 * Configuration:
 *   - API key: LISA_API_KEY env var or apiKey option
 *   - Project ID: LISA_PROJECT_ID env var or projectId option
 *   - Base URL: LISA_API_URL env var or baseUrl option (defaults to https://api.lisa.dev)
 */

import { z } from "zod";
import { StateAdapter } from "./types.js";
import { Lock, LockSchema } from "../../core/schemas.js";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for the Lisa API adapter.
 */
export interface LisaApiConfig {
  /**
   * API key for authentication.
   * Falls back to LISA_API_KEY environment variable.
   */
  apiKey?: string;

  /**
   * Project ID to operate on.
   * Falls back to LISA_PROJECT_ID environment variable.
   */
  projectId?: string;

  /**
   * Base URL for the Lisa Cloud API.
   * Falls back to LISA_API_URL environment variable.
   * Defaults to https://api.lisa.dev
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds.
   * Defaults to 30000 (30 seconds).
   */
  timeout?: number;
}

/**
 * Resolved configuration with all required fields.
 */
interface ResolvedConfig {
  apiKey: string;
  projectId: string;
  baseUrl: string;
  timeout: number;
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when API configuration is missing or invalid.
 */
export class LisaApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LisaApiConfigError";
  }
}

/**
 * Error thrown when an API request fails.
 */
export class LisaApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body?: unknown;

  constructor(response: Response, body?: unknown) {
    const message = `Lisa API error: ${response.status} ${response.statusText}`;
    super(message);
    this.name = "LisaApiError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.body = body;
  }
}

/**
 * Error thrown when there's a conflict (409).
 */
export class LisaApiConflictError extends LisaApiError {
  constructor(response: Response, body?: unknown) {
    super(response, body);
    this.name = "LisaApiConflictError";
  }
}

// =============================================================================
// API Adapter Implementation
// =============================================================================

/**
 * Lisa Cloud API state adapter.
 *
 * Stores project state in the Lisa Cloud service, enabling:
 * - Team collaboration with shared state
 * - Cross-device access
 * - Centralized backup
 * - Audit trails
 *
 * @example
 * ```typescript
 * // Using environment variables
 * process.env.LISA_API_KEY = "rk_live_abc123";
 * process.env.LISA_PROJECT_ID = "proj-xyz789";
 * const adapter = new LisaApiAdapter();
 *
 * // Or explicit configuration
 * const adapter = new LisaApiAdapter({
 *   apiKey: "rk_live_abc123",
 *   projectId: "proj-xyz789",
 * });
 *
 * // Use with StateManager
 * const state = createStateManager(adapter);
 *
 * // Or with LisaEngine
 * const engine = createEngine({ adapter });
 * ```
 */
export class LisaApiAdapter implements StateAdapter {
  private config: ResolvedConfig;

  constructor(config: LisaApiConfig = {}) {
    this.config = this.resolveConfig(config);
  }

  /**
   * Resolve configuration from options and environment variables.
   */
  private resolveConfig(config: LisaApiConfig): ResolvedConfig {
    const apiKey = config.apiKey ?? process.env.LISA_API_KEY;
    const projectId = config.projectId ?? process.env.LISA_PROJECT_ID;
    const baseUrl = config.baseUrl ?? process.env.LISA_API_URL ?? "https://api.lisa.dev";
    const timeout = config.timeout ?? 30000;

    if (!apiKey) {
      throw new LisaApiConfigError(
        "Lisa API key is required. Set LISA_API_KEY environment variable or pass apiKey option."
      );
    }

    if (!projectId) {
      throw new LisaApiConfigError(
        "Lisa project ID is required. Set LISA_PROJECT_ID environment variable or pass projectId option."
      );
    }

    return { apiKey, projectId, baseUrl, timeout };
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  async isInitialized(): Promise<boolean> {
    try {
      const response = await this.request("GET", "/state/project.json");
      return response.status === 200;
    } catch {
      return false;
    }
  }

  getRootDir(): string {
    // Cloud projects don't have a local root directory.
    // Return a virtual identifier for compatibility.
    return `lisa-cloud://${this.config.projectId}`;
  }

  // ===========================================================================
  // Generic Read/Write Operations
  // ===========================================================================

  async readJson<T extends z.ZodTypeAny>(
    key: string,
    schema: T
  ): Promise<z.output<T> | null> {
    const response = await this.request("GET", `/state/${this.encodeKey(key)}`);

    if (response.status === 404) {
      return null;
    }

    await this.assertOk(response);

    const data = await response.json();
    return schema.parse(data) as z.output<T>;
  }

  async writeJson<T>(key: string, data: T): Promise<void> {
    const response = await this.request("PUT", `/state/${this.encodeKey(key)}`, {
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
    });

    await this.assertOk(response);
  }

  async readYaml<T extends z.ZodTypeAny>(
    key: string,
    schema: T
  ): Promise<z.output<T> | null> {
    const response = await this.request("GET", `/state/${this.encodeKey(key)}`, {
      headers: {
        "Accept": "application/x-yaml, application/json",
      },
    });

    if (response.status === 404) {
      return null;
    }

    await this.assertOk(response);

    // API returns JSON regardless of stored format
    const data = await response.json();
    return schema.parse(data) as z.output<T>;
  }

  async writeYaml<T>(key: string, data: T): Promise<void> {
    // Send as JSON, API stores appropriately based on key extension
    const response = await this.request("PUT", `/state/${this.encodeKey(key)}`, {
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
        "X-Lisa-Format": "yaml", // Hint to store as YAML
      },
    });

    await this.assertOk(response);
  }

  async readText(key: string): Promise<string | null> {
    const response = await this.request("GET", `/state/${this.encodeKey(key)}`, {
      headers: {
        "Accept": "text/plain, text/markdown",
      },
    });

    if (response.status === 404) {
      return null;
    }

    await this.assertOk(response);

    return response.text();
  }

  async writeText(key: string, content: string): Promise<void> {
    const response = await this.request("PUT", `/state/${this.encodeKey(key)}`, {
      body: content,
      headers: {
        "Content-Type": "text/plain",
      },
    });

    await this.assertOk(response);
  }

  // ===========================================================================
  // Utility Operations
  // ===========================================================================

  async exists(key: string): Promise<boolean> {
    const response = await this.request("HEAD", `/state/${this.encodeKey(key)}`);
    return response.status === 200;
  }

  async delete(key: string): Promise<void> {
    const response = await this.request("DELETE", `/state/${this.encodeKey(key)}`);

    // 404 is fine - key didn't exist
    if (response.status !== 404) {
      await this.assertOk(response);
    }
  }

  async list(prefix: string): Promise<string[]> {
    const response = await this.request(
      "GET",
      `/state?prefix=${encodeURIComponent(prefix)}`
    );

    await this.assertOk(response);

    const data = await response.json();
    return data.keys ?? [];
  }

  async listDirectories(prefix: string): Promise<string[]> {
    const response = await this.request(
      "GET",
      `/state?prefix=${encodeURIComponent(prefix)}&type=directory`
    );

    await this.assertOk(response);

    const data = await response.json();
    return data.directories ?? [];
  }

  async ensureDirectory(key: string): Promise<void> {
    // In cloud storage, directories are virtual - they exist implicitly
    // when files are created within them. This is a no-op.
    // Some implementations might want to create a marker file.
  }

  // ===========================================================================
  // Lock Operations
  // ===========================================================================

  async acquireLock(
    holder: "worker" | "user" | "system",
    task?: string
  ): Promise<boolean> {
    const response = await this.request("POST", "/lock", {
      body: JSON.stringify({ holder, task }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.status === 409) {
      // Lock already held
      return false;
    }

    await this.assertOk(response);
    return true;
  }

  async releaseLock(): Promise<void> {
    const response = await this.request("DELETE", "/lock");

    // 404 is fine - lock didn't exist
    if (response.status !== 404) {
      await this.assertOk(response);
    }
  }

  async readLock(): Promise<Lock | null> {
    const response = await this.request("GET", "/lock");

    if (response.status === 404) {
      return null;
    }

    await this.assertOk(response);

    const data = await response.json();
    return LockSchema.parse(data);
  }

  // ===========================================================================
  // HTTP Client
  // ===========================================================================

  /**
   * Make an HTTP request to the Lisa API.
   */
  private async request(
    method: string,
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.config.baseUrl}/projects/${this.config.projectId}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method,
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "X-Lisa-Client": "lisa-cli",
          "X-Lisa-Version": "0.1.0", // TODO: Get from package.json
          ...options.headers,
        },
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Encode a storage key for use in URL path.
   */
  private encodeKey(key: string): string {
    // Encode each path segment separately to preserve slashes
    return key
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  /**
   * Assert that a response is successful, throw otherwise.
   */
  private async assertOk(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // Response might not be JSON
    }

    if (response.status === 409) {
      throw new LisaApiConflictError(response, body);
    }

    throw new LisaApiError(response, body);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Lisa API adapter.
 *
 * @example
 * ```typescript
 * // Using environment variables
 * const adapter = createLisaApiAdapter();
 *
 * // With explicit config
 * const adapter = createLisaApiAdapter({
 *   apiKey: "rk_live_abc123",
 *   projectId: "proj-xyz789",
 * });
 * ```
 */
export function createLisaApiAdapter(config?: LisaApiConfig): LisaApiAdapter {
  return new LisaApiAdapter(config);
}

/**
 * Check if Lisa Cloud configuration is available.
 * Useful for auto-detecting which adapter to use.
 */
export function isLisaCloudConfigured(): boolean {
  return !!(process.env.LISA_API_KEY && process.env.LISA_PROJECT_ID);
}
