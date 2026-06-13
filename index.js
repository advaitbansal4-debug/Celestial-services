"use strict";

// ============================================================
//  Merged Discord Bot — Mafia + Economy + Games
//  Requirements: Node 18+  |  npm install discord.js
//  Env vars: DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID
// ============================================================

const {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  Collection,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  TextChannel,
} = require("discord.js");

const TOKEN     = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

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

function getBalance(userId)          { return balances.get(userId) ?? 0; }
function addCoins(userId, amount)    { const n = getBalance(userId) + amount; balances.set(userId, n); return n; }
function deductCoins(userId, amount) { const cur = getBalance(userId); if (cur < amount) return false; balances.set(userId, cur - amount); return true; }
function setBalance(userId, amount)  { balances.set(userId, amount); }
function getAllBalances()             { return [...balances.entries()]; }

// ============================================================
//  STORE & INVENTORIES
// ============================================================

const inventories = new Map();

const STORE = {
  "epstein-island": { name: "Epstein Island", emoji: "🏝️", price: 1000, description: "A private island of questionable reputation." },
};

function getInventory(userId)        { return inventories.get(userId) ?? []; }
function addToInventory(userId, item){ const inv = getInventory(userId); inv.push(item); inventories.set(userId, inv); }
function removeFromInventory(userId, item) {
  const inv = getInventory(userId);
  const idx = inv.indexOf(item);
  if (idx === -1) return false;
  inv.splice(idx, 1);
  inventories.set(userId, inv);
  return true;
}
function hasItem(userId, item)       { return getInventory(userId).includes(item); }

// ============================================================
//  COOLDOWNS
// ============================================================

const DAILY_MS = 24 * 60 * 60 * 1000;
const dailyMap = new Map();

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
      { name: "Your Hand",     value: handStr(game.playerCards), inline: true },
      { name: "Dealer's Hand", value: showDealer ? handStr(game.dealerCards) : `${game.dealerCards[0]} ??`, inline: true },
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
//  DUEL STATE
// ============================================================

const pendingDuels = new Map(); // challengerId → { targetId, amount, channelId }

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
  if (r[0]===r[1] && r[1]===r[2]) return SLOT_SYMS.find(s => s.e === r[0]).p;
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
//  MAFIA GAME STATE
// ============================================================

const lobbies = new Map(); // guildId → lobby
const games   = new Map(); // guildId → game

function getLobby(gid) { return lobbies.get(gid); }
function getGame(gid)  { return games.get(gid); }

function createLobby(gid, hostId, channelId) {
  const lobby = { hostId, channelId, players: [hostId] };
  lobbies.set(gid, lobby);
  return lobby;
}

function getRoleCounts(n) {
  if (n >= 15) return { mafia: 3, doctor: 3 };
  if (n >= 10) return { mafia: 2, doctor: 2 };
  return { mafia: 1, doctor: 1 };
}

function assignRoles(players) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const { mafia, doctor } = getRoleCounts(players.length);
  const map = new Map();
  shuffled.forEach((id, i) => {
    if (i < mafia) map.set(id, "Mafia");
    else if (i < mafia + doctor) map.set(id, "Doctor");
    else map.set(id, "Villager");
  });
  return map;
}

function startGame(gid, lobby, roles, usernames) {
  const hasDr = [...roles.values()].includes("Doctor");
  const game = {
    channelId: lobby.channelId,
    hostId: lobby.hostId,
    round: 1,
    phase: "night",
    alive: [...lobby.players],
    roles,
    usernames,
    nightKill: null,
    nightSave: null,
    mafiaSubmitted: false,
    doctorSubmitted: !hasDr,
    dayVotes: new Map(),
  };
  games.set(gid, game);
  return game;
}

function aliveByRole(game, role) {
  return game.alive.filter(id => game.roles.get(id) === role);
}

function checkWin(game) {
  const mafiaAlive = aliveByRole(game, "Mafia").length;
  if (mafiaAlive === 0) return "town";
  if (mafiaAlive >= game.alive.length - mafiaAlive) return "mafia";
  return null;
}

function resolveNight(game) {
  const kill = game.nightKill;
  const save = game.nightSave;
  if (!kill) return { died: null, saved: false };
  if (kill === save) return { died: null, saved: true };
  game.alive = game.alive.filter(id => id !== kill);
  return { died: kill, saved: false };
}

function resolveDay(game) {
  if (game.dayVotes.size === 0) return { eliminated: null, tied: false };
  const tally = new Map();
  for (const t of game.dayVotes.values()) tally.set(t, (tally.get(t) || 0) + 1);
  const max = Math.max(...tally.values());
  const top = [...tally.entries()].filter(([, v]) => v === max).map(([k]) => k);
  if (top.length > 1) return { eliminated: null, tied: true };
  const out = top[0];
  game.alive = game.alive.filter(id => id !== out);
  return { eliminated: out, tied: false };
}

function lobbyText(lobby) {
  const { mafia, doctor } = getRoleCounts(lobby.players.length);
  const vil = Math.max(0, lobby.players.length - mafia - doctor);
  return [
    `🎭 **Mafia Lobby**`,
    ``,
    `**Host:** <@${lobby.hostId}>`,
    `**Players:** ${lobby.players.length}/15`,
    ``,
    `📋 **Role breakdown** (if started now):`,
    `🔴 Mafia: ${mafia}  |  💚 Doctor: ${doctor}  |  🟡 Villager: ${vil}`,
    ``,
    `*Minimum 5 players required to start.*`,
  ].join("\n");
}

function uname(id, usernames) { return `@${usernames.get(id) || id}`; }
function aliveList(game) { return game.alive.map(id => `<@${id}>`).join(", "); }

// ── Mafia UI builders ──
function lobbyRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("mafia_join").setLabel("🎮 Join").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("mafia_leave").setLabel("🚪 Leave").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("mafia_start").setLabel("▶️ Start").setStyle(ButtonStyle.Primary),
  );
}
function viewRoleRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("mafia_viewrole").setLabel("👁 See My Role").setStyle(ButtonStyle.Secondary),
  );
}
function nightActionRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("mafia_night_action").setLabel("🌙 Submit Night Action").setStyle(ButtonStyle.Primary),
  );
}
function dayVoteRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("mafia_vote_button").setLabel("🗳️ Cast Your Vote").setStyle(ButtonStyle.Primary),
  );
}
function killMenu(targets, usernames) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("mafia_night_kill")
      .setPlaceholder("Choose a player to eliminate...")
      .addOptions(targets.map(id =>
        new StringSelectMenuOptionBuilder().setLabel(uname(id, usernames)).setValue(id).setEmoji("💀")
      ))
  );
}
function saveMenu(targets, usernames) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("mafia_night_save")
      .setPlaceholder("Choose a player to save...")
      .addOptions(targets.map(id =>
        new StringSelectMenuOptionBuilder().setLabel(uname(id, usernames)).setValue(id).setEmoji("💉")
      ))
  );
}
function voteMenu(targets, usernames) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("mafia_day_vote")
      .setPlaceholder("Choose a player to eliminate...")
      .addOptions(targets.map(id =>
        new StringSelectMenuOptionBuilder().setLabel(uname(id, usernames)).setValue(id).setEmoji("🗳️")
      ))
  );
}

const ROLE_EMOJI = { Mafia: "🔴", Doctor: "💚", Villager: "🟡" };
const ROLE_COLOR = { Mafia: 0xe74c3c, Doctor: 0x2ecc71, Villager: 0xf1c40f };
const ROLE_HINT  = {
  Mafia:    "Work with your fellow Mafia to eliminate the Villagers each night. You know who the other Mafia are.",
  Doctor:   "Each night, choose one player to protect from elimination. You can save yourself.",
  Villager: "Discuss each day and vote to eliminate who you think is Mafia. Use logic and deduction!",
};

// ── Mafia game flow ──
async function postNight(channel, game) {
  const hasDoc = aliveByRole(game, "Doctor").length > 0;
  await channel.send({
    content: [
      `🌙 **Night ${game.round} has fallen...**`,
      ``,
      `🔴 Mafia — choose who to kill`,
      hasDoc ? `💚 Doctor — choose who to save` : null,
      `🟡 Villagers — wait for morning`,
      ``,
      `**Alive (${game.alive.length}):** ${aliveList(game)}`,
    ].filter(Boolean).join("\n"),
    components: [nightActionRow()],
  });
}

async function announceWin(channel, game, gid, winner) {
  const mafiaList = [...game.roles.entries()]
    .filter(([, r]) => r === "Mafia").map(([id]) => `<@${id}>`).join(", ");
  const embed = new EmbedBuilder()
    .setTitle(winner === "mafia" ? "🔴 Mafia Wins!" : "🟡 Town Wins!")
    .setColor(winner === "mafia" ? 0xe74c3c : 0xf1c40f)
    .setDescription(winner === "mafia"
      ? "The Mafia has taken control. The town has been defeated!"
      : "The town has rooted out all the Mafia. Justice prevails!")
    .addFields({ name: "🔴 Mafia Members Were", value: mafiaList || "Unknown" })
    .setTimestamp();
  await channel.send({ embeds: [embed] });
  games.delete(gid);
}

async function resolveAndAdvance(interaction, gid, game) {
  const channel = interaction.channel;

  if (game.phase === "night") {
    if (!game.mafiaSubmitted || !game.doctorSubmitted) return;
    const { died, saved } = resolveNight(game);
    let msg;
    if (saved && !died) msg = `☀️ **Morning — Round ${game.round}**\n\n💉 Someone was targeted but the Doctor saved them! No one died tonight.`;
    else if (died)      msg = `☀️ **Morning — Round ${game.round}**\n\n💀 <@${died}> was killed by the Mafia. They were a **${game.roles.get(died)}**.`;
    else                msg = `☀️ **Morning — Round ${game.round}**\n\nThe night passed quietly. No one was eliminated.`;

    const win = checkWin(game);
    if (win) { await channel.send(msg); await announceWin(channel, game, gid, win); return; }

    game.phase = "day";
    game.dayVotes = new Map();
    game.round++;

    await channel.send({
      content: [msg, ``, `☀️ **Day ${game.round} — Discuss and vote!**`, `**Alive (${game.alive.length}):** ${aliveList(game)}`, ``, `Each player votes once. Most votes = eliminated.`].join("\n"),
      components: [dayVoteRow()],
    });
    return;
  }

  if (game.phase === "day") {
    if (!game.alive.every(id => game.dayVotes.has(id))) return;
    const { eliminated, tied } = resolveDay(game);
    let msg;
    if (tied)            msg = `🗳️ **Vote — Tie!**\n\nThe vote was tied. No one was eliminated.`;
    else if (eliminated) msg = `🗳️ **Vote Result**\n\n⚖️ <@${eliminated}> was voted out. They were a **${game.roles.get(eliminated)}**.`;
    else                 msg = `🗳️ **Vote Result**\n\nNo votes cast. No one eliminated.`;

    const win = checkWin(game);
    if (win) { await channel.send(msg); await announceWin(channel, game, gid, win); return; }

    game.phase = "night";
    game.nightKill = null;
    game.nightSave = null;
    game.mafiaSubmitted = false;
    game.doctorSubmitted = aliveByRole(game, "Doctor").length === 0;

    await channel.send(msg);
    await postNight(channel, game);
  }
}

// ============================================================
//  SLASH COMMAND DEFINITIONS
// ============================================================

const commandDefs = [
  // --- Utilities ---
  new SlashCommandBuilder().setName("ping").setDescription("Check the bot's latency"),
  new SlashCommandBuilder().setName("help").setDescription("Show all available commands"),
  new SlashCommandBuilder().setName("userinfo").setDescription("Show info about a user")
    .addUserOption(o => o.setName("user").setDescription("The user to inspect")),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Show server stats").setDMPermission(false),
  new SlashCommandBuilder().setName("avatar").setDescription("Get a user's full avatar")
    .addUserOption(o => o.setName("user").setDescription("The user")),
  new SlashCommandBuilder().setName("say").setDescription("Make the bot send a message")
    .addStringOption(o => o.setName("message").setDescription("The message to send").setRequired(true).setMaxLength(2000)),
  new SlashCommandBuilder().setName("poll").setDescription("Create a reaction poll")
    .addStringOption(o => o.setName("question").setDescription("Poll question").setRequired(true).setMaxLength(256))
    .addStringOption(o => o.setName("option1").setDescription("First option").setRequired(true).setMaxLength(100))
    .addStringOption(o => o.setName("option2").setDescription("Second option").setRequired(true).setMaxLength(100))
    .addStringOption(o => o.setName("option3").setDescription("Third option").setMaxLength(100))
    .addStringOption(o => o.setName("option4").setDescription("Fourth option").setMaxLength(100)),
  new SlashCommandBuilder().setName("clear").setDescription("Bulk delete messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName("amount").setDescription("Number of messages to delete (1–100)").setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName("roll").setDescription("Roll a dice")
    .addIntegerOption(o => o.setName("sides").setDescription("Number of sides (default 6)").setMinValue(2)),

  // --- Economy ---
  new SlashCommandBuilder().setName("daily").setDescription("Claim your 100 daily coins"),
  new SlashCommandBuilder().setName("bal").setDescription("Check your coin balance"),
  new SlashCommandBuilder().setName("gamble").setDescription("Bet coins on a 50/50 chance")
    .addIntegerOption(o => o.setName("amount").setDescription("Coins to bet").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("coinflip").setDescription("Call heads or tails and bet coins")
    .addStringOption(o => o.setName("choice").setDescription("heads or tails").setRequired(true)
      .addChoices({ name:"Heads", value:"heads" }, { name:"Tails", value:"tails" }))
    .addIntegerOption(o => o.setName("bet").setDescription("Coins to wager").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("transfer").setDescription("Send coins to another user")
    .addUserOption(o => o.setName("user").setDescription("Who to send coins to").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Coins to send").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Show top coin holders"),
  new SlashCommandBuilder().setName("balance").setDescription("View or set a user's balance (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setDescription("The user to inspect").setRequired(true))
    .addIntegerOption(o => o.setName("set").setDescription("Overwrite balance to this amount").setMinValue(0)),

  // --- Casino Games ---
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

  // --- Duel ---
  new SlashCommandBuilder().setName("duel").setDescription("Challenge another player to a coin duel")
    .addUserOption(o => o.setName("opponent").setDescription("Who to challenge").setRequired(true))
    .addIntegerOption(o => o.setName("bet").setDescription("Coins each player puts in (default 500)").setMinValue(1)),

  // --- Store ---
  new SlashCommandBuilder()
    .setName("store")
    .setDescription("Browse the item store"),
  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy an item from the store")
    .addStringOption(o =>
      o.setName("item")
        .setDescription("Item ID to buy")
        .setRequired(true)
        .addChoices(
          ...Object.entries(STORE).map(([k, v]) => ({
            name: `${v.emoji} ${v.name} (${v.price} coins)`,
            value: k,
          }))
        )
    ),
  new SlashCommandBuilder()
    .setName("use")
    .setDescription("Use an item from your inventory")
    .addStringOption(o =>
      o.setName("item")
        .setDescription("Item ID to use")
        .setRequired(true)
        .addChoices(
          ...Object.entries(STORE).map(([k, v]) => ({
            name: `${v.emoji} ${v.name}`,
            value: k,
          }))
        )
    )
    .addUserOption(o =>
      o.setName("target")
        .setDescription("User to use the item on")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your inventory"),

  // --- Mafia ---
  new SlashCommandBuilder().setName("mafia").setDescription("Start a Mafia game lobby").setDMPermission(false),
];

// ============================================================
//  SLASH COMMAND HANDLER
// ============================================================

async function handleSlash(interaction) {
  const { commandName } = interaction;
  const userId = interaction.user.id;

  // ── ping ──
  if (commandName === "ping") {
    const sent = await interaction.reply({ content: "Pinging…", fetchReply: true });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong!\n⏱ Roundtrip: **${roundtrip}ms** | WebSocket: **${Math.round(interaction.client.ws.ping)}ms**`);
    return;
  }

  // ── help ──
  if (commandName === "help") {
    const embed = new EmbedBuilder().setTitle("📖 Commands").setColor(0x5865f2)
      .addFields(
        { name: "🔧 Utilities",  value: "`/ping` `/help` `/userinfo` `/serverinfo` `/avatar` `/say` `/poll` `/clear` `/roll`" },
        { name: "💰 Economy",    value: "`/daily` `/bal` `/gamble` `/coinflip` `/transfer` `/leaderboard` `/balance` (admin)" },
        { name: "🎮 Casino",     value: "`/slots` `/blackjack` `/roulette` `/rps` `/dice` `/trivia` `/duel`" },
        { name: "🎯 Word Game",  value: "`/guessword` `/hint` `/guess`  |  also: `-guessword` `-hint` `-guess`" },
        { name: "🛒 Store",      value: "`/store` `/buy` `/use` `/inventory`  |  also: `-store` `-buy` `-use` `-inventory`" },
        { name: "🎭 Mafia",      value: "`/mafia` — start a lobby, then use the Join / Leave / Start buttons" },
      ).setTimestamp().setFooter({ text: interaction.client.user.username });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── userinfo ──
  if (commandName === "userinfo") {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const member = interaction.guild?.members.cache.get(target.id);
    const embed = new EmbedBuilder()
      .setTitle(`👤 User Info — ${target.tag}`).setThumbnail(target.displayAvatarURL({ size: 256 })).setColor(0x5865f2)
      .addFields(
        { name: "ID",             value: target.id,                                                         inline: true },
        { name: "Bot?",           value: target.bot ? "Yes" : "No",                                         inline: true },
        { name: "Account Created",value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`,              inline: true },
      );
    if (member) {
      embed.addFields(
        { name: "Joined Server", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "Unknown", inline: true },
        { name: "Nickname",      value: member.nickname ?? "None", inline: true },
        { name: `Roles (${member.roles.cache.size - 1})`, value: member.roles.cache.filter(r => r.id !== interaction.guildId).map(r => `<@&${r.id}>`).join(", ") || "None" },
      );
    }
    embed.setTimestamp();
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ── serverinfo ──
  if (commandName === "serverinfo") {
    const guild = interaction.guild;
    if (!guild) { await interaction.reply({ content: "Server only command.", ephemeral: true }); return; }
    await guild.fetch();
    const embed = new EmbedBuilder()
      .setTitle(`🏠 Server Info — ${guild.name}`).setColor(0x5865f2).setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: "Server ID",   value: guild.id,                                                         inline: true },
        { name: "Owner",       value: `<@${guild.ownerId}>`,                                             inline: true },
        { name: "Created",     value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,              inline: true },
        { name: "Members",     value: `${guild.memberCount}`,                                            inline: true },
        { name: "Channels",    value: `${guild.channels.cache.size}`,                                    inline: true },
        { name: "Roles",       value: `${guild.roles.cache.size}`,                                       inline: true },
        { name: "Boost Level", value: `Level ${guild.premiumTier}`,                                      inline: true },
        { name: "Boosts",      value: `${guild.premiumSubscriptionCount ?? 0}`,                          inline: true },
      ).setTimestamp();
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ── avatar ──
  if (commandName === "avatar") {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const embed = new EmbedBuilder()
      .setTitle(`🖼️ ${target.tag}'s Avatar`).setColor(0x5865f2)
      .setImage(target.displayAvatarURL({ size: 512 }))
      .addFields(
        { name: "PNG",  value: `[Link](${target.displayAvatarURL({ extension: "png",  size: 512 })})`, inline: true },
        { name: "JPG",  value: `[Link](${target.displayAvatarURL({ extension: "jpg",  size: 512 })})`, inline: true },
        { name: "WebP", value: `[Link](${target.displayAvatarURL({ extension: "webp", size: 512 })})`, inline: true },
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
    const opts = ["option1","option2","option3","option4"].map(k => interaction.options.getString(k)).filter(Boolean);
    const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣"];
    const embed = new EmbedBuilder().setColor(0xe67e22).setTitle("📊 " + question)
      .setDescription(opts.map((o, i) => `${emojis[i]} ${o}`).join("\n")).setTimestamp()
      .setFooter({ text: `Poll by ${interaction.user.tag}` });
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    for (let i = 0; i < opts.length; i++) await msg.react(emojis[i]).catch(() => {});
    return;
  }

  // ── clear ──
  if (commandName === "clear") {
    const amount = interaction.options.getInteger("amount", true);
    if (!(interaction.channel instanceof TextChannel))
      return interaction.reply({ content: "Text channels only.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const deleted = await interaction.channel.bulkDelete(amount, true);
    await interaction.editReply(`🗑️ Deleted **${deleted.size}** message(s).`);
    return;
  }

  // ── roll ──
  if (commandName === "roll") {
    const sides  = interaction.options.getInteger("sides") ?? 6;
    const result = Math.floor(Math.random() * sides) + 1;
    await interaction.reply(`🎲 You rolled a **d${sides}** and got **${result}**!`);
    return;
  }

  // ── daily ──
  if (commandName === "daily") {
    const cd = checkCooldown(dailyMap, DAILY_MS, userId);
    if (!cd.ready) { await interaction.reply({ content: `⏳ Already claimed. Come back <t:${expiresAt(dailyMap, DAILY_MS, userId)}:R>.`, ephemeral: true }); return; }
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
      await interaction.reply(`🎉 You won **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet * 2)} coins**`);
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
      await interaction.reply(`${coin} Landed on **${result}**!\n🎉 Won **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet * 2)} coins**`);
    } else {
      await interaction.reply(`${coin} Landed on **${result}**!\n💸 You called ${choice} — lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`);
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
    const top = getAllBalances().sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!top.length) { await interaction.reply("No one has coins yet!"); return; }
    const desc = top.map(([uid, bal], i) => `**${i + 1}.** <@${uid}> — **${bal.toLocaleString()} coins**`).join("\n");
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
    const bet   = interaction.options.getInteger("bet", true);
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
      const win = bet * mult - bet; const newBal = addCoins(userId, bet * mult);
      const hdr = mult >= 10 ? "🎰 **JACKPOT!**" : mult >= 5 ? "💎 **Big win!**" : "🎉 **Winner!**";
      color = mult >= 5 ? 0xf1c40f : 0x2ecc71; desc = `${disp}\n\n${hdr} **${mult}x** — won **${win} coins**!\n${randomWin()}\n💰 Balance: **${newBal} coins**`;
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
      const win = Math.floor(bet * 1.5); const newBal = addCoins(userId, bet + win);
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
    const em     = result.color === "red" ? "🔴" : result.color === "black" ? "⚫" : "🟢";
    const won    = choice === result.color;
    const mult   = won ? (choice === "green" ? 17 : 1) : 0;
    let desc, color;
    if (won) {
      const win = bet * mult; color = 0x2ecc71;
      desc = `${em} Ball landed on **${result.number} ${result.color}**!\n\n🎉 Won **${win} coins** (${mult}:1)!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet + win)} coins**`;
    } else {
      color = 0xe74c3c;
      desc = `${em} Ball landed on **${result.number} ${result.color}**!\n\n💸 You bet ${choice} — lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`;
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
    const bot     = picks[Math.floor(Math.random() * 3)];
    const beats   = (a, b) => (a==="rock"&&b==="scissors")||(a==="paper"&&b==="rock")||(a==="scissors"&&b==="paper");
    const summary = `${emojis[choice]} You → **${choice}** vs Bot → **${bot}** ${emojis[bot]}`;
    let desc, color;
    if (choice === bot)         { color = 0x95a5a6; desc = `${summary}\n\n🤝 **Tie!** Bet refunded.\n💰 Balance: **${addCoins(userId, bet)} coins**`; }
    else if (beats(choice, bot)){ color = 0x2ecc71; desc = `${summary}\n\n🎉 You win **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet * 2)} coins**`; }
    else                        { color = 0xe74c3c; desc = `${summary}\n\n💸 Bot wins — lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`; }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle("✂️ Rock Paper Scissors").setDescription(desc)] });
    return;
  }

  // ── dice ──
  if (commandName === "dice") {
    const bet   = interaction.options.getInteger("bet", true);
    if (!deductCoins(userId, bet)) { await interaction.reply({ content: `❌ Not enough coins. Balance: **${getBalance(userId)} coins**`, ephemeral: true }); return; }
    const die   = ["⚀","⚁","⚂","⚃","⚄","⚅"];
    const pRoll = Math.floor(Math.random() * 6) + 1;
    const bRoll = Math.floor(Math.random() * 6) + 1;
    const sum   = `You rolled **${die[pRoll-1]} ${pRoll}** — Bot rolled **${die[bRoll-1]} ${bRoll}**`;
    let desc, color;
    if (pRoll > bRoll)      { color = 0x2ecc71; desc = `${sum}\n\n🎉 Higher roll — won **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet * 2)} coins**`; }
    else if (pRoll === bRoll){ color = 0x95a5a6; desc = `${sum}\n\n🤝 **Tie!** Bet refunded.\n💰 Balance: **${addCoins(userId, bet)} coins**`; }
    else                    { color = 0xe74c3c; desc = `${sum}\n\n💸 Lower roll — lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`; }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle("🎲 Dice Duel").setDescription(desc)] });
    return;
  }

  // ── trivia ──
  if (commandName === "trivia") {
    const q    = TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
    const opts = q.opts.map((o, i) => `**${LETTERS[i]}**. ${o}`).join("\n");
    const embed = new EmbedBuilder().setColor(0x9b59b6).setTitle("🧠 Trivia")
      .setDescription(`**${q.q}**\n\n${opts}`)
      .setFooter({ text: `Correct = +${q.r} coins • You have 20 seconds` });
    await interaction.reply({ embeds: [embed] });
    const collector = interaction.channel?.createMessageCollector({ filter: m => m.author.id === userId, time: 20000, max: 3 });
    if (!collector) return;
    collector.on("collect", async msg => {
      const ans     = msg.content.trim().toUpperCase();
      const correct = LETTERS[q.a];
      if (ans === correct || ans.toLowerCase() === q.opts[q.a].toLowerCase()) {
        collector.stop("correct");
        const newBal = addCoins(userId, q.r);
        await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle("✅ Correct!")
          .setDescription(`The answer was **${correct}. ${q.opts[q.a]}**\n\n🎉 Earned **${q.r} coins**!\n💰 Balance: **${newBal} coins**`)] });
      } else { await msg.react("❌").catch(() => {}); }
    });
    collector.on("end", async (_, reason) => {
      if (reason !== "correct") await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("⏰ Time's up!")
        .setDescription(`The correct answer was **${LETTERS[q.a]}. ${q.opts[q.a]}**.`)] });
    });
    return;
  }

  // ── guessword ──
  if (commandName === "guessword") {
    const result = await startWordGame(interaction.channelId, s => interaction.channel?.send(s));
    if (result === "already_running") await interaction.reply({ content: "⚠️ A game is already running here.", ephemeral: true });
    else await interaction.reply({ content: "🎯 Game started!", ephemeral: true });
    return;
  }

  // ── hint ──
  if (commandName === "hint") {
    const r = buyWordHint(interaction.channelId, userId);
    if (r.status === "no_game")  { await interaction.reply({ content: "❌ No game running here.", ephemeral: true }); return; }
    if (r.status === "no_coins") { await interaction.reply({ content: `❌ You need **${HINT_COST} coins** for a hint.`, ephemeral: true }); return; }
    await interaction.reply(`💡 Extra Hint: \`${r.extraHint}\`\n💸 -${HINT_COST} coins | ⚠️ Win reward reduced to ${HINT_WIN_REWARD} coins.`);
    return;
  }

  // ── guess ──
  if (commandName === "guess") {
    const word = interaction.options.getString("word", true);
    const r    = submitWordGuess(interaction.channelId, userId, word);
    if (r.status === "no_game") { await interaction.reply({ content: "❌ No game running here.", ephemeral: true }); return; }
    if (r.status === "wrong")   { await interaction.reply({ content: "❌ Wrong guess!", ephemeral: true }); return; }
    await interaction.reply(`🏆 **${interaction.user.username}** guessed it!\n✅ Word: **${r.word}**\n💰 +${r.reward} coins | Balance: **${r.newBalance} coins**`);
    return;
  }

  // ── duel ──
  if (commandName === "duel") {
    const opponent = interaction.options.getUser("opponent", true);
    const bet      = interaction.options.getInteger("bet") ?? 500;
    if (opponent.id === userId)  { await interaction.reply({ content: "❌ You can't duel yourself.", ephemeral: true }); return; }
    if (opponent.bot)            { await interaction.reply({ content: "❌ You can't duel a bot.", ephemeral: true }); return; }
    if (pendingDuels.has(userId)){ await interaction.reply({ content: "❌ You already have a pending duel.", ephemeral: true }); return; }
    if (!deductCoins(userId, bet)) {
      await interaction.reply({ content: `❌ You need **${bet} coins** to start this duel. Balance: **${getBalance(userId)} coins**`, ephemeral: true }); return;
    }
    pendingDuels.set(userId, { targetId: opponent.id, amount: bet, channelId: interaction.channelId });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`duel_accept_${userId}`).setLabel("✅ Accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`duel_decline_${userId}`).setLabel("❌ Decline").setStyle(ButtonStyle.Danger),
    );
    const embed = new EmbedBuilder().setColor(0xe67e22).setTitle("🎲 Duel Challenge!")
      .setDescription(`<@${userId}> has challenged ${opponent} to a **${bet} coin** duel!\n\n${opponent}, do you accept?\n\n*You must also have ${bet} coins to accept.*`)
      .setFooter({ text: "Challenge expires in 60 seconds" });
    await interaction.reply({ embeds: [embed], components: [row] });
    setTimeout(async () => {
      if (pendingDuels.has(userId)) {
        pendingDuels.delete(userId);
        addCoins(userId, bet);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("🎲 Duel Expired").setDescription(`${opponent} didn't respond in time. <@${userId}>'s coins have been returned.`)], components: [] });
      }
    }, 60_000);
    return;
  }

  // ── store ──
  if (commandName === "store") {
    const items = Object.entries(STORE).map(([, v]) => `${v.emoji} **${v.name}** — ${v.price} coins\n*${v.description}*`).join("\n\n");
    const embed = new EmbedBuilder().setColor(0x3498db).setTitle("🛒 Item Store")
      .setDescription(items)
      .setFooter({ text: "Use /buy <item> to purchase" }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ── buy ──
  if (commandName === "buy") {
    const itemId = interaction.options.getString("item", true);
    const item   = STORE[itemId];
    if (!item) { await interaction.reply({ content: "❌ Item not found.", ephemeral: true }); return; }
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (isAdmin) {
      addToInventory(userId, itemId);
      await interaction.reply({ content: `✅ Administrator detected. **${item.name}** added to your inventory for free!`, ephemeral: true });
      return;
    }
    if (!deductCoins(userId, item.price)) {
      await interaction.reply({ content: `❌ Not enough coins. You need **${item.price}** but have **${getBalance(userId)}**.`, ephemeral: true });
      return;
    }
    addToInventory(userId, itemId);
    await interaction.reply(`✅ Purchased **${item.emoji} ${item.name}**!\n💰 Balance: **${getBalance(userId)} coins**`);
    return;
  }

  // ── use ──
  if (commandName === "use") {
    const itemId = interaction.options.getString("item", true);
    const target = interaction.options.getUser("target", true);
    const item   = STORE[itemId];
    if (!item) { await interaction.reply({ content: "❌ Item not found.", ephemeral: true }); return; }
    if (!hasItem(userId, itemId)) { await interaction.reply({ content: `❌ You don't own **${item.name}**.`, ephemeral: true }); return; }
    removeFromInventory(userId, itemId);
    if (itemId === "epstein-island") {
      await interaction.reply(`🏝️ Welcome to Epstein Island, ${target}!`);
    } else {
      await interaction.reply(`${item.emoji} Used **${item.name}** on ${target}!`);
    }
    return;
  }

  // ── inventory ──
  if (commandName === "inventory") {
    const inv = getInventory(userId);
    const embed = new EmbedBuilder().setColor(0x9b59b6).setTitle(`🎒 ${interaction.user.username}'s Inventory`)
      .setThumbnail(interaction.user.displayAvatarURL({ size: 64 }));
    if (!inv.length) {
      embed.setDescription("Your inventory is empty. Use `/store` to browse items!");
    } else {
      const tally = new Map();
      for (const id of inv) tally.set(id, (tally.get(id) || 0) + 1);
      embed.setDescription([...tally.entries()].map(([id, qty]) => `${STORE[id]?.emoji ?? "📦"} **${STORE[id]?.name ?? id}** × ${qty}`).join("\n"));
    }
    embed.setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── mafia ──
  if (commandName === "mafia") {
    const gid = interaction.guildId;
    if (!gid) { await interaction.reply({ content: "Server only.", ephemeral: true }); return; }
    if (getLobby(gid)) {
      const ex = getLobby(gid);
      await interaction.reply({ content: `A lobby is already open in <#${ex.channelId}>. Host (<@${ex.hostId}>) must start it first.`, ephemeral: true });
      return;
    }
    if (getGame(gid)) {
      const g = getGame(gid);
      await interaction.reply({ content: `A game is already running in <#${g.channelId}>. Wait for it to finish.`, ephemeral: true });
      return;
    }
    const lobby = createLobby(gid, interaction.user.id, interaction.channelId);
    await interaction.reply({ content: lobbyText(lobby), components: [lobbyRow()] });
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
    if (dv > 21 || pv > dv) { const nb = addCoins(userId, game.bet * 2); color = 0x2ecc71; outcome = `🎉 You win **${game.bet} coins**! (You: ${pv} vs Dealer: ${dv > 21 ? "bust" : dv})\n${randomWin()}\n💰 Balance: **${nb} coins**`; }
    else if (pv === dv)      { const nb = addCoins(userId, game.bet);     color = 0x95a5a6; outcome = `🤝 Push — tie at ${pv}. Bet refunded.\n💰 Balance: **${nb} coins**`; }
    else                     { color = 0xe74c3c; outcome = `💸 Dealer wins. (You: ${pv} vs Dealer: ${dv})\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`; }
    await interaction.update({ embeds: [bjEmbed(game, true).setColor(color).setDescription(outcome)], components: [bjButtons(userId, true)] });
  }

  if (action === "hit") {
    game.playerCards.push(game.deck.pop());
    const pv = handValue(game.playerCards);
    if (pv > 21) {
      bjGames.delete(userId);
      await interaction.update({ embeds: [bjEmbed(game, true).setColor(0xe74c3c).setDescription(`💥 **Bust!** Over 21 — lost **${game.bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`)], components: [bjButtons(userId, true)] });
      return;
    }
    if (pv === 21) { await resolveStand(); return; }
    await interaction.update({ embeds: [bjEmbed(game)], components: [bjButtons(userId)] });
  } else {
    await resolveStand();
  }
}

// ============================================================
//  DUEL BUTTON HANDLER
// ============================================================

async function handleDuelButton(interaction) {
  const parts       = interaction.customId.split("_");
  const action      = parts[1];
  const challengerId = parts[2];
  const duel        = pendingDuels.get(challengerId);

  if (!duel) {
    await interaction.update({ embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("🎲 Duel").setDescription("This duel has already ended or expired.")], components: [] });
    return;
  }

  if (interaction.user.id !== duel.targetId) {
    await interaction.reply({ content: "❌ This duel challenge isn't for you.", ephemeral: true });
    return;
  }

  pendingDuels.delete(challengerId);

  if (action === "decline") {
    addCoins(challengerId, duel.amount);
    await interaction.update({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("🎲 Duel Declined").setDescription(`<@${duel.targetId}> declined the duel. <@${challengerId}>'s coins have been returned.`)], components: [] });
    return;
  }

  if (!deductCoins(duel.targetId, duel.amount)) {
    addCoins(challengerId, duel.amount);
    await interaction.update({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("🎲 Duel Cancelled").setDescription(`<@${duel.targetId}> doesn't have enough coins. <@${challengerId}>'s coins have been returned.`)], components: [] });
    return;
  }

  const challengerWins = Math.random() < 0.5;
  const winnerId = challengerWins ? challengerId : duel.targetId;
  const loserId  = challengerWins ? duel.targetId : challengerId;
  const prize    = duel.amount * 2;
  addCoins(winnerId, prize);

  const winnerMsg = `🎉 Now you can buy babyoil 🛢️`;
  const loserMsg  = `😭 Now you are going to Epstein Island with babyoil 🏝️`;

  const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle("🎲 Duel Result!")
    .setDescription([
      `**${duel.amount} coins** each were on the line!`,
      ``,
      `🏆 <@${winnerId}> **wins** and takes **${prize} coins**!`,
      `> ${winnerMsg}`,
      ``,
      `💀 <@${loserId}> **loses**!`,
      `> ${loserMsg}`,
      ``,
      `💰 Winner balance: **${getBalance(winnerId)} coins**`,
    ].join("\n"))
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });
}

// ============================================================
//  MAFIA BUTTON HANDLER
// ============================================================

async function handleMafiaButton(interaction) {
  const gid = interaction.guildId;
  if (!gid) return;

  // ── See My Role ──
  if (interaction.customId === "mafia_viewrole") {
    const game = getGame(gid);
    const role = game?.roles.get(interaction.user.id);
    if (!role) return interaction.reply({ content: "You are not a participant in the current game.", ephemeral: true });
    const embed = new EmbedBuilder()
      .setTitle(`${ROLE_EMOJI[role]} Your role: **${role}**`).setColor(ROLE_COLOR[role])
      .setDescription(ROLE_HINT[role]).setFooter({ text: "Only you can see this." });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Night Action ──
  if (interaction.customId === "mafia_night_action") {
    const game = getGame(gid);
    if (!game || game.phase !== "night")
      return interaction.reply({ content: "No night phase is active.", ephemeral: true });
    if (!game.alive.includes(interaction.user.id))
      return interaction.reply({ content: "You are not an alive participant.", ephemeral: true });

    const role = game.roles.get(interaction.user.id);

    if (role === "Mafia") {
      if (game.mafiaSubmitted)
        return interaction.reply({ content: "🔴 Your team already submitted the kill.", ephemeral: true });
      const targets = game.alive.filter(id => game.roles.get(id) !== "Mafia");
      if (!targets.length) return interaction.reply({ content: "No valid targets.", ephemeral: true });
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle("🔴 Mafia — Choose your kill target").setColor(0xe74c3c)
          .setDescription("Select a player to eliminate tonight.\n**Only you can see this. Action is final.**")],
        components: [killMenu(targets, game.usernames)],
        ephemeral: true,
      });
    }

    if (role === "Doctor") {
      if (game.doctorSubmitted)
        return interaction.reply({ content: "💚 You already submitted your save.", ephemeral: true });
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle("💚 Doctor — Choose who to save tonight").setColor(0x2ecc71)
          .setDescription("Select a player to protect from the Mafia tonight.\n**Only you can see this. Action is final.**")],
        components: [saveMenu([...game.alive], game.usernames)],
        ephemeral: true,
      });
    }

    return interaction.reply({ content: "🟡 **Villager** — You have no night action. Sleep tight...", ephemeral: true });
  }

  // ── Day vote button ──
  if (interaction.customId === "mafia_vote_button") {
    const game = getGame(gid);
    if (!game || game.phase !== "day")
      return interaction.reply({ content: "No voting phase is active.", ephemeral: true });
    if (!game.alive.includes(interaction.user.id))
      return interaction.reply({ content: "You are not an alive participant.", ephemeral: true });
    if (game.dayVotes.has(interaction.user.id)) {
      const v = game.dayVotes.get(interaction.user.id);
      return interaction.reply({ content: `🗳️ You already voted for <@${v}>. Votes cannot be changed.`, ephemeral: true });
    }
    const targets = game.alive.filter(id => id !== interaction.user.id);
    return interaction.reply({
      embeds: [new EmbedBuilder().setTitle("🗳️ Cast Your Vote").setColor(0x5865f2)
        .setDescription("Select the player you believe is Mafia.\n**Only you can see this. Votes are final.**")],
      components: [voteMenu(targets, game.usernames)],
      ephemeral: true,
    });
  }

  // ── Lobby buttons ──
  const lobby = getLobby(gid);

  if (interaction.customId === "mafia_join") {
    if (!lobby) return interaction.reply({ content: "No active lobby.", ephemeral: true });
    if (lobby.players.includes(interaction.user.id))
      return interaction.reply({ content: "You are already in the lobby.", ephemeral: true });
    if (lobby.players.length >= 15)
      return interaction.reply({ content: "Lobby is full (15/15).", ephemeral: true });
    lobby.players.push(interaction.user.id);
    await interaction.reply({ content: "✅ You joined the Mafia game!", ephemeral: true });
    await interaction.message.edit({ content: lobbyText(lobby), components: [lobbyRow()] });
    return;
  }

  if (interaction.customId === "mafia_leave") {
    if (!lobby) return interaction.reply({ content: "No active lobby.", ephemeral: true });
    if (!lobby.players.includes(interaction.user.id))
      return interaction.reply({ content: "You are not in the lobby.", ephemeral: true });
    if (interaction.user.id === lobby.hostId)
      return interaction.reply({ content: "The host cannot leave. Start a new `/mafia` to reset.", ephemeral: true });
    lobby.players = lobby.players.filter(id => id !== interaction.user.id);
    await interaction.reply({ content: "👋 You left the Mafia game.", ephemeral: true });
    await interaction.message.edit({ content: lobbyText(lobby), components: [lobbyRow()] });
    return;
  }

  if (interaction.customId === "mafia_start") {
    if (!lobby) return interaction.reply({ content: "No active lobby.", ephemeral: true });
    if (interaction.user.id !== lobby.hostId)
      return interaction.reply({ content: "Only the host can start.", ephemeral: true });
    if (lobby.players.length < 5)
      return interaction.reply({ content: `Need at least 5 players. Currently: **${lobby.players.length}/5**.`, ephemeral: true });

    const usernames = new Map();
    await Promise.all(lobby.players.map(async id => {
      try { const u = await interaction.client.users.fetch(id); usernames.set(id, u.username); }
      catch { usernames.set(id, id); }
    }));

    const roles = assignRoles(lobby.players);
    const game  = startGame(gid, lobby, roles, usernames);
    const { mafia, doctor } = getRoleCounts(lobby.players.length);
    const vil = Math.max(0, lobby.players.length - mafia - doctor);

    await interaction.message.edit({
      content: [
        `🎭 **Mafia game started!**`,
        `**Players (${lobby.players.length}):** ${lobby.players.map(id => `<@${id}>`).join(", ")}`,
        `🔴 Mafia: ${mafia}  |  💚 Doctor: ${doctor}  |  🟡 Villager: ${vil}`,
      ].join("\n"),
      components: [],
    });

    await interaction.reply({
      content: [
        `🎭 **Roles have been assigned!**`,
        `Click the button below to secretly see your role.`,
        `*(Only you will see it.)*`,
      ].join("\n"),
      components: [viewRoleRow()],
    });

    lobbies.delete(gid);
    setTimeout(() => postNight(interaction.channel, game), 10_000);
    return;
  }
}

// ============================================================
//  MAFIA SELECT MENU HANDLER
// ============================================================

async function handleMafiaSelect(interaction) {
  const gid = interaction.guildId;
  if (!gid) return;

  const game     = getGame(gid);
  if (!game) return interaction.reply({ content: "No active game found.", ephemeral: true });
  const selected = interaction.values[0];
  if (!selected) return;

  if (interaction.customId === "mafia_night_kill") {
    if (game.phase !== "night" || game.mafiaSubmitted)
      return interaction.reply({ content: "Action no longer valid.", ephemeral: true });
    if (game.roles.get(interaction.user.id) !== "Mafia" || !game.alive.includes(interaction.user.id))
      return interaction.reply({ content: "You cannot perform this action.", ephemeral: true });
    game.nightKill = selected;
    game.mafiaSubmitted = true;
    await interaction.update({
      embeds: [new EmbedBuilder().setTitle("🔴 Kill target locked in").setColor(0xe74c3c)
        .setDescription(`You chose to eliminate **${uname(selected, game.usernames)}** tonight.\nWait for morning...`)
        .setFooter({ text: "Only you can see this." })],
      components: [],
    });
    await resolveAndAdvance(interaction, gid, game);
    return;
  }

  if (interaction.customId === "mafia_night_save") {
    if (game.phase !== "night" || game.doctorSubmitted)
      return interaction.reply({ content: "Action no longer valid.", ephemeral: true });
    if (game.roles.get(interaction.user.id) !== "Doctor" || !game.alive.includes(interaction.user.id))
      return interaction.reply({ content: "You cannot perform this action.", ephemeral: true });
    game.nightSave = selected;
    game.doctorSubmitted = true;
    await interaction.update({
      embeds: [new EmbedBuilder().setTitle("💚 Save target locked in").setColor(0x2ecc71)
        .setDescription(`You are protecting **${uname(selected, game.usernames)}** tonight.\nWait for morning...`)
        .setFooter({ text: "Only you can see this." })],
      components: [],
    });
    await resolveAndAdvance(interaction, gid, game);
    return;
  }

  if (interaction.customId === "mafia_day_vote") {
    if (game.phase !== "day" || !game.alive.includes(interaction.user.id))
      return interaction.reply({ content: "You cannot vote right now.", ephemeral: true });
    if (game.dayVotes.has(interaction.user.id))
      return interaction.reply({ content: "You already voted.", ephemeral: true });
    game.dayVotes.set(interaction.user.id, selected);
    const votesIn = game.dayVotes.size;
    const total   = game.alive.length;
    await interaction.update({
      embeds: [new EmbedBuilder().setTitle("🗳️ Vote cast!").setColor(0x5865f2)
        .setDescription(`You voted to eliminate **${uname(selected, game.usernames)}**.\n\n**Votes in:** ${votesIn}/${total}`)
        .setFooter({ text: "Only you can see this." })],
      components: [],
    });
    await interaction.channel.send(`🗳️ **${votesIn}/${total}** votes received.`);
    await resolveAndAdvance(interaction, gid, game);
    return;
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

  if (command === "-guessword") {
    const r = await startWordGame(message.channelId, send);
    if (r === "already_running") await message.reply("⚠️ A game is already running here.");
    return;
  }
  if (command === "-hint") {
    const r = buyWordHint(message.channelId, userId);
    if (r.status === "no_game")  await message.reply("❌ No game running here.");
    else if (r.status === "no_coins") await message.reply(`❌ You need **${HINT_COST} coins** for a hint.`);
    else await message.reply(`💡 Extra Hint: \`${r.extraHint}\`\n💸 -${HINT_COST} coins | ⚠️ Win reward reduced to ${HINT_WIN_REWARD} coins.`);
    return;
  }
  if (command === "-guess") {
    const guess = args.slice(1).join("");
    const r = submitWordGuess(message.channelId, userId, guess);
    if (r.status === "correct") await send(`🏆 **${message.author.username}** guessed it!\n✅ Word: **${r.word}**\n💰 +${r.reward} coins | Balance: **${r.newBalance} coins**`);
    return;
  }
  if (command === "-store") {
    const items = Object.entries(STORE).map(([id, v]) => `${v.emoji} **${v.name}** (\`${id}\`) — ${v.price} coins`).join("\n");
    await message.reply(`🛒 **Store**\n\n${items}\n\nUse \`-buy <item-id>\` to purchase.`);
    return;
  }
  if (command === "-buy") {
    const itemId = args[1]?.toLowerCase();
    if (!itemId || !STORE[itemId]) { await message.reply("❌ Item not found. Use `-store` to browse."); return; }
    const item    = STORE[itemId];
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
    if (isAdmin) { addToInventory(userId, itemId); await message.reply(`✅ Administrator detected. **${item.name}** added for free!`); return; }
    if (!deductCoins(userId, item.price)) { await message.reply(`❌ Not enough coins. You need **${item.price}** but have **${getBalance(userId)}**.`); return; }
    addToInventory(userId, itemId);
    await message.reply(`✅ Purchased **${item.emoji} ${item.name}**!\n💰 Balance: **${getBalance(userId)} coins**`);
    return;
  }
  if (command === "-use") {
    const itemId = args[1]?.toLowerCase();
    const target = message.mentions.users.first();
    if (!itemId || !STORE[itemId]) { await message.reply("Usage: `-use <item-id> @user`"); return; }
    if (!target) { await message.reply("❌ Mention a user to use the item on."); return; }
    const item = STORE[itemId];
    if (!hasItem(userId, itemId)) { await message.reply(`❌ You don't own **${item.name}**.`); return; }
    removeFromInventory(userId, itemId);
    if (itemId === "epstein-island") { await message.channel.send(`🏝️ Welcome to Epstein Island, ${target}!`); }
    else { await message.reply(`${item.emoji} Used **${item.name}** on ${target}!`); }
    return;
  }
  if (command === "-inventory") {
    const inv = getInventory(userId);
    if (!inv.length) { await message.reply("🎒 Your inventory is empty. Use `-store` to browse items!"); return; }
    const tally = new Map();
    for (const id of inv) tally.set(id, (tally.get(id) || 0) + 1);
    const list = [...tally.entries()].map(([id, qty]) => `${STORE[id]?.emoji ?? "📦"} **${STORE[id]?.name ?? id}** × ${qty}`).join("\n");
    await message.reply(`🎒 **Your Inventory**\n\n${list}`);
    return;
  }
  if (command === "-daily") {
    const cd = checkCooldown(dailyMap, DAILY_MS, userId);
    if (!cd.ready) { await message.reply(`⏳ Already claimed. Come back <t:${expiresAt(dailyMap, DAILY_MS, userId)}:R>.`); return; }
    setCooldown(dailyMap, userId);
    await message.reply(`☀️ Daily claimed! **+100 coins**\n💰 Balance: **${addCoins(userId, 100)} coins**`);
    return;
  }
  if (command === "-bal") {
    await message.reply(`💰 Your balance: **${getBalance(userId)} coins**`);
    return;
  }
  if (command === "-gamble") {
    const bet = parseInt(args[1] ?? "", 10);
    if (isNaN(bet) || bet < 1) { await message.reply("Usage: `-gamble <amount>`"); return; }
    if (!deductCoins(userId, bet)) { await message.reply(`❌ Not enough coins. Balance: **${getBalance(userId)} coins**`); return; }
    if (Math.random() < 0.5) await message.reply(`🎉 Won **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet * 2)} coins**`);
    else await message.reply(`💸 Lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`);
    return;
  }
  if (command === "-coinflip") {
    const choice = args[1]?.toLowerCase();
    const bet    = parseInt(args[2] ?? "", 10);
    if (choice !== "heads" && choice !== "tails") { await message.reply("Usage: `-coinflip <heads|tails> <bet>`"); return; }
    if (isNaN(bet) || bet < 1) { await message.reply("Usage: `-coinflip <heads|tails> <bet>`"); return; }
    if (!deductCoins(userId, bet)) { await message.reply(`❌ Not enough coins. Balance: **${getBalance(userId)} coins**`); return; }
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const coin   = result === "heads" ? "🪙" : "🌑";
    if (choice === result) await message.reply(`${coin} Landed on **${result}**!\n🎉 Won **${bet} coins**!\n${randomWin()}\n💰 Balance: **${addCoins(userId, bet * 2)} coins**`);
    else await message.reply(`${coin} Landed on **${result}**!\n💸 Lost **${bet} coins**.\n${randomLose()}\n💰 Balance: **${getBalance(userId)} coins**`);
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
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, c => {
  console.log(`✅ Logged in as ${c.user.tag} — in ${c.guilds.cache.size} server(s)`);
});

client.on(Events.InteractionCreate, async interaction => {
  const safeErr = async (err) => {
    console.error("Interaction error:", err);
    const msg = { content: "Something went wrong.", ephemeral: true };
    try {
      interaction.replied || interaction.deferred
        ? await interaction.followUp(msg)
        : await interaction.reply(msg);
    } catch {}
  };

  try {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("bj_"))    { await handleBlackjackButton(interaction); return; }
      if (interaction.customId.startsWith("mafia_")) { await handleMafiaButton(interaction);     return; }
      if (interaction.customId.startsWith("duel_"))  { await handleDuelButton(interaction);      return; }
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith("mafia_")) { await handleMafiaSelect(interaction); return; }
    }
    if (interaction.isChatInputCommand()) {
      await handleSlash(interaction);
    }
  } catch (err) {
    await safeErr(err);
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
