/**
 * DropBot Database — pure JSON storage, no native compilation needed
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'dropbot.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Load or init
function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { guilds: {}, giveaways: {}, entries: {}, winners: {} };
  }
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── Guilds ────────────────────────────────────────────────────────────
function upsertGuild(guildId, name) {
  const d = load();
  if (!d.guilds[guildId]) d.guilds[guildId] = { guild_id: guildId, name, require_verifyguard: 0, dm_winners: 1 };
  else d.guilds[guildId].name = name;
  save(d);
}
function getGuild(guildId) { return load().guilds[guildId] || null; }
function updateGuildSetting(guildId, key, value) {
  const d = load();
  if (!d.guilds[guildId]) d.guilds[guildId] = { guild_id: guildId };
  d.guilds[guildId][key] = value;
  save(d);
}

// ── Giveaways ─────────────────────────────────────────────────────────
function createGiveaway(g) {
  const d = load();
  d.giveaways[g.id] = {
    ...g,
    status: 'active',
    message_id: null,
    requirements: [],
    bonusEntries: [],
    created_at: Date.now()
  };
  save(d);
}
function getGiveaway(id) { return load().giveaways[id] || null; }
function getGiveawayByMessage(messageId) {
  const d = load();
  return Object.values(d.giveaways).find(g => g.message_id === messageId) || null;
}
function setMessageId(id, messageId) {
  const d = load();
  if (d.giveaways[id]) { d.giveaways[id].message_id = messageId; save(d); }
}
function setGiveawayStatus(id, status) {
  const d = load();
  if (d.giveaways[id]) { d.giveaways[id].status = status; save(d); }
}
function getExpiredGiveaways() {
  const d = load();
  const now = Math.floor(Date.now() / 1000);
  return Object.values(d.giveaways).filter(g => g.status === 'active' && g.end_time <= now);
}
function getActiveGiveaways(guildId) {
  return Object.values(load().giveaways).filter(g => g.guild_id === guildId && g.status === 'active');
}
function getAllActiveGiveaways() {
  return Object.values(load().giveaways).filter(g => g.status === 'active');
}
function endGiveaway(id) { setGiveawayStatus(id, 'ended'); }
function cancelGiveaway(id) { setGiveawayStatus(id, 'cancelled'); }
function getEndedGiveaways(guildId) {
  return Object.values(load().giveaways).filter(g => g.guild_id === guildId && g.status === 'ended');
}

// ── Requirements ─────────────────────────────────────────────────────
function addRequirement(id, type, value) {
  const d = load();
  if (d.giveaways[id]) {
    d.giveaways[id].requirements = d.giveaways[id].requirements || [];
    d.giveaways[id].requirements.push({ type, value });
    save(d);
  }
}
function getRequirements(id) { return load().giveaways[id]?.requirements || []; }

// ── Bonus Entries ────────────────────────────────────────────────────
function addBonusEntry(id, type, roleId, multiplier) {
  const d = load();
  if (d.giveaways[id]) {
    d.giveaways[id].bonusEntries = d.giveaways[id].bonusEntries || [];
    d.giveaways[id].bonusEntries.push({ type, role_id: roleId, multiplier });
    save(d);
  }
}
function getBonusEntries(id) { return load().giveaways[id]?.bonusEntries || []; }

// ── Entries ──────────────────────────────────────────────────────────
function addEntry(giveawayId, userId, entryCount = 1) {
  const d = load();
  if (!d.entries[giveawayId]) d.entries[giveawayId] = {};
  d.entries[giveawayId][userId] = entryCount;
  save(d);
}
function hasEntered(giveawayId, userId) {
  return !!(load().entries[giveawayId]?.[userId]);
}
function getEntries(giveawayId) {
  const e = load().entries[giveawayId] || {};
  // Return flat array with user_id repeated by entry_count (for weighted selection)
  const pool = [];
  for (const [userId, count] of Object.entries(e)) {
    for (let i = 0; i < count; i++) pool.push(userId);
  }
  return pool;
}
function getEntryCount(giveawayId) {
  const e = load().entries[giveawayId] || {};
  return Object.keys(e).length; // unique entrants
}
function getTotalEntries(giveawayId) {
  const e = load().entries[giveawayId] || {};
  return Object.values(e).reduce((s, c) => s + c, 0);
}

// ── Winners ──────────────────────────────────────────────────────────
function addWinner(giveawayId, userId) {
  const d = load();
  if (!d.winners[giveawayId]) d.winners[giveawayId] = [];
  if (!d.winners[giveawayId].includes(userId)) d.winners[giveawayId].push(userId);
  save(d);
}
function getWinners(giveawayId) { return load().winners[giveawayId] || []; }

module.exports = {
  upsertGuild, getGuild, updateGuildSetting,
  createGiveaway, getGiveaway, getGiveawayByMessage,
  setMessageId, setGiveawayStatus, getExpiredGiveaways,
  getActiveGiveaways, getAllActiveGiveaways,
  endGiveaway, cancelGiveaway, getEndedGiveaways,
  addRequirement, getRequirements,
  addBonusEntry, getBonusEntries,
  addEntry, hasEntered, getEntries, getEntryCount, getTotalEntries,
  addWinner, getWinners,
};
