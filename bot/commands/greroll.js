const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/database');
const { selectWinners } = require('../../shared/giveaway-engine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('greroll')
    .setDescription('🔄 Reroll winners for an ended giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))
    .addIntegerOption(o => o.setName('count').setDescription('How many new winners to pick').setMinValue(1).setMaxValue(20).setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const shortId = interaction.options.getString('id');
    const count = interaction.options.getInteger('count') || 1;

    const ended = db.getEndedGiveaways(interaction.guildId, 20);
    const giveaway = ended.find(g => g.id.startsWith(shortId));
    if (!giveaway) return interaction.editReply({ content: '❌ Ended giveaway not found.' });

    const entries = db.getEntries(giveaway.id);
    const fakeGiveaway = { ...giveaway, winner_count: count };
    const winners = selectWinners(fakeGiveaway, entries);

    if (winners.length === 0) return interaction.editReply({ content: '😢 No entries to reroll from.' });

    const winnerMentions = winners.map(w => `<@${w.user_id}>`).join(', ');
    await interaction.editReply({
      content: `🔄 **Reroll!** New winner(s) for **${giveaway.prize}**: ${winnerMentions} 🎉`
    });
  }
};
