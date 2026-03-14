/**
 * DropBot Animations
 * Simulates slot machine / wheel spin using rapid Discord message edits
 */

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Slot Machine Winner Reveal ────────────────────────────────────────
/**
 * Spins through all entrant names, slows down, lands on winner
 * @param {TextChannel} channel
 * @param {Object} giveaway
 * @param {string[]} winnerIds - final winner user IDs
 * @param {string[]} allEntrantIds - all unique entrant IDs
 * @param {Client} client - Discord client to resolve usernames
 */
async function slotMachineReveal(channel, giveaway, winnerIds, allEntrantIds, client) {
  if (winnerIds.length === 0) {
    return channel.send({ content: `😔 No valid entries for **${giveaway.prize}**. Giveaway cancelled.` });
  }

  // Resolve usernames for all entrants
  const nameMap = {};
  const fetchLimit = Math.min(allEntrantIds.length, 20);
  for (const id of allEntrantIds.slice(0, fetchLimit)) {
    try {
      const user = await client.users.fetch(id);
      nameMap[id] = user.username;
    } catch {
      nameMap[id] = id.slice(0, 8) + '...';
    }
  }

  const winnerNames = winnerIds.map(id => nameMap[id] || id);
  const entrantNames = allEntrantIds.map(id => nameMap[id] || id);

  // Need at least 2 names for spinning — pad with filler if only 1 entrant
  const spinPool = entrantNames.length >= 2
    ? entrantNames
    : [...entrantNames, ...Array(4).fill('???')];

  // ── Phase 1: Countdown ────────────────────────────────────────────
  const msg = await channel.send({ content: buildCountdown(3, giveaway.prize) });
  await sleep(900);
  await msg.edit({ content: buildCountdown(2, giveaway.prize) });
  await sleep(900);
  await msg.edit({ content: buildCountdown(1, giveaway.prize) });
  await sleep(900);

  // ── Phase 2: Fast spin ────────────────────────────────────────────
  await msg.edit({ content: buildSlotFrame('🎰 SPINNING...', spinPool, null, 'fast') });
  await sleep(200);

  const fastRounds = 12;
  for (let i = 0; i < fastRounds; i++) {
    const displayed = getRandomSlice(spinPool, winnerIds[0], i, fastRounds, false);
    await msg.edit({ content: buildSlotFrame('🎰 SPINNING...', spinPool, displayed, 'fast') });
    await sleep(150);
  }

  // ── Phase 3: Slowing down ────────────────────────────────────────
  const slowSpeeds = [250, 350, 500, 700, 900, 1100];
  for (let i = 0; i < slowSpeeds.length; i++) {
    const isLast = i === slowSpeeds.length - 1;
    const displayed = getRandomSlice(spinPool, winnerIds[0], i, slowSpeeds.length, isLast);
    const label = i < 3 ? '🌀 Slowing...' : i < 5 ? '⚡ Almost...' : '🎯 Landing...';
    await msg.edit({ content: buildSlotFrame(label, spinPool, displayed, 'slow') });
    await sleep(slowSpeeds[i]);
  }

  // ── Phase 4: Winner reveal ────────────────────────────────────────
  await sleep(400);

  if (winnerIds.length === 1) {
    // Single winner — big dramatic reveal
    await msg.edit({ content: buildSingleWinnerReveal(winnerNames[0], winnerIds[0], giveaway.prize, allEntrantIds.length) });
  } else {
    // Multiple winners
    await msg.edit({ content: buildMultiWinnerReveal(winnerNames, winnerIds, giveaway.prize, allEntrantIds.length) });
  }

  // Bonus: fire a follow-up message after a pause
  await sleep(1500);
  await channel.send({
    content: `🎟️ **${allEntrantIds.length}** people entered · **${winnerIds.length}** won · Use \`/greroll\` to reroll`
  });

  return msg;
}

// ── Frame builders ────────────────────────────────────────────────────

function buildCountdown(n, prize) {
  const bars = ['▓▓▓▓▓▓▓▓▓▓', '▓▓▓▓▓▓▓░░░', '▓▓▓░░░░░░░'];
  const emojis = ['3️⃣', '2️⃣', '1️⃣'];
  return [
    ``,
    `## 🎰 ${prize}`,
    ``,
    `**Drawing winner in...**`,
    ``,
    `# ${emojis[3 - n]}`,
    `\`${bars[3 - n]}\``,
    ``,
  ].join('\n');
}

function buildSlotFrame(label, pool, displayed, speed) {
  const rows = displayed || getRandomSlice(pool, null, 0, 1, false);
  const [top, mid, bot] = rows;

  const separator = speed === 'fast'
    ? '`══════════════════`'
    : '`━━━━━━━━━━━━━━━━━━`';

  return [
    ``,
    `## 🎰 GIVEAWAY DRAW`,
    `**${label}**`,
    ``,
    separator,
    `🎟️  ${padName(top)}`,
    `▶️  **${padName(mid)}** ◀️`,
    `🎟️  ${padName(bot)}`,
    separator,
    ``,
  ].join('\n');
}

function buildSingleWinnerReveal(name, userId, prize, totalEntries) {
  return [
    ``,
    `## 🏆 WE HAVE A WINNER!`,
    ``,
    `\`══════════════════════\``,
    `🎊  🎊  🎊  🎊  🎊  🎊`,
    ``,
    `# 🥇 <@${userId}>`,
    ``,
    `🎊  🎊  🎊  🎊  🎊  🎊`,
    `\`══════════════════════\``,
    ``,
    `**🎁 Prize: ${prize}**`,
    `*Selected from ${totalEntries} ${totalEntries === 1 ? 'entry' : 'entries'} · Powered by 🎰 DropBot*`,
    ``,
  ].join('\n');
}

function buildMultiWinnerReveal(names, userIds, prize, totalEntries) {
  const winnerLines = userIds.map((id, i) => `🥇 <@${id}>`).join('\n');
  return [
    ``,
    `## 🏆 WE HAVE WINNERS!`,
    ``,
    `\`══════════════════════\``,
    `🎊  🎊  🎊  🎊  🎊  🎊`,
    ``,
    winnerLines,
    ``,
    `🎊  🎊  🎊  🎊  🎊  🎊`,
    `\`══════════════════════\``,
    ``,
    `**🎁 Prize: ${prize}**`,
    `*Selected from ${totalEntries} entries · Powered by 🎰 DropBot*`,
    ``,
  ].join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────

function getRandomSlice(pool, winnerId, step, total, landOnWinner) {
  if (landOnWinner && winnerId) {
    // Final frame — winner is in the middle slot
    const others = pool.filter(n => n !== (pool.find(p => p === winnerId) || ''));
    const top = others[Math.floor(Math.random() * others.length)] || pool[0];
    const bot = others[Math.floor(Math.random() * others.length)] || pool[0];
    const winnerName = pool.find(n => n === winnerId) || pool[0];
    return [top, winnerName, bot];
  }
  // Random frame
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return [
    shuffled[0] || '???',
    shuffled[1] || '???',
    shuffled[2] || shuffled[0] || '???',
  ];
}

function padName(name = '???') {
  const max = 20;
  const str = String(name).slice(0, max);
  return str.padEnd(max, ' ');
}

module.exports = { slotMachineReveal };
