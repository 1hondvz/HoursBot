require('dotenv').config();
const http = require('http');

// Keep-alive server for Replit
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Kronos is alive!');
}).listen(3000, () => console.log('🌐 Keep-alive server running on port 3000'));

const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
} = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;
const TOKEN     = process.env.DISCORD_TOKEN;

// ─── Slash Commands Definition ────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('البوت يدخل الـ voice channel بتاعك'),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('البوت يخرج من الـ voice channel'),

  new SlashCommandBuilder()
    .setName('hours')
    .setDescription('شوف ساعات الأعضاء في الـ voice channels')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('اختار العضو (اتركه فاضي تشوف نفسك)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('أعلى 10 أعضاء في الساعات'),

  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('إعادة تعيين ساعات عضو معين (للأدمن فقط)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('العضو اللي تريد إعادة تعيين ساعاته')
        .setRequired(true)
    ),
].map(cmd => cmd.toJSON());

// ─── Register Commands ────────────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('⏳ بيتم تسجيل الـ slash commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ تم تسجيل الـ commands بنجاح!');
  } catch (err) {
    console.error('❌ خطأ في تسجيل الأوامر:', err);
  }
}

// ─── Data Storage ─────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return {}; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

let hoursData = loadData();
const activeSessions = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ensureUser(userId, username) {
  if (!hoursData[userId]) {
    hoursData[userId] = { username, totalSeconds: 0 };
  } else {
    hoursData[userId].username = username;
  }
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function onMemberJoinVoice(member) {
  if (member.user.bot) return;
  const id = member.id;
  ensureUser(id, member.user.username);
  if (!activeSessions[id]) activeSessions[id] = Date.now();
}

function onMemberLeaveVoice(member) {
  if (member.user.bot) return;
  const id = member.id;
  if (activeSessions[id]) {
    const elapsed = Math.floor((Date.now() - activeSessions[id]) / 1000);
    ensureUser(id, member.user.username);
    hoursData[id].totalSeconds += elapsed;
    delete activeSessions[id];
    saveData(hoursData);
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

// ─── Voice State Updates ──────────────────────────────────────────────────────
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const joined = !oldState.channelId && newState.channelId;
  const left   = oldState.channelId && !newState.channelId;

  if (joined) onMemberJoinVoice(member);
  else if (left) onMemberLeaveVoice(member);
});

// ─── Slash Commands ───────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member } = interaction;

  // /join
  if (commandName === 'join') {
    const voiceChannel = member.voice?.channel;
    if (!voiceChannel)
      return interaction.reply({ content: '❌ لازم تكون في voice channel الأول!', ephemeral: true });

    if (getVoiceConnection(guild.id))
      return interaction.reply({ content: '⚠️ أنا بالفعل في voice channel!', ephemeral: true });

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: true,
      });

      connection.on(VoiceConnectionStatus.Disconnected, () => {
        try { connection.destroy(); } catch {}
      });

      for (const [, vcMember] of voiceChannel.members) {
        if (!vcMember.user.bot) onMemberJoinVoice(vcMember);
      }

      await interaction.reply({ content: `✅ دخلت **${voiceChannel.name}** وبدأت أتتبع الساعات!` });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ حصل خطأ وأنا بحاول أدخل الـ voice channel.', ephemeral: true });
    }
  }

  // /leave
  else if (commandName === 'leave') {
    const connection = getVoiceConnection(guild.id);
    if (!connection)
      return interaction.reply({ content: '❌ أنا مش في أي voice channel دلوقتي!', ephemeral: true });

    const botVoiceChannel = guild.members.me?.voice?.channel;
    if (botVoiceChannel) {
      for (const [, vcMember] of botVoiceChannel.members) {
        if (!vcMember.user.bot) onMemberLeaveVoice(vcMember);
      }
    }

    connection.destroy();
    await interaction.reply({ content: '👋 خرجت من الـ voice channel وحفظت كل الساعات!' });
  }

  // /hours
  else if (commandName === 'hours') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const id = targetUser.id;

    const liveSeconds = activeSessions[id]
      ? Math.floor((Date.now() - activeSessions[id]) / 1000)
      : 0;

    const total = (hoursData[id]?.totalSeconds || 0) + liveSeconds;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`⏱️ ساعات ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'إجمالي الوقت', value: formatDuration(total), inline: true },
        { name: 'الحالة', value: activeSessions[id] ? '🟢 في voice الآن' : '🔴 خارج', inline: true }
      )
      .setFooter({ text: 'Kronos — Voice Hours Tracker' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // /leaderboard
  else if (commandName === 'leaderboard') {
    const merged = { ...hoursData };
    for (const [id, startMs] of Object.entries(activeSessions)) {
      if (!merged[id]) merged[id] = { username: id, totalSeconds: 0 };
      merged[id] = {
        ...merged[id],
        totalSeconds: merged[id].totalSeconds + Math.floor((Date.now() - startMs) / 1000),
      };
    }

    const sorted = Object.entries(merged)
      .sort(([, a], [, b]) => b.totalSeconds - a.totalSeconds)
      .slice(0, 10);

    if (sorted.length === 0)
      return interaction.reply({ content: '📭 مفيش بيانات لسه!', ephemeral: true });

    const medals = ['🥇', '🥈', '🥉'];
    const lines = sorted.map(([id, data], i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      const live  = activeSessions[id] ? ' 🟢' : '';
      return `${medal} <@${id}> — ${formatDuration(data.totalSeconds)}${live}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('🏆 لوحة الصدارة — أكتر ناس في Voice')
      .setDescription(lines.join('\n'))
      .setFooter({ text: '🟢 = في الـ voice دلوقتي' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // /reset
  else if (commandName === 'reset') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ الأمر ده للأدمن بس!', ephemeral: true });

    const targetUser = interaction.options.getUser('user', true);
    const id = targetUser.id;

    delete activeSessions[id];
    if (hoursData[id]) {
      hoursData[id].totalSeconds = 0;
      saveData(hoursData);
    }

    await interaction.reply({ content: `✅ تم إعادة تعيين ساعات **${targetUser.username}** لصفر.` });
  }
});

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ البوت شغال كـ ${c.user.tag}`);
  await registerCommands();
});

// ─── Start ────────────────────────────────────────────────────────────────────
client.login(TOKEN);
