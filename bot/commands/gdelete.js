const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gdelete')
    .setDescription('🗑️ Delete a giveaway without picking winners')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const shortId = interaction.options.getString('id');
    const active = db.getActiveGiveaways(interaction.guildId);
    const giveaway = active.find(g => g.id.startsWith(shortId));
    if (!giveaway) return interaction.editReply({ content: '❌ Active giveaway not found.' });

    db.cancelGiveaway(giveaway.id);

    const channel = await interaction.guild.channels.fetch(giveaway.channel_id).catch(() => null);
    if (channel && giveaway.message_id) {
      const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
      if (msg) await msg.edit({ content: '~~This giveaway was cancelled.~~', embeds: [], components: [] });
    }

    await interaction.editReply({ content: `🗑️ Giveaway **${giveaway.prize}** has been deleted.` });
  }
};
