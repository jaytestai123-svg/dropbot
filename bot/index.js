/**
 * DropBot — Discord Giveaway Bot
 * Built with VerifyGuard anti-cheat integration
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('../shared/database');
const { buildEndedEmbed, selectWinners } = require('../shared/giveaway-engine');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
  ]
});

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.data) client.commands.set(cmd.data.name, cmd);
}

// ── Events ───────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ DropBot ready as ${client.user.tag}`);
  client.user.setActivity('🎉 Hosting Giveaways | dropbot.gg', { type: 3 });
  startGiveawayChecker();
});

client.on('guildCreate', async (guild) => {
  db.upsertGuild(guild.id, guild.name);
  console.log(`➕ Joined guild: ${guild.name}`);
});

// ── Slash command handler ────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, client);
    } catch (err) {
      console.error(`Command error [${interaction.commandName}]:`, err);
      const msg = { content: '❌ Something went wrong. Please try again.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    }
  }

  // ── Button: Enter Giveaway ─────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'dropbot_enter') {
    await handleGiveawayEntry(interaction);
  }
});

// ── Giveaway Entry Handler ────────────────────────────────────────────
async function handleGiveawayEntry(interaction) {
  const { checkEntryEligibility, calcBonusEntries } = require('../shared/verifyguard');
  const { buildEntryButton } = require('../shared/giveaway-engine');

  await interaction.deferReply({ ephemeral: true });

  const giveaway = db.getGiveawayByMessage(interaction.message.id);
  if (!giveaway || giveaway.ended || giveaway.cancelled) {
    return interaction.editReply({ content: '❌ This giveaway is no longer active.' });
  }

  if (Date.now() / 1000 > giveaway.end_time) {
    return interaction.editReply({ content: '⏰ This giveaway has already ended.' });
  }

  const existing = db.getEntry(giveaway.id, interaction.user.id);
  if (existing) {
    return interaction.editReply({ content: `✅ You've already entered this giveaway with **${existing.entry_count}** ${existing.entry_count === 1 ? 'entry' : 'entries'}!` });
  }

  const guildConfig = db.getGuild(interaction.guildId);
  const member = interaction.member;
  const requirements = db.getRequirements(giveaway.id);
  const bonusRules = db.getBonusEntries(giveaway.id);

  // Eligibility check (includes VerifyGuard)
  const eligibility = await checkEntryEligibility(member, interaction.guildId, requirements, guildConfig);
  if (!eligibility.eligible) {
    return interaction.editReply({ content: eligibility.reason });
  }

  // Calculate entries
  const entryCount = calcBonusEntries(member, bonusRules);

  // Check VerifyGuard status for this user
  const { isUserVerified } = require('../shared/verifyguard');
  const vgStatus = isUserVerified(interaction.user.id, interaction.guildId);

  // Save entry
  db.addEntry({
    giveaway_id: giveaway.id,
    user_id: interaction.user.id,
    username: interaction.user.username,
    entry_count: entryCount,
    verified_by_vg: vgStatus.verified ? 1 : 0,
    vg_risk_score: vgStatus.riskScore || 0
  });

  // Update button count
  const totalEntries = db.getEntryCount(giveaway.id);
  try {
    await interaction.message.edit({ components: [buildEntryButton(totalEntries)] });
  } catch (e) {}

  const bonusMsg = entryCount > 1 ? ` (**${entryCount}x** bonus entries!)` : '';
  const vgBadge = vgStatus.verified ? ' 🛡️' : '';

  await interaction.editReply({
    content: `🎉 You've entered **${giveaway.prize}**!${bonusMsg}${vgBadge}\n\nGood luck! Winners announced <t:${giveaway.end_time}:R>.`
  });
}

// ── Giveaway Auto-Ender ───────────────────────────────────────────────
function startGiveawayChecker() {
  setInterval(async () => {
    const now = Math.floor(Date.now() / 1000);
    const active = db.getAllActiveGiveaways();

    for (const giveaway of active) {
      if (giveaway.end_time <= now) {
        await endGiveaway(giveaway);
      }
    }
  }, 5000); // Check every 5 seconds
}

async function endGiveaway(giveaway) {
  try {
    const entries = db.getEntries(giveaway.id);
    const winners = selectWinners(giveaway, entries);

    // Save winners
    for (const w of winners) {
      db.addWinner({ giveaway_id: giveaway.id, user_id: w.user_id, username: w.username });
    }
    db.endGiveaway(giveaway.id, winners.map(w => w.user_id));

    // Update Discord message
    const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
    if (message) {
      const endedEmbed = buildEndedEmbed(giveaway, winners);
      await message.edit({ embeds: [endedEmbed], components: [] });
    }

    // Announce winners
    const winnerMentions = winners.length > 0
      ? `🎉 Congratulations ${winners.map(w => `<@${w.user_id}>`).join(', ')}! You won **${giveaway.prize}**!`
      : `😢 No valid entries for **${giveaway.prize}**. Nobody won!`;

    await channel.send({
      content: winnerMentions,
      reply: giveaway.message_id ? { messageReference: giveaway.message_id } : undefined
    });

    // DM winners
    const guildConfig = db.getGuild(giveaway.guild_id);
    if (guildConfig?.dm_winners) {
      for (const winner of winners) {
        try {
          const user = await client.users.fetch(winner.user_id);
          await user.send({
            content: `🎉 You won **${giveaway.prize}** in a giveaway! Check the server for details.`
          });
        } catch (e) {}
      }
    }

    console.log(`✅ Ended giveaway ${giveaway.id} — ${winners.length} winners`);
  } catch (e) {
    console.error(`Failed to end giveaway ${giveaway.id}:`, e.message);
  }
}

// Export for web server
module.exports = client;

client.login(process.env.DISCORD_TOKEN);
