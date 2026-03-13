/**
 * VerifyGuard Integration
 * Checks if a user is verified, their risk score, and account age
 * Uses VerifyGuard's local DB or API
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let vgDb = null;

function getVGDb() {
  if (vgDb) return vgDb;
  const dbPath = process.env.VERIFYGUARD_DB || path.join(__dirname, '../../verifyguard/data/verifyguard.db');
  if (fs.existsSync(dbPath)) {
    vgDb = new Database(dbPath, { readonly: true });
    console.log('✅ VerifyGuard DB connected');
  } else {
    console.log('⚠️  VerifyGuard DB not found — VG checks disabled');
  }
  return vgDb;
}

/**
 * Check if a user is verified by VerifyGuard in a specific guild
 */
function isUserVerified(userId, guildId) {
  try {
    const db = getVGDb();
    if (!db) return { verified: false, reason: 'vg_not_installed' };
    const row = db.prepare('SELECT * FROM verified_users WHERE discord_id = ? AND guild_id = ?').get(userId, guildId);
    if (!row) return { verified: false, reason: 'not_verified' };
    return {
      verified: true,
      riskScore: row.risk_score || 0,
      verifiedAt: row.verified_at,
      country: row.country,
      phone: !!row.phone,
      email: !!row.email
    };
  } catch (e) {
    console.error('VG check error:', e.message);
    return { verified: false, reason: 'error' };
  }
}

/**
 * Check if VerifyGuard is installed in a guild
 */
function isVGInstalled(guildId) {
  try {
    const db = getVGDb();
    if (!db) return false;
    const row = db.prepare('SELECT guild_id FROM guilds WHERE guild_id = ?').get(guildId);
    return !!row;
  } catch (e) {
    return false;
  }
}

/**
 * Get account age in days from Discord user ID (snowflake)
 */
function getAccountAgeDays(userId) {
  try {
    const createdAt = new Date(Number(BigInt(userId) >> 22n) + 1420070400000);
    return Math.floor((Date.now() - createdAt) / 86400000);
  } catch (e) {
    return 0;
  }
}

/**
 * Full entry eligibility check
 * Returns { eligible: bool, reason: string, riskScore: number }
 */
async function checkEntryEligibility(member, guildId, requirements, guildConfig) {
  const userId = member.id;
  const accountAge = getAccountAgeDays(userId);

  // ── VerifyGuard check (primary gate if enabled) ──────────────────
  if (guildConfig?.require_verifyguard) {
    const vgInstalled = isVGInstalled(guildId);
    if (vgInstalled) {
      const vgCheck = isUserVerified(userId, guildId);
      if (!vgCheck.verified) {
        return {
          eligible: false,
          reason: '🛡️ You must be verified by VerifyGuard to enter. Use `/verify` to get verified first.',
          riskScore: 100
        };
      }
      // Block high-risk users
      if (vgCheck.riskScore > 75) {
        return {
          eligible: false,
          reason: '⚠️ Your account has been flagged as high-risk and cannot enter giveaways.',
          riskScore: vgCheck.riskScore
        };
      }
    }
  }

  // ── Account age check ────────────────────────────────────────────
  if (accountAge < 7) {
    return {
      eligible: false,
      reason: `⏳ Your Discord account is too new (${accountAge} days old). Accounts must be at least 7 days old to enter.`,
      riskScore: 80
    };
  }

  // ── Per-giveaway requirements ────────────────────────────────────
  for (const req of requirements) {
    switch (req.type) {
      case 'role': {
        if (!member.roles.cache.has(req.value)) {
          const role = member.guild.roles.cache.get(req.value);
          return { eligible: false, reason: `🔒 You need the **${role?.name || 'required'}** role to enter.` };
        }
        break;
      }
      case 'no_role': {
        if (member.roles.cache.has(req.value)) {
          const role = member.guild.roles.cache.get(req.value);
          return { eligible: false, reason: `🚫 Members with the **${role?.name || 'excluded'}** role cannot enter.` };
        }
        break;
      }
      case 'boost': {
        if (!member.premiumSince) {
          return { eligible: false, reason: '💎 You must be boosting this server to enter.' };
        }
        break;
      }
      case 'min_days': {
        const joinedDays = member.joinedAt ? Math.floor((Date.now() - member.joinedAt) / 86400000) : 0;
        if (joinedDays < parseInt(req.value)) {
          return { eligible: false, reason: `📅 You must have been a member for at least **${req.value} days** to enter.` };
        }
        break;
      }
      case 'account_age': {
        if (accountAge < parseInt(req.value)) {
          return { eligible: false, reason: `🗓️ Your account must be at least **${req.value} days old** to enter.` };
        }
        break;
      }
    }
  }

  return { eligible: true, riskScore: 0 };
}

/**
 * Calculate bonus entries for a user
 */
function calcBonusEntries(member, bonusRules) {
  let entries = 1;
  for (const rule of bonusRules) {
    switch (rule.type) {
      case 'role':
        if (member.roles.cache.has(rule.value)) entries += (rule.multiplier - 1);
        break;
      case 'boost':
        if (member.premiumSince) entries += (rule.multiplier - 1);
        break;
    }
  }
  return Math.max(1, entries);
}

module.exports = { isUserVerified, isVGInstalled, getAccountAgeDays, checkEntryEligibility, calcBonusEntries };
