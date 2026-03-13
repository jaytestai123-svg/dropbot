const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../shared/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('glist')
    .setDescription('📋 List all active giveaways in this server'),

  async execute(interaction) {
    const active = db.getActiveGiveaways(interaction.guildId);

    if (active.length === 0) {
      return interaction.reply({ content: '📭 No active giveaways right now. Start one with `/gstart`!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎉 Active Giveaways')
      .setColor('#5865F2')
      .setDescription(active.map(g => {
        const entries = db.getEntryCount(g.id);
        return `**${g.prize}**\nID: \`${g.id.slice(0,8)}\` • Ends <t:${g.end_time}:R> • ${g.winner_count} winner(s) • ${entries} entries`;
      }).join('\n\n'))
      .setFooter({ text: `${active.length} active giveaway(s)` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
