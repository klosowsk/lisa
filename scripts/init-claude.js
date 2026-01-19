#!/usr/bin/env node

/**
 * Initializes a local .claude directory with symlinked skills
 * Usage: npm run init:claude
 */

import { existsSync, mkdirSync, symlinkSync, readdirSync, lstatSync } from 'fs'
import { join, dirname, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const claudeDir = join(root, '.claude')
const claudeSkillsDir = join(claudeDir, 'skills')
const sourceSkillsDir = join(root, 'skills')

function init() {
  console.log('Initializing .claude directory...\n')

  // Create .claude directory
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir)
    console.log('  Created .claude/')
  } else {
    console.log('  .claude/ already exists')
  }

  // Create .claude/skills directory
  if (!existsSync(claudeSkillsDir)) {
    mkdirSync(claudeSkillsDir)
    console.log('  Created .claude/skills/')
  } else {
    console.log('  .claude/skills/ already exists')
  }

  // Symlink each skill from skills/ to .claude/skills/
  if (existsSync(sourceSkillsDir)) {
    const skills = readdirSync(sourceSkillsDir).filter(name => {
      const skillPath = join(sourceSkillsDir, name)
      return lstatSync(skillPath).isDirectory()
    })

    for (const skill of skills) {
      const source = join(sourceSkillsDir, skill)
      const target = join(claudeSkillsDir, skill)

      // Calculate relative path from .claude/skills/ to skills/
      const relativePath = relative(claudeSkillsDir, source)

      if (existsSync(target)) {
        const stats = lstatSync(target)
        if (stats.isSymbolicLink()) {
          console.log(`  ${skill}/ already symlinked`)
        } else {
          console.log(`  ${skill}/ exists (not a symlink, skipped)`)
        }
      } else {
        symlinkSync(relativePath, target)
        console.log(`  Symlinked ${skill}/ -> ${relativePath}`)
      }
    }
  } else {
    console.log('  No skills/ directory found')
  }

  console.log('\nDone! Skills symlinked to .claude/skills/')
}

init()
