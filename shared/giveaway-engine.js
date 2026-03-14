/**
 * DropBot Giveaway Engine
 * Visually stunning, gamified embeds + winner selection
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ── Color themes per giveaway state ──────────────────────────────────
const COLORS = {
  active:    0x5865F2,  // Discord blurple
  hot:       0xFF6B35,  // Orange — lots of entries
  ending:    0xFF0000,  // Red — last few minutes
  ended:     0x2D2D2D,  // Grey — over
  winner:    0xFFD700,  // Gold — winner reveal
};

// ── Hype thresholds ───────────────────────────────────────────────────
function getHypeLevel(entryCount) {
  if (entryCount >= 100) return { emoji: '🔥🔥🔥', label: 'INSANE', color: 0xFF0000 };
  if (entryCount >= 50)  return { emoji: '🔥🔥',   label: 'ON FIRE', color: 0xFF4500 };
  if (entryCount >= 25)  return { emoji: '🔥',     label: 'HEATING UP', color: 0xFF6B35 };
  if (entryCount >= 10)  return { emoji: '⚡',     label: 'GAINING HEAT', color: 0xFFAA00 };
  return                         { emoji: '🎉',     label: 'LIVE', color: 0x5865F2 };
}

function formatTimeLeft(endTimeSec) {
  const diff = endTimeSec - Math.floor(Date.now() / 1000);
  if (diff <= 0) return '⏰ Ending now!';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function progressBar(entries, max = 100) {
  const filled = Math.min(10, Math.round((entries / max) * 10));
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ── Main giveaway embed ───────────────────────────────────────────────
function buildGiveawayEmbed(giveaway, entryCount = 0, requirements = [], bonusRules = []) {
  const hype = getHypeLevel(entryCount);
  const timeLeft = formatTimeLeft(giveaway.end_time);
  const isEnding = (giveaway.end_time - Math.floor(Date.now() / 1000)) < 300; // last 5 min

  const embed = new EmbedBuilder()
    .setColor(isEnding ? COLORS.ending : hype.color)
    .setTitle(`${hype.emoji} ${giveaway.prize}`)
    .setDescription(
      (giveaway.description ? `> ${giveaway.description}\n\n` : '') +
      `**Press the button below to enter!**\n` +
      (giveaway.sponsor_name ? `\n🏢 Sponsored by **${giveaway.sponsor_name}**` : '')
    );

  // Core fields
  embed.addFields(
    { name: '⏰ Time Left', value: `\`${timeLeft}\`\n<t:${giveaway.end_time}:R>`, inline: true },
    { name: '🏆 Winners', value: `**${giveaway.winner_count}**`, inline: true },
    { name: '🎟️ Entries', value: `**${entryCount}**`, inline: true },
  );

  // Entry progress bar
  embed.addFields({
    name: `📊 Hype Meter — ${hype.label}`,
    value: `\`${progressBar(entryCount)}\` ${entryCount} entries`
  });

  // Requirements
  if (requirements.length > 0) {
    const lines = requirements.map(r => {
      if (r.type === 'role') return `• <@&${r.value}> role required`;
      if (r.type === 'boost') return `• 💎 Must be a server booster`;
      if (r.type === 'min_days') return `• 📅 ${r.value}+ days in server`;
      return `• ${r.type}: ${r.value}`;
    });
    embed.addFields({ name: '📋 Requirements', value: lines.join('\n') });
  }

  // Bonus entries
  if (bonusRules.length > 0) {
    const lines = bonusRules.map(r => {
      if (r.type === 'role') return `• <@&${r.role_id}> → **${r.multiplier}× entries** ✨`;
      if (r.type === 'boost') return `• 💎 Boosters → **${r.multiplier}× entries** ✨`;
      return `• ${r.type} → **${r.multiplier}×**`;
    });
    embed.addFields({ name: '✨ Bonus Entries', value: lines.join('\n') });
  }

  embed
    .setFooter({ text: `🎰 DropBot • Provably Fair  |  ID: ${giveaway.id?.slice(0,8) || '?'}` })
    .setTimestamp(new Date(giveaway.end_time * 1000));

  return embed;
}

// ── Entry button ──────────────────────────────────────────────────────
function buildEntryButton(entryCount = 0) {
  const hype = getHypeLevel(entryCount);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dropbot_enter_${Date.now()}`) // placeholder, overridden in gstart
      .setLabel(`${hype.emoji} Enter Giveaway — ${entryCount} entered`)
      .setStyle(ButtonStyle.Primary)
  );
}

function buildEntryButtonForGiveaway(giveawayId, entryCount = 0) {
  const hype = getHypeLevel(entryCount);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dropbot_enter_${giveawayId}`)
      .setLabel(`${hype.emoji} Enter — ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`)
      .setStyle(ButtonStyle.Primary)
  );
}

// ── Winner reveal embed ───────────────────────────────────────────────
function buildEndedEmbed(giveaway, winnerIds = [], totalEntries = 0) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.winner)
    .setTitle(`🏆 GIVEAWAY ENDED — ${giveaway.prize}`)
    .setDescription(
      winnerIds.length > 0
        ? `🎊 **${winnerIds.length === 1 ? 'Winner' : 'Winners'} selected from ${totalEntries} entries!**\n\n` +
          winnerIds.map(id => `🥇 <@${id}>`).join('\n')
        : `😔 No valid entries — nobody won.`
    )
    .addFields(
      { name: '🎟️ Total Entries', value: String(totalEntries), inline: true },
      { name: '🏆 Winners', value: String(winnerIds.length), inline: true },
      { name: '🎁 Prize', value: giveaway.prize, inline: true },
    )
    .setFooter({ text: '🎰 DropBot • Provably Fair — Use /greroll to reroll' })
    .setTimestamp();

  return embed;
}

// ── Dramatic winner announcement messages ─────────────────────────────
async function dramaticWinnerReveal(channel, giveaway, winnerIds, totalEntries) {
  if (winnerIds.length === 0) {
    return channel.send({ content: `😔 No valid entries for **${giveaway.prize}**. Giveaway cancelled.` });
  }

  // Build up suspense
  const suspenseMsg = await channel.send({
    content: `🎰 **${giveaway.prize}** giveaway is over! Drawing winner${winnerIds.length > 1 ? 's' : ''}...`
  });

  await sleep(1500);

  await suspenseMsg.edit({
    content: `🎲 **Shuffling ${totalEntries} entries...**\n${'🎟️ '.repeat(Math.min(totalEntries, 10))}`
  });

  await sleep(2000);

  await suspenseMsg.edit({ content: `⚡ **Selecting winner${winnerIds.length > 1 ? 's' : ''}...**` });

  await sleep(1500);

  // Final reveal
  const winnerMentions = winnerIds.map(id => `<@${id}>`).join(', ');
  await suspenseMsg.edit({
    content: `🎊🎉 **CONGRATULATIONS** ${winnerMentions}! 🎉🎊\nYou won **${giveaway.prize}**!\n\n> *Contact the host to claim your prize.*`
  });

  return suspenseMsg;
}

// ── Entry confirmation messages ───────────────────────────────────────
function getEntryMessage(entryCount, totalEntries, multiplier = 1) {
  const msgs = multiplier > 1 ? [
    `💎 BOOSTED! You're in with **${multiplier}x entries**! You've got ${entryCount} total shots at this. 🔥`,
    `⚡ VIP entry! **${multiplier}× entries** recorded. Total entries: **${totalEntries}**`,
    `✨ Bonus applied! **${multiplier}x** your chances. ${totalEntries} entries and counting...`,
  ] : [
    `🎟️ You're in! **${totalEntries}** ${totalEntries === 1 ? 'entry' : 'entries'} total. Good luck! 🤞`,
    `✅ Entered! You're competing with **${totalEntries - 1}** others. May the odds be ever in your favor 🎲`,
    `🎉 Entry locked in! **${totalEntries}** people are going for this. 🔥`,
    `⚡ You're in the draw! **${totalEntries}** total entries so far.`,
  ];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

// ── Milestone announcements ───────────────────────────────────────────
function getMilestoneMessage(count) {
  const milestones = {
    10:  `🔥 **10 entries!** Things are heating up...`,
    25:  `⚡ **25 entries!** The competition is getting real!`,
    50:  `🚀 **50 ENTRIES!** This giveaway is ON FIRE! 🔥🔥`,
    100: `💥 **100 ENTRIES!!** ABSOLUTE MADNESS! 🔥🔥🔥`,
    250: `🤯 **250 ENTRIES!!!** This is INSANE! Who's going to win?!`,
    500: `🏟️ **500 ENTRIES!!!!!** LEGENDARY GIVEAWAY! 🏆`,
  };
  return milestones[count] || null;
}

// ── Winner selection ──────────────────────────────────────────────────
function selectWinners(giveaway, entries) {
  // entries = flat array of user ID strings (weighted - user appears multiple times for bonus entries)
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const uniqueEntrants = [...new Set(entries)];
  const winnerCount = Math.min(giveaway.winner_count || 1, uniqueEntrants.length);
  const winners = new Set();
  let attempts = 0;

  while (winners.size < winnerCount && attempts < entries.length * 3) {
    const idx = Math.floor(Math.random() * entries.length);
    winners.add(entries[idx]);
    attempts++;
  }

  return [...winners];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = {
  buildGiveawayEmbed,
  buildEndedEmbed,
  buildEntryButton,
  buildEntryButtonForGiveaway,
  dramaticWinnerReveal,
  getEntryMessage,
  getMilestoneMessage,
  selectWinners,
  getHypeLevel,
  formatTimeLeft,
  COLORS,
};
