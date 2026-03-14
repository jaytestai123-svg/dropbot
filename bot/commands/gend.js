const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../shared/database');
const { selectWinners, buildEndedEmbed, dramaticWinnerReveal } = require('../../shared/giveaway-engine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gend')
    .setDescription('🏁 End a giveaway early and pick winners')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('id').setDescription('Giveaway ID (first 8 chars)').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const shortId = interaction.options.getString('id');
    const all = db.getAllActiveGiveaways ? db.getAllActiveGiveaways() : [];
    const giveaway = all.find(g => g.id.startsWith(shortId) && g.guild_id === interaction.guildId);

    if (!giveaway) return interaction.editReply({ content: `❌ No active giveaway found with ID \`${shortId}\`.` });

    db.setGiveawayStatus(giveaway.id, 'ended');

    // Pick winners — returns array of user ID strings
    const entries = db.getEntries(giveaway.id) || [];
    const winners = selectWinners(giveaway, entries)
      .map(w => typeof w === 'object' ? w?.user_id : w)
      .filter(Boolean);

    for (const userId of winners) db.addWinner(giveaway.id, userId);

    // Update embed
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

      // Dramatic reveal
      await dramaticWinnerReveal(channel, giveaway, winners, entries.length);
    } catch (e) {
      console.error('gend embed update error:', e.message);
    }

    await interaction.editReply({ content: `✅ Giveaway ended! **${winners.length}** winner(s) selected.` });
  }
};
