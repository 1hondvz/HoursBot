# 🎙️ Kronos — Discord Voice Hours Bot

بوت بيتتبع وقت الأعضاء في الـ Voice Channels.

---

## 📋 الأوامر

| الأمر | الوصف |
|-------|-------|
| `/join` | البوت يدخل الـ voice channel بتاعك |
| `/leave` | البوت يخرج ويحفظ كل الساعات |
| `/hours` | شوف ساعاتك أو ساعات أي عضو |
| `/leaderboard` | أعلى 10 أعضاء في الساعات |
| `/reset @user` | إعادة تعيين ساعات عضو (للأدمن فقط) |

---

## ⚙️ الإعداد

### 1. تثبيت الـ packages
```
npm install
```

### 2. إعداد الـ `.env`
```
DISCORD_TOKEN=توكن_البوت
CLIENT_ID=ID_البوت
GUILD_ID=ID_السيرفر
```

### 3. تشغيل البوت
```
npm start
```

> الـ slash commands بتتسجل تلقائياً عند كل تشغيل.

---

## 📁 الملفات

```
Kronos/
├── index.js      ← كل الكود
├── package.json  ← الـ dependencies
├── .env          ← التوكن والـ IDs (لا ترفعه على GitHub)
└── README.md
```

---

*Made by JIO*
