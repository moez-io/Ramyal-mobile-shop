import "dotenv/config";
import Database from "better-sqlite3";
import { Pool } from "pg";
import { put } from "@vercel/blob";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = path.resolve(
  serverDirectory,
  process.env.SQLITE_PATH || "./data/royal_mobile.sqlite",
);
if (!process.env.DATABASE_URL)
  throw Error("Set DATABASE_URL to the Neon PostgreSQL connection string");
if (!fs.existsSync(sqlitePath))
  throw Error(`SQLite database was not found at ${sqlitePath}`);

const sqlite = new Database(sqlitePath, { readonly: true });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});
function referencedPhotoPaths(value, result = new Set()) {
  if (typeof value === "string") {
    const match = value.match(/^\/uploads\/([^/?]+)$/);
    if (match) result.add(match[0]);
  } else if (Array.isArray(value)) {
    value.forEach((item) => referencedPhotoPaths(item, result));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => referencedPhotoPaths(item, result));
  }
  return result;
}

function rewritePhotos(value, replacements) {
  if (typeof value === "string") return replacements.get(value) || value;
  if (Array.isArray(value))
    return value.map((item) => rewritePhotos(item, replacements));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        rewritePhotos(item, replacements),
      ]),
    );
  return value;
}

const records = sqlite
  .prepare("SELECT model, id, data, created_at, updated_at FROM records")
  .all();
const originalUniqueValues = sqlite
  .prepare("SELECT model, field, value, record_id FROM unique_values")
  .all();
sqlite.close();

const connection = await pool.connect();
const replacements = new Map();
try {
  await connection.query(`CREATE TABLE IF NOT EXISTS records (
    model TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(model, id)
  )`);
  await connection.query(`CREATE TABLE IF NOT EXISTS unique_values (
    model TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL, record_id TEXT NOT NULL,
    UNIQUE(model, field, value)
  )`);
  const existing = await connection.query(
    "SELECT COUNT(*)::int AS count FROM records",
  );
  if (existing.rows[0].count > 0)
    throw Error(
      "The Neon database is not empty. Migration stopped to avoid overwriting live data.",
    );

  const paths = new Set();
  for (const row of records) referencedPhotoPaths(JSON.parse(row.data), paths);
  if (paths.size && !process.env.BLOB_READ_WRITE_TOKEN)
    throw Error(
      "Local product photos were found. Set BLOB_READ_WRITE_TOKEN to migrate photos too.",
    );
  for (const photoPath of paths) {
    const filename = path.basename(photoPath);
    const source = path.join(serverDirectory, "uploads", filename);
    if (!fs.existsSync(source))
      throw Error(`Referenced local photo is missing: ${source}`);
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : null;
    if (!contentType) throw Error(`Unsupported photo type in ${filename}`);
    const blob = await put(
      `migration/${crypto.randomUUID()}${ext}`,
      fs.readFileSync(source),
      {
        access: "public",
        contentType,
      },
    );
    replacements.set(photoPath, blob.url);
  }

  await connection.query("BEGIN");
  try {
    for (const row of records) {
      const value = rewritePhotos(JSON.parse(row.data), replacements);
      await connection.query(
        "INSERT INTO records (model, id, data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
        [
          row.model,
          row.id,
          JSON.stringify(value),
          row.created_at,
          row.updated_at,
        ],
      );
    }
    for (const row of originalUniqueValues)
      await connection.query(
        "INSERT INTO unique_values (model, field, value, record_id) VALUES ($1, $2, $3, $4)",
        [row.model, row.field, row.value, row.record_id],
      );
    await connection.query(
      "CREATE INDEX IF NOT EXISTS records_model_created ON records(model, created_at)",
    );
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  }
  console.log(
    `Migrated ${records.length} records and ${replacements.size} photos. The original SQLite database was not changed.`,
  );
} finally {
  connection.release();
  await pool.end();
}
