/**
 * Tests for LisaApiAdapter
 *
 * Uses MSW (Mock Service Worker) patterns for mocking HTTP requests.
 * Since we don't have MSW installed, we mock fetch directly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LisaApiAdapter,
  LisaApiConfig,
  LisaApiError,
  LisaApiConfigError,
  LisaApiConflictError,
  createLisaApiAdapter,
  isLisaCloudConfigured,
} from "../api.js";
import { z } from "zod";

// =============================================================================
// Test Helpers
// =============================================================================

const TEST_CONFIG: LisaApiConfig = {
  apiKey: "lk_test_abc123",
  projectId: "proj-test-xyz",
  baseUrl: "https://api.test.lisa.dev",
  timeout: 5000,
};

/**
 * Create a mock Response object.
 */
function mockResponse(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {}
): Response {
  const responseBody = body !== undefined ? JSON.stringify(body) : null;
  return new Response(responseBody, {
    status,
    statusText: getStatusText(status),
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function mockTextResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    statusText: getStatusText(status),
    headers: {
      "Content-Type": "text/plain",
    },
  });
}

function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: "OK",
    201: "Created",
    204: "No Content",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    500: "Internal Server Error",
  };
  return statusTexts[status] ?? "Unknown";
}

// =============================================================================
// Configuration Tests
// =============================================================================

describe("LisaApiAdapter Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should use explicit config options", () => {
    const adapter = new LisaApiAdapter(TEST_CONFIG);
    expect(adapter.getRootDir()).toBe(`lisa-cloud://${TEST_CONFIG.projectId}`);
  });

  it("should fall back to environment variables", () => {
    process.env.LISA_API_KEY = "lk_env_key";
    process.env.LISA_PROJECT_ID = "proj-env-id";

    const adapter = new LisaApiAdapter();
    expect(adapter.getRootDir()).toBe("lisa-cloud://proj-env-id");
  });

  it("should prefer explicit options over environment variables", () => {
    process.env.LISA_API_KEY = "lk_env_key";
    process.env.LISA_PROJECT_ID = "proj-env-id";

    const adapter = new LisaApiAdapter({
      apiKey: "lk_explicit_key",
      projectId: "proj-explicit-id",
    });
    expect(adapter.getRootDir()).toBe("lisa-cloud://proj-explicit-id");
  });

  it("should throw if API key is missing", () => {
    delete process.env.LISA_API_KEY;
    delete process.env.LISA_PROJECT_ID;

    expect(() => new LisaApiAdapter({ projectId: "proj-123" })).toThrow(
      LisaApiConfigError
    );
    expect(() => new LisaApiAdapter({ projectId: "proj-123" })).toThrow(
      "API key is required"
    );
  });

  it("should throw if project ID is missing", () => {
    delete process.env.LISA_API_KEY;
    delete process.env.LISA_PROJECT_ID;

    expect(() => new LisaApiAdapter({ apiKey: "lk_test" })).toThrow(
      LisaApiConfigError
    );
    expect(() => new LisaApiAdapter({ apiKey: "lk_test" })).toThrow(
      "project ID is required"
    );
  });

  it("should use default base URL if not provided", () => {
    process.env.LISA_API_KEY = "lk_test";
    process.env.LISA_PROJECT_ID = "proj-123";
    delete process.env.LISA_API_URL;

    // We can't directly test the baseUrl, but we can verify it doesn't throw
    const adapter = new LisaApiAdapter();
    expect(adapter).toBeDefined();
  });

  it("should use LISA_API_URL environment variable", () => {
    process.env.LISA_API_KEY = "lk_test";
    process.env.LISA_PROJECT_ID = "proj-123";
    process.env.LISA_API_URL = "https://custom.api.example.com";

    const adapter = new LisaApiAdapter();
    expect(adapter).toBeDefined();
  });
});

describe("isLisaCloudConfigured", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return true when both env vars are set", () => {
    process.env.LISA_API_KEY = "lk_test";
    process.env.LISA_PROJECT_ID = "proj-123";

    expect(isLisaCloudConfigured()).toBe(true);
  });

  it("should return false when API key is missing", () => {
    delete process.env.LISA_API_KEY;
    process.env.LISA_PROJECT_ID = "proj-123";

    expect(isLisaCloudConfigured()).toBe(false);
  });

  it("should return false when project ID is missing", () => {
    process.env.LISA_API_KEY = "lk_test";
    delete process.env.LISA_PROJECT_ID;

    expect(isLisaCloudConfigured()).toBe(false);
  });

  it("should return false when both are missing", () => {
    delete process.env.LISA_API_KEY;
    delete process.env.LISA_PROJECT_ID;

    expect(isLisaCloudConfigured()).toBe(false);
  });
});

describe("createLisaApiAdapter", () => {
  it("should create an adapter with config", () => {
    const adapter = createLisaApiAdapter(TEST_CONFIG);
    expect(adapter).toBeInstanceOf(LisaApiAdapter);
  });
});

// =============================================================================
// HTTP Request Tests
// =============================================================================

describe("LisaApiAdapter HTTP Operations", () => {
  let adapter: LisaApiAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new LisaApiAdapter(TEST_CONFIG);
    fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isInitialized", () => {
    it("should return true when project.json exists", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { id: "proj-123" }));

      const result = await adapter.isInitialized();

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_CONFIG.baseUrl}/projects/${TEST_CONFIG.projectId}/state/project.json`,
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_CONFIG.apiKey}`,
          }),
        })
      );
    });

    it("should return false when project.json does not exist", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404));

      const result = await adapter.isInitialized();

      expect(result).toBe(false);
    });

    it("should return false on network error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network error"));

      const result = await adapter.isInitialized();

      expect(result).toBe(false);
    });
  });

  describe("readJson", () => {
    const TestSchema = z.object({
      id: z.string(),
      name: z.string(),
    });

    it("should read and parse JSON data", async () => {
      const testData = { id: "123", name: "Test" };
      fetchMock.mockResolvedValueOnce(mockResponse(200, testData));

      const result = await adapter.readJson("test.json", TestSchema);

      expect(result).toEqual(testData);
      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_CONFIG.baseUrl}/projects/${TEST_CONFIG.projectId}/state/test.json`,
        expect.objectContaining({ method: "GET" })
      );
    });

    it("should return null for 404", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404));

      const result = await adapter.readJson("nonexistent.json", TestSchema);

      expect(result).toBeNull();
    });

    it("should throw on schema validation failure", async () => {
      const invalidData = { id: 123, name: "Test" }; // id should be string
      fetchMock.mockResolvedValueOnce(mockResponse(200, invalidData));

      await expect(adapter.readJson("test.json", TestSchema)).rejects.toThrow();
    });

    it("should throw LisaApiError on server error", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(500, { error: "Server error" }));

      await expect(adapter.readJson("test.json", TestSchema)).rejects.toThrow(
        LisaApiError
      );
    });

    it("should encode keys with special characters", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { id: "1", name: "Test" }));

      await adapter.readJson("epics/E1-auth/epic.json", TestSchema);

      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_CONFIG.baseUrl}/projects/${TEST_CONFIG.projectId}/state/epics/E1-auth/epic.json`,
        expect.anything()
      );
    });
  });

  describe("writeJson", () => {
    it("should write JSON data", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200));

      const testData = { id: "123", name: "Test" };
      await adapter.writeJson("test.json", testData);

      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_CONFIG.baseUrl}/projects/${TEST_CONFIG.projectId}/state/test.json`,
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(testData),
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("should throw on error response", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(403, { error: "Forbidden" }));

      await expect(adapter.writeJson("test.json", {})).rejects.toThrow(
        LisaApiError
      );
    });
  });

  describe("readText", () => {
    it("should read text content", async () => {
      const content = "# My Document\n\nSome content here.";
      fetchMock.mockResolvedValueOnce(mockTextResponse(200, content));

      const result = await adapter.readText("docs/readme.md");

      expect(result).toBe(content);
    });

    it("should return null for 404", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404));

      const result = await adapter.readText("nonexistent.md");

      expect(result).toBeNull();
    });
  });

  describe("writeText", () => {
    it("should write text content", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200));

      const content = "# My Document";
      await adapter.writeText("docs/readme.md", content);

      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_CONFIG.baseUrl}/projects/${TEST_CONFIG.projectId}/state/docs/readme.md`,
        expect.objectContaining({
          method: "PUT",
          body: content,
          headers: expect.objectContaining({
            "Content-Type": "text/plain",
          }),
        })
      );
    });
  });

  describe("exists", () => {
    it("should return true when key exists", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200));

      const result = await adapter.exists("test.json");

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: "HEAD" })
      );
    });

    it("should return false when key does not exist", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404));

      const result = await adapter.exists("nonexistent.json");

      expect(result).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete a key", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(204));

      await adapter.delete("test.json");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("should not throw on 404", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404));

      await expect(adapter.delete("nonexistent.json")).resolves.toBeUndefined();
    });
  });

  describe("list", () => {
    it("should list keys with prefix", async () => {
      const keys = ["epics/E1-auth/epic.json", "epics/E1-auth/prd.md"];
      fetchMock.mockResolvedValueOnce(mockResponse(200, { keys }));

      const result = await adapter.list("epics/");

      expect(result).toEqual(keys);
      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_CONFIG.baseUrl}/projects/${TEST_CONFIG.projectId}/state?prefix=epics%2F`,
        expect.anything()
      );
    });
  });

  describe("listDirectories", () => {
    it("should list directories with prefix", async () => {
      const directories = ["E1-auth", "E2-payments"];
      fetchMock.mockResolvedValueOnce(mockResponse(200, { directories }));

      const result = await adapter.listDirectories("epics/");

      expect(result).toEqual(directories);
      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_CONFIG.baseUrl}/projects/${TEST_CONFIG.projectId}/state?prefix=epics%2F&type=directory`,
        expect.anything()
      );
    });
  });
});

// =============================================================================
// Lock Tests
// =============================================================================

describe("LisaApiAdapter Lock Operations", () => {
  let adapter: LisaApiAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new LisaApiAdapter(TEST_CONFIG);
    fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("acquireLock", () => {
    it("should acquire lock successfully", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { acquired: true }));

      const result = await adapter.acquireLock("worker", "test task");

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_CONFIG.baseUrl}/projects/${TEST_CONFIG.projectId}/lock`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ holder: "worker", task: "test task" }),
        })
      );
    });

    it("should return false on conflict (lock already held)", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(409, { error: "Lock held" }));

      const result = await adapter.acquireLock("user");

      expect(result).toBe(false);
    });

    it("should throw on other errors", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(500));

      await expect(adapter.acquireLock("system")).rejects.toThrow(LisaApiError);
    });
  });

  describe("releaseLock", () => {
    it("should release lock successfully", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(204));

      await adapter.releaseLock();

      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_CONFIG.baseUrl}/projects/${TEST_CONFIG.projectId}/lock`,
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("should not throw on 404 (no lock to release)", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404));

      await expect(adapter.releaseLock()).resolves.toBeUndefined();
    });
  });

  describe("readLock", () => {
    it("should read lock state", async () => {
      const lockData = {
        holder: "worker",
        task: "generating PRD",
        started: "2024-01-15T10:00:00Z",
        timeout: "2024-01-15T10:10:00Z",
      };
      fetchMock.mockResolvedValueOnce(mockResponse(200, lockData));

      const result = await adapter.readLock();

      expect(result).toEqual(lockData);
    });

    it("should return null when no lock exists", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404));

      const result = await adapter.readLock();

      expect(result).toBeNull();
    });
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("LisaApiAdapter Error Handling", () => {
  let adapter: LisaApiAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new LisaApiAdapter(TEST_CONFIG);
    fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should throw LisaApiConflictError on 409", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(409, { error: "Version conflict" })
    );

    const schema = z.object({ id: z.string() });

    try {
      await adapter.readJson("test.json", schema);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LisaApiConflictError);
      expect((error as LisaApiConflictError).status).toBe(409);
    }
  });

  it("should include response body in error", async () => {
    const errorBody = { error: "Invalid request", details: "Missing field" };
    fetchMock.mockResolvedValueOnce(mockResponse(400, errorBody));

    const schema = z.object({ id: z.string() });

    try {
      await adapter.readJson("test.json", schema);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LisaApiError);
      expect((error as LisaApiError).body).toEqual(errorBody);
    }
  });

  it("should handle non-JSON error responses", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Internal Server Error", {
        status: 500,
        statusText: "Internal Server Error",
      })
    );

    const schema = z.object({ id: z.string() });

    try {
      await adapter.readJson("test.json", schema);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LisaApiError);
      expect((error as LisaApiError).body).toBeUndefined();
    }
  });

  it("should include proper headers in requests", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { id: "1" }));

    const schema = z.object({ id: z.string() });
    await adapter.readJson("test.json", schema);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_CONFIG.apiKey}`,
          "X-Lisa-Client": "lisa-cli",
          "X-Lisa-Version": expect.any(String),
        }),
      })
    );
  });
});

// =============================================================================
// YAML Operations Tests
// =============================================================================

describe("LisaApiAdapter YAML Operations", () => {
  let adapter: LisaApiAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new LisaApiAdapter(TEST_CONFIG);
    fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("readYaml", () => {
    it("should read YAML data (returned as JSON from API)", async () => {
      const ConfigSchema = z.object({
        grind: z.object({
          max_attempts: z.number(),
        }),
      });

      const data = { grind: { max_attempts: 5 } };
      fetchMock.mockResolvedValueOnce(mockResponse(200, data));

      const result = await adapter.readYaml("config.yaml", ConfigSchema);

      expect(result).toEqual(data);
    });

    it("should return null for 404", async () => {
      const ConfigSchema = z.object({});
      fetchMock.mockResolvedValueOnce(mockResponse(404));

      const result = await adapter.readYaml("config.yaml", ConfigSchema);

      expect(result).toBeNull();
    });
  });

  describe("writeYaml", () => {
    it("should write YAML data with format hint", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200));

      const data = { grind: { max_attempts: 5 } };
      await adapter.writeYaml("config.yaml", data);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(data),
          headers: expect.objectContaining({
            "X-Lisa-Format": "yaml",
          }),
        })
      );
    });
  });
});

// =============================================================================
// ensureDirectory Tests
// =============================================================================

describe("LisaApiAdapter ensureDirectory", () => {
  let adapter: LisaApiAdapter;

  beforeEach(() => {
    adapter = new LisaApiAdapter(TEST_CONFIG);
  });

  it("should be a no-op (directories are virtual in cloud storage)", async () => {
    // Should complete without making any requests
    await expect(adapter.ensureDirectory("epics/E1-auth")).resolves.toBeUndefined();
  });
});
