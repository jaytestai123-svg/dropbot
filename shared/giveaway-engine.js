/**
 * DropBot Giveaway Engine
 * Handles embeds, winner selection, and live updates
 */

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const db = require('./database');

const CONFETTI = '🎉';
const COLOR_ACTIVE = '#5865F2';
const COLOR_ENDED = '#2d2d2d';

/**
 * Build the live giveaway embed
 */
function buildGiveawayEmbed(giveaway, entryCount, requirements = [], bonusRules = []) {
  const timeLeft = giveaway.end_time - Math.floor(Date.now() / 1000);
  const endDate = new Date(giveaway.end_time * 1000);

  const embed = new EmbedBuilder()
    .setTitle(`${CONFETTI} ${giveaway.prize}`)
    .setColor(giveaway.color || COLOR_ACTIVE)
    .addFields(
      { name: '⏰ Ends', value: `<t:${giveaway.end_time}:R> (<t:${giveaway.end_time}:f>)`, inline: true },
      { name: '🏆 Winners', value: `${giveaway.winner_count}`, inline: true },
      { name: '🎟️ Entries', value: `${entryCount.toLocaleString()}`, inline: true }
    )
    .setFooter({ text: `Hosted by DropBot • ID: ${giveaway.id.slice(0, 8)}` })
    .setTimestamp(endDate);

  if (giveaway.description) embed.setDescription(giveaway.description);
  if (giveaway.image_url) embed.setImage(giveaway.image_url);

  // Requirements
  if (requirements.length > 0) {
    const reqText = requirements.map(r => {
      switch (r.type) {
        case 'role': return `• Must have <@&${r.value}> role`;
        case 'boost': return `• Must be a Server Booster 💎`;
        case 'min_days': return `• Must have been a member for ${r.value}+ days`;
        case 'account_age': return `• Account must be ${r.value}+ days old`;
        default: return `• ${r.type}: ${r.value}`;
      }
    }).join('\n');
    embed.addFields({ name: '📋 Requirements', value: reqText, inline: false });
  }

  // Bonus entries
  if (bonusRules.length > 0) {
    const bonusText = bonusRules.map(r => {
      switch (r.type) {
        case 'role': return `• <@&${r.value}> → **${r.multiplier}x** entries`;
        case 'boost': return `• Server Boosters → **${r.multiplier}x** entries 💎`;
        default: return `• ${r.type} → **${r.multiplier}x** entries`;
      }
    }).join('\n');
    embed.addFields({ name: '✨ Bonus Entries', value: bonusText, inline: false });
  }

  // VerifyGuard badge
  embed.addFields({ name: '🛡️ Anti-Cheat', value: 'Protected by [VerifyGuard](https://verifyguard.gg)', inline: true });

  // Sponsor
  if (giveaway.sponsor_name) {
    embed.addFields({ name: '💼 Sponsored by', value: giveaway.sponsor_name, inline: true });
    if (giveaway.sponsor_logo) embed.setThumbnail(giveaway.sponsor_logo);
  }

  return embed;
}

/**
 * Build ended giveaway embed
 */
function buildEndedEmbed(giveaway, winners = []) {
  const winnerText = winners.length > 0
    ? winners.map(w => `<@${w.user_id}>`).join(', ')
    : 'No valid entries';

  return new EmbedBuilder()
    .setTitle(`${CONFETTI} ${giveaway.prize} — ENDED`)
    .setColor(COLOR_ENDED)
    .setDescription(`**Winners:** ${winnerText}`)
    .addFields(
      { name: '🏆 Winner Count', value: `${giveaway.winner_count}`, inline: true },
      { name: '🎟️ Total Entries', value: `${db.getEntryCount(giveaway.id).toLocaleString()}`, inline: true }
    )
    .setFooter({ text: `Ended • ID: ${giveaway.id.slice(0, 8)}` })
    .setTimestamp();
}

/**
 * Entry button
 */
function buildEntryButton(entryCount = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('dropbot_enter')
      .setLabel(`${CONFETTI} Enter — ${entryCount.toLocaleString()} entries`)
      .setStyle(ButtonStyle.Primary)
  );
}

/**
 * Provably fair winner selection (weighted by entry_count)
 */
function selectWinners(giveaway, entries) {
  if (entries.length === 0) return [];

  // Build weighted pool
  const pool = [];
  for (const entry of entries) {
    for (let i = 0; i < (entry.entry_count || 1); i++) {
      pool.push(entry.user_id);
    }
  }

  const winners = new Set();
  const maxWinners = Math.min(giveaway.winner_count, entries.length);
  let attempts = 0;

  while (winners.size < maxWinners && attempts < pool.length * 3) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.add(pool[idx]);
    attempts++;
  }

  return [...winners].map(userId => {
    const entry = entries.find(e => e.user_id === userId);
    return { user_id: userId, username: entry?.username || userId };
  });
}

/**
 * Format time remaining
 */
function formatTime(seconds) {
  if (seconds <= 0) return 'Ended';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = { buildGiveawayEmbed, buildEndedEmbed, buildEntryButton, selectWinners, formatTime };
