require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const db   = require('../shared/database');
const {
  buildGiveawayEmbed, buildEndedEmbed, buildEntryButtonForGiveaway,
  getEntryMessage, getMilestoneMessage, selectWinners, getHypeLevel, COLORS
} = require('../shared/giveaway-engine');
const { slotMachineReveal } = require('../shared/animations');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.data) client.commands.set(cmd.data.name, cmd);
}

client.once('ready', () => {
  console.log(`✅ DropBot online as ${client.user.tag}`);
  client.user.setActivity('🎉 /gstart to begin', { type: 3 });
  startAutoEnder();
});

client.on('guildCreate', guild => {
  db.upsertGuild(guild.id, guild.name);
  console.log(`➕ Joined: ${guild.name}`);
});

// ── Interaction handler ───────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction, client);
    } catch (err) {
      console.error(`[${interaction.commandName}]`, err.message);
      const payload = { content: `❌ Error: ${err.message}`, ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('dropbot_enter_')) {
    const giveawayId = interaction.customId.replace('dropbot_enter_', '');
    await handleEntry(interaction, giveawayId);
  }
});

// ── Entry handler ─────────────────────────────────────────────────────
async function handleEntry(interaction, giveawayId) {
  await interaction.deferReply({ ephemeral: true });

  const giveaway = db.getGiveaway(giveawayId);
  if (!giveaway || giveaway.status !== 'active') {
    return interaction.editReply({ content: '❌ This giveaway has already ended.' });
  }

  const userId = interaction.user.id;

  if (db.hasEntered(giveawayId, userId)) {
    const total = db.getEntryCount(giveawayId);
    return interaction.editReply({ content: `✅ You're already entered! **${total}** total entries so far. Good luck! 🤞` });
  }

  // Check requirements
  const reqs = db.getRequirements(giveawayId);
  for (const req of reqs) {
    if (req.type === 'role') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!member?.roles.cache.has(req.value))
        return interaction.editReply({ content: `❌ You need the <@&${req.value}> role to enter this giveaway.` });
    }
    if (req.type === 'boost') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!member?.premiumSince)
        return interaction.editReply({ content: '❌ You must be **boosting this server** to enter. 💎' });
    }
    if (req.type === 'min_days') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!member) return interaction.editReply({ content: '❌ Could not verify your membership.' });
      const days = Math.floor((Date.now() - member.joinedTimestamp) / 86400000);
      if (days < parseInt(req.value))
        return interaction.editReply({ content: `❌ You need **${req.value}+ days** in this server to enter. You've been here **${days} days**.` });
    }
  }

  // Bonus entries
  let entryCount = 1;
  const bonusRules = db.getBonusEntries(giveawayId);
  for (const rule of bonusRules) {
    if (rule.type === 'role') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member?.roles.cache.has(rule.role_id)) entryCount = Math.max(entryCount, rule.multiplier);
    }
    if (rule.type === 'boost') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member?.premiumSince) entryCount = Math.max(entryCount, rule.multiplier);
    }
  }

  db.addEntry(giveawayId, userId, entryCount);

  const totalEntries = db.getEntryCount(giveawayId);

  // Update embed with new count + hype level
  await updateGiveawayEmbed(giveaway, totalEntries, interaction.guild);

  // Check milestones
  const milestone = getMilestoneMessage(totalEntries);
  if (milestone) {
    interaction.channel.send({ content: milestone }).catch(() => {});
  }

  await interaction.editReply({
    content: getEntryMessage(entryCount, totalEntries, entryCount)
  });
}

// ── Update embed ──────────────────────────────────────────────────────
async function updateGiveawayEmbed(giveaway, entryCount, guild) {
  try {
    const channel = await guild.channels.fetch(giveaway.channel_id);
    const msg = await channel.messages.fetch(giveaway.message_id);
    const reqs = db.getRequirements(giveaway.id);
    const bonus = db.getBonusEntries(giveaway.id);
    const newEmbed = buildGiveawayEmbed(giveaway, entryCount, reqs, bonus);
    const newRow = buildEntryButtonForGiveaway(giveaway.id, entryCount);
    await msg.edit({ embeds: [newEmbed], components: [newRow] });
  } catch (e) {
    // Non-critical
  }
}

// ── Auto-ender ────────────────────────────────────────────────────────
function startAutoEnder() {
  setInterval(async () => {
    let expired = [];
    try { expired = db.getExpiredGiveaways() || []; } catch (e) { return; }
    for (const giveaway of expired) {
      try { await endGiveaway(giveaway); }
      catch (e) { console.error('Auto-end error:', e.message); }
    }
  }, 10000);
}

async function endGiveaway(giveaway) {
  db.setGiveawayStatus(giveaway.id, 'ended');

  const guild = await client.guilds.fetch(giveaway.guild_id).catch(() => null);
  if (!guild) return;

  const channel = await guild.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel) return;

  // Get entries and pick winners
  const entries = db.getEntries(giveaway.id) || [];
  const rawWinners = selectWinners(giveaway, entries);

  // Safety: ensure we only store valid string user IDs, never objects
  const winners = rawWinners
    .map(w => (typeof w === 'object' ? w?.user_id : w))
    .filter(id => typeof id === 'string' && id.length > 5);

  for (const userId of winners) db.addWinner(giveaway.id, userId);

  // Update the embed to ended state
  try {
    const msg = await channel.messages.fetch(giveaway.message_id);
    const endedEmbed = buildEndedEmbed(giveaway, winners, entries.length);
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('dropbot_ended')
        .setLabel(`🏆 Giveaway Ended — ${entries.length} entries`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await msg.edit({ embeds: [endedEmbed], components: [disabledRow] });
  } catch (e) {}

  // 🎰 Slot machine winner reveal
  const uniqueEntrants = [...new Set(entries)];
  await slotMachineReveal(channel, giveaway, winners, uniqueEntrants, client);

  // DM winners
  const config = db.getGuild(giveaway.guild_id);
  if (config?.dm_winners !== 0 && winners.length > 0) {
    for (const winnerId of winners) {
      const user = await client.users.fetch(winnerId).catch(() => null);
      if (user) {
        user.send(`🎉 **You won!**\nPrize: **${giveaway.prize}** in **${guild.name}**!\nContact the server host to claim your prize.`).catch(() => {});
      }
    }
  }
}

module.exports = { client, endGiveaway };

client.login(process.env.DISCORD_TOKEN);
