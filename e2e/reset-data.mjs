import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const dataDir = path.resolve(process.cwd(), "server/data-e2e");

await rm(dataDir, { force: true, recursive: true });
