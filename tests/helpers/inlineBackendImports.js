import fs from "node:fs";
import path from "node:path";

// Backend tests import handlers from a data URL after replacing their SDK
// import with the existing isolated test stub. Inline relative dependencies as
// URLs too: a data URL has no base directory. Never stub actual domain logic.
export async function inlineBackendImports(source, entryPath, ancestors = new Set()) {
  const { transform } = await import("esbuild");
  const imports = [...source.matchAll(/\bfrom\s*(["'])(\.\.?\/[^"']+)\1/g)];
  let result = source;
  for (const match of imports) {
    const dependencyPath = path.resolve(path.dirname(entryPath), match[2]);
    if (ancestors.has(dependencyPath)) throw new Error(`Circular backend test import: ${dependencyPath}`);
    const dependency = await inlineBackendImports(fs.readFileSync(dependencyPath, "utf8"), dependencyPath, new Set([...ancestors, entryPath]));
    const compiled = await transform(dependency, { format: "esm", loader: "ts", target: "es2022" });
    const url = `data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`;
    result = result.replace(match[0], `from ${JSON.stringify(url)}`);
  }
  return result;
}
