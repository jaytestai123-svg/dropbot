const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const ms = require('ms');
const db = require('../../shared/database');
const { buildGiveawayEmbed, buildEntryButton } = require('../../shared/giveaway-engine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gstart')
    .setDescription('🎉 Start a new giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('prize').setDescription('What are you giving away?').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('How long? (e.g. 1h, 30m, 2d)').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20).setRequired(false))
    .addStringOption(o => o.setName('description').setDescription('Additional details about the giveaway').setRequired(false))
    .addRoleOption(o => o.setName('required_role').setDescription('Role required to enter').setRequired(false))
    .addBooleanOption(o => o.setName('boost_required').setDescription('Must be boosting to enter?').setRequired(false))
    .addIntegerOption(o => o.setName('min_days_member').setDescription('Minimum days in server to enter').setRequired(false))
    .addRoleOption(o => o.setName('bonus_role').setDescription('Role that gets bonus entries').setRequired(false))
    .addIntegerOption(o => o.setName('bonus_multiplier').setDescription('Bonus entry multiplier (2-5x)').setMinValue(2).setMaxValue(5).setRequired(false))
    .addStringOption(o => o.setName('sponsor').setDescription('Sponsor name (optional)').setRequired(false))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (default: current)').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const prize = interaction.options.getString('prize');
    const durationStr = interaction.options.getString('duration');
    const winnerCount = interaction.options.getInteger('winners') || 1;
    const description = interaction.options.getString('description');
    const requiredRole = interaction.options.getRole('required_role');
    const boostRequired = interaction.options.getBoolean('boost_required');
    const minDays = interaction.options.getInteger('min_days_member');
    const bonusRole = interaction.options.getRole('bonus_role');
    const bonusMultiplier = interaction.options.getInteger('bonus_multiplier') || 2;
    const sponsor = interaction.options.getString('sponsor');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    // Parse duration
    const duration = ms(durationStr);
    if (!duration || duration < 5000) {
      return interaction.editReply({ content: '❌ Invalid duration. Use formats like `30m`, `1h`, `2d`.' });
    }
    if (duration > ms('30d')) {
      return interaction.editReply({ content: '❌ Maximum giveaway duration is 30 days.' });
    }

    // Ensure guild config exists
    db.upsertGuild(interaction.guildId, interaction.guild.name);

    const id = uuidv4();
    const endTime = Math.floor((Date.now() + duration) / 1000);

    // Create giveaway record
    db.createGiveaway({
      id,
      guild_id: interaction.guildId,
      channel_id: targetChannel.id,
      host_id: interaction.user.id,
      prize,
      description: description || null,
      winner_count: winnerCount,
      end_time: endTime,
      color: COLOR_ACTIVE,
      type: 'standard',
      image_url: null,
      sponsor_name: sponsor || null,
      sponsor_logo: null
    });

    // Add requirements
    if (requiredRole) db.addRequirement(id, 'role', requiredRole.id);
    if (boostRequired) db.addRequirement(id, 'boost', null);
    if (minDays) db.addRequirement(id, 'min_days', String(minDays));

    // Add bonus entries
    if (bonusRole) db.addBonusEntry(id, 'role', bonusRole.id, bonusMultiplier);
    if (boostRequired && !bonusRole) db.addBonusEntry(id, 'boost', null, 2);

    // Build and post embed
    const requirements = db.getRequirements(id);
    const bonusRules = db.getBonusEntries(id);
    const giveaway = db.getGiveaway(id);
    const embed = buildGiveawayEmbed(giveaway, 0, requirements, bonusRules);
    const button = buildEntryButton(0);

    const msg = await targetChannel.send({ embeds: [embed], components: [button] });
    db.setMessageId(id, msg.id);

    await interaction.editReply({
      content: `✅ Giveaway started in ${targetChannel}!\n🎉 **${prize}** — ends <t:${endTime}:R>`
    });
  }
};

const COLOR_ACTIVE = '#5865F2';
