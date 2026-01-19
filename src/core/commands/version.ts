/**
 * Version Command for Lisa Engine
 *
 * Display version information.
 */

import { CommandResult, OutputSection, success, section } from "../types.js";

// These are injected at build time by esbuild
declare const LISA_VERSION: string;
declare const LISA_NAME: string;
declare const LISA_HOMEPAGE: string;
declare const LISA_REPOSITORY: string;

// ============================================================================
// Types
// ============================================================================

export interface VersionData {
  version: string;
  name: string;
  homepage?: string;
  repository?: string;
}

// ============================================================================
// Version Command
// ============================================================================

export async function version(): Promise<CommandResult<VersionData>> {
  const data: VersionData = {
    version: LISA_VERSION,
    name: LISA_NAME,
    homepage: LISA_HOMEPAGE,
    repository: LISA_REPOSITORY,
  };

  const sections: OutputSection[] = [
    section.header("Lisa"),
    section.text(`  Version: ${data.version}`),
    section.blank(),
  ];

  if (data.homepage) {
    sections.push(section.dim(`  Homepage: ${data.homepage}`));
  }

  if (data.repository) {
    const repoUrl = data.repository.replace(/^git\+/, "").replace(/\.git$/, "");
    sections.push(section.dim(`  Repository: ${repoUrl}`));
  }

  return success(data, sections);
}
