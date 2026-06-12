"use strict";

// ============================================================
//  Celestial Services Discord Bot — standalone index.js
//  Requirements: Node 18+  |  npm install  |  node index.js
//  Env vars: DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID
// ============================================================

const {
  Client,
  GatewayIntentBits,
  Events,
  Collection,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

const TOKEN     = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const fs = require('fs');
const fs = require('fs');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const token = process.env.DISCORD_TOKEN;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Load commands
client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

// When bot is ready
client.once('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    
    // Register slash commands
    const commands = client.commands.map(cmd => cmd.data.toJSON());
    client.application.commands.set(commands);
});

// When slash command is used
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ Error executing command', ephemeral: true });
    }
});

client.login(token);
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const token = process.env.DISCORD_TOKEN;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Load commands
client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

// When bot is ready
client.once('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    
    // Register slash commands
    const commands = client.commands.map(cmd => cmd.data.toJSON());
    client.application.commands.set(commands);
});

// When slash command is used
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ Error executing command', ephemeral: true });
    }
});

client.login(token);
if (!TOKEN || !CLIENT_ID) {
  console.error("ERROR: Set DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID environment variables.");
  process.exit(1);
}

// ============================================================
//  WIN / LOSS MESSAGES
// ============================================================

const WIN_MESSAGES = [
  "🏝️ Now you can buy Epstein Island!",
  "🚀 Private jet unlocked.",
  "👑 You are now the CEO of Potatoes.",
  "💎 Treasure chest unlocked.",
  "🍌 Banana Empire acquired.",
];
const LOSE_MESSAGES = [
  "🦈 You are trapped on Epstein Island.",
  "💸 The casino took everything.",
  "🐒 A monkey stole your wallet.",
  "🌧️ Better luck next time.",
  "🕳️ You fell into a trap.",
];
const randomWin  = () => WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)];
const randomLose = () => LOSE_MESSAGES[Math.floor(Math.random() * LOSE_MESSAGES.length)];

// ============================================================
//  BALANCES
// ============================================================

const balances = new Map();

function getBalance(userId)         { return balances.get(userId) ?? 0; }
function addCoins(userId, amount)   { const n = getBalance(userId) + amount; balances.set(userId, n); return n; }
function deductCoins(userId, amount){ const cur = getBalance(userId); if (cur < amount) return false; balances.set(userId, cur - amount); return true; }
function setBalance(userId, amount) { balances.set(userId, amount); }
function getAllBalances()            { return [...balances.entries()]; }

// ============================================================
//  COOLDOWNS
// ============================================================

const DAILY_MS = 24 * 60 * 60 * 1000;
const ROB_MS   = 10 * 60 * 1000;
const dailyMap = new Map();
const robMap   = new Map();

function checkCooldown(map, ms, userId) {
  const last = map.get(userId);
  if (!last) return { ready: true };
  const elapsed = Date.now() - last;
  return elapsed >= ms ? { ready: true } : { ready: false };
}
function setCooldown(map, userId) { map.set(userId, Date.now()); }
function expiresAt(map, ms, userId) {
  return Math.floor(((map.get(userId) ?? Date.now()) + ms) / 1000);
}

// ============================================================
//  WORD GAME
// ============================================================

const WORDS = ["APPLE","DISCORD","MINECRAFT","DRAGON","TREASURE",
               "GAMING","CASTLE","PYTHON","BABYOIL","MEME",
               "BANANA","SPONGEBOB","PIZZA","EPSTEIN"];
const HINT_COST       = 200;
const WIN_REWARD      = 100;
const HINT_WIN_REWARD = 50;
const activeWordGames = new Map();

async function startWordGame(channelId, sendFn) {
  if (activeWordGames.has(channelId)) return "already_running";
  const word   = WORDS[Math.floor(Math.random() * WORDS.length)];
  const hidden = "\\_ ".repeat(word.length).trim();
  await sendFn(`🎯 **Guess The Word!**\n${hidden}`);
  let revealed = 0;
  const hintUsers = new Set();
  const interval = setInterval(async () => {
    const game = activeWordGames.get(channelId);
    if (!game) return;
    game.revealed++;
    const hint = word.substring(0, game.revealed) + "\\_".repeat(word.length - game.revealed);
    await sendFn(`💡 Hint: \`${hint}\``);
    if (game.revealed >= word.length) {
      await sendFn(`❌ Nobody guessed it! The word was: **${word}**`);
      clearInterval(game.interval);
      activeWordGames.delete(channelId);
    }
  }, 3000);
  activeWordGames.set(channelId, { word, revealed, hintUsers, interval, sendFn });
  return "started";
}

function buyWordHint(channelId, userId) {
  const game = activeWordGames.get(channelId);
  if (!game) return { status: "no_game" };
  if (!deductCoins(userId, HINT_COST)) return { status: "no_coins" };
  game.hintUsers.add(userId);
  const next = Math.min(game.revealed + 2, game.word.length);
  return { status: "success", extraHint: game.word.substring(0, next) + "\\_".repeat(game.word.length - next) };
}

function submitWordGuess(channelId, userId, guess) {
  const game = activeWordGames.get(channelId);
  if (!game) return { status: "no_game" };
  if (guess.toUpperCase() !== game.word) return { status: "wrong" };
  const reward     = game.hintUsers.has(userId) ? HINT_WIN_REWARD : WIN_REWARD;
  const newBalance = addCoins(userId, reward);
  clearInterval(game.interval);
  activeWordGames.delete(channelId);
  return { status: "correct", word: game.word, reward, newBalance };
}

// ============================================================
//  BLACKJACK STATE
// ============================================================

const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS = ["♠","♥","♦","♣"];

function createDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}`);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function cardValue(card) {
  const r = card.slice(0, -1);
  if (["J","Q","K"].includes(r)) return 10;
  if (r === "A") return 11;
  return parseInt(r, 10);
}
function handValue(cards) {
  let total = cards.reduce((s, c) => s + cardValue(c), 0);
  let aces  = cards.filter(c => c.startsWith("A")).length;
  while (total > 21 && aces-- > 0) total -= 10;
  return total;
}
function handStr(cards) { return `${cards.join(" ")} **(${handValue(cards)})**`; }
function bjEmbed(game, showDealer = false) {
  return new EmbedBuilder()
    .setColor(0x2ecc71).setTitle("🃏 Blackjack")
    .addFields(
      { name: "Your Hand",      value: handStr(game.playerCards), inline: true },
      { name: "Dealer's Hand",  value: showDealer ? handStr(game.dealerCards) : `${game.dealerCards[0]} ??`, inline: true },
    ).setFooter({ text: `Bet: ${game.bet} coins` });
}
function bjButtons(userId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj_hit_${userId}`).setLabel("Hit").setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`bj_stand_${userId}`).setLabel("Stand").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );
}
const bjGames = new Map();

// ============================================================
//  SLOTS
// ============================================================

const SLOT_SYMS = [
  { e: "🍒", w: 8, p: 2 }, { e: "🍋", w: 7, p: 2 },
  { e: "🍊", w: 6, p: 3 }, { e: "🍇", w: 5, p: 3 },
  { e: "💎", w: 2, p: 5 }, { e: "⭐", w: 1, p: 10 },
];
const SLOT_POOL = SLOT_SYMS.flatMap(s => Array(s.w).fill(s.e));
function spinSlots() { return [0,1,2].map(() => SLOT_POOL[Math.floor(Math.random() * SLOT_POOL.length)]); }
function slotPayout(r) {
  if (r[0]===r[1] && r[1]===r[2]) return SLOT_SYMS.find(s=>s.e===r[0]).p;
  if (r[0]===r[1] || r[1]===r[2] || r[0]===r[2]) return 1;
  return 0;
}

// ============================================================
//  ROULETTE
// ============================================================

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function spinWheel() {
  const n = Math.floor(Math.random() * 37);
  return { number: n, color: n === 0 ? "green" : RED_NUMS.has(n) ? "red" : "black" };
}

// ============================================================
//  TRIVIA
// ============================================================

const TRIVIA = [
  { q:"What is the capital of France?",           opts:["Berlin","Paris","Madrid","Rome"],                    a:1, r:50  },
  { q:"How many sides does a hexagon have?",       opts:["5","6","7","8"],                                     a:1, r:50  },
  { q:"What planet is closest to the Sun?",        opts:["Venus","Earth","Mercury","Mars"],                    a:2, r:50  },
  { q:"What is 12 × 12?",                          opts:["124","144","132","148"],                             a:1, r:50  },
  { q:"Who wrote Romeo and Juliet?",               opts:["Dickens","Hemingway","Shakespeare","Austen"],        a:2, r:75  },
  { q:"What is the chemical symbol for gold?",     opts:["Go","Gd","Ag","Au"],                                 a:3, r:75  },
  { q:"How many bones in the adult human body?",   opts:["196","206","216","226"],                             a:1, r:75  },
  { q:"What is the largest ocean on Earth?",       opts:["Atlantic","Indian","Arctic","Pacific"],              a:3, r:50  },
  { q:"In what year did World War II end?",        opts:["1943","1944","1945","1946"],                         a:2, r:75  },
  { q:"Most native speakers worldwide?",           opts:["English","Spanish","Hindi","Mandarin"],              a:3, r:75  },
  { q:"Speed of light (approx.) in km/s?",         opts:["100,000","200,000","300,000","400,000"],             a:2, r:100 },
  { q:"Element with atomic number 1?",             opts:["Helium","Hydrogen","Lithium","Carbon"],              a:1, r:50  },
  { q:"Planet with the most moons?",               opts:["Jupiter","Saturn","Uranus","Neptune"],               a:1, r:100 },
  { q:"Smallest prime number?",                    opts:["0","1","2","3"],                                     a:2, r:50  },
  { q:"Who painted the Mona Lisa?",                opts:["Michelangelo","Raphael","Da Vinci","Botticelli"],    a:2, r:50  },
  { q:"How many continents are there?",            opts:["5","6","7","8"],                                     a:2, r:50  },
  { q:"What gas do plants absorb?",                opts:["Oxygen","Nitrogen","Carbon Dioxide","Hydrogen"],     a:2, r:50  },
  { q:"Currency of Japan?",                        opts:["Yuan","Won","Baht","Yen"],                           a:3, r:50  },
  { q:"Strings on a standard guitar?",             opts:["4","5","6","7"],                                     a:2, r:50  },
  { q:"Hardest natural substance on Earth?",       opts:["Gold","Iron","Diamond","Quartz"],                    a:2, r:75  },
];
const LETTERS = ["A","B","C","D"];

// ============================================================
//  SLASH COMMAND DEFINITIONS
// ============================================================

const commandDefs = [
  // --- Utilities ---
  new SlashCommandBuilder().setName("ping").setDescription("Check the bot's latency"),
  new SlashCommandBuilder().setName("help").setDescription("Show all available commands"),
  new SlashCommandBuilder().setName("userinfo").setDescription("Show info about a user")
    .addUserOption(o => o.setName("user").setDescription("The user to inspect")),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Show server info").setDMPermission(false),
  new SlashCommandBuilder().setName("say").setDescription("Make the bot send a message")
    .addStringOption(o => o.setName("message").setDescription("The message to send").setRequired(true).setMaxLength(2000)),
  new SlashCommandBuilder().setName("poll").setDescription("Create a reaction poll")
    .addStringOption(o => o.setName("question").setDescription("Poll question").setRequired(true).setMaxLength(256))
    .addStringOption(o => o.setName("option1").setDescription("First option").setRequired(true).setMaxLength(100))
    .addStringOption(o => o.setName("option2").setDescription("Second option").setRequired(true).setMaxLength(100))
    .addStringOption(o => o.setName("option3").setDescription("Third option").setMaxLength(100))
    .addStringOption(o => o.setName("option4").setDescription("Fourth option").setMaxLength(100)),

  // --- Economy ---
  new SlashCommandBuilder().setName("daily").setDescription("Claim your 100 daily coins"),
  new SlashCommandBuilder().setName("bal").setDescription("Check your coin balance"),
  new SlashCommandBuilder().setName("gamble").setDescription("Bet coins on a 50/50 chance")
    .addIntegerOption(o => o.setName("amount").setDescription("Coins to bet").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("coinflip").setDescription("Call heads or tails and bet coins")
    .addStringOption(o => o.setName("choice").setDescription("heads or tails").setRequired(true)
      .addChoices({ name:"Heads", value:"heads" }, { name:"Tails", value:"tails" }))
    .addIntegerOption(o => o.setName("bet").setDescription("Coins to wager").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("rob").setDescription("Attempt to steal coins from another user")
    .addUserOption(o => o.setName("user").setDescription("Who to rob").setRequired(true)),
  new SlashCommandBuilder().setName("transfer").setDescription("Send coins to another user")
    .addUserOption(o => o.setName("user").setDescription("Who to send coins to").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Coins to send").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Show top coin holders"),
  new SlashCommandBuilder().setName("balance").setDescription("View or set a user's balance (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setDescription("The user to inspect").setRequired(true))
    .addIntegerOption(o => o.setName("set").setDescription("Overwrite balance to this amount").setMinValue(0)),

  // --- Games ---
  new SlashCommandBuilder().setName("slots").setDescription("Spin the slot machine")
    .addIntegerOption(o => o.setName("bet").setDescription("Coins to wager").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("blackjack").setDescription("Play blackjack against the dealer")
    .addIntegerOption(o => o.setName("bet").setDescription("Coins to wager").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("roulette").setDescription("Bet on a roulette spin")
    .addStringOption(o => o.setName("color").setDescription("red (1:1) / black (1:1) / green (17:1)").setRequired(true)
      .addChoices({ name:"🔴 Red (1:1)", value:"red" }, { name:"⚫ Black (1:1)", value:"black" }, { name:"🟢 Green/Zero (17:1)", value:"green" }))
    .addIntegerOption(o => o.setName("bet").setDescription("Coins to wager").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("rps").setDescription("Rock Paper Scissors vs the bot")
    .addStringOption(o => o.setName("choice").setDescription("Your pick").setRequired(true)
      .addChoices({ name:"🪨 Rock", value:"rock" }, { name:"📄 Paper", value:"paper" }, { name:"✂️ Scissors", value:"scissors" }))
    .addIntegerOption(o => o.setName("bet").setDescription("Coins to wager").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("dice").setDescription("Roll a die against the bot — higher wins")
    .addIntegerOption(o => o.setName("bet").setDescription("Coins to wager").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("trivia").setDescription("Answer a trivia question for free coins"),

  // --- Word Game ---
  new SlashCommandBuilder().setName("guessword").setDescription("Start a word guessing game"),
  new SlashCommandBuilder().setName("hint").setDescription("Buy an extra hint (costs 200 coins)"),
  new SlashCommandBuilder().setName("guess").setDescription("Guess the current word")
    .addStringOption(o => o.setName("word").setDescription("Your guess").setRequired(true)),
];

// ============================================================
//  SLASH COMMAND HANDLERS
// ============================================================

async function handleSlash(interaction) {
  const { commandName } = interaction;
  const userId = interaction.user.id;

  // ── ping ──
  if (commandName === "ping") {
    const sent = await interaction.reply({ content: "Pinging…", fetchReply: true });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const ws = Math.round(interaction.client.ws.ping);
    await interaction.editReply(`🏓 Pong!\n⏱ Roundtrip: **${roundtrip}ms** | WebSocket: **${ws}ms**`);
    return;
  }

  // ── help ──
  if (commandName === "help") {
    const embed = new EmbedBuilder().setTitle("📖 Commands").setColor(0x5865f2)
      .addFields(
        { name: "🔧 Utilities", value: "`/ping` `/help` `/userinfo` `/serverinfo` `/say` `/poll`" },
        { name: "💰 Economy  (also `-daily` `-bal` `-gamble` `-coinflip` `-rob`)",
          value: "`/daily` `/bal` `/gamble` `/coinflip` `/rob` `/transfer` `/leaderboard` `/balance` (admin)" },
        { name: "🎮 Games",
          value: "`/slots` `/blackjack` `/roulette` `/rps` `/dice` `/trivia`" },
        { name: "🎯 Word Game  (also `-guessword` `-hint` `-guess`)",
          value: "`/guessword` `/hint` `/guess`" },
      ).setTimestamp().setFooter({ text: interaction.client.user.username });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── userinfo ──
  if (commandName === "userinfo") {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const member = interaction.guild?.members.cache.get(target.id);
    const embed = new EmbedBuilder().setColor(0x3498db).setTitle(`👤 ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: "ID",         value: target.id,                                           inline: true },
        { name: "Joined Discord", value: `<t:${Math.floor(target.createdTimestamp/1000)}:D>`, inline: true },
        { name: "Roles",      value: member?.roles.cache.filter(r=>r.id!==interaction.guild?.id).map(r=>`<@&${r.id}>`).join(" ") || "None", inline: false },
      ).setTimestamp();
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ── serverinfo ──
  if (commandName === "serverinfo") {
    const g = interaction.guild;
    if (!g) { await interaction.reply({ content: "❌ Use this in a server.", ephemeral: true }); return; }
    const embed = new EmbedBuilder().setColor(0x9b59b6).setTitle(`🏰 ${g.name}`)
      .setThumbnail(g.iconURL({ size: 128 }))
      .addFields(
        { name: "Members",  value: `${g.memberCount}`, inline: true },
        { name: "Channels", value: `${g.channels.cache.size}`, inline: true },
        { name: "Owner",    value: `<@${g.ownerId}>`, inline: true },
        { name: "Created",  value: `<t:${Math.floor(g.createdTimestamp/1000)}:D>`, inline: true },
      ).setTimestamp();
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ── say ──
  if (commandName === "say") {
    const msg = interaction.options.getString("message", true);
    await interaction.reply({ content: "✅ Sent!", ephemeral: true });
    await interaction.channel?.send(msg);
    return;
  }

  // ── poll ──
  if (commandName === "poll") {
    const question = interaction.options.getString("question", true);
    const opts = ["option1","option2","option3","option4"].map(k=>interaction.options.getString(k)).filter(Boolean);
    const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣"];
    const embed = new EmbedBuilder().setColor(0xe67e22).setTitle("📊 " + question)
      .setDescription(opts.map((o,i)=>`${emojis[i]} ${o}`).join("\n")).setTimestamp()
      .setFooter({ text: `Poll by ${interaction.user.username}` });
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    for (let i = 0; i < opts.length; i++) await msg.react(emojis[i]).catch(()=>{});
    return;
  }

  // ── daily ──
  if (commandName === "daily") {
    const cd = checkCooldown(dailyMap, DAILY_MS, userId);
    if (!cd.ready) {
      await interaction.reply({ content: `⏳ Already claimed. Come back <t:${expiresAt(dailyMap, DAILY_MS, userId)}:R>.`, ephemeral: true });
      return;
    }
    setCooldown(dailyMap, userId);
    const bal = addCoins(userId, 100);
    await interaction.reply(`☀️ Daily claimed! **+100 coins**\n💰 Balance: **${bal} coins**`);
    return;
  }

  // ── bal ──
  if (commandName === "bal") {
    const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`💵 ${interaction.user.username}'s Balance`)
      .setDescription(`**${getBalance(userId).toLocaleString()} coins**`)
      .setThumbnail(interaction.user.displayAvatarURL({ size: 64 })).setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── gamble ──
  if (commandName === "gamble") {
    const bet = interaction.options.getInteger("amount", true);
    if (!deductCoins(userId, bet)) { await interaction.reply({ content: `❌ Not enough coins. Balance: **${getBalance(userId)} coins**`, ephemeral: true }); return; }
    if (Math.random() < 0.5) {
      await interaction.reply(`🎉 You won **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet*2)} coins**`);
    } else {
      await interaction.reply(`💸 You lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`);
    }
    return;
  }

  // ── coinflip ──
  if (commandName === "coinflip") {
    const choice = interaction.options.getString("choice", true);
    const bet    = interaction.options.getInteger("bet", true);
    if (!deductCoins(userId, bet)) { await interaction.reply({ content: `❌ Not enough coins. Balance: **${getBalance(userId)} coins**`, ephemeral: true }); return; }
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const coin   = result === "heads" ? "🪙" : "🌑";
    if (choice === result) {
      await interaction.reply(`${coin} Landed on **${result}**!\n🎉 Won **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet*2)} coins**`);
    } else {
      await interaction.reply(`${coin} Landed on **${result}**!\n💸 You called ${choice} — lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`);
    }
    return;
  }

  // ── rob ──
  if (commandName === "rob") {
    const target = interaction.options.getUser("user", true);
    if (target.id === userId) { await interaction.reply({ content: "❌ Can't rob yourself.", ephemeral: true }); return; }
    const cd = checkCooldown(robMap, ROB_MS, userId);
    if (!cd.ready) { await interaction.reply({ content: `🕐 Lay low. Rob again <t:${expiresAt(robMap, ROB_MS, userId)}:R>.`, ephemeral: true }); return; }
    if (getBalance(target.id) < 50) { await interaction.reply("💸 That person is broke — not worth the risk."); return; }
    setCooldown(robMap, userId);
    if (Math.random() < 0.4) {
      const pct = Math.floor(Math.random()*21)+20;
      const stolen = Math.max(1, Math.floor(getBalance(target.id)*pct/100));
      deductCoins(target.id, stolen);
      await interaction.reply(`🦹 Stole **${stolen} coins** (${pct}%) from <@${target.id}>!\n💰 Balance: **${addCoins(userId, stolen)} coins**`);
    } else {
      const pct  = Math.floor(Math.random()*16)+10;
      const fine = Math.max(1, Math.floor(getBalance(userId)*pct/100));
      if (deductCoins(userId, fine)) { addCoins(target.id, fine); await interaction.reply(`🚨 Caught! Paid **${fine} coin** fine (${pct}%) to <@${target.id}>.\n💰 Balance: **${getBalance(userId)} coins**`); }
      else await interaction.reply(`🚨 Caught and couldn't pay the fine!\n💰 Balance: **${getBalance(userId)} coins**`);
    }
    return;
  }

  // ── transfer ──
  if (commandName === "transfer") {
    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    if (target.id === userId) { await interaction.reply({ content: "❌ Can't transfer to yourself.", ephemeral: true }); return; }
    if (target.bot)           { await interaction.reply({ content: "❌ Can't transfer to a bot.", ephemeral: true }); return; }
    if (!deductCoins(userId, amount)) { await interaction.reply({ content: `❌ Not enough coins. Balance: **${getBalance(userId)} coins**`, ephemeral: true }); return; }
    await interaction.reply(`💸 Sent **${amount} coins** to <@${target.id}>!\n💰 Your balance: **${getBalance(userId)} coins**`);
    addCoins(target.id, amount);
    return;
  }

  // ── leaderboard ──
  if (commandName === "leaderboard") {
    const top = getAllBalances().sort((a,b)=>b[1]-a[1]).slice(0,10);
    if (!top.length) { await interaction.reply("No one has coins yet!"); return; }
    const desc = top.map(([uid,bal],i)=>`**${i+1}.** <@${uid}> — **${bal.toLocaleString()} coins**`).join("\n");
    const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle("🏆 Leaderboard").setDescription(desc).setTimestamp();
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ── balance (admin) ──
  if (commandName === "balance") {
    const target = interaction.options.getUser("user", true);
    const set    = interaction.options.getInteger("set");
    if (set !== null) { setBalance(target.id, set); await interaction.reply(`✅ Set <@${target.id}>'s balance to **${set} coins**.`); }
    else await interaction.reply({ content: `💰 <@${target.id}>'s balance: **${getBalance(target.id)} coins**`, ephemeral: true });
    return;
  }

  // ── slots ──
  if (commandName === "slots") {
    const bet = interaction.options.getInteger("bet", true);
    if (!deductCoins(userId, bet)) { await interaction.reply({ content: `❌ Not enough coins. Balance: **${getBalance(userId)} coins**`, ephemeral: true }); return; }
    const reels = spinSlots();
    const mult  = slotPayout(reels);
    const disp  = `[ ${reels.join("  |  ")} ]`;
    let desc, color;
    if (mult === 0) {
      color = 0xe74c3c; desc = `${disp}\n\n💸 No match — lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`;
    } else if (mult === 1) {
      color = 0x95a5a6; desc = `${disp}\n\n🤝 Two of a kind — bet returned!\n💰 Balance: **${addCoins(userId, bet)} coins**`;
    } else {
      const win = bet*mult-bet; const newBal = addCoins(userId, bet*mult);
      const hdr = mult>=10?"🎰 **JACKPOT!**":mult>=5?"💎 **Big win!**":"🎉 **Winner!**";
      color = mult>=5?0xf1c40f:0x2ecc71; desc = `${disp}\n\n${hdr} **${mult}x** — won **${win} coins**!\n${randomWin()}\n💰 Balance: **${newBal} coins**`;
    }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle("🎰 Slots").setDescription(desc)] });
    return;
  }

  // ── blackjack ──
  if (commandName === "blackjack") {
    const bet = interaction.options.getInteger("bet", true);
    if (bjGames.has(userId)) { await interaction.reply({ content: "❌ Finish your current blackjack game first!", ephemeral: true }); return; }
    if (!deductCoins(userId, bet)) { await interaction.reply({ content: `❌ Not enough coins. Balance: **${getBalance(userId)} coins**`, ephemeral: true }); return; }
    const deck = createDeck();
    const game = { bet, playerCards: [deck.pop(), deck.pop()], dealerCards: [deck.pop(), deck.pop()], deck };
    bjGames.set(userId, game);
    const pv = handValue(game.playerCards);
    if (pv === 21) {
      bjGames.delete(userId);
      const win = Math.floor(bet*1.5); const newBal = addCoins(userId, bet+win);
      await interaction.reply({ embeds: [bjEmbed(game, true).setColor(0xf1c40f).setDescription(`🃏 **Blackjack!** Won **${win} coins**!\n${randomWin()}\n💰 Balance: **${newBal} coins**`)] });
      return;
    }
    await interaction.reply({ embeds: [bjEmbed(game)], components: [bjButtons(userId)] });
    return;
  }

  // ── roulette ──
  if (commandName === "roulette") {
    const choice = interaction.options.getString("color", true);
    const bet    = interaction.options.getInteger("bet", true);
    if (!deductCoins(userId, bet)) { await interaction.reply({ content: `❌ Not enough coins. Balance: **${getBalance(userId)} coins**`, ephemeral: true }); return; }
    const result = spinWheel();
    const em     = result.color==="red"?"🔴":result.color==="black"?"⚫":"🟢";
    const won    = choice === result.color;
    const mult   = won ? (choice==="green"?17:1) : 0;
    let desc, color;
    if (won) {
      const win = bet*mult; color=0x2ecc71;
      desc=`${em} Ball landed on **${result.number} ${result.color}**!\n\n🎉 Won **${win} coins** (${mult}:1)!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet+win)} coins**`;
    } else {
      color=0xe74c3c;
      desc=`${em} Ball landed on **${result.number} ${result.color}**!\n\n💸 You bet ${choice} — lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`;
    }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle("🎡 Roulette").setDescription(desc)] });
    return;
  }

  // ── rps ──
  if (commandName === "rps") {
    const choice  = interaction.options.getString("choice", true);
    const bet     = interaction.options.getInteger("bet", true);
    if (!deductCoins(userId, bet)) { await interaction.reply({ content: `❌ Not enough coins. Balance: **${getBalance(userId)} coins**`, ephemeral: true }); return; }
    const picks   = ["rock","paper","scissors"];
    const emojis  = { rock:"🪨", paper:"📄", scissors:"✂️" };
    const bot     = picks[Math.floor(Math.random()*3)];
    const beats   = (a,b) => (a==="rock"&&b==="scissors")||(a==="paper"&&b==="rock")||(a==="scissors"&&b==="paper");
    const summary = `${emojis[choice]} You → **${choice}** vs Bot → **${bot}** ${emojis[bot]}`;
    let desc, color;
    if (choice===bot) { color=0x95a5a6; desc=`${summary}\n\n🤝 **Tie!** Bet refunded.\n💰 Balance: **${addCoins(userId, bet)} coins**`; }
    else if (beats(choice,bot)) { color=0x2ecc71; desc=`${summary}\n\n🎉 You win **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet*2)} coins**`; }
    else { color=0xe74c3c; desc=`${summary}\n\n💸 Bot wins — lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`; }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle("✂️ Rock Paper Scissors").setDescription(desc)] });
    return;
  }

  // ── dice ──
  if (commandName === "dice") {
    const bet  = interaction.options.getInteger("bet", true);
    if (!deductCoins(userId, bet)) { await interaction.reply({ content: `❌ Not enough coins. Balance: **${getBalance(userId)} coins**`, ephemeral: true }); return; }
    const die  = ["⚀","⚁","⚂","⚃","⚄","⚅"];
    const pRoll = Math.floor(Math.random()*6)+1;
    const bRoll = Math.floor(Math.random()*6)+1;
    const sum  = `You rolled **${die[pRoll-1]} ${pRoll}** — Bot rolled **${die[bRoll-1]} ${bRoll}**`;
    let desc, color;
    if (pRoll>bRoll) { color=0x2ecc71; desc=`${sum}\n\n🎉 Higher roll — won **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet*2)} coins**`; }
    else if (pRoll===bRoll) { color=0x95a5a6; desc=`${sum}\n\n🤝 **Tie!** Bet refunded.\n💰 Balance: **${addCoins(userId, bet)} coins**`; }
    else { color=0xe74c3c; desc=`${sum}\n\n💸 Lower roll — lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`; }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle("🎲 Dice Duel").setDescription(desc)] });
    return;
  }

  // ── trivia ──
  if (commandName === "trivia") {
    const q     = TRIVIA[Math.floor(Math.random()*TRIVIA.length)];
    const opts  = q.opts.map((o,i)=>`**${LETTERS[i]}**. ${o}`).join("\n");
    const embed = new EmbedBuilder().setColor(0x9b59b6).setTitle("🧠 Trivia")
      .setDescription(`**${q.q}**\n\n${opts}`)
      .setFooter({ text: `Correct = +${q.r} coins • You have 20 seconds` });
    await interaction.reply({ embeds: [embed] });
    const collector = interaction.channel?.createMessageCollector({ filter: m=>m.author.id===userId, time:20000, max:3 });
    if (!collector) return;
    collector.on("collect", async msg => {
      const ans = msg.content.trim().toUpperCase();
      const correct = LETTERS[q.a];
      if (ans===correct || ans.toLowerCase()===q.opts[q.a].toLowerCase()) {
        collector.stop("correct");
        const newBal = addCoins(userId, q.r);
        await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle("✅ Correct!")
          .setDescription(`The answer was **${correct}. ${q.opts[q.a]}**\n\n🎉 Earned **${q.r} coins**!\n💰 Balance: **${newBal} coins**`)] });
      } else { await msg.react("❌").catch(()=>{}); }
    });
    collector.on("end", async (_,reason) => {
      if (reason!=="correct") await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("⏰ Time's up!")
        .setDescription(`The correct answer was **${LETTERS[q.a]}. ${q.opts[q.a]}**.`)] });
    });
    return;
  }

  // ── guessword ──
  if (commandName === "guessword") {
    const result = await startWordGame(interaction.channelId, s => interaction.channel?.send(s));
    if (result==="already_running") await interaction.reply({ content: "⚠️ A game is already running here.", ephemeral: true });
    else await interaction.reply({ content: "🎯 Game started!", ephemeral: true });
    return;
  }

  // ── hint ──
  if (commandName === "hint") {
    const r = buyWordHint(interaction.channelId, userId);
    if (r.status==="no_game")  { await interaction.reply({ content: "❌ No game running here.", ephemeral: true }); return; }
    if (r.status==="no_coins") { await interaction.reply({ content: `❌ You need **${HINT_COST} coins** for a hint.`, ephemeral: true }); return; }
    await interaction.reply(`💡 Extra Hint: \`${r.extraHint}\`\n💸 -${HINT_COST} coins | ⚠️ Win reward reduced to ${HINT_WIN_REWARD} coins.`);
    return;
  }

  // ── guess ──
  if (commandName === "guess") {
    const word = interaction.options.getString("word", true);
    const r    = submitWordGuess(interaction.channelId, userId, word);
    if (r.status==="no_game") { await interaction.reply({ content: "❌ No game running here.", ephemeral: true }); return; }
    if (r.status==="wrong")   { await interaction.reply({ content: "❌ Wrong guess!", ephemeral: true }); return; }
    await interaction.reply(`🏆 **${interaction.user.username}** guessed it!\n✅ Word: **${r.word}**\n💰 +${r.reward} coins | Balance: **${r.newBalance} coins**`);
    return;
  }
}

// ============================================================
//  BLACKJACK BUTTON HANDLER
// ============================================================

async function handleBlackjackButton(interaction) {
  const parts  = interaction.customId.split("_");
  const action = parts[1];
  const userId = parts.slice(2).join("_");

  if (interaction.user.id !== userId) { await interaction.reply({ content: "❌ Not your game!", ephemeral: true }); return; }
  const game = bjGames.get(userId);
  if (!game) { await interaction.update({ content: "❌ No active game.", embeds: [], components: [] }); return; }

  async function resolveStand() {
    while (handValue(game.dealerCards) < 17) game.dealerCards.push(game.deck.pop());
    const pv = handValue(game.playerCards), dv = handValue(game.dealerCards);
    bjGames.delete(userId);
    let color, outcome;
    if (dv>21||pv>dv) { const nb=addCoins(userId,game.bet*2); color=0x2ecc71; outcome=`🎉 You win **${game.bet} coins**! (You: ${pv} vs Dealer: ${dv>21?"bust":dv})\n${randomWin()}\n💰 Balance: **${nb} coins**`; }
    else if (pv===dv) { const nb=addCoins(userId,game.bet); color=0x95a5a6; outcome=`🤝 Push — tie at ${pv}. Bet refunded.\n💰 Balance: **${nb} coins**`; }
    else { color=0xe74c3c; outcome=`💸 Dealer wins. (You: ${pv} vs Dealer: ${dv})\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`; }
    await interaction.update({ embeds: [bjEmbed(game,true).setColor(color).setDescription(outcome)], components: [bjButtons(userId,true)] });
  }

  if (action === "hit") {
    game.playerCards.push(game.deck.pop());
    const pv = handValue(game.playerCards);
    if (pv > 21) {
      bjGames.delete(userId);
      await interaction.update({ embeds: [bjEmbed(game,true).setColor(0xe74c3c).setDescription(`💥 **Bust!** Over 21 — lost **${game.bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`)], components: [bjButtons(userId,true)] });
      return;
    }
    if (pv === 21) { await resolveStand(); return; }
    await interaction.update({ embeds: [bjEmbed(game)], components: [bjButtons(userId)] });
  } else {
    await resolveStand();
  }
}

// ============================================================
//  PREFIX COMMAND HANDLER
// ============================================================

async function handlePrefix(message) {
  if (message.author.bot) return;
  const args    = message.content.trim().split(/\s+/);
  const command = args[0]?.toLowerCase();
  const userId  = message.author.id;
  const send    = c => message.channel.send(c);

  // Word game prefix commands
  if (command==="-guessword") {
    const r = await startWordGame(message.channelId, send);
    if (r==="already_running") await message.reply("⚠️ A game is already running here.");
    return;
  }
  if (command==="-hint") {
    const r = buyWordHint(message.channelId, userId);
    if (r.status==="no_game")  await message.reply("❌ No game running here.");
    else if (r.status==="no_coins") await message.reply(`❌ You need **${HINT_COST} coins** for a hint.`);
    else await message.reply(`💡 Extra Hint: \`${r.extraHint}\`\n💸 -${HINT_COST} coins | ⚠️ Win reward reduced to ${HINT_WIN_REWARD} coins.`);
    return;
  }
  if (command==="-guess") {
    const guess = args.slice(1).join("");
    const r = submitWordGuess(message.channelId, userId, guess);
    if (r.status==="correct") await send(`🏆 **${message.author.username}** guessed it!\n✅ Word: **${r.word}**\n💰 +${r.reward} coins | Balance: **${r.newBalance} coins**`);
    return;
  }

  // Economy prefix commands
  if (command==="-daily") {
    const cd = checkCooldown(dailyMap, DAILY_MS, userId);
    if (!cd.ready) { await message.reply(`⏳ Already claimed. Come back <t:${expiresAt(dailyMap, DAILY_MS, userId)}:R>.`); return; }
    setCooldown(dailyMap, userId);
    await message.reply(`☀️ Daily claimed! **+100 coins**\n💰 Balance: **${addCoins(userId,100)} coins**`);
    return;
  }
  if (command==="-bal") {
    await message.reply(`💰 Your balance: **${getBalance(userId)} coins**`);
    return;
  }
  if (command==="-gamble") {
    const bet = parseInt(args[1]??""  , 10);
    if (isNaN(bet)||bet<1) { await message.reply("Usage: `-gamble <amount>`"); return; }
    if (!deductCoins(userId,bet)) { await message.reply(`❌ Not enough coins. Balance: **${getBalance(userId)} coins**`); return; }
    if (Math.random()<0.5) await message.reply(`🎉 Won **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId,bet*2)} coins**`);
    else await message.reply(`💸 Lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`);
    return;
  }
  if (command==="-coinflip") {
    const choice = args[1]?.toLowerCase();
    const bet    = parseInt(args[2]??"", 10);
    if (choice!=="heads"&&choice!=="tails") { await message.reply("Usage: `-coinflip <heads|tails> <bet>`"); return; }
    if (isNaN(bet)||bet<1) { await message.reply("Usage: `-coinflip <heads|tails> <bet>`"); return; }
    if (!deductCoins(userId,bet)) { await message.reply(`❌ Not enough coins. Balance: **${getBalance(userId)} coins**`); return; }
    const result = Math.random()<0.5?"heads":"tails";
    const coin   = result==="heads"?"🪙":"🌑";
    if (choice===result) await message.reply(`${coin} Landed on **${result}**!\n🎉 Won **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId,bet*2)} coins**`);
    else await message.reply(`${coin} Landed on **${result}**!\n💸 Lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`);
    return;
  }
  if (command==="-rob") {
    const mention  = args[1];
    const targetId = mention?.replace(/[<@!>]/g,"");
    if (!targetId) { await message.reply("Usage: `-rob <@user>`"); return; }
    if (targetId===userId) { await message.reply("❌ Can't rob yourself."); return; }
    if (!checkCooldown(robMap,ROB_MS,userId).ready) { await message.reply(`🕐 Lay low. Rob again <t:${expiresAt(robMap,ROB_MS,userId)}:R>.`); return; }
    if (getBalance(targetId)<50) { await message.reply("💸 That person is broke — not worth the risk."); return; }
    setCooldown(robMap, userId);
    if (Math.random()<0.4) {
      const pct=Math.floor(Math.random()*21)+20, stolen=Math.max(1,Math.floor(getBalance(targetId)*pct/100));
      deductCoins(targetId,stolen);
      await message.reply(`🦹 Stole **${stolen} coins** (${pct}%) from <@${targetId}>!\n💰 Balance: **${addCoins(userId,stolen)} coins**`);
    } else {
      const pct=Math.floor(Math.random()*16)+10, fine=Math.max(1,Math.floor(getBalance(userId)*pct/100));
      if (deductCoins(userId,fine)) { addCoins(targetId,fine); await message.reply(`🚨 Caught! Paid **${fine} coin** fine to <@${targetId}>.\n💰 Balance: **${getBalance(userId)} coins**`); }
      else await message.reply(`🚨 Caught and couldn't pay the fine!\n💰 Balance: **${getBalance(userId)} coins**`);
    }
    return;
  }
}

// ============================================================
//  BOT SETUP & STARTUP
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, c => {
  console.log(`✅ Logged in as ${c.user.tag} — in ${c.guilds.cache.size} server(s)`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith("bj_")) {
      await handleBlackjackButton(interaction);
      return;
    }
    if (interaction.isChatInputCommand()) {
      await handleSlash(interaction);
    }
  } catch (err) {
    console.error("Interaction error:", err);
    const msg = { content: "Something went wrong.", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(()=>{});
    else await interaction.reply(msg).catch(()=>{});
  }
});

client.on(Events.MessageCreate, message => {
  handlePrefix(message).catch(err => console.error("Prefix command error:", err));
});

// Register slash commands then log in
(async () => {
  const rest = new REST().setToken(TOKEN);
  const body = commandDefs.map(c => c.toJSON());
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
    console.log(`✅ Registered ${body.length} slash commands globally`);
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }
  await client.login(TOKEN);
})();
