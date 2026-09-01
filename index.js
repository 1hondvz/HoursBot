require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
} = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

// ─── Data Storage ────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// hoursData structure:
// { "userId": { "username": "...", "totalSeconds": 0, "joinedAt": null } }
let hoursData = loadData();

// Track which users are currently in a voice channel
// { "userId": timestamp (ms) }
const activeSessions = {};

// ─── Client Setup ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ensureUser(userId, username) {
  if (!hoursData[userId]) {
    hoursData[userId] = { username, totalSeconds: 0, joinedAt: null };
  } else {
    hoursData[userId].username = username; // update display name
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

// Called whenever a member joins a voice channel
function onMemberJoinVoice(member) {
  if (member.user.bot) return;
  const id = member.id;
  ensureUser(id, member.user.username);
  if (!activeSessions[id]) {
    activeSessions[id] = Date.now();
  }
}

// Called whenever a member leaves a voice channel
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

// ─── Voice State Updates ──────────────────────────────────────────────────────
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const joined = !oldState.channelId && newState.channelId;
  const left   = oldState.channelId && !newState.channelId;
  const moved  = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

  if (joined) {
    onMemberJoinVoice(member);
  } else if (left) {
    onMemberLeaveVoice(member);
  } else if (moved) {
    // Count as continuous session — no break needed
  }
});

// ─── Slash Commands ───────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member } = interaction;

  // ── /join ──────────────────────────────────────────────────────────────────
  if (commandName === 'join') {
    const voiceChannel = member.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: '❌ لازم تكون في voice channel الأول!',
        ephemeral: true,
      });
    }

    const existingConnection = getVoiceConnection(guild.id);
    if (existingConnection) {
      return interaction.reply({
        content: '⚠️ أنا بالفعل في voice channel!',
        ephemeral: true,
      });
    }

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

      // Register everyone already in the channel
      for (const [, vcMember] of voiceChannel.members) {
        if (!vcMember.user.bot) onMemberJoinVoice(vcMember);
      }

      await interaction.reply({
        content: `✅ دخلت **${voiceChannel.name}** وبدأت أتتبع الساعات!`,
      });
    } catch (err) {
      console.error(err);
      await interaction.reply({
        content: '❌ حصل خطأ وأنا بحاول أدخل الـ voice channel.',
        ephemeral: true,
      });
    }
  }

  // ── /leave ─────────────────────────────────────────────────────────────────
  else if (commandName === 'leave') {
    const connection = getVoiceConnection(guild.id);

    if (!connection) {
      return interaction.reply({
        content: '❌ أنا مش في أي voice channel دلوقتي!',
        ephemeral: true,
      });
    }

    // Flush all active sessions before leaving
    const botVoiceChannel = guild.members.me?.voice?.channel;
    if (botVoiceChannel) {
      for (const [, vcMember] of botVoiceChannel.members) {
        if (!vcMember.user.bot) onMemberLeaveVoice(vcMember);
      }
    }

    connection.destroy();

    await interaction.reply({
      content: '👋 خرجت من الـ voice channel وحفظت كل الساعات!',
    });
  }

  // ── /hours ─────────────────────────────────────────────────────────────────
  else if (commandName === 'hours') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const id = targetUser.id;

    // Add any live session time
    let liveSeconds = 0;
    if (activeSessions[id]) {
      liveSeconds = Math.floor((Date.now() - activeSessions[id]) / 1000);
    }

    const stored = hoursData[id]?.totalSeconds || 0;
    const total  = stored + liveSeconds;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`⏱️ ساعات ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'إجمالي الوقت', value: formatDuration(total), inline: true },
        { name: 'الحالة', value: activeSessions[id] ? '🟢 في voice الآن' : '🔴 خارج', inline: true }
      )
      .setFooter({ text: 'Discord Voice Hours Tracker' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // ── /leaderboard ───────────────────────────────────────────────────────────
  else if (commandName === 'leaderboard') {
    // Merge stored + live sessions
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

    if (sorted.length === 0) {
      return interaction.reply({ content: '📭 مفيش بيانات لسه!', ephemeral: true });
    }

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

  // ── /reset ─────────────────────────────────────────────────────────────────
  else if (commandName === 'reset') {
    // Only admins can reset
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ الأمر ده للأدمن بس!',
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('user', true);
    const id = targetUser.id;

    delete activeSessions[id];
    if (hoursData[id]) {
      hoursData[id].totalSeconds = 0;
      saveData(hoursData);
    }

    await interaction.reply({
      content: `✅ تم إعادة تعيين ساعات **${targetUser.username}** لصفر.`,
    });
  }
});

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, (c) => {
  console.log(`✅ البوت شغال كـ ${c.user.tag}`);
  console.log(`📊 بيتتبع ساعات الـ voice channels`);
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
