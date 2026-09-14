import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The one rule the workspace layout exists to enforce: **an app may not import
 * another app.** Shared code moves to packages/domain, which is the only route by
 * which code travels between apps.
 *
 * This is a test rather than a lint rule because there is no linter here, and a
 * test rather than a build failure because a bundler would not object — Vite
 * resolves a relative path out of apps/storefront into apps/pos perfectly happily
 * and says nothing. The rule has to be asserted somewhere or it is a convention,
 * and a convention is what this restructure was meant to stop relying on.
 *
 * Written in the same shape as action-log.test.ts's append-only walk: read the
 * directories by name, and fail on what should not be there.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const appsDir = path.join(repoRoot, "apps");

/** Every import/export specifier in a source file, in source order. */
function specifiersOf(source: string): string[] {
  const found: string[] = [];
  // Covers `import x from "y"`, bare `import "y"`, `export … from "y"` and
  // dynamic `import("y")`. Template-literal specifiers are not matched, and
  // nothing in this repo uses one.
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) found.push(m[1]);
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { out.push(...sourceFiles(full)); continue; }
    if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("an app may not import another app", () => {
  const apps = readdirSync(appsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  assert.ok(apps.length >= 2, "the rule is only meaningful with more than one app");

  const offenders: string[] = [];

  for (const app of apps) {
    const appRoot = path.join(appsDir, app);
    for (const file of sourceFiles(appRoot)) {
      for (const spec of specifiersOf(readFileSync(file, "utf8"))) {
        const where = `${path.relative(repoRoot, file)} → ${spec}`;

        // A specifier naming another app by path, however it is spelled.
        const named = apps.find(other => other !== app && spec.includes(`apps/${other}/`));
        if (named) { offenders.push(`${where} (names apps/${named})`); continue; }

        // A relative path that climbs out of its own app. Landing in packages/ is
        // the supported way across; landing anywhere else is not.
        if (!spec.startsWith(".")) continue;
        const resolved = path.resolve(path.dirname(file), spec);
        if (resolved.startsWith(appRoot + path.sep)) continue;
        if (resolved.startsWith(path.join(repoRoot, "packages") + path.sep)) continue;
        offenders.push(`${where} (resolves to ${path.relative(repoRoot, resolved)})`);
      }
    }
  }

  assert.deepEqual(offenders, [], "an app reached outside itself into something other than packages/");
});

test("every app is a workspace with its own manifest", () => {
  for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = path.join(appsDir, entry.name, "package.json");
    assert.ok(existsSync(manifest), `apps/${entry.name} has no package.json, so it is not a workspace`);
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    assert.match(pkg.name, /^@store-one\//, `apps/${entry.name} is not scoped to @store-one`);
  }
});
