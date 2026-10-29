import { Pool } from "pg";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let database;
let pool;
let connected = false;
let sqliteTransactionQueue = Promise.resolve();
const transactionContext = new AsyncLocalStorage();
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const definitions = {};
const uniqueFields = {
  User: ["email"],
  Setting: ["key"],
  Sale: ["invoice"],
  Payment: ["key"],
  Refund: ["key"],
  Phone: ["imeis"],
};
const defaults = {
  User: { active: true },
  Phone: { status: "available" },
  Sale: { status: "active" },
  Payment: { kind: "installment", reversed: false },
};

function clean(value) {
  if (!value) return value;
  const out = { ...value };
  delete out.toObject;
  delete out.save;
  return out;
}

function attach(modelName, record) {
  if (!record) return record;
  const doc = { ...record };
  Object.defineProperties(doc, {
    id: { enumerable: true, value: String(record._id) },
    toObject: { enumerable: false, value: () => clean(doc) },
    save: {
      enumerable: false,
      value: () => definitions[modelName].replace(doc),
    },
  });
  return doc;
}

function pathValue(object, pathName) {
  return pathName.split(".").reduce((value, key) => value?.[key], object);
}

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual =
      key === "_id" || key === "id" ? String(doc._id) : pathValue(doc, key);
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$ne" in expected) return String(actual) !== String(expected.$ne);
      if ("$in" in expected)
        return expected.$in.some((value) => String(actual) === String(value));
      return JSON.stringify(actual) === JSON.stringify(expected);
    }
    if (Array.isArray(actual))
      return actual.some((value) => String(value) === String(expected));
    return String(actual) === String(expected);
  });
}

function currentConnection() {
  return transactionContext.getStore()?.connection || database;
}

async function query(sql, params = []) {
  if (pool)
    return (
      transactionContext.getStore()?.connection || pool
    ).query(sql, params);
  const connection = currentConnection();
  if (!connection) throw Error("Database is not connected");
  const statement = connection.prepare(
    sql.replace(/\$\d+/g, "?").replace(/ FOR UPDATE$/, ""),
  );
  if (/^\s*SELECT/i.test(sql)) return { rows: statement.all(...params) };
  const result = statement.run(...params);
  return { rows: [], rowCount: result.changes };
}

function uniqueValues(modelName, doc) {
  if (modelName === "Phone")
    return (doc.imeis || []).filter(Boolean).map((value) => ["imei", value]);
  return (uniqueFields[modelName] || [])
    .map((field) => doc[field] && [field, String(doc[field])])
    .filter(Boolean);
}

async function persist(modelName, doc, isNew = false) {
  const now = new Date().toISOString();
  const value = {
    ...clean(doc),
    _id: String(doc._id || crypto.randomUUID()),
    createdAt: doc.createdAt || now,
    updatedAt: now,
  };
  const write = async () => {
    if (!isNew) {
      const existing = await query(
        "SELECT 1 FROM records WHERE model = $1 AND id = $2",
        [modelName, value._id],
      );
      if (!existing.rows.length) return null;
      await query(
        "DELETE FROM unique_values WHERE model = $1 AND record_id = $2",
        [modelName, value._id],
      );
      await query(
        "UPDATE records SET data = $1, updated_at = $2 WHERE model = $3 AND id = $4",
        [JSON.stringify(value), now, modelName, value._id],
      );
    } else {
      await query(
        "INSERT INTO records (model, id, data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
        [modelName, value._id, JSON.stringify(value), now, now],
      );
    }
    for (const [field, uniqueValue] of uniqueValues(modelName, value))
      await query(
        "INSERT INTO unique_values (model, field, value, record_id) VALUES ($1, $2, $3, $4)",
        [modelName, field, uniqueValue, value._id],
      );
    return attach(modelName, value);
  };

  try {
    return transactionContext.getStore()
      ? await write()
      : await transaction(write);
  } catch (err) {
    if (
      String(err.code || "").startsWith("SQLITE_CONSTRAINT") ||
      err.code === "23505"
    ) {
      err.code = 11000;
      err.message = "Duplicate unique value";
    }
    throw err;
  }
}

class Query {
  constructor(modelName, filter, single = false) {
    this.modelName = modelName;
    this.filter = filter;
    this.single = single;
    this.sortSpec = null;
    this.max = null;
    this.exclusions = [];
  }
  sort(spec) {
    this.sortSpec = spec;
    return this;
  }
  limit(value) {
    this.max = value;
    return this;
  }
  select(spec) {
    this.exclusions = String(spec)
      .split(/\s+/)
      .filter((value) => value.startsWith("-"))
      .map((value) => value.slice(1));
    return this;
  }
  lean() {
    return this;
  }
  exec() {
    return this.execute();
  }
  async execute() {
    const result = await query(
      `SELECT data FROM records WHERE model = $1${pool && transactionContext.getStore() ? " FOR UPDATE" : ""}`,
      [this.modelName],
    );
    const rows = result.rows
      .map((row) =>
        typeof row.data === "string" ? JSON.parse(row.data) : row.data,
      )
      .filter((row) => matches(row, this.filter));
    if (this.sortSpec) {
      const [[key, direction]] = Object.entries(this.sortSpec);
      rows.sort(
        (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * direction,
      );
    }
    const selected = this.single
      ? rows[0] || null
      : rows.slice(0, this.max ?? rows.length);
    const project = (doc) => {
      if (!doc) return doc;
      for (const key of this.exclusions) delete doc[key];
      return attach(this.modelName, doc);
    };
    return Array.isArray(selected) ? selected.map(project) : project(selected);
  }
  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
  catch(reject) {
    return this.execute().catch(reject);
  }
}

function makeModel(name) {
  const api = {
    find: (filter = {}) => new Query(name, filter),
    findOne: (filter = {}) => new Query(name, filter, true),
    findById: (id) => new Query(name, { _id: String(id) }, true),
    async findOneAndUpdate(filter, update, options = {}) {
      const updateRecord = async () => {
        const current = await new Query(name, filter, true).execute();
        if (!current && !options.upsert) return null;
        const patch = update?.$set ? update.$set : update;
        const initial = current
          ? {}
          : Object.fromEntries(
              Object.entries(filter).filter(
                ([, value]) =>
                  !value || typeof value !== "object" || Array.isArray(value),
              ),
            );
        return persist(
          name,
          { ...initial, ...(current || {}), ...patch },
          !current,
        );
      };
      return transactionContext.getStore()
        ? updateRecord()
        : transaction(updateRecord);
    },
    findByIdAndUpdate(id, update, options) {
      return api.findOneAndUpdate({ _id: String(id) }, update, options);
    },
    async updateOne(filter, update) {
      const current = await new Query(name, filter, true).execute();
      if (!current) return { matchedCount: 0, modifiedCount: 0 };
      await persist(name, { ...current, ...(update?.$set || update) });
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async create(input) {
      const many = Array.isArray(input);
      const values = many ? input : [input];
      const insert = async () => {
        const result = [];
        for (const doc of values)
          result.push(await persist(name, { ...defaults[name], ...doc }, true));
        return many ? result : result[0];
      };
      return transactionContext.getStore() ? insert() : transaction(insert);
    },
    init() {
      return Promise.resolve();
    },
    replace(doc) {
      return persist(name, doc, false);
    },
  };
  definitions[name] = api;
  return api;
}

export const User = makeModel("User");
export const Phone = makeModel("Phone");
export const Customer = makeModel("Customer");
export const Sale = makeModel("Sale");
export const Payment = makeModel("Payment");
export const Setting = makeModel("Setting");
export const Audit = makeModel("Audit");
export const Inquiry = makeModel("Inquiry");
export const Refund = makeModel("Refund");

export async function connect() {
  if (connected) return;
  if (process.env.VERCEL && !process.env.DATABASE_URL)
    throw Error("Set DATABASE_URL to a persistent PostgreSQL database on Vercel");
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 5),
      ssl: process.env.PGSSL === "disable" ? false : undefined,
    });
    await pool.query("SELECT 1");
    await pool.query(`CREATE TABLE IF NOT EXISTS records (
      model TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY(model, id)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS unique_values (
      model TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL, record_id TEXT NOT NULL,
      UNIQUE(model, field, value)
    )`);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS records_model_created ON records(model, created_at)",
    );
  } else {
    const { default: Database } = await import("better-sqlite3");
    const filename = path.resolve(
      serverDirectory,
      process.env.SQLITE_PATH || "./data/royal_mobile.sqlite",
    );
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    database = new Database(filename);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    database.exec(`CREATE TABLE IF NOT EXISTS records (
      model TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(model, id)
    );
    CREATE TABLE IF NOT EXISTS unique_values (
      model TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL, record_id TEXT NOT NULL,
      UNIQUE(model, field, value)
    );
    CREATE INDEX IF NOT EXISTS records_model_created ON records(model, created_at);`);
  }
  connected = true;
}

export async function transaction(callback) {
  if (transactionContext.getStore()) return callback();
  if (pool) {
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await transactionContext.run({ connection }, callback);
      await connection.query("COMMIT");
      return result;
    } catch (err) {
      await connection.query("ROLLBACK");
      throw err;
    } finally {
      connection.release();
    }
  }
  let release;
  const previous = sqliteTransactionQueue;
  sqliteTransactionQueue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    database.exec("BEGIN IMMEDIATE");
    const result = await transactionContext.run(
      { connection: database },
      callback,
    );
    database.exec("COMMIT");
    return result;
  } catch (err) {
    if (database?.inTransaction) database.exec("ROLLBACK");
    throw err;
  } finally {
    release();
  }
}

export async function clearAuditAndInquiryRecords() {
  return transaction(async () => {
    const counts = await query(
      "SELECT model, COUNT(*) AS count FROM records WHERE model IN ($1, $2) GROUP BY model",
      ["Audit", "Inquiry"],
    );
    await query("DELETE FROM unique_values WHERE model IN ($1, $2)", [
      "Audit",
      "Inquiry",
    ]);
    await query("DELETE FROM records WHERE model IN ($1, $2)", [
      "Audit",
      "Inquiry",
    ]);
    const result = { auditCount: 0, inquiryCount: 0 };
    for (const row of counts.rows)
      result[row.model === "Audit" ? "auditCount" : "inquiryCount"] = Number(
        row.count,
      );
    return result;
  });
}

export async function resetBusinessData(keepAdminId) {
  return transaction(async () => {
    const result = await query("SELECT model, id, data FROM records");
    const removed = {};
    const uploadedPhotos = new Set();
    for (const row of result.rows) {
      const value =
        typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      if (
        (row.model === "User" && row.id === String(keepAdminId)) ||
        (row.model === "Setting" && value.key === "shop")
      )
        continue;
      if (row.model === "Phone" && Array.isArray(value.photos))
        for (const photo of value.photos)
          if (
            typeof photo === "string" &&
            (photo.startsWith("/uploads/") ||
              (photo.startsWith("https://") &&
                (photo.includes(".public.blob.vercel-storage.com/") ||
                  (process.env.BLOB_HOSTNAME &&
                    new URL(photo).hostname === process.env.BLOB_HOSTNAME))))
          )
            uploadedPhotos.add(photo);
      await query(
        "DELETE FROM unique_values WHERE model = $1 AND record_id = $2",
        [row.model, row.id],
      );
      await query("DELETE FROM records WHERE model = $1 AND id = $2", [
        row.model,
        row.id,
      ]);
      removed[row.model] = (removed[row.model] || 0) + 1;
    }
    return { removed, uploadedPhotos: [...uploadedPhotos] };
  });
}

export function isConnected() {
  return connected;
}

export async function close() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
  if (database) {
    database.close();
    database = undefined;
  }
  connected = false;
}
