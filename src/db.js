const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

let dbInstance = null;

function ensureDataDir() {
  const dataDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      email TEXT PRIMARY KEY,
      plan TEXT NOT NULL,
      status TEXT NOT NULL,
      current_period_end INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_status_end
      ON subscriptions (status, current_period_end);
  `);
}

function getDbFilePath() {
  const dataDir = ensureDataDir();
  return path.join(dataDir, "subscriptions.sqlite");
}

function initDb() {
  const dbPath = getDbFilePath();
  const db = new Database(dbPath);
  createSchema(db);
  return db;
}

function getDb() {
  if (!dbInstance) dbInstance = initDb();
  return dbInstance;
}

async function getSubscription(db, email) {
  const row = db
    .prepare(
      `SELECT email, plan, status, current_period_end, updated_at
       FROM subscriptions WHERE email = ?`
    )
    .get(email);
  return row || null;
}

async function upsertSubscription(db, { email, plan, status, currentPeriodEnd }) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO subscriptions (email, plan, status, current_period_end, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       plan = excluded.plan,
       status = excluded.status,
       current_period_end = excluded.current_period_end,
       updated_at = excluded.updated_at`
  ).run(email, plan, status, currentPeriodEnd, now);
}

async function upsertMockSubscriptionFromEmail(db, email) {
  // 30-day "active" mock subscription.
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  await upsertSubscription(db, {
    email,
    plan: "premium_mock",
    status: "active",
    currentPeriodEnd: Math.floor(Date.now() / 1000) + thirtyDays / 1000,
  });
}

module.exports = {
  getDb,
  getSubscription,
  upsertMockSubscriptionFromEmail,
};

