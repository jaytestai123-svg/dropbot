/**
 * DropBot Database
 * SQLite with full giveaway, entry, and server config schema
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_URL || './data/dropbot.db';
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS guilds (
    guild_id TEXT PRIMARY KEY,
    guild_name TEXT,
    manager_role_id TEXT,
    log_channel_id TEXT,
    dm_winners INTEGER DEFAULT 1,
    require_verifyguard INTEGER DEFAULT 1,
    verifyguard_role_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS giveaways (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    host_id TEXT NOT NULL,
    prize TEXT NOT NULL,
    description TEXT,
    winner_count INTEGER DEFAULT 1,
    start_time INTEGER DEFAULT (strftime('%s','now')),
    end_time INTEGER NOT NULL,
    ended INTEGER DEFAULT 0,
    cancelled INTEGER DEFAULT 0,
    winners TEXT DEFAULT '[]',
    image_url TEXT,
    thumbnail_url TEXT,
    color TEXT DEFAULT '#5865F2',
    type TEXT DEFAULT 'standard',
    recurring_cron TEXT,
    collab_guild_id TEXT,
    collab_channel_id TEXT,
    sponsor_name TEXT,
    sponsor_logo TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id TEXT NOT NULL,
    type TEXT NOT NULL,
    value TEXT,
    FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bonus_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id TEXT NOT NULL,
    type TEXT NOT NULL,
    value TEXT,
    multiplier INTEGER DEFAULT 2,
    FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT,
    entry_count INTEGER DEFAULT 1,
    verified_by_vg INTEGER DEFAULT 0,
    vg_risk_score INTEGER,
    entered_at INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(giveaway_id, user_id),
    FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT,
    claimed INTEGER DEFAULT 0,
    claimed_at INTEGER,
    won_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invite_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    invite_code TEXT,
    invites INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(guild_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_giveaways_guild ON giveaways(guild_id);
  CREATE INDEX IF NOT EXISTS idx_giveaways_active ON giveaways(ended, cancelled, end_time);
  CREATE INDEX IF NOT EXISTS idx_entries_giveaway ON entries(giveaway_id);
  CREATE INDEX IF NOT EXISTS idx_entries_user ON entries(user_id);
`);

// ── Guild ────────────────────────────────────────────────────────────
const getGuild = (guildId) => db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId);
const upsertGuild = (guildId, name) => db.prepare(`
  INSERT INTO guilds (guild_id, guild_name) VALUES (?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET guild_name = excluded.guild_name
`).run(guildId, name);
const updateGuildSetting = (guildId, key, value) => db.prepare(`UPDATE guilds SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);

// ── Giveaways ────────────────────────────────────────────────────────
const createGiveaway = (data) => db.prepare(`
  INSERT INTO giveaways (id, guild_id, channel_id, host_id, prize, description, winner_count, end_time, color, type, image_url, sponsor_name, sponsor_logo)
  VALUES (@id, @guild_id, @channel_id, @host_id, @prize, @description, @winner_count, @end_time, @color, @type, @image_url, @sponsor_name, @sponsor_logo)
`).run(data);

const getGiveaway = (id) => db.prepare('SELECT * FROM giveaways WHERE id = ?').get(id);
const getGiveawayByMessage = (messageId) => db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
const getActiveGiveaways = (guildId) => db.prepare('SELECT * FROM giveaways WHERE guild_id = ? AND ended = 0 AND cancelled = 0 ORDER BY end_time ASC').all(guildId);
const getAllActiveGiveaways = () => db.prepare('SELECT * FROM giveaways WHERE ended = 0 AND cancelled = 0').all();
const setMessageId = (id, messageId) => db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(messageId, id);
const endGiveaway = (id, winners) => db.prepare('UPDATE giveaways SET ended = 1, winners = ? WHERE id = ?').run(JSON.stringify(winners), id);
const cancelGiveaway = (id) => db.prepare('UPDATE giveaways SET cancelled = 1 WHERE id = ?').run(id);
const getEndedGiveaways = (guildId, limit = 10) => db.prepare('SELECT * FROM giveaways WHERE guild_id = ? AND ended = 1 ORDER BY end_time DESC LIMIT ?').all(guildId, limit);

// ── Requirements ─────────────────────────────────────────────────────
const addRequirement = (giveawayId, type, value) => db.prepare('INSERT INTO requirements (giveaway_id, type, value) VALUES (?, ?, ?)').run(giveawayId, type, value);
const getRequirements = (giveawayId) => db.prepare('SELECT * FROM requirements WHERE giveaway_id = ?').all(giveawayId);

// ── Bonus Entries ─────────────────────────────────────────────────────
const addBonusEntry = (giveawayId, type, value, multiplier) => db.prepare('INSERT INTO bonus_entries (giveaway_id, type, value, multiplier) VALUES (?, ?, ?, ?)').run(giveawayId, type, value, multiplier);
const getBonusEntries = (giveawayId) => db.prepare('SELECT * FROM bonus_entries WHERE giveaway_id = ?').all(giveawayId);

// ── Entries ──────────────────────────────────────────────────────────
const addEntry = (data) => db.prepare(`
  INSERT INTO entries (giveaway_id, user_id, username, entry_count, verified_by_vg, vg_risk_score)
  VALUES (@giveaway_id, @user_id, @username, @entry_count, @verified_by_vg, @vg_risk_score)
  ON CONFLICT(giveaway_id, user_id) DO NOTHING
`).run(data);
const hasEntered = (giveawayId, userId) => !!db.prepare('SELECT 1 FROM entries WHERE giveaway_id = ? AND user_id = ?').get(giveawayId, userId);
const getEntry = (giveawayId, userId) => db.prepare('SELECT * FROM entries WHERE giveaway_id = ? AND user_id = ?').get(giveawayId, userId);
const getEntries = (giveawayId) => db.prepare('SELECT * FROM entries WHERE giveaway_id = ?').all(giveawayId);
const getEntryCount = (giveawayId) => db.prepare('SELECT SUM(entry_count) as total FROM entries WHERE giveaway_id = ?').get(giveawayId)?.total || 0;

// ── Status helpers ────────────────────────────────────────────────────
const setGiveawayStatus = (id, status) => db.prepare("UPDATE giveaways SET status = ? WHERE id = ?").run(status, id);
const getExpiredGiveaways = () => db.prepare("SELECT * FROM giveaways WHERE status = 'active' AND end_time <= ?").all(Math.floor(Date.now() / 1000));

// ── Winners ──────────────────────────────────────────────────────────
const addWinner = (giveawayId, userId) => {
  try { db.prepare('INSERT OR IGNORE INTO winners (giveaway_id, user_id) VALUES (?, ?)').run(giveawayId, userId); } catch(e) {}
};
const getWinners = (giveawayId) => db.prepare('SELECT * FROM winners WHERE giveaway_id = ?').all(giveawayId);

module.exports = {
  getGuild, upsertGuild, updateGuildSetting,
  createGiveaway, getGiveaway, getGiveawayByMessage, getActiveGiveaways,
  getAllActiveGiveaways, setMessageId, endGiveaway, cancelGiveaway, getEndedGiveaways,
  setGiveawayStatus, getExpiredGiveaways,
  addRequirement, getRequirements,
  addBonusEntry, getBonusEntries,
  addEntry, getEntry, getEntries, getEntryCount, hasEntered,
  addWinner, getWinners,
  db
};
