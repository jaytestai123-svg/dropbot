const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../shared/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gsettings')
    .setDescription('⚙️ Configure DropBot for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('show').setDescription('Show current settings'))
    .addSubcommand(s => s
      .setName('verifyguard')
      .setDescription('Require VerifyGuard verification to enter giveaways')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable/disable VerifyGuard requirement').setRequired(true)))
    .addSubcommand(s => s
      .setName('dm_winners')
      .setDescription('DM winners when giveaway ends')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable/disable winner DMs').setRequired(true)))
    .addSubcommand(s => s
      .setName('manager_role')
      .setDescription('Set role that can manage giveaways')
      .addRoleOption(o => o.setName('role').setDescription('Manager role').setRequired(true))),

  async execute(interaction) {
    db.upsertGuild(interaction.guildId, interaction.guild.name);
    const config = db.getGuild(interaction.guildId);
    const sub = interaction.options.getSubcommand();

    if (sub === 'show') {
      const { isVGInstalled } = require('../../shared/verifyguard');
      const vgInstalled = isVGInstalled(interaction.guildId);
      const embed = new EmbedBuilder()
        .setTitle('⚙️ DropBot Settings')
        .setColor('#5865F2')
        .addFields(
          { name: '🛡️ VerifyGuard Required', value: config.require_verifyguard ? '✅ Yes' : '❌ No', inline: true },
          { name: '🛡️ VerifyGuard Installed', value: vgInstalled ? '✅ Yes' : '❌ No', inline: true },
          { name: '📨 DM Winners', value: config.dm_winners ? '✅ Yes' : '❌ No', inline: true },
          { name: '👑 Manager Role', value: config.manager_role_id ? `<@&${config.manager_role_id}>` : 'Not set', inline: true }
        )
        .setFooter({ text: 'DropBot • Powered by VerifyGuard anti-cheat' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'verifyguard') {
      const enabled = interaction.options.getBoolean('enabled');
      db.updateGuildSetting(interaction.guildId, 'require_verifyguard', enabled ? 1 : 0);
      return interaction.reply({
        content: `🛡️ VerifyGuard requirement **${enabled ? 'enabled' : 'disabled'}**. ${enabled ? 'Users must be VerifyGuard-verified to enter giveaways.' : ''}`,
        ephemeral: true
      });
    }

    if (sub === 'dm_winners') {
      const enabled = interaction.options.getBoolean('enabled');
      db.updateGuildSetting(interaction.guildId, 'dm_winners', enabled ? 1 : 0);
      return interaction.reply({ content: `📨 Winner DMs **${enabled ? 'enabled' : 'disabled'}**.`, ephemeral: true });
    }

    if (sub === 'manager_role') {
      const role = interaction.options.getRole('role');
      db.updateGuildSetting(interaction.guildId, 'manager_role_id', role.id);
      return interaction.reply({ content: `👑 Manager role set to ${role}.`, ephemeral: true });
    }
  }
};
