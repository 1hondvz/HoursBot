const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { clientId, guildId } = require('./config.json');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('البوت يدخل الـ voice channel بتاعك')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('البوت يخرج من الـ voice channel')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('hours')
    .setDescription('شوف ساعات الأعضاء في الـ voice channels')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('اختار العضو (اتركه فاضي تشوف نفسك)')
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('أعلى 10 أعضاء في الساعات')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('إعادة تعيين ساعات عضو معين (للأدمن فقط)')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('العضو اللي تريد إعادة تعيين ساعاته')
        .setRequired(true)
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⏳ بيتم تسجيل الـ slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('✅ تم تسجيل الـ commands بنجاح!');
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
})();
