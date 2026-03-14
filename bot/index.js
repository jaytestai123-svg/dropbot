require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('../shared/database');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

client.commands = new Collection();

// Load commands
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
  // Slash commands
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction, client);
    } catch (err) {
      console.error(`[${interaction.commandName}] Error:`, err.message);
      const payload = { content: `❌ Error: ${err.message}`, ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
    return;
  }

  // Button: Enter giveaway
  if (interaction.isButton() && interaction.customId.startsWith('dropbot_enter_')) {
    const giveawayId = interaction.customId.replace('dropbot_enter_', '');
    await handleEntry(interaction, giveawayId);
  }
});

// ── Giveaway entry handler ────────────────────────────────────────────
async function handleEntry(interaction, giveawayId) {
  await interaction.deferReply({ ephemeral: true });

  const giveaway = db.getGiveaway(giveawayId);
  if (!giveaway || giveaway.status !== 'active') {
    return interaction.editReply({ content: '❌ This giveaway has ended.' });
  }

  const userId = interaction.user.id;

  // Check already entered
  if (db.hasEntered(giveawayId, userId)) {
    const count = db.getEntryCount(giveawayId);
    return interaction.editReply({ content: `✅ You're already entered! **${count}** total entries.` });
  }

  // Check requirements
  const reqs = db.getRequirements(giveawayId);
  for (const req of reqs) {
    if (req.type === 'role') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!member || !member.roles.cache.has(req.value)) {
        return interaction.editReply({ content: `❌ You need the <@&${req.value}> role to enter.` });
      }
    }
    if (req.type === 'boost') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!member?.premiumSince) {
        return interaction.editReply({ content: '❌ You must be boosting this server to enter.' });
      }
    }
    if (req.type === 'min_days') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!member) return interaction.editReply({ content: '❌ Could not verify membership.' });
      const daysMember = Math.floor((Date.now() - member.joinedTimestamp) / 86400000);
      if (daysMember < parseInt(req.value)) {
        return interaction.editReply({ content: `❌ You need to be in this server for at least **${req.value} days** to enter. (You've been here ${daysMember} days)` });
      }
    }
  }

  // Calculate bonus entries
  let entryCount = 1;
  const bonusRules = db.getBonusEntries(giveawayId);
  for (const rule of bonusRules) {
    if (rule.type === 'role') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member?.roles.cache.has(rule.role_id)) entryCount = rule.multiplier;
    }
    if (rule.type === 'boost') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member?.premiumSince) entryCount = rule.multiplier;
    }
  }

  // Record entry
  db.addEntry(giveawayId, userId, entryCount);

  const totalEntries = db.getEntryCount(giveawayId);

  // Update embed entry count
  await updateGiveawayEmbed(giveaway, totalEntries, interaction.guild);

  const msg = entryCount > 1
    ? `🎉 Entered with **${entryCount}x entries**! **${totalEntries}** total entries.`
    : `🎉 You're in! **${totalEntries}** total entries.`;

  await interaction.editReply({ content: msg });
}

// ── Update embed entry count ─────────────────────────────────────────
async function updateGiveawayEmbed(giveaway, entryCount, guild) {
  try {
    const channel = await guild.channels.fetch(giveaway.channel_id);
    const msg = await channel.messages.fetch(giveaway.message_id);
    const oldEmbed = msg.embeds[0];
    if (!oldEmbed) return;

    const newEmbed = EmbedBuilder.from(oldEmbed);
    const fields = (oldEmbed.fields || []).map(f => {
      if (f.name === '🎟️ Entries') return { name: '🎟️ Entries', value: String(entryCount), inline: true };
      return f;
    });
    newEmbed.setFields(fields);
    await msg.edit({ embeds: [newEmbed], components: msg.components });
  } catch (e) {
    // Non-critical, skip
  }
}

// ── Auto-ender (checks every 10s) ────────────────────────────────────
function startAutoEnder() {
  setInterval(async () => {
    const ended = db.getExpiredGiveaways();
    for (const giveaway of ended) {
      try {
        await endGiveaway(giveaway);
      } catch (e) {
        console.error('Auto-end error:', e.message);
      }
    }
  }, 10000);
}

async function endGiveaway(giveaway) {
  db.setGiveawayStatus(giveaway.id, 'ended');

  const guild = await client.guilds.fetch(giveaway.guild_id).catch(() => null);
  if (!guild) return;

  const channel = await guild.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel) return;

  // Pick winners
  const entries = db.getEntries(giveaway.id); // flat weighted array of user IDs
  const winnerObjs = selectWinners(giveaway, entries);
  const winners = winnerObjs.map(w => w.user_id);

  // Save winners
  for (const userId of winners) db.addWinner(giveaway.id, userId);

  // Update embed
  try {
    const msg = await channel.messages.fetch(giveaway.message_id);
    const endedEmbed = buildEndedEmbed(giveaway, winners, entries.length);
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('dropbot_ended')
        .setLabel(`🎉 Giveaway Ended — ${entries.length} entries`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await msg.edit({ embeds: [endedEmbed], components: [disabledRow] });
  } catch (e) {}

  // Announce winners
  if (winners.length > 0) {
    const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
    await channel.send({
      content: `🎉 Congratulations ${winnerMentions}! You won **${giveaway.prize}**!\n> Use \`/greroll ${giveaway.id.slice(0,8)}\` to reroll.`
    });

    // DM winners
    const config = db.getGuild(giveaway.guild_id);
    if (config?.dm_winners !== 0) {
      for (const winnerId of winners) {
        const user = await client.users.fetch(winnerId).catch(() => null);
        if (user) {
          user.send(`🎉 You won **${giveaway.prize}** in **${guild.name}**!`).catch(() => {});
        }
      }
    }
  } else {
    await channel.send(`😔 No valid entries for **${giveaway.prize}**. Giveaway cancelled.`);
  }
}

// Import winner selector
const { selectWinners, buildEndedEmbed } = require('../shared/giveaway-engine');

client.login(process.env.DISCORD_TOKEN);

module.exports = { client, endGiveaway };
