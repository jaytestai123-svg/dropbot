const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const ms = require('ms');
const db = require('../../shared/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gstart')
    .setDescription('🎉 Start a giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('prize').setDescription('What are you giving away?').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('How long? e.g. 30m, 1h, 2d').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Number of winners (default: 1)').setMinValue(1).setMaxValue(20))
    .addStringOption(o => o.setName('description').setDescription('Extra details'))
    .addRoleOption(o => o.setName('required_role').setDescription('Role required to enter'))
    .addBooleanOption(o => o.setName('boost_required').setDescription('Must be boosting?'))
    .addRoleOption(o => o.setName('bonus_role').setDescription('Role that gets 2x entries'))
    .addStringOption(o => o.setName('channel').setDescription('Channel ID to post in (default: here)')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const prize       = interaction.options.getString('prize');
    const durationStr = interaction.options.getString('duration');
    const winnerCount = interaction.options.getInteger('winners') || 1;
    const description = interaction.options.getString('description');
    const reqRole     = interaction.options.getRole('required_role');
    const boostReq    = interaction.options.getBoolean('boost_required');
    const bonusRole   = interaction.options.getRole('bonus_role');
    const chanIdOpt   = interaction.options.getString('channel');

    // Parse duration
    const duration = ms(durationStr);
    if (!duration || duration < 10000) {
      return interaction.editReply('❌ Invalid duration. Try: `10m`, `1h`, `24h`, `2d`');
    }

    // Resolve channel
    let targetChannel = interaction.channel;
    if (chanIdOpt) {
      targetChannel = await interaction.guild.channels.fetch(chanIdOpt).catch(() => null) || interaction.channel;
    }

    db.upsertGuild(interaction.guildId, interaction.guild.name);

    const id      = uuidv4();
    const shortId = id.slice(0, 8);
    const endTime = Math.floor((Date.now() + duration) / 1000);

    db.createGiveaway({
      id,
      guild_id:     interaction.guildId,
      channel_id:   targetChannel.id,
      host_id:      interaction.user.id,
      prize,
      description:  description || null,
      winner_count: winnerCount,
      end_time:     endTime,
    });

    if (reqRole)  db.addRequirement(id, 'role', reqRole.id);
    if (boostReq) db.addRequirement(id, 'boost', null);
    if (bonusRole) db.addBonusEntry(id, 'role', bonusRole.id, 2);

    // Build requirements text
    const reqLines = [];
    if (reqRole)  reqLines.push(`• Must have <@&${reqRole.id}>`);
    if (boostReq) reqLines.push('• Must be boosting this server');

    const bonusLines = [];
    if (bonusRole) bonusLines.push(`• <@&${bonusRole.id}> → **2× entries**`);

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(`🎉 ${prize}`)
      .setColor(0x5865F2)
      .setDescription(description || null)
      .addFields(
        { name: '⏰ Ends', value: `<t:${endTime}:R>`, inline: true },
        { name: '🏆 Winners', value: String(winnerCount), inline: true },
        { name: '🎟️ Entries', value: '0', inline: true },
      );

    if (reqLines.length > 0) embed.addFields({ name: '📋 Requirements', value: reqLines.join('\n') });
    if (bonusLines.length > 0) embed.addFields({ name: '✨ Bonus Entries', value: bonusLines.join('\n') });

    embed
      .setFooter({ text: `ID: ${shortId} • Hosted by ${interaction.user.username}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`dropbot_enter_${id}`)
        .setLabel('🎉 Enter Giveaway')
        .setStyle(ButtonStyle.Primary)
    );

    const msg = await targetChannel.send({ embeds: [embed], components: [row] });
    db.setMessageId(id, msg.id);

    await interaction.editReply(
      `✅ Giveaway started in ${targetChannel}!\n🎉 **${prize}** ends <t:${endTime}:R>\nID: \`${shortId}\``
    );
  }
};
