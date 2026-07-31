import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"] as const;

function resolveSourceImport(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith("node:")) return specifier;

  const unresolved = specifier.startsWith("@/")
    ? resolve(repositoryRoot, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (!unresolved) return null;

  const candidates = extname(unresolved)
    ? [unresolved]
    : [
        ...sourceExtensions.map((extension) => `${unresolved}${extension}`),
        ...sourceExtensions.map((extension) => resolve(unresolved, `index${extension}`)),
      ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function runtimeImports(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports: string[] = [];

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      if (
        clause?.namedBindings
        && ts.isNamedImports(clause.namedBindings)
        && !clause.name
        && clause.namedBindings.elements.length > 0
        && clause.namedBindings.elements.every((element) => element.isTypeOnly)
      ) {
        continue;
      }
      imports.push(statement.moduleSpecifier.text);
    }

    if (
      ts.isExportDeclaration(statement)
      && statement.moduleSpecifier
      && ts.isStringLiteral(statement.moduleSpecifier)
      && !statement.isTypeOnly
    ) {
      imports.push(statement.moduleSpecifier.text);
    }
  }

  return imports;
}

function serverBuiltinsReachableFrom(entry: string): string[] {
  const queue = [resolve(repositoryRoot, entry)];
  const visited = new Set<string>();
  const serverBuiltins = new Set<string>();

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    for (const specifier of runtimeImports(file)) {
      const target = resolveSourceImport(file, specifier);
      if (!target) continue;
      if (target.startsWith("node:")) serverBuiltins.add(`${specifier} via ${file}`);
      else queue.push(target);
    }
  }

  return [...serverBuiltins].sort();
}

test("the demo login and workspace client graph contains no Node-only builtins", () => {
  assert.deepEqual(
    serverBuiltinsReachableFrom("app/login/page.tsx"),
    [],
    "a browser-hydrated entry imports a Node-only module",
  );
});
