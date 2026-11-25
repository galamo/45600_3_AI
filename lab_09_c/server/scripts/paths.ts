import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const LAB_ROOT = path.resolve(here, "..", "..");
export const SCHEMA_SQL = path.join(LAB_ROOT, "schema.sql");
export const DATA_SQL = path.join(LAB_ROOT, "data.sql");
export const CONTENT_DIR = path.resolve(here, "..", "content");
