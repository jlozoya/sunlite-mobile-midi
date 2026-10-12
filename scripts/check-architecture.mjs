import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceRoot = path.join(root, "src")
const maxLines = 600
const problems = []

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.(?:ts|tsx|cts)$/.test(entry.name)
        ? [file]
        : []
  })
}

function layer(file) {
  return path.relative(sourceRoot, file).split(path.sep)[0]
}

const files = sourceFiles(sourceRoot)
for (const file of files) {
  const relative = path.relative(root, file)
  const content = fs.readFileSync(file, "utf8")
  const lines = content.trimEnd().split(/\r?\n/).length
  if (lines > maxLines)
    problems.push(
      `${relative}: ${lines} lines (limit: ${maxLines}); split by responsibility`,
    )
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true)
  const from = layer(file)
  function checkImport(specifier) {
    if (!ts.isStringLiteral(specifier)) return
    const name = specifier.text
    if (!name.startsWith(".")) {
      if (
        ["renderer", "shared"].includes(from) &&
        (name === "electron" ||
          name.startsWith("node:") ||
          ["easymidi", "@julusian/midi", "express", "ws"].includes(name))
      ) {
        problems.push(`${relative}: ${from} cannot import desktop/server module ${name}`)
      }
      return
    }
    const target = path.resolve(path.dirname(file), name)
    const to = layer(target)
    const allowed = {
      main: ["main", "shared", "router"],
      renderer: ["renderer", "shared"],
      shared: ["shared"],
      router: ["router", "shared"],
      types: ["types", "shared"],
    }
    if (!allowed[from]?.includes(to))
      problems.push(`${relative}: forbidden dependency ${from} -> ${to} (${name})`)
  }
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    )
      checkImport(node.moduleSpecifier)
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      checkImport(node.argument.literal)
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0]
    )
      checkImport(node.arguments[0])
    ts.forEachChild(node, visit)
  }
  visit(source)
}

if (problems.length) {
  console.error(problems.join("\n"))
  process.exitCode = 1
} else {
  console.log(
    `Architecture checked: ${files.length} source files; layer boundaries and ${maxLines}-line limit passed.`,
  )
}
