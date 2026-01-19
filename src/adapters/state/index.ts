/**
 * State Adapter Exports
 *
 * Provides the state adapter interface and implementations.
 */

// Interface
export type { StateAdapter, StateAdapterOptions } from "./types.js";

// Filesystem Implementation (local .lisa folder)
export {
  FileSystemStateAdapter,
  createFileSystemAdapter,
  LISA_DIR,
} from "./filesystem.js";

// API Implementation
export {
  LisaApiAdapter,
  type LisaApiConfig,
  LisaApiError,
  LisaApiConfigError,
  LisaApiConflictError,
  createLisaApiAdapter,
  isLisaCloudConfigured,
} from "./api.js";
