#!/usr/bin/env node

/**
 * Bumps version across package.json and .claude-plugin/plugin.json
 * Usage: node scripts/bump-version.js [major|minor|patch|<version>]
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const files = [
  join(root, 'package.json'),
  join(root, '.claude-plugin', 'plugin.json'),
]

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) throw new Error(`Invalid version: ${version}`)
  return { major: parseInt(match[1]), minor: parseInt(match[2]), patch: parseInt(match[3]) }
}

function bumpVersion(current, type) {
  const v = parseVersion(current)
  switch (type) {
    case 'major':
      return `${v.major + 1}.0.0`
    case 'minor':
      return `${v.major}.${v.minor + 1}.0`
    case 'patch':
      return `${v.major}.${v.minor}.${v.patch + 1}`
    default:
      // Assume it's a specific version
      parseVersion(type) // Validate format
      return type
  }
}

const type = process.argv[2] || 'patch'
const packageJson = JSON.parse(readFileSync(files[0], 'utf-8'))
const currentVersion = packageJson.version
const newVersion = bumpVersion(currentVersion, type)

console.log(`Bumping version: ${currentVersion} → ${newVersion}`)

for (const file of files) {
  const content = JSON.parse(readFileSync(file, 'utf-8'))
  content.version = newVersion
  writeFileSync(file, JSON.stringify(content, null, 2) + '\n')
  console.log(`  Updated: ${file}`)
}

console.log(`\nNext steps:`)
console.log(`  git add -A && git commit -m "v${newVersion}"`)
console.log(`  git tag v${newVersion}`)
console.log(`  git push && git push --tags`)
