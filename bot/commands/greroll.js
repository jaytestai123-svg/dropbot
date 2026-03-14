const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/database');
const { selectWinners } = require('../../shared/giveaway-engine');
const { slotMachineReveal } = require('../../shared/animations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('greroll')
    .setDescription('🔄 Reroll winners for an ended giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('id').setDescription('Giveaway ID (first 8 chars)').setRequired(true))
    .addIntegerOption(o => o.setName('count').setDescription('How many winners to pick (default: 1)').setMinValue(1).setMaxValue(20)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const shortId = interaction.options.getString('id');
    const count   = interaction.options.getInteger('count') || 1;

    // Search all giveaways for this guild
    const allData = require('../../data/dropbot.json');
    const giveaway = Object.values(allData.giveaways).find(g =>
      g.id.startsWith(shortId) && g.guild_id === interaction.guildId
    );

    if (!giveaway) return interaction.editReply({ content: `❌ No giveaway found with ID \`${shortId}\`.` });

    const entries = db.getEntries(giveaway.id) || [];
    if (entries.length === 0) return interaction.editReply({ content: '😢 No entries to reroll from.' });

    // Pick new winners — returns array of user ID strings
    const fakeGiveaway = { ...giveaway, winner_count: count };
    const winners = selectWinners(fakeGiveaway, entries)
      .map(w => typeof w === 'object' ? w?.user_id : w)
      .filter(Boolean);

    if (winners.length === 0) return interaction.editReply({ content: '😢 Could not pick winners.' });

    // Announce in channel with dramatic reveal
    try {
      const channel = await interaction.guild.channels.fetch(giveaway.channel_id);
      const uniqueEntrants = [...new Set(entries)];
      await slotMachineReveal(channel, giveaway, winners, uniqueEntrants, interaction.client);
    } catch (e) {
      console.error('greroll channel error:', e.message);
    }

    const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
    await interaction.editReply({ content: `🔄 Rerolled! New winner(s): ${winnerMentions}` });
  }
};
