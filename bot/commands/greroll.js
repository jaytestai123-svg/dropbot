const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../shared/database');
const { selectWinners } = require('../../shared/giveaway-engine');
const { slotMachineReveal } = require('../../shared/animations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('greroll')
    .setDescription('🔄 Reroll winners for an ended giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o
      .setName('giveaway')
      .setDescription('Select the giveaway to reroll')
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption(o => o
      .setName('count')
      .setDescription('How many winners to pick (default: 1)')
      .setMinValue(1).setMaxValue(20)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    // Show ended giveaways for reroll
    const data = require('../../data/dropbot.json');
    const giveaways = Object.values(data.giveaways || {})
      .filter(g => g.guild_id === interaction.guildId && g.status === 'ended')
      .filter(g => g.prize.toLowerCase().includes(focused) || g.id.startsWith(focused))
      .slice(0, 25)
      .map(g => ({ name: `🏆 ${g.prize.slice(0, 50)} (ended)`, value: g.id }));
    await interaction.respond(giveaways);
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const giveawayId = interaction.options.getString('giveaway');
    const count = interaction.options.getInteger('count') || 1;

    const data = require('../../data/dropbot.json');
    const giveaway = data.giveaways?.[giveawayId];

    if (!giveaway || giveaway.guild_id !== interaction.guildId) {
      return interaction.editReply({ content: '❌ Giveaway not found.' });
    }

    const entries = db.getEntries(giveawayId) || [];
    if (entries.length === 0) return interaction.editReply({ content: '😢 No entries to reroll from.' });

    const fakeGiveaway = { ...giveaway, winner_count: count };
    const winners = selectWinners(fakeGiveaway, entries)
      .map(w => typeof w === 'object' ? w?.user_id : w)
      .filter(Boolean);

    if (winners.length === 0) return interaction.editReply({ content: '😢 Could not pick winners.' });

    try {
      const channel = await interaction.guild.channels.fetch(giveaway.channel_id);
      const uniqueEntrants = [...new Set(entries)];
      await slotMachineReveal(channel, giveaway, winners, uniqueEntrants, interaction.client);
    } catch (e) {
      console.error('greroll error:', e.message);
    }

    const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
    await interaction.editReply({ content: `🔄 Rerolled! New winner(s): ${winnerMentions}` });
  }
};
