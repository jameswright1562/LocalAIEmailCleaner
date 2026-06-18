import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourcePath = path.join(root, "server/src/types.ts");
const targetPath = path.join(root, "client/src/types.ts");

const source = await readFile(sourcePath, "utf8");
const generated = `// This file is auto-generated from server/src/types.ts.
// Run npm run generate:types after changing shared API types.

${source}`;

await writeFile(targetPath, generated, "utf8");
