const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../shared/database');
const { selectWinners, buildEndedEmbed } = require('../../shared/giveaway-engine');
const { slotMachineReveal } = require('../../shared/animations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gend')
    .setDescription('🏁 End a giveaway early and pick winners')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o
      .setName('giveaway')
      .setDescription('Select the giveaway to end')
      .setRequired(true)
      .setAutocomplete(true)
    ),

  // Autocomplete handler — shows active giveaways in this server
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const active = db.getActiveGiveaways(interaction.guildId) || [];
    const choices = active
      .filter(g => g.prize.toLowerCase().includes(focused) || g.id.startsWith(focused))
      .slice(0, 25)
      .map(g => ({
        name: `🎉 ${g.prize.slice(0, 50)} — ends <soon>`,
        value: g.id
      }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const giveawayId = interaction.options.getString('giveaway');
    const giveaway = db.getGiveaway(giveawayId);

    if (!giveaway || giveaway.guild_id !== interaction.guildId) {
      return interaction.editReply({ content: '❌ Giveaway not found.' });
    }
    if (giveaway.status !== 'active') {
      return interaction.editReply({ content: '❌ This giveaway has already ended.' });
    }

    db.setGiveawayStatus(giveaway.id, 'ended');

    const entries = db.getEntries(giveaway.id) || [];
    const winners = selectWinners(giveaway, entries)
      .map(w => typeof w === 'object' ? w?.user_id : w)
      .filter(Boolean);

    for (const userId of winners) db.addWinner(giveaway.id, userId);

    try {
      const channel = await interaction.guild.channels.fetch(giveaway.channel_id);
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

      const uniqueEntrants = [...new Set(entries)];
      await slotMachineReveal(channel, giveaway, winners, uniqueEntrants, interaction.client);
    } catch (e) {
      console.error('gend error:', e.message);
    }

    await interaction.editReply({ content: `✅ Ended **${giveaway.prize}**! **${winners.length}** winner(s) selected.` });
  }
};
