/**
 * Security dependency floor guard (`bun run check:security-deps`).
 *
 * Verifies that every resolution recorded in bun.lock for the dependency
 * findings of epic #40 (Snitch audit remediation) sits at or above the
 * floor fixed by its originating issue:
 *
 * - defu   >= 6.1.5   (#37, GHSA-737v-mqg7-c878: prototype pollution via
 *   `__proto__` in defu <= 6.1.4; transitively owned by better-auth, which
 *   resolved outside the vulnerable range from 1.7.22 on, see #33)
 * - kysely >= 0.28.17 (#38, GHSA-pv5w-4p9q-p3v2 (JSON path traversal),
 *   GHSA-wmrf-hv6w-mr66 (SQLi via JSON path keys) and GHSA-8cpq-38p9-67gx
 *   (MySQL SQLi via `sql.lit`) in kysely >= 0.26.0 < 0.28.17; transitively
 *   owned by better-auth, which resolved outside the vulnerable range from
 *   1.7.22 on, see #33)
 * - zod    >= 4.6.6   (#35, GHSA-mrhx-c7xc-m3w5: memory exhaustion
 *   validating oversized constrained collections)
 *
 * `bun audit` only fails on advisories it can currently resolve; this guard
 * freezes the floors themselves, so a regression back into a vulnerable
 * range (e.g. defu <= 6.1.4 returning via a better-auth downgrade, or a
 * nested duplicate of any of the three appearing under another package)
 * fails the CI `audit` job loudly even if the advisory data is unavailable,
 * withdrawn or re-anchored upstream.
 *
 * Fails closed: a watched package with no resolution in the lockfile is an
 * error too, so a lockfile format change can never silently neuter the
 * guard — the guard must be updated deliberately when the tree changes.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface SecurityFloor {
  package: string
  floor: string
  issue: number
  advisory?: string
  why: string
}

const SECURITY_FLOORS: SecurityFloor[] = [
  {
    package: 'defu',
    floor: '6.1.5',
    issue: 37,
    advisory: 'GHSA-737v-mqg7-c878',
    why: 'Prototype pollution via __proto__ (defu <= 6.1.4)',
  },
  {
    package: 'kysely',
    floor: '0.28.17',
    issue: 38,
    advisory: 'GHSA-pv5w-4p9q-p3v2/GHSA-wmrf-hv6w-mr66/GHSA-8cpq-38p9-67gx',
    why: 'SQL injection via JSON path keys and MySQL sql.lit (kysely >= 0.26.0 < 0.28.17)',
  },
  {
    package: 'zod',
    floor: '4.6.6',
    issue: 35,
    advisory: 'GHSA-mrhx-c7xc-m3w5',
    why: 'Memory exhaustion validating oversized constrained collections (zod < 4.6.6)',
  },
]

/** Numeric semver comparison of the x.y.z core; prerelease tags are ignored. */
function compareSemver(a: string, b: string): number {
  const core = (version: string): number[] =>
    version.split(/[-+]/)[0].split('.').map(part => Number.parseInt(part, 10))

  const [aMajor, aMinor, aPatch] = core(a)
  const [bMajor, bMinor, bPatch] = core(b)

  if (aMajor !== bMajor) return aMajor - bMajor
  if (aMinor !== bMinor) return aMinor - bMinor
  return aPatch - bPatch
}

/**
 * Collects every version of `pkg` resolved anywhere in the lockfile text
 * (root entries like `"pkg": ["pkg@1.2.3", ...]` and nested duplicates like
 * `"node_modules/a/node_modules/pkg": ["pkg@1.2.3", ...]`). A vulnerable
 * version must not appear anywhere in the tree, so the whole lockfile text
 * is scanned instead of only the root entries.
 */
function resolvedVersions(lockfile: string, pkg: string): string[] {
  const pattern = new RegExp(`"${pkg}@(\\d+\\.\\d+\\.\\d+(?:[-+][^"]*)?)"`, 'g')
  return [...new Set([...lockfile.matchAll(pattern)].map(match => match[1]))]
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const lockPath = argv[0] ?? fileURLToPath(new URL('../bun.lock', import.meta.url))

  let lock: string
  try {
    lock = readFileSync(lockPath, 'utf8')
  } catch (error) {
    console.error(`✗ check-security-deps: cannot read lockfile at ${lockPath}`)
    console.error(`  ${(error as Error).message}`)
    return 1
  }

  const violations: string[] = []

  for (const { package: pkg, floor, issue, advisory, why } of SECURITY_FLOORS) {
    const versions = resolvedVersions(lock, pkg)

    if (versions.length === 0) {
      violations.push(
        `  ✗ ${pkg}: no resolution found in the lockfile — expected a version >= ${floor} (${why}).\n` +
          `    If the package genuinely left the tree, or the bun.lock format changed,\n` +
          `    update this guard deliberately; never silence it silently.`,
      )
      continue
    }

    const ref = advisory ? `${advisory} (#${issue})` : `#${issue}`

    for (const version of versions) {
      if (compareSemver(version, floor) < 0) {
        violations.push(
          `  ✗ ${pkg}@${version} < ${floor} — vulnerable range (${why}, ${ref}).\n` +
            `    Raise the resolving dependency until bun.lock no longer contains\n` +
            `    any ${pkg} below ${floor}.`,
        )
      }
    }

    const status = versions.every(version => compareSemver(version, floor) >= 0)
    console.log(
      `${status ? '✓' : '✗'} ${pkg}: resolved ${versions.join(', ')} — floor >= ${floor} (${ref})`,
    )
  }

  if (violations.length > 0) {
    console.error(`\n✗ check-security-deps: ${violations.length} violation(s) in ${lockPath}:`)
    for (const violation of violations) console.error(violation)
    return 1
  }

  console.log(
    `\n✓ check-security-deps: all ${SECURITY_FLOORS.length} security floors satisfied across every lockfile resolution.`,
  )
  return 0
}

if (import.meta.main) {
  process.exit(main())
}
