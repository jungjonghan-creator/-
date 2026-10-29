/** 서버 DB 스키마. 원장/정산/점수는 append-only 이며 UNIQUE 키로 중복 지급·중복 적립을 DB 수준에서 막는다. */
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL, salt TEXT NOT NULL, iterations INTEGER NOT NULL,
    nationality TEXT NOT NULL DEFAULT '대한민국', public_profile INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL, last_saved_at INTEGER, deleted_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS wallets (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id), version INTEGER NOT NULL, initial INTEGER NOT NULL, balance INTEGER NOT NULL CHECK (balance >= 0),
    peak INTEGER NOT NULL, created INTEGER NOT NULL, last_op TEXT)`,
  `CREATE TABLE IF NOT EXISTS wallet_txs (
    account_id TEXT NOT NULL, tx_id TEXT NOT NULL, seq INTEGER NOT NULL, ts INTEGER NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL,
    ref TEXT NOT NULL, note TEXT NOT NULL, balance_after INTEGER NOT NULL, PRIMARY KEY (account_id, tx_id))`,
  `CREATE TABLE IF NOT EXISTS wallet_accounts (account_id TEXT NOT NULL, sid TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (account_id, sid))`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, event_id TEXT NOT NULL, season INTEGER NOT NULL, value INTEGER NOT NULL, source_entry TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL, created_at INTEGER NOT NULL, used_entry TEXT)`,
  `CREATE TABLE IF NOT EXISTS tournament_entries (
    sid TEXT PRIMARY KEY, account_id TEXT NOT NULL, source TEXT NOT NULL, def_id TEXT NOT NULL, season INTEGER, instance_id TEXT NOT NULL UNIQUE,
    seed INTEGER NOT NULL, cost INTEGER NOT NULL, entries INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL, created_at INTEGER NOT NULL, world_day INTEGER,
    settled_at INTEGER, place INTEGER, field INTEGER, prize INTEGER, ticket_id TEXT, digest TEXT)`,
  `CREATE TABLE IF NOT EXISTS ranked_submissions (
    instance_id TEXT NOT NULL, participant_id TEXT NOT NULL, rules_version TEXT NOT NULL, ranked_result_id TEXT NOT NULL UNIQUE,
    season INTEGER NOT NULL, event_id TEXT NOT NULL, world_day INTEGER NOT NULL, place INTEGER NOT NULL, entries INTEGER NOT NULL, field INTEGER NOT NULL, paid INTEGER NOT NULL,
    prize INTEGER NOT NULL, cost INTEGER NOT NULL, points REAL NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (instance_id, participant_id, rules_version))`,
  `CREATE TABLE IF NOT EXISTS points_ledger (ranked_result_id TEXT PRIMARY KEY, participant_id TEXT NOT NULL, season INTEGER NOT NULL, event_id TEXT NOT NULL, points REAL NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS global_roster (
    entity_key TEXT PRIMARY KEY, kind TEXT NOT NULL, stable_id TEXT NOT NULL, display_name TEXT NOT NULL, nationality TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS friend_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS friend_group_members (group_id TEXT NOT NULL, account_id TEXT NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY (group_id, account_id))`,
  `CREATE TABLE IF NOT EXISTS save_chunks (account_id TEXT NOT NULL, slot TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, slot, idx))`,
  `CREATE TABLE IF NOT EXISTS saves (account_id TEXT NOT NULL, slot TEXT NOT NULL, version INTEGER NOT NULL, chunks INTEGER NOT NULL, bytes INTEGER NOT NULL, updated_at INTEGER NOT NULL, op TEXT, PRIMARY KEY (account_id, slot))`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, account_id TEXT, action TEXT NOT NULL, detail TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_points_participant ON points_ledger(participant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_account ON tournament_entries(account_id, status)`,
];
