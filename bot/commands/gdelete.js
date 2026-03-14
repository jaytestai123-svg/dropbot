const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../shared/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gdelete')
    .setDescription('🗑️ Cancel a giveaway without picking winners')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o
      .setName('giveaway')
      .setDescription('Select the giveaway to cancel')
      .setRequired(true)
      .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const active = db.getActiveGiveaways(interaction.guildId) || [];
    const choices = active
      .filter(g => g.prize.toLowerCase().includes(focused) || g.id.startsWith(focused))
      .slice(0, 25)
      .map(g => ({ name: `🎉 ${g.prize.slice(0, 55)}`, value: g.id }));
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
      return interaction.editReply({ content: '❌ This giveaway is not active.' });
    }

    db.setGiveawayStatus(giveawayId, 'cancelled');

    try {
      const channel = await interaction.guild.channels.fetch(giveaway.channel_id);
      const msg = await channel.messages.fetch(giveaway.message_id);
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('dropbot_cancelled')
          .setLabel('❌ Giveaway Cancelled')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );
      await msg.edit({ components: [disabledRow] });
      await channel.send({ content: `❌ The **${giveaway.prize}** giveaway was cancelled.` });
    } catch (e) {}

    await interaction.editReply({ content: `✅ **${giveaway.prize}** cancelled. No winners selected.` });
  }
};
