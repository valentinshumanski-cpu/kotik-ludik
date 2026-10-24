// Slot math: no DOM here so tests can enumerate every combination.
// Ported from old-version (weighted pick, fixed paytable); symbols and rewards follow GDD v1.

export const SYMBOLS = [
  { id: 'coin', name: 'монетка', weight: 22, img: 'sym-coin' },
  { id: 'yarn', name: 'клубок', weight: 16, img: 'yarn' },
  { id: 'bell', name: 'колокольчик', weight: 10, emoji: '🔔' }, // shortcut: emoji until the bell sprite is generated
  { id: 'fish', name: 'рыбка', weight: 7, img: 'sym-fish' },
  { id: 'paw', name: 'лапка', weight: 6, img: 'sym-paw' },
  { id: 'crystal', name: 'кристалл', weight: 5, emoji: '💎' }, // shortcut: emoji until the crystal sprite is generated
];

// Three of a kind; checked in this order so the most valuable line wins.
const LINES = [
  { id: 'crystal', reward: { crystals: 3 }, text: 'Три кристалла! Джекпот!' },
  { id: 'fish', reward: { fish: 5 }, text: 'Три рыбки! +5 прокруток' },
  { id: 'bell', reward: { coins: 75 }, text: 'Три колокольчика!' },
  { id: 'yarn', reward: { coins: 40 }, text: 'Три клубка!' },
  { id: 'coin', reward: { coins: 25 }, text: 'Три монетки!' },
];
const PAW_LINE = { reward: { coins: 150 }, text: 'Три лапки! Алекс в восторге!' };
const PAIR = { reward: { coins: 6 }, text: 'Пара!' };
// A crystal pair pays a crystal instead of coins, so breeds stay reachable without relying on the rare jackpot.
const CRYSTAL_PAIR = { reward: { crystals: 1 }, text: 'Пара кристаллов!' };

const TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

export function pickSymbol(random = Math.random) {
  let roll = random() * TOTAL_WEIGHT;
  for (const symbol of SYMBOLS) {
    roll -= symbol.weight;
    if (roll < 0) return symbol.id;
  }
  return SYMBOLS[SYMBOLS.length - 1].id;
}

export const spinReels = (random = Math.random) => [pickSymbol(random), pickSymbol(random), pickSymbol(random)];

// Paw is wild: it completes any line or pair. Returns rewards plus which reels took part.
export function evaluate(reels) {
  const paws = reels.filter((id) => id === 'paw').length;
  const winners = (id) => reels.map((r, i) => (r === id || r === 'paw' ? i : -1)).filter((i) => i >= 0);
  if (paws === 3) return { kind: 'paw', ...PAW_LINE, winners: [0, 1, 2] };
  for (const line of LINES) {
    const n = reels.filter((id) => id === line.id).length;
    if (n > 0 && n + paws === 3) return { kind: line.id, reward: line.reward, text: line.text, winners: winners(line.id) };
  }
  for (const { id } of [...SYMBOLS].reverse()) { // rarest first, so a crystal pair beats a coin pair
    const n = reels.filter((r) => r === id).length;
    if (id !== 'paw' && n > 0 && n + paws >= 2) return { kind: 'pair', ...(id === 'crystal' ? CRYSTAL_PAIR : PAIR), winners: winners(id) };
  }
  return { kind: 'none', reward: {}, text: 'Мимо. Ещё разок?', winners: [] };
}

// Exact expectation over all 6^3 outcomes (used by tests and for balancing).
export function expectation() {
  const totals = { coins: 0, fish: 0, crystals: 0, crystalChance: 0, winChance: 0 };
  for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
    const p = (a.weight * b.weight * c.weight) / TOTAL_WEIGHT ** 3;
    const { reward, kind } = evaluate([a.id, b.id, c.id]);
    totals.coins += p * (reward.coins || 0);
    totals.fish += p * (reward.fish || 0);
    totals.crystals += p * (reward.crystals || 0);
    if (kind === 'crystal') totals.crystalChance += p;
    if (kind !== 'none') totals.winChance += p;
  }
  return totals;
}
