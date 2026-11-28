import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const sourceRoot = fileURLToPath(new URL("../../src/", import.meta.url));
const excludedFiles = new Set([
  "lib/extraction/constants.js",
  "lib/extraction/candidates.js",
  "lib/import/chatExportParser.js",
]);
const bannedCopy = /\b(?:waiting on|overdue|missed)\b/iu;
const stringLiteral = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/gu;
const jsxText = />([^<>]+)</gu;

function listSourceFiles(directory, relativeDirectory = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath, relativePath);
    return /\.(?:js|jsx)$/u.test(entry.name) ? [relativePath] : [];
  });
}

function visibleText(source) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");
  const literals = [...withoutComments.matchAll(stringLiteral)]
    .map((match) => match[0].slice(1, -1));
  const textNodes = [...withoutComments.matchAll(jsxText)]
    .map((match) => match[1]);
  return [...literals, ...textNodes].join("\n");
}

test("user-visible source labels and explanations avoid banned wording", () => {
  const violations = listSourceFiles(sourceRoot)
    .filter((relativePath) => !excludedFiles.has(relativePath.replace(/\\/gu, "/")))
    .flatMap((relativePath) => {
      const source = readFileSync(path.join(sourceRoot, relativePath), "utf8");
      const copy = visibleText(source);
      return bannedCopy.test(copy)
        ? [`${relativePath}: ${copy.match(bannedCopy)?.[0]}`]
        : [];
    });

  assert.deepEqual(violations, []);
});
