const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/database');
const { buildEndedEmbed, selectWinners } = require('../../shared/giveaway-engine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gend')
    .setDescription('🏁 End a giveaway early')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('id').setDescription('Giveaway ID (first 8 chars)').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const shortId = interaction.options.getString('id');

    const active = db.getActiveGiveaways(interaction.guildId);
    const giveaway = active.find(g => g.id.startsWith(shortId));

    if (!giveaway) return interaction.editReply({ content: '❌ Giveaway not found. Use `/glist` to see active giveaways.' });

    const entries = db.getEntries(giveaway.id);
    const winners = selectWinners(giveaway, entries);

    for (const w of winners) db.addWinner({ giveaway_id: giveaway.id, user_id: w.user_id, username: w.username });
    db.endGiveaway(giveaway.id, winners.map(w => w.user_id));

    const channel = await interaction.guild.channels.fetch(giveaway.channel_id).catch(() => null);
    if (channel && giveaway.message_id) {
      const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
      if (msg) await msg.edit({ embeds: [buildEndedEmbed(giveaway, winners)], components: [] });
      const winnerText = winners.length > 0
        ? `🎉 ${winners.map(w => `<@${w.user_id}>`).join(', ')} won **${giveaway.prize}**!`
        : `😢 No valid entries for **${giveaway.prize}**.`;
      await channel.send({ content: winnerText });
    }

    await interaction.editReply({ content: `✅ Giveaway ended! ${winners.length} winner(s) selected.` });
  }
};
