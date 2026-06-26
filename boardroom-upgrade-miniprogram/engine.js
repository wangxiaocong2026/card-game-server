const SUITS = {
  s: { symbol: "♠", name: "黑桃", color: "black" },
  h: { symbol: "♥", name: "红桃", color: "red" },
  c: { symbol: "♣", name: "梅花", color: "black" },
  d: { symbol: "♦", name: "方块", color: "red" }
};

const SUIT_ORDER = { s: 0, h: 1, c: 2, d: 3 };
const RANK_ORDER = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  "10": 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2
};
const FIXED_TRUMPS = ["5", "3", "2"];
const FIXED_TRUMP_ORDER = { "5": 0, "3": 1, "2": 2 };
const LEVEL_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SEAT_NAMES = ["玩家", "机器人2", "机器人3", "机器人4"];
const POSITION_BY_SEAT = ["bottom", "left", "top", "right"];

function rng(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCard(rank, suit, deck, serial) {
  if (rank === "BIG") {
    return { id: `big-${deck}-${serial}`, rank: "JOKER", joker: "big", suit: "", symbol: "★", color: "red", label: "大王" };
  }
  if (rank === "SMALL") {
    return { id: `small-${deck}-${serial}`, rank: "JOKER", joker: "small", suit: "", symbol: "★", color: "black", label: "小王" };
  }
  const meta = SUITS[suit];
  return {
    id: `${rank}-${suit}-${deck}-${serial}`,
    rank,
    suit,
    symbol: meta.symbol,
    color: meta.color,
    label: `${rank}${meta.symbol}`
  };
}

function cloneCard(card) {
  return { ...card };
}

function createDeck() {
  const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
  const cards = [];
  let serial = 0;
  for (let deck = 0; deck < 2; deck += 1) {
    Object.keys(SUITS).forEach((suit) => {
      ranks.forEach((rank) => {
        cards.push(makeCard(rank, suit, deck, serial++));
      });
    });
    cards.push(makeCard("SMALL", "", deck, serial++));
    cards.push(makeCard("BIG", "", deck, serial++));
  }
  return cards;
}

function shuffle(cards, seed) {
  const random = rng(seed);
  const result = cards.map(cloneCard);
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function cardPoint(card) {
  if (card.rank === "5") return 5;
  if (card.rank === "10" || card.rank === "K") return 10;
  return 0;
}

function isTrump(card, level, trumpSuit) {
  if (!card) return false;
  if (card.rank === "JOKER") return true;
  if (card.rank === level) return true;
  if (FIXED_TRUMPS.includes(card.rank)) return true;
  return Boolean(trumpSuit && card.suit === trumpSuit);
}

function trumpSortKey(card, level, trumpSuit) {
  if (card.rank === "JOKER") return card.joker === "big" ? 0 : 1;
  if (card.rank === level) return 10 + (card.suit === trumpSuit ? 0 : 1 + (SUIT_ORDER[card.suit] || 0));
  if (FIXED_TRUMPS.includes(card.rank)) return 20 + FIXED_TRUMP_ORDER[card.rank] * 10 + (SUIT_ORDER[card.suit] || 0);
  if (card.suit === trumpSuit) return 60 + (14 - (RANK_ORDER[card.rank] || 0));
  return 99;
}

function compareCardsForDisplay(a, b, level, trumpSuit) {
  const aTrump = isTrump(a, level, trumpSuit);
  const bTrump = isTrump(b, level, trumpSuit);
  const groupA = aTrump ? 0 : 1 + (SUIT_ORDER[a.suit] ?? 9);
  const groupB = bTrump ? 0 : 1 + (SUIT_ORDER[b.suit] ?? 9);
  if (groupA !== groupB) return groupA - groupB;
  if (aTrump) return trumpSortKey(a, level, trumpSuit) - trumpSortKey(b, level, trumpSuit);
  return (RANK_ORDER[b.rank] || 0) - (RANK_ORDER[a.rank] || 0);
}

function sortHand(cards, game) {
  cards.sort((a, b) => compareCardsForDisplay(a, b, game.level, game.trumpSuit));
}

function findCardLocation(game, predicate) {
  for (let seat = 0; seat < game.hands.length; seat += 1) {
    const index = game.hands[seat].findIndex(predicate);
    if (index >= 0) return { area: "hand", seat, index };
  }
  const bottomIndex = game.bottomCards.findIndex(predicate);
  if (bottomIndex >= 0) return { area: "bottom", seat: -1, index: bottomIndex };
  return null;
}

function ensurePlayerCard(game, predicate) {
  if (game.hands[0].some(predicate)) return;
  const location = findCardLocation(game, predicate);
  if (!location) return;
  const playerIndex = game.hands[0].findIndex((card) => cardPoint(card) === 0 && card.rank !== "JOKER");
  const swapIndex = playerIndex >= 0 ? playerIndex : 0;
  if (location.area === "hand") {
    [game.hands[0][swapIndex], game.hands[location.seat][location.index]] = [game.hands[location.seat][location.index], game.hands[0][swapIndex]];
  } else {
    [game.hands[0][swapIndex], game.bottomCards[location.index]] = [game.bottomCards[location.index], game.hands[0][swapIndex]];
  }
}

function createGame(options = {}) {
  const seed = options.seed || 20260624;
  const shuffled = shuffle(createDeck(), seed);
  const bottomCards = shuffled.slice(0, 4);
  const hands = [[], [], [], []];
  shuffled.slice(4).forEach((card, index) => {
    hands[index % 4].push(card);
  });
  const levels = options.levels ? [...options.levels] : ["A", "A"];
  const bankers = Array.isArray(options.bankers) && options.bankers.length
    ? [...options.bankers]
    : [];
  const level = bankers.length ? levels[bankers[0] % 2] : "A";

  const game = {
    seed,
    levels,
    level,
    phase: "liangzhu",
    trumpSuit: "",
    pendingTrumpSuit: "",
    liangzhuCandidates: [],
    chipaiPassed: [],
    chipaiResult: null,
    chipaiTargetSeat: -1,
    chipaiActorSeat: -1,
    chipaiEatenCards: [],
    chipaiReturnCards: [],
    chipaiReturnTargetSeat: -1,
    chipaiWinnerCards: [],
    huanpaiOffer: [],
    huanpaiPickedCards: [],
    huanpaiReturnCards: [],
    bankers,
    bankerSeat: -1,
    bottomPicker: -1,
    liangzhuPlayer: -1,
    liangzhuCards: [],
    liangzhuType: "",
    liangzhuPriority: 99,
    bottomCards,
    pickedBottomCards: [],
    buriedCards: [],
    hands,
    scores: { defenders: 0 },
    baseScore: 50,
    bottomPenalty: 0,
    result: null,
    currentTurn: 0,
    currentTrick: [],
    lastTrick: [],
    lastWinner: -1,
    playedCards: [],
    trickNumber: 1,
    selectedMessage: "",
    gameIndex: options.gameIndex || 1
  };

  ensurePlayerCard(game, (card) => card.rank === game.level && card.suit === "h");
  ensurePlayerCard(game, (card) => card.rank === "JOKER" && card.joker === "big");
  ensurePlayerCard(game, (card) => card.rank === "JOKER" && card.joker === "small");
  hands.forEach((hand) => sortHand(hand, game));
  return game;
}

function getTrumpCandidates(game) {
  const candidates = findLiangzhuCandidates(game.hands[0], game);
  const available = game.phase === "chipai"
    ? candidates.filter((candidate) => candidate.priority < (game.liangzhuPriority || 99))
    : candidates;
  const bestBySuit = new Map();
  available.forEach((candidate) => {
    const current = bestBySuit.get(candidate.suit);
    if (!current || candidate.priority < current.priority || candidate.cards.length > current.cards.length) {
      bestBySuit.set(candidate.suit, candidate);
    }
  });
  const list = bestBySuit.size ? [...bestBySuit.values()] : [];
  return list.map((candidate) => ({
    suit: candidate.suit,
    symbol: SUITS[candidate.suit].symbol,
    name: SUITS[candidate.suit].name,
    color: SUITS[candidate.suit].color,
    cards: candidate.cards.map(cloneCard),
    type: candidate.type,
    priority: candidate.priority,
    label: `${SUITS[candidate.suit].symbol} ${SUITS[candidate.suit].name}`,
    detail: candidate.text
  }));
}

function oppositeSeat(seat) {
  return (seat + 2) % 4;
}

function sameTeam(a, b) {
  return a >= 0 && b >= 0 && a % 2 === b % 2;
}

function isBankerSeat(game, seat) {
  return Array.isArray(game.bankers) && game.bankers.includes(seat);
}

function setBankersAfterLiangzhu(game, seat) {
  if (game.gameIndex === 1 || !game.bankers.length) {
    game.bankers = [seat, oppositeSeat(seat)];
  }
  return game.bankers;
}

function getKoupaiPicker(game) {
  if (!game.bankers.length) return 0;
  const candidates = game.bankers.filter((seat) => seat !== game.liangzhuPlayer);
  const pool = candidates.length ? candidates : game.bankers;
  if (pool.includes(0)) return 0;
  return pool[0];
}

function firstBottomSuit(game) {
  const card = game.bottomCards.find((item) => item.suit);
  return card ? card.suit : "s";
}

function sameFacePairCards(cards) {
  return findPairs(cards.filter((card) => card.rank !== "JOKER"));
}

function findPairChains(pairList) {
  const sorted = [...pairList].sort((a, b) => (RANK_ORDER[a[0].rank] || 0) - (RANK_ORDER[b[0].rank] || 0));
  const chains = [];
  let current = [];
  sorted.forEach((pair) => {
    const rank = RANK_ORDER[pair[0].rank] || 0;
    const prev = current.length ? (RANK_ORDER[current[current.length - 1][0].rank] || 0) : null;
    if (!current.length || rank === prev + 1) {
      current.push(pair);
    } else {
      if (current.length >= 2) chains.push([...current]);
      current = [pair];
    }
  });
  if (current.length >= 2) chains.push([...current]);
  return chains;
}

function findLiangzhuCandidates(hand, game) {
  const jokers = hand.filter((card) => card.rank === "JOKER");
  const pairs = sameFacePairCards(hand);
  const candidates = [];
  const pairByKey = new Set();

  const addCandidate = (type, cards, suit, priority, text) => {
    if (!suit || !SUITS[suit]) return;
    const ids = new Set();
    const uniqueCards = [];
    cards.forEach((card) => {
      if (!card || ids.has(card.id)) return;
      ids.add(card.id);
      uniqueCards.push(card);
    });
    if (!uniqueCards.length) return;
    candidates.push({ type, cards: uniqueCards, suit, priority, text });
  };

  const pairGroupsBySuit = {};
  pairs.forEach((pair) => {
    const suit = pair[0].suit;
    if (!pairGroupsBySuit[suit]) pairGroupsBySuit[suit] = [];
    pairGroupsBySuit[suit].push(pair);
  });

  Object.keys(pairGroupsBySuit).forEach((suit) => {
    findPairChains(pairGroupsBySuit[suit]).forEach((chain) => {
      if (chain.length >= 3) {
        addCandidate("duolian", chain.flat(), suit, 1, `${chain.length}连对`);
      }
      if (chain.length >= 2 && jokers.length) {
        addCandidate("shuanglian", [...chain.slice(0, 2).flat(), jokers[0]], suit, 3, "司令+双连对");
      }
    });
  });

  if (jokers.length >= 3) {
    pairs.forEach((pair) => {
      const key = `${pair[0].rank}-${pair[0].suit}`;
      if (pairByKey.has(key)) return;
      pairByKey.add(key);
      addCandidate("threeking", jokers.slice(0, 3), pair[0].suit, 2, `三王定${SUITS[pair[0].suit].name}`);
    });
  }

  pairs.forEach((pair) => {
    const key = `${pair[0].rank}-${pair[0].suit}`;
    if (pairByKey.has(`danlian-${key}`)) return;
    pairByKey.add(`danlian-${key}`);
    if (jokers.length) {
      addCandidate("danlian", [pair[0], pair[1], jokers[0]], pair[0].suit, 4, "司令+对子");
    }
  });

  return candidates.sort((a, b) => a.priority - b.priority || b.cards.length - a.cards.length);
}

function bestLiangCandidate(game, seat, suit, minPriority = Infinity) {
  const candidates = findLiangzhuCandidates(game.hands[seat], game)
    .filter((candidate) => candidate.suit === suit && candidate.priority < minPriority);
  return candidates[0] || null;
}

function resetTrickState(game, starter) {
  game.phase = "playing";
  game.currentTurn = starter;
  game.currentTrick = [];
  game.lastTrick = [];
  game.lastWinner = -1;
  game.trickNumber = 1;
}

function startPlayingAfterBottom(game, starter, message) {
  game.huanpaiOffer = [];
  resetTrickState(game, starter);
  game.selectedMessage = message || `${SEAT_NAMES[starter]}先出牌`;
}

function finishKoupai(game, messagePrefix) {
  const offer = game.trumpSuit && game.liangzhuPlayer >= 0
    ? game.buriedCards.filter((card) => card.suit === game.trumpSuit && card.rank !== "JOKER")
    : [];
  game.huanpaiOffer = offer.map(cloneCard);
  game.huanpaiPickedCards = [];
  game.huanpaiReturnCards = [];
  if (offer.length) {
    game.phase = "huanpai";
    game.currentTurn = game.liangzhuPlayer;
    game.selectedMessage = `${messagePrefix || "已扣底"}，${SEAT_NAMES[game.liangzhuPlayer]}可拾亮主花色底牌：${plainCards(offer)}`;
    return;
  }
  startPlayingAfterBottom(game, game.bottomPicker, `${messagePrefix || "已扣底"}，${SEAT_NAMES[game.bottomPicker]}先出牌`);
}

function beginBottomPick(game, picker) {
  game.bottomPicker = picker;
  game.bankerSeat = picker;
  game.pickedBottomCards = game.bottomCards.map(cloneCard);
  game.hands[picker].push(...game.bottomCards);
  game.bottomCards = [];
  sortHand(game.hands[picker], game);

  if (picker === 0) {
    game.phase = "koupai";
    game.selectedMessage = `已拾底：${plainCards(game.pickedBottomCards)}，请选择4张扣回底牌`;
    return;
  }

  autoBuryBanker(game);
}

function recordLiangCandidate(game, seat, candidate) {
  const entry = {
    seat,
    cards: candidate.cards.map(cloneCard),
    type: candidate.type,
    priority: candidate.priority,
    suit: candidate.suit
  };
  game.liangzhuCandidates = (game.liangzhuCandidates || []).filter((item) => item.seat !== seat);
  game.liangzhuCandidates.push(entry);
  return entry;
}

function handStrength(game, seat) {
  return game.hands[seat].reduce((sum, card) => {
    const trumpBonus = isTrump(card, game.level, game.trumpSuit) ? 8 : 0;
    return sum + cardPoint(card) * 5 + trumpBonus + (RANK_ORDER[card.rank] || 0);
  }, 0);
}

function candidateSortValue(game, seat, candidate) {
  return candidate.priority * 1000 - candidate.cards.length * 20 - handStrength(game, seat) / 10;
}

function bestCandidateForSeats(game, seats, maxPriority = Infinity) {
  const options = [];
  seats.forEach((seat) => {
    findLiangzhuCandidates(game.hands[seat], game)
      .filter((candidate) => candidate.priority < maxPriority)
      .forEach((candidate) => {
        options.push({ seat, candidate, value: candidateSortValue(game, seat, candidate) });
      });
  });
  return options.sort((a, b) => a.value - b.value || a.seat - b.seat)[0] || null;
}

function declareTrumpForSeat(game, seat, suit, options = {}) {
  if (game.phase !== "liangzhu") return { ok: false, message: "当前不能亮主" };
  if (!SUITS[suit]) return { ok: false, message: "请选择主花色" };
  const candidate = bestLiangCandidate(game, seat, suit);
  if (!candidate) return { ok: false, message: "没有符合规则的亮主牌型" };
  game.trumpSuit = suit;
  game.pendingTrumpSuit = "";
  recordLiangCandidate(game, seat, candidate);
  game.chipaiPassed = [];
  game.chipaiResult = null;
  game.chipaiTargetSeat = -1;
  game.chipaiActorSeat = -1;
  game.chipaiEatenCards = [];
  game.chipaiReturnCards = [];
  game.chipaiReturnTargetSeat = -1;
  game.chipaiWinnerCards = [];
  game.liangzhuPlayer = seat;
  game.liangzhuCards = candidate.cards.map(cloneCard);
  game.liangzhuType = candidate.type;
  game.liangzhuPriority = candidate.priority;
  setBankersAfterLiangzhu(game, seat);
  game.phase = "chipai";
  game.pendingTrumpSuit = suit;
  game.chipaiTargetSeat = seat;
  game.chipaiActorSeat = sameTeam(seat, 0) ? -1 : 0;
  if (options.waitForPlayerChipai && seat !== 0 && !sameTeam(seat, 0)) {
    game.selectedMessage = `${SEAT_NAMES[seat]}亮主 ${SUITS[suit].symbol}${SUITS[suit].name}，请选择是否吃主`;
    return { ok: true, message: game.selectedMessage, waitForChipai: true };
  }
  return resolveChipaiRobotsOrConfirm(game, `${SEAT_NAMES[seat]}亮主 ${SUITS[suit].symbol}${SUITS[suit].name}`);
}

function declareTrump(game, suit) {
  return declareTrumpForSeat(game, 0, suit);
}

function autoRobotDeclare(game) {
  const best = bestCandidateForSeats(game, [1, 2, 3]);
  if (!best) return null;
  return declareTrumpForSeat(game, best.seat, best.candidate.suit, { waitForPlayerChipai: !sameTeam(best.seat, 0) });
}

function passTrump(game) {
  if (game.phase !== "liangzhu") return { ok: false, message: "当前不能不亮" };
  const robot = autoRobotDeclare(game);
  if (robot && robot.ok) return robot;

  game.trumpSuit = firstBottomSuit(game);
  game.liangzhuPlayer = -1;
  if (!game.bankers.length) game.bankers = [0, 2];
  const picker = getKoupaiPicker(game);
  beginBottomPick(game, picker);
  const trump = SUITS[game.trumpSuit];
  game.selectedMessage = `无人亮主，翻底定主 ${trump.symbol}${trump.name}，${SEAT_NAMES[picker]}拾底`;
  return { ok: true, message: game.selectedMessage };
}

function canChipai(game) {
  return game.phase === "chipai"
    && game.chipaiActorSeat === 0
    && game.chipaiTargetSeat >= 0
    && !sameTeam(game.chipaiTargetSeat, 0);
}

function confirmTrumpAfterChipai(game) {
  const picker = getKoupaiPicker(game);
  beginBottomPick(game, picker);
  game.selectedMessage = `${SEAT_NAMES[game.liangzhuPlayer]}亮主确认，${SEAT_NAMES[picker]}拾底`;
  return { ok: true, message: game.selectedMessage };
}

function removeCardsFromSeat(game, seat, cards) {
  const next = removeCardsByIds(game.hands[seat], cards.map((card) => card.id));
  game.hands[seat] = next.kept;
  return next.removed;
}

function selectReturnCards(game, bigSeat, eatenCards, bigLiangCards) {
  const totalNeeded = eatenCards.length;
  const jokerNeed = eatenCards.filter((card) => card.rank === "JOKER").length;
  const eatenSuit = eatenCards.find((card) => card.rank !== "JOKER")?.suit || "";
  const protectedIds = new Set((bigLiangCards || []).map((card) => card.id));
  const available = game.hands[bigSeat].filter((card) => !protectedIds.has(card.id));
  const selected = [];
  const used = new Set();
  const takeFrom = (cards, countLimit = totalNeeded) => {
    lowestCards(cards.filter((card) => !used.has(card.id)), game).forEach((card) => {
      if (selected.length >= countLimit) return;
      selected.push(card);
      used.add(card.id);
    });
  };

  takeFrom(available.filter((card) => isTrump(card, game.level, game.trumpSuit)), jokerNeed);
  takeFrom(available.filter((card) => eatenSuit && card.suit === eatenSuit && !isTrump(card, game.level, game.trumpSuit)));
  takeFrom(available.filter((card) => !isTrump(card, game.level, game.trumpSuit)));
  takeFrom(available.filter((card) => isTrump(card, game.level, game.trumpSuit)));
  return selected.slice(0, totalNeeded);
}

function executeChipai(game, claimerSeat, candidate) {
  const originalSeat = game.liangzhuPlayer;
  const originalCards = game.liangzhuCards.map(cloneCard);
  const claimerCards = candidate.cards.map(cloneCard);
  recordLiangCandidate(game, claimerSeat, candidate);

  const realEaten = removeCardsFromSeat(game, originalSeat, originalCards);
  game.hands[claimerSeat].push(...realEaten.map(cloneCard));

  game.trumpSuit = candidate.suit;
  game.pendingTrumpSuit = "";
  game.liangzhuPlayer = claimerSeat;
  game.liangzhuCards = claimerCards.map(cloneCard);
  game.liangzhuType = candidate.type;
  game.liangzhuPriority = candidate.priority;
  setBankersAfterLiangzhu(game, claimerSeat);

  const returnCards = selectReturnCards(game, claimerSeat, realEaten, claimerCards);
  const returned = removeCardsFromSeat(game, claimerSeat, returnCards);
  game.hands[originalSeat].push(...returned.map(cloneCard));
  sortHand(game.hands[claimerSeat], game);
  sortHand(game.hands[originalSeat], game);

  game.chipaiResult = { bigSeat: claimerSeat, smallSeat: originalSeat };
  game.chipaiEatenCards = realEaten.map(cloneCard);
  game.chipaiReturnCards = returned.map(cloneCard);
  game.chipaiReturnTargetSeat = originalSeat;
  game.chipaiWinnerCards = claimerCards.map(cloneCard);
  game.chipaiTargetSeat = -1;
  game.chipaiActorSeat = -1;
  game.phase = "koupai";

  const message = `${SEAT_NAMES[claimerSeat]}吃主成功，吃到${plainCards(realEaten)}，返牌${plainCards(returned) || "无"}`;
  const picker = getKoupaiPicker(game);
  beginBottomPick(game, picker);
  game.selectedMessage = `${message}，${SEAT_NAMES[picker]}拾底`;
  return { ok: true, message: game.selectedMessage, chipai: true };
}

function resolveChipaiRobotsOrConfirm(game, prefix = "") {
  if (game.phase !== "chipai" || game.liangzhuPlayer < 0) {
    return { ok: false, message: "当前不是吃牌阶段" };
  }
  const liangTeam = game.liangzhuPlayer % 2;
  const opponents = [0, 1, 2, 3].filter((seat) => seat % 2 !== liangTeam);
  const pendingHuman = opponents.includes(0) && !(game.chipaiPassed || []).includes(0);
  const robotSeats = opponents.filter((seat) => seat !== 0 && !(game.chipaiPassed || []).includes(seat));
  if (pendingHuman) {
    game.chipaiActorSeat = 0;
    game.selectedMessage = `${prefix || SEAT_NAMES[game.liangzhuPlayer] + "亮主"}，请选择是否吃主`;
    return { ok: true, message: game.selectedMessage, waitForChipai: true };
  }
  const best = bestCandidateForSeats(game, robotSeats, game.liangzhuPriority || 99);
  if (best) {
    return executeChipai(game, best.seat, best.candidate);
  }
  game.chipaiPassed = [...new Set([...(game.chipaiPassed || []), ...robotSeats])];
  return confirmTrumpAfterChipai(game);
}

function chipaiReturnCandidates(game) {
  if (game.phase !== "fanpai" || game.chipaiReturnTargetSeat < 0) return [];
  const eaten = game.chipaiEatenCards || [];
  const eatenSuit = eaten.find((card) => card.rank !== "JOKER")?.suit || "";
  const winningIds = new Set((game.chipaiWinnerCards || []).map((card) => card.id));
  return game.hands[0].filter((card) => {
    if (winningIds.has(card.id)) return false;
    if (eaten.some((item) => item.rank === "JOKER")) {
      if (isFixedReturnTrump(card, game)) return true;
    }
    if (eatenSuit && card.suit === eatenSuit && !isTrump(card, game.level, game.trumpSuit)) return true;
    return false;
  });
}

function isFixedReturnTrump(card, game) {
  if (card.rank === "JOKER") return true;
  if (card.rank === game.level) return card.suit !== game.trumpSuit;
  if (FIXED_TRUMPS.includes(card.rank)) return card.suit !== game.trumpSuit;
  return false;
}

function validateChipaiReturn(game, cards) {
  const eaten = game.chipaiEatenCards || [];
  if (cards.length !== eaten.length) return { ok: false, message: `请返${eaten.length}张牌` };

  const jokerNeed = eaten.filter((card) => card.rank === "JOKER").length;
  const eatenSuitCounts = {};
  eaten.filter((card) => card.rank !== "JOKER").forEach((card) => {
    eatenSuitCounts[card.suit] = (eatenSuitCounts[card.suit] || 0) + 1;
  });

  const selectedCounts = {};
  cards.forEach((card) => {
    if (isFixedReturnTrump(card, game)) {
      selectedCounts.trump = (selectedCounts.trump || 0) + 1;
    }
    if (!isTrump(card, game.level, game.trumpSuit) && card.suit) {
      selectedCounts[card.suit] = (selectedCounts[card.suit] || 0) + 1;
    }
  });

  if ((selectedCounts.trump || 0) < jokerNeed) return { ok: false, message: `吃到司令，需要返${jokerNeed}张固定主牌` };
  for (const [suit, count] of Object.entries(eatenSuitCounts)) {
    if ((selectedCounts[suit] || 0) < count) {
      return { ok: false, message: `吃到${SUITS[suit].name}副牌，需要返${count}张同花色副牌` };
    }
  }
  return { ok: true, message: "" };
}

function finishChipaiReturn(game, returnCards) {
  const targetSeat = game.chipaiReturnTargetSeat;
  removeCardsFromSeat(game, 0, returnCards);
  game.hands[targetSeat].push(...returnCards.map(cloneCard));
  game.chipaiReturnCards = returnCards.map(cloneCard);
  sortHand(game.hands[0], game);
  sortHand(game.hands[targetSeat], game);
  game.chipaiTargetSeat = -1;
  game.chipaiActorSeat = -1;
  game.chipaiReturnTargetSeat = -1;
  const picker = getKoupaiPicker(game);
  beginBottomPick(game, picker);
  game.selectedMessage = `已返牌给${SEAT_NAMES[targetSeat]}：${plainCards(returnCards)}，${SEAT_NAMES[picker]}拾底`;
  return { ok: true, message: game.selectedMessage };
}

function chipaiTrump(game, suit) {
  if (!canChipai(game)) return { ok: false, message: "当前不能吃主" };
  if (!SUITS[suit]) return { ok: false, message: "请选择吃主花色" };
  const candidate = bestLiangCandidate(game, 0, suit, game.liangzhuPriority || 99);
  if (!candidate || candidate.priority >= (game.liangzhuPriority || 99)) {
    return { ok: false, message: "吃主牌型必须大于当前亮主牌型" };
  }
  return executeChipai(game, 0, candidate);
}

function returnChipaiCards(game, ids) {
  if (game.phase !== "fanpai" || game.chipaiReturnTargetSeat < 0) return { ok: false, message: "当前不能返牌" };
  if (!Array.isArray(ids) || !ids.length) return { ok: false, message: "请选择要返的牌" };
  const cards = cardsByIds(game, ids);
  if (cards.length !== ids.length) return { ok: false, message: "返牌选择已失效，请重新选择" };
  const winningIds = new Set((game.chipaiWinnerCards || []).map((card) => card.id));
  if (cards.some((card) => winningIds.has(card.id))) return { ok: false, message: "吃主亮出的牌不能返回去" };
  const valid = validateChipaiReturn(game, cards);
  if (!valid.ok) return valid;
  return finishChipaiReturn(game, cards);
}

function passChipai(game) {
  if (!canChipai(game)) return { ok: false, message: "当前不能不吃" };
  game.chipaiPassed = [...new Set([...(game.chipaiPassed || []), 0])];
  game.chipaiActorSeat = -1;
  return resolveChipaiRobotsOrConfirm(game, "你选择不吃");
}

function cardsByIds(game, ids) {
  const wanted = new Set(ids);
  return game.hands[0].filter((card) => wanted.has(card.id));
}

function cardsByIdsForSeat(game, seat, ids) {
  const wanted = new Set(ids);
  return game.hands[seat].filter((card) => wanted.has(card.id));
}

function removeCardsByIds(cards, ids) {
  const wanted = new Set(ids);
  const removed = [];
  const kept = [];
  cards.forEach((card) => {
    if (wanted.has(card.id)) removed.push(card);
    else kept.push(card);
  });
  return { kept, removed };
}

function cardsByIdsFrom(cards, ids) {
  const wanted = new Set(ids);
  return cards.filter((card) => wanted.has(card.id));
}

function sameRankCounts(cards) {
  const counts = {};
  cards.forEach((card) => {
    counts[card.rank] = (counts[card.rank] || 0) + 1;
  });
  return counts;
}

function rankCountsCover(cards, requiredCards) {
  const have = sameRankCounts(cards);
  const need = sameRankCounts(requiredCards);
  return Object.entries(need).every(([rank, count]) => (have[rank] || 0) >= count);
}

function removeCardInstances(cards, removeCards) {
  const wanted = new Set(removeCards.map((card) => card.id));
  return cards.filter((card) => !wanted.has(card.id));
}

function huanpaiReturnCandidates(game, pickCards = game.huanpaiOffer || []) {
  if (game.phase !== "huanpai" || game.liangzhuPlayer < 0) return [];
  const need = sameRankCounts(pickCards);
  return game.hands[game.liangzhuPlayer].filter((card) => (need[card.rank] || 0) > 0);
}

function autoShipaiChoice(game, seat) {
  const offer = [...(game.huanpaiOffer || [])].sort((a, b) => compareCardsForDisplay(a, b, game.level, game.trumpSuit));
  const hand = game.hands[seat];
  const picks = [];
  const returns = [];
  const used = new Set();
  offer.forEach((offerCard) => {
    const candidates = lowestCards(hand.filter((card) => card.rank === offerCard.rank && !used.has(card.id)), game);
    if (!candidates.length) return;
    picks.push(offerCard);
    returns.push(candidates[0]);
    used.add(candidates[0].id);
  });
  return { picks, returns };
}

function passShipai(game) {
  if (game.phase !== "huanpai") return { ok: false, message: "当前不能跳过拾牌" };
  game.huanpaiPickedCards = [];
  game.huanpaiReturnCards = [];
  startPlayingAfterBottom(game, game.bottomPicker, `${SEAT_NAMES[game.liangzhuPlayer]}未拾底牌，${SEAT_NAMES[game.bottomPicker]}先出牌`);
  return { ok: true, message: game.selectedMessage };
}

function shipaiCards(game, pickIds = null, returnIds = null) {
  if (game.phase !== "huanpai") return { ok: false, message: "当前不是拾牌阶段" };
  const seat = game.liangzhuPlayer;
  if (seat < 0) return passShipai(game);
  let pickCards;
  let returnCards;
  if (Array.isArray(pickIds) && pickIds.length) {
    pickCards = cardsByIdsFrom(game.huanpaiOffer || [], pickIds);
    returnCards = cardsByIdsForSeat(game, seat, returnIds || []);
  } else {
    const choice = autoShipaiChoice(game, seat);
    pickCards = choice.picks;
    returnCards = choice.returns;
  }
  if (!pickCards.length) return passShipai(game);
  if (pickCards.length !== returnCards.length) return { ok: false, message: `拾${pickCards.length}张牌，需要还${pickCards.length}张同点数牌` };
  if (!rankCountsCover(returnCards, pickCards)) return { ok: false, message: "还牌必须和拾牌点数一致" };

  const offerCounts = new Map();
  (game.huanpaiOffer || []).forEach((card) => offerCounts.set(card.id, (offerCounts.get(card.id) || 0) + 1));
  for (const card of pickCards) {
    if (!offerCounts.get(card.id)) return { ok: false, message: "拾的牌不在可拾底牌中" };
    offerCounts.set(card.id, offerCounts.get(card.id) - 1);
  }

  const nextHand = removeCardsByIds(game.hands[seat], returnCards.map((card) => card.id));
  if (nextHand.removed.length !== returnCards.length) return { ok: false, message: "还的牌不在手中" };
  game.hands[seat] = nextHand.kept;
  game.hands[seat].push(...pickCards.map(cloneCard));
  game.buriedCards = removeCardInstances(game.buriedCards, pickCards);
  game.buriedCards.push(...returnCards.map(cloneCard));
  game.huanpaiPickedCards = pickCards.map(cloneCard);
  game.huanpaiReturnCards = returnCards.map(cloneCard);
  game.bottomPicker = seat;
  sortHand(game.hands[seat], game);
  startPlayingAfterBottom(game, seat, `${SEAT_NAMES[seat]}拾底：${plainCards(pickCards)}，返牌：${plainCards(returnCards)}`);
  return { ok: true, message: game.selectedMessage };
}

function autoShipaiCards(game) {
  if (game.phase !== "huanpai") return { ok: false, message: "当前不是拾牌阶段" };
  return shipaiCards(game);
}

function buryCards(game, ids) {
  if (game.phase !== "koupai") return { ok: false, message: "当前不能扣底" };
  if (!Array.isArray(ids) || ids.length !== 4) {
    return { ok: false, message: `请选择4张扣底，当前已选${ids ? ids.length : 0}张` };
  }
  const cards = cardsByIds(game, ids);
  if (cards.length !== 4) return { ok: false, message: "扣底牌不在手牌中，请重新选择" };
  const next = removeCardsByIds(game.hands[0], ids);
  game.hands[0] = next.kept;
  game.buriedCards = next.removed.map(cloneCard);
  game.bottomPicker = 0;
  game.bankerSeat = 0;
  sortHand(game.hands[0], game);
  finishKoupai(game, `已扣底：${plainCards(game.buriedCards)}`);
  if (game.phase === "huanpai" && game.liangzhuPlayer !== 0) {
    autoShipaiCards(game);
  }
  return { ok: true, message: game.selectedMessage };
}

function chooseBuryCards(game, seat) {
  return [...game.hands[seat]]
    .sort((a, b) => cardPoint(a) - cardPoint(b) || compareCardsForDisplay(b, a, game.level, game.trumpSuit))
    .slice(0, 4);
}

function autoBuryBanker(game) {
  game.phase = "koupai";
  const picker = game.bottomPicker >= 0 ? game.bottomPicker : getKoupaiPicker(game);
  game.bottomPicker = picker;
  game.bankerSeat = picker;
  const cards = chooseBuryCards(game, picker);
  const ids = cards.map((card) => card.id);
  const next = removeCardsByIds(game.hands[picker], ids);
  game.hands[picker] = next.kept;
  game.buriedCards = next.removed.map(cloneCard);
  sortHand(game.hands[picker], game);
  finishKoupai(game, `${SEAT_NAMES[picker]}已拾底并扣底：${plainCards(game.buriedCards)}`);
  if (game.phase === "huanpai" && game.liangzhuPlayer !== 0) {
    autoShipaiCards(game);
  }
}

function playClass(card, game) {
  return isTrump(card, game.level, game.trumpSuit) ? "trump" : card.suit;
}

function cardFaceKey(card) {
  if (card.rank === "JOKER") return `JOKER-${card.joker}`;
  return `${card.rank}-${card.suit}`;
}

function isPair(cards) {
  return cards.length === 2 && cardFaceKey(cards[0]) === cardFaceKey(cards[1]);
}

function groupByFace(cards) {
  const groups = new Map();
  cards.forEach((card) => {
    const key = cardFaceKey(card);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  });
  return groups;
}

function findPairs(cards) {
  const groups = groupByFace(cards);
  return [...groups.values()].filter((group) => group.length >= 2).map((group) => group.slice(0, 2));
}

function countPairs(cards) {
  let pairs = 0;
  for (const group of groupByFace(cards).values()) {
    pairs += Math.floor(group.length / 2);
  }
  return pairs;
}

function getTrumpRank(card, game) {
  if (card.rank === "JOKER") return card.joker === "big" ? 100 : 99;
  if (card.rank === game.level) return 80 + (card.suit === game.trumpSuit ? 10 : 0);
  if (card.rank === "5") return 60 + (card.suit === game.trumpSuit ? 10 : 0);
  if (card.rank === "3") return 40 + (card.suit === game.trumpSuit ? 10 : 0);
  if (card.rank === "2") return 20 + (card.suit === game.trumpSuit ? 10 : 0);
  if (game.trumpSuit && card.suit === game.trumpSuit) return RANK_ORDER[card.rank] || 0;
  return 0;
}

function sequenceRank(card) {
  if (card.rank === "JOKER") return card.joker === "big" ? 100 : 99;
  return RANK_ORDER[card.rank] || 0;
}

function isConsecutivePairs(cards, game) {
  if (cards.length < 4 || cards.length % 2 !== 0) return false;
  const groups = [...groupByFace(cards).values()];
  if (groups.some((group) => group.length !== 2)) return false;
  if (cards.some((card) => card.rank === "JOKER")) return false;

  const classes = new Set(cards.map((card) => playClass(card, game)));
  if (classes.size !== 1) return false;

  const ranks = groups.map((group) => sequenceRank(group[0])).sort((a, b) => a - b);
  for (let i = 1; i < ranks.length; i += 1) {
    if (ranks[i] !== ranks[i - 1] + 1) return false;
  }
  return true;
}

function determinePlayType(cards, game) {
  if (!cards.length) return null;
  const allTrump = cards.every((card) => isTrump(card, game.level, game.trumpSuit));
  const prefix = allTrump ? "zhu" : "fu";
  const count = cards.length;

  if (count === 1) return allTrump ? "zhudan" : "fudan";
  if (count === 2) return isPair(cards) ? `${prefix}dui` : `${prefix}san`;

  const pairCount = countPairs(cards);
  if (count >= 4 && count % 2 === 0) {
    if (isConsecutivePairs(cards, game)) return `${prefix}lian${count / 2}`;
    if (pairCount === count / 2) return `${prefix}dui${pairCount}`;
    if (pairCount > 0) return `${prefix}dui${pairCount}_san`;
    return `${prefix}san${count}`;
  }
  if (pairCount > 0) return `${prefix}dui${pairCount}_san`;
  return `${prefix}san${count}`;
}

function playTypePriority(playType) {
  if (!playType) return [0, 0];
  if (playType === "zhudan" || playType === "fudan") return [1, 1];
  if (playType === "zhusan" || playType === "fusan") return [1, 0];
  if (playType === "zhudui" || playType === "fudui") return [2, 1];
  if (playType.startsWith("fulian") || playType.startsWith("zhulian")) {
    const pairCount = Number(playType.replace("fulian", "").replace("zhulian", "")) || 2;
    return [100 + pairCount, 0];
  }
  if (playType.includes("_san")) {
    const pairCount = Number(playType.split("dui")[1].split("_san")[0]) || 0;
    return [10 + pairCount, 1];
  }
  if (playType.includes("dui")) {
    const pairCount = Number(playType.split("dui")[1]) || 0;
    return [20 + pairCount, 0];
  }
  if (playType.includes("san")) return [5, 0];
  return [0, 0];
}

function comparePriority(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

function compareTrumpCards(a, b, game) {
  const aRank = getTrumpRank(a, game);
  const bRank = getTrumpRank(b, game);
  if (aRank !== bRank) return aRank > bRank;
  if (game.trumpSuit) {
    if (a.suit === game.trumpSuit && b.suit !== game.trumpSuit) return true;
    if (a.suit !== game.trumpSuit && b.suit === game.trumpSuit) return false;
  }
  return false;
}

function compareOutcards(cards1, cards2, game) {
  if (!cards1.length && !cards2.length) return false;
  if (!cards2.length) return true;
  if (!cards1.length) return false;
  if (cards1.length !== cards2.length) return cards1.length > cards2.length;

  const type1 = determinePlayType(cards1, game);
  const type2 = determinePlayType(cards2, game);
  const priorityCompare = comparePriority(playTypePriority(type1), playTypePriority(type2));
  if (priorityCompare !== 0) return priorityCompare > 0;

  const allTrump1 = cards1.every((card) => isTrump(card, game.level, game.trumpSuit));
  const allTrump2 = cards2.every((card) => isTrump(card, game.level, game.trumpSuit));
  const hasTrump1 = cards1.some((card) => isTrump(card, game.level, game.trumpSuit));
  const hasTrump2 = cards2.some((card) => isTrump(card, game.level, game.trumpSuit));

  if (allTrump1 && !allTrump2) return true;
  if (!allTrump1 && allTrump2) return false;
  if (hasTrump1 && !hasTrump2) return true;
  if (!hasTrump1 && hasTrump2) return false;

  if (allTrump1 && allTrump2) {
    const max1 = [...cards1].sort((a, b) => getTrumpRank(b, game) - getTrumpRank(a, game))[0];
    const max2 = [...cards2].sort((a, b) => getTrumpRank(b, game) - getTrumpRank(a, game))[0];
    if (getTrumpRank(max1, game) !== getTrumpRank(max2, game)) {
      return getTrumpRank(max1, game) > getTrumpRank(max2, game);
    }
    return compareTrumpCards(max1, max2, game);
  }

  if (cards1[0].suit !== cards2[0].suit) return false;
  return Math.max(...cards1.map((card) => RANK_ORDER[card.rank] || 0)) > Math.max(...cards2.map((card) => RANK_ORDER[card.rank] || 0));
}

function trickCardPower(card, leadClass, game) {
  if (isTrump(card, game.level, game.trumpSuit)) return 1000 + getTrumpRank(card, game);
  if (leadClass !== "trump" && card.suit === leadClass) return 100 + (RANK_ORDER[card.rank] || 0);
  return RANK_ORDER[card.rank] || 0;
}

function topTrumpCards(cards, count, game) {
  return [...cards]
    .sort((a, b) => getTrumpRank(b, game) - getTrumpRank(a, game))
    .slice(0, count);
}

function lowestCards(cards, game) {
  return [...cards].sort((a, b) => {
    const pointDelta = cardPoint(a) - cardPoint(b);
    if (pointDelta !== 0) return pointDelta;
    return trickCardPower(a, playClass(a, game), game) - trickCardPower(b, playClass(b, game), game);
  });
}

function leadPairCount(cards, game) {
  const type = determinePlayType(cards, game) || "";
  if (type === "zhudui" || type === "fudui") return 1;
  if (type.startsWith("zhulian") || type.startsWith("fulian")) {
    return Number(type.replace("zhulian", "").replace("fulian", "")) || 2;
  }
  if (type.includes("dui")) {
    const fragment = type.split("dui")[1].split("_san")[0];
    return Number(fragment) || 1;
  }
  return 0;
}

function chooseFollowCards(game, seat, leadCards) {
  const hand = game.hands[seat];
  const count = leadCards.length || 1;
  const firstType = determinePlayType(leadCards, game);
  const pairNeed = leadPairCount(leadCards, game);

  if (leadCards.every((card) => isTrump(card, game.level, game.trumpSuit))) {
    const trumpCards = hand.filter((card) => isTrump(card, game.level, game.trumpSuit));
    const must = Math.min(trumpCards.length, count);
    let selected = [];
    const pairs = findPairs(trumpCards)
      .sort((a, b) => trickCardPower(a[0], "trump", game) - trickCardPower(b[0], "trump", game));
    if (pairNeed > 0 && pairs.length) {
      for (const pair of pairs.slice(0, Math.min(pairNeed, pairs.length))) selected.push(...pair);
    } else if ((firstType === "zhudui" || firstType?.startsWith("zhulian")) && !pairs.length) {
      selected = topTrumpCards(trumpCards, must, game);
    }
    const used = new Set(selected.map((card) => card.id));
    for (const card of lowestCards(trumpCards.filter((card) => !used.has(card.id)), game)) {
      if (selected.length >= must) break;
      selected.push(card);
    }
    for (const card of lowestCards(hand.filter((card) => !used.has(card.id) && !selected.some((item) => item.id === card.id)), game)) {
      if (selected.length >= Math.min(count, hand.length)) break;
      selected.push(card);
    }
    return selected.slice(0, Math.min(count, hand.length));
  }

  const leadSuit = leadCards[0].suit;
  const sameSuitFu = hand.filter((card) => card.suit === leadSuit && !isTrump(card, game.level, game.trumpSuit));
  const must = Math.min(sameSuitFu.length, count);
  let selected = [];
  const sameSuitPairs = findPairs(sameSuitFu)
    .sort((a, b) => trickCardPower(a[0], leadSuit, game) - trickCardPower(b[0], leadSuit, game));
  if (pairNeed > 0 && sameSuitPairs.length) {
    for (const pair of sameSuitPairs.slice(0, Math.min(pairNeed, sameSuitPairs.length))) selected.push(...pair);
  }
  const used = new Set(selected.map((card) => card.id));
  for (const card of lowestCards(sameSuitFu.filter((card) => !used.has(card.id)), game)) {
    if (selected.length >= must) break;
    selected.push(card);
  }
  for (const card of lowestCards(hand.filter((card) => !used.has(card.id) && !selected.some((item) => item.id === card.id)), game)) {
    if (selected.length >= Math.min(count, hand.length)) break;
    selected.push(card);
  }
  return selected.slice(0, Math.min(count, hand.length));
}

function chooseLeadCards(game, seat) {
  const hand = game.hands[seat];
  const nonTrump = hand.filter((card) => !isTrump(card, game.level, game.trumpSuit));
  const pairOptions = findPairs(nonTrump).sort((a, b) => {
    const strongDelta = (RANK_ORDER[b[0].rank] || 0) - (RANK_ORDER[a[0].rank] || 0);
    if (strongDelta !== 0) return strongDelta;
    return cardPoint(a[0]) - cardPoint(b[0]);
  });
  const strongPair = pairOptions.find((pair) => (RANK_ORDER[pair[0].rank] || 0) >= 12 && pair.reduce((sum, card) => sum + cardPoint(card), 0) < 20);
  if (strongPair) return strongPair;

  const likelyMax = [...nonTrump]
    .filter((card) => ["A", "K", "Q"].includes(card.rank))
    .sort((a, b) => (RANK_ORDER[b.rank] || 0) - (RANK_ORDER[a.rank] || 0));
  if (likelyMax.length) return [likelyMax[0]];

  const suits = Object.keys(SUITS).filter((suit) => suit !== game.trumpSuit);
  for (const suit of suits.sort((a, b) => {
    const aCount = nonTrump.filter((card) => card.suit === a).length;
    const bCount = nonTrump.filter((card) => card.suit === b).length;
    return aCount - bCount;
  })) {
    const candidates = lowestCards(nonTrump.filter((card) => card.suit === suit && cardPoint(card) === 0), game);
    if (candidates.length) return [candidates[0]];
  }

  const anyNonTrump = lowestCards(nonTrump, game);
  if (anyNonTrump.length) return [anyNonTrump[0]];
  return [lowestCards(hand, game)[0]].filter(Boolean);
}

function chooseRobotCards(game, seat, leadCards) {
  if (!leadCards.length) return chooseLeadCards(game, seat);
  return chooseFollowCards(game, seat, leadCards);
}

function chooseSuggestedCards(game, seat = 0) {
  const leadCards = game.currentTrick.length ? game.currentTrick[0].cards : [];
  return chooseRobotCards(game, seat, leadCards);
}

function addPlay(game, seat, cards) {
  game.currentTrick.push({ seat, cards: cards.map(cloneCard) });
  game.playedCards = game.playedCards || [];
  game.playedCards.push(...cards.map(cloneCard));
  const ids = cards.map((card) => card.id);
  const next = removeCardsByIds(game.hands[seat], ids);
  game.hands[seat] = next.kept;
}

function expectedPlayCount(game) {
  return game.currentTrick.length ? game.currentTrick[0].cards.length : 1;
}

function finishTrick(game) {
  const lead = game.currentTrick[0];
  let winner = lead.seat;
  let bestCards = lead.cards;
  game.currentTrick.slice(1).forEach((play) => {
    if (compareOutcards(play.cards, bestCards, game)) {
      bestCards = play.cards;
      winner = play.seat;
    }
  });
  const points = game.currentTrick.flatMap((play) => play.cards).reduce((sum, card) => sum + cardPoint(card), 0);
  if (!isBankerSeat(game, winner)) {
    game.scores.defenders += points;
  }
  game.lastTrick = game.currentTrick.map((play) => ({ seat: play.seat, cards: play.cards.map(cloneCard) }));
  game.lastWinner = winner;
  game.currentTrick = [];
  game.currentTurn = winner;
  game.trickNumber += 1;
  if (game.hands.every((hand) => hand.length === 0)) {
    const buriedPoints = game.buriedCards.reduce((sum, card) => sum + cardPoint(card), 0);
    const winningPlay = game.lastTrick.find((play) => play.seat === winner);
    const winnerTrumpCount = winningPlay
      ? winningPlay.cards.filter((card) => isTrump(card, game.level, game.trumpSuit)).length
      : 0;
    const bottomMultiplier = winnerTrumpCount > 0 ? Math.ceil(winnerTrumpCount / 2) : 0;
    const bottomScoreDelta = buriedPoints * bottomMultiplier;
    const defendersWonLast = !isBankerSeat(game, winner);
    game.bottomPenalty = defendersWonLast ? bottomScoreDelta : 0;
    game.bankerGuardScore = defendersWonLast ? 0 : bottomScoreDelta;
    if (defendersWonLast) {
      game.scores.defenders += game.bottomPenalty;
    } else if (game.bankerGuardScore > 0) {
      game.scores.defenders = Math.max(0, game.scores.defenders - game.bankerGuardScore);
    }
    const settlement = settleGame(game, buriedPoints, bottomMultiplier);
    game.result = {
      defenderScore: game.scores.defenders,
      bottomPenalty: game.bottomPenalty,
      bankerGuardScore: game.bankerGuardScore,
      bottomBaseScore: buriedPoints,
      bottomMultiplier,
      baseScore: game.baseScore,
      bankerSideWon: settlement.winnerTeam === "banker",
      levels: settlement.levels,
      winnerTeam: settlement.winnerTeam,
      nextBankers: settlement.nextBankers,
      nextLevels: [...game.levels]
    };
    game.phase = "game_over";
    if (game.bottomPenalty > 0) {
      game.selectedMessage = `本局结束：闲家倒扣${game.bottomPenalty}分，${settlement.label}`;
    } else if (game.bankerGuardScore > 0) {
      game.selectedMessage = `本局结束：庄家保底扣回${game.bankerGuardScore}分，${settlement.label}`;
    } else {
      game.selectedMessage = `本局结束：底牌${buriedPoints}分，${settlement.label}`;
    }
  } else {
    game.selectedMessage = `${SEAT_NAMES[winner]} 本轮最大，继续出牌`;
  }
  return winner;
}

function submitPlay(game, seat, cards) {
  addPlay(game, seat, cards);
  if (game.currentTrick.length >= 4) {
    return finishTrick(game);
  }
  game.currentTurn = (seat + 1) % 4;
  return -1;
}

function advanceLevelName(level, steps) {
  const index = LEVEL_ORDER.indexOf(level);
  const start = index >= 0 ? index : 0;
  return LEVEL_ORDER[(start + steps) % LEVEL_ORDER.length];
}

function settleGame(game, bottomBaseScore, bottomMultiplier) {
  let levels = 0;
  let winnerTeam = "banker";
  let resultType = "sheng1";

  if (game.scores.defenders === 0) {
    levels = 4;
    resultType = "光头";
  } else if (game.scores.defenders < 40) {
    levels = 2;
    resultType = "小光";
  } else if (game.scores.defenders < 80) {
    levels = 1;
    resultType = "庄家升级";
  } else if (game.scores.defenders < 120) {
    levels = 0;
    winnerTeam = "defender";
    resultType = "闲家上台";
  } else if (game.scores.defenders < 160) {
    levels = 1;
    winnerTeam = "defender";
    resultType = "闲家上台升1级";
  } else if (game.scores.defenders < 200) {
    levels = 2;
    winnerTeam = "defender";
    resultType = "闲家上台升2级";
  } else {
    levels = 4;
    winnerTeam = "defender";
    resultType = "闲家大胜升4级";
  }

  const bankerTeam = game.bankers.length ? game.bankers[0] % 2 : 0;
  const defenderTeam = bankerTeam === 0 ? 1 : 0;
  const winnerTeamIndex = winnerTeam === "banker" ? bankerTeam : defenderTeam;

  if (levels > 0) {
    game.levels[winnerTeamIndex] = advanceLevelName(game.levels[winnerTeamIndex], levels);
  }

  if (winnerTeam === "defender") {
    game.bankers = [winnerTeamIndex, winnerTeamIndex + 2].filter((seat) => seat < 4);
  }

  return {
    levels,
    winnerTeam,
    winnerTeamIndex,
    resultType,
    nextBankers: [...game.bankers],
    bottomBaseScore,
    bottomMultiplier,
    label: `${resultType}，下一局打${game.levels[game.bankers[0] % 2]}`
  };
}

function advanceToPlayerTurn(game) {
  let guard = 0;
  while (game.phase === "playing" && game.currentTurn !== 0 && guard < 16) {
    stepRobot(game);
    guard += 1;
  }
  return game.currentTurn;
}

function stepRobot(game) {
  if (game.phase !== "playing" || game.currentTurn === 0) {
    return { ok: false, message: game.phase === "playing" ? "轮到玩家出牌" : "当前不是出牌阶段" };
  }
  const seat = game.currentTurn;
  const cards = chooseSuggestedCards(game, seat);
  if (!cards.length) return { ok: false, message: `${SEAT_NAMES[seat]}无可出牌` };
  submitPlay(game, seat, cards);
  return { ok: true, seat, cards: cards.map(cloneCard), message: "" };
}

function containsCards(selected, required) {
  const selectedCounts = new Map();
  selected.forEach((card) => selectedCounts.set(cardFaceKey(card), (selectedCounts.get(cardFaceKey(card)) || 0) + 1));
  for (const card of required) {
    const key = cardFaceKey(card);
    const count = selectedCounts.get(key) || 0;
    if (count <= 0) return false;
    selectedCounts.set(key, count - 1);
  }
  return true;
}

function validateFollow(game, seat, played, firstCards) {
  const hand = game.hands[seat];
  const count = firstCards.length;
  if (played.length > count) return { ok: false, message: `出牌数量不能多于首家${count}张` };
  if (played.length < count && hand.length >= count) return { ok: false, message: `本轮需要出${count}张牌` };

  const firstType = determinePlayType(firstCards, game);
  const firstAllTrump = firstCards.every((card) => isTrump(card, game.level, game.trumpSuit));
  const pairNeed = leadPairCount(firstCards, game);

  if (firstAllTrump) {
    const playedTrump = played.filter((card) => isTrump(card, game.level, game.trumpSuit));
    const handTrump = hand.filter((card) => isTrump(card, game.level, game.trumpSuit));
    const mustPlayTrump = Math.min(handTrump.length, count);
    if (playedTrump.length < mustPlayTrump) {
      return { ok: false, message: `有主牌必须先出主牌，需出${mustPlayTrump}张` };
    }

    if (pairNeed > 0 && mustPlayTrump > 0) {
      const handTrumpPairs = findPairs(handTrump);
      const playedTrumpPairs = findPairs(playedTrump);
      if (handTrumpPairs.length && playedTrumpPairs.length < Math.min(pairNeed, handTrumpPairs.length) && playedTrump.length >= 2) {
        return { ok: false, message: "有主对必须出主对" };
      }
      if (!handTrumpPairs.length && (firstType === "zhudui" || firstType?.startsWith("zhulian"))) {
        const requiredTop = topTrumpCards(handTrump, mustPlayTrump, game);
        if (!containsCards(playedTrump, requiredTop)) {
          return { ok: false, message: `无主对时必须出最大的主牌：${plainCards(requiredTop)}` };
        }
      }
    }
    return { ok: true, message: "" };
  }

  const leadSuit = firstCards[0].suit;
  const handSameSuit = hand.filter((card) => card.suit === leadSuit && !isTrump(card, game.level, game.trumpSuit));
  const playedSameSuit = played.filter((card) => card.suit === leadSuit && !isTrump(card, game.level, game.trumpSuit));
  const playedTrump = played.filter((card) => isTrump(card, game.level, game.trumpSuit));
  const mustPlaySuit = Math.min(handSameSuit.length, count);
  if (playedSameSuit.length < mustPlaySuit) {
    return { ok: false, message: `有同花色副牌必须跟同花色，需出${mustPlaySuit}张` };
  }
  if (playedTrump.length && handSameSuit.length > playedSameSuit.length) {
    return { ok: false, message: "有同花色副牌时不可用主牌替代" };
  }
  if (pairNeed > 0 && handSameSuit.length >= 2) {
    const handPairs = findPairs(handSameSuit);
    const playedPairs = findPairs(playedSameSuit);
    if (handPairs.length && playedPairs.length < Math.min(pairNeed, handPairs.length) && played.length >= 2) {
      return { ok: false, message: "有同花色对子必须出对子" };
    }
  }
  return { ok: true, message: "" };
}

function playCards(game, ids) {
  if (game.phase !== "playing") return { ok: false, message: "当前不能出牌" };
  if (game.currentTurn !== 0) return { ok: false, message: "请等待玩家出牌" };
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, message: "请选择要出的牌" };
  const cards = cardsByIds(game, ids);
  if (cards.length !== ids.length) return { ok: false, message: "出牌选择已失效，请重新选择" };
  if (!game.currentTrick.length) {
    if (!determinePlayType(cards, game)) return { ok: false, message: "出牌牌型不合法" };
  } else {
    const valid = validateFollow(game, 0, cards, game.currentTrick[0].cards);
    if (!valid.ok) return { ok: false, message: valid.message };
  }
  const winner = submitPlay(game, 0, cards);
  return { ok: true, message: game.phase === "game_over" ? game.selectedMessage : "已出牌", winner: game.currentTurn };
}

function suggestIds(game) {
  if (game.phase === "fanpai") {
    const candidates = chipaiReturnCandidates(game);
    const eaten = game.chipaiEatenCards || [];
    const chosen = [];
    const used = new Set();
    const jokerNeed = eaten.filter((card) => card.rank === "JOKER").length;
    const eatenSuitCounts = {};
    eaten.filter((card) => card.rank !== "JOKER").forEach((card) => {
      eatenSuitCounts[card.suit] = (eatenSuitCounts[card.suit] || 0) + 1;
    });

    const fixed = lowestCards(candidates.filter((card) => isFixedReturnTrump(card, game)), game).slice(0, jokerNeed);
    fixed.forEach((card) => {
      chosen.push(card);
      used.add(card.id);
    });
    Object.entries(eatenSuitCounts).forEach(([suit, count]) => {
      lowestCards(candidates.filter((card) => card.suit === suit && !used.has(card.id)), game)
        .slice(0, count)
        .forEach((card) => {
          chosen.push(card);
          used.add(card.id);
        });
    });
    return chosen.slice(0, eaten.length).map((card) => card.id);
  }
  if (game.phase === "huanpai") {
    return [];
  }
  if (game.phase === "koupai") {
    return [...game.hands[0]]
      .sort((a, b) => cardPoint(a) - cardPoint(b) || compareCardsForDisplay(b, a, game.level, game.trumpSuit))
      .slice(0, 4)
      .map((card) => card.id);
  }
  if (game.phase === "playing") {
    return chooseSuggestedCards(game, 0).map((card) => card.id);
  }
  return [];
}

function nextGame(game) {
  const nextBankers = game.bankers.length ? [...game.bankers] : [0, 2];
  return createGame({
    seed: game.seed + 1,
    gameIndex: game.gameIndex + 1,
    levels: [...game.levels],
    bankers: nextBankers
  });
}

function plainCards(cards) {
  return cards.map((card) => card.label).join(" ");
}

function visiblePlayed(game) {
  const result = { top: [], left: [], right: [], bottom: [] };
  const plays = game.currentTrick.length ? game.currentTrick : game.lastTrick;
  plays.forEach((play) => {
    result[POSITION_BY_SEAT[play.seat]] = play.cards.map(cloneCard);
  });
  return result;
}

function playerView(game, seat) {
  const isBanker = isBankerSeat(game, seat);
  return {
    seat,
    name: SEAT_NAMES[seat],
    count: game.hands[seat].length,
    role: isBanker ? "庄" : "闲",
    side: seat === 0 ? "我" : seat === 2 ? "队友" : "对手"
  };
}

function cardRankKey(card) {
  if (card.rank === "JOKER") return card.joker === "big" ? "大王" : "小王";
  return card.rank;
}

function recorderCounts(game) {
  const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2", "小王", "大王"];
  const counts = {};
  ranks.forEach((rank) => {
    counts[rank] = rank.includes("王") ? 2 : 8;
  });
  (game.playedCards || []).forEach((card) => {
    const key = cardRankKey(card);
    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] = Math.max(0, counts[key] - 1);
    }
  });
  return ranks.map((rank) => ({ rank, count: counts[rank] }));
}

function phaseLabel(game) {
  if (game.phase === "liangzhu") return "亮主";
  if (game.phase === "chipai") return "吃主";
  if (game.phase === "fanpai") return "返牌";
  if (game.phase === "huanpai") return "拾牌";
  if (game.phase === "koupai") return "扣底";
  if (game.phase === "playing") return "出牌中";
  if (game.phase === "game_over") return "结束";
  return "等待";
}

function centerMessage(game, selectedCount) {
  if (game.phase === "liangzhu") return "亮主阶段：请选择主花色";
  if (game.phase === "chipai") return "吃主阶段：请选择花色吃主，或选择不吃";
  if (game.phase === "fanpai") return `吃主成功：请选择${(game.chipaiEatenCards || []).length}张返给${SEAT_NAMES[game.chipaiReturnTargetSeat]}`;
  if (game.phase === "huanpai") return `${SEAT_NAMES[game.liangzhuPlayer]}可拾亮主花色底牌`;
  if (game.phase === "koupai") return `整理底牌：请选择4张扣回底牌，还需扣${Math.max(0, 4 - selectedCount)}张`;
  if (game.phase === "playing") {
    return game.currentTurn === 0 ? `轮到你出牌 · 第${game.trickNumber}轮` : "等待玩家出牌";
  }
  if (game.bankerGuardScore > 0) return `本局结束 · 庄家保底${game.bankerGuardScore}分`;
  return `本局结束 · 闲家倒扣${game.bottomPenalty || 0}分`;
}

function handPrompt(game, selectedCount) {
  if (game.phase === "liangzhu") return "选择下方花色按钮亮主，也可不亮";
  if (game.phase === "chipai") return `${SEAT_NAMES[game.chipaiTargetSeat]}已亮 ${game.pendingTrumpSuit ? SUITS[game.pendingTrumpSuit].symbol + SUITS[game.pendingTrumpSuit].name : "主"}，可选择花色吃主`;
  if (game.phase === "fanpai") return `已吃：${plainCards(game.chipaiEatenCards || [])} · 可返：${plainCards(chipaiReturnCandidates(game))} · 已选${selectedCount}张`;
  if (game.phase === "huanpai") return `可拾底牌：${plainCards(game.huanpaiOffer || [])} · 拾后需还同点数牌`;
  if (game.phase === "koupai") return `已拾底牌：${plainCards(game.pickedBottomCards)} · 已选${selectedCount}张`;
  if (game.phase === "playing") return `已选${selectedCount}张 · ${game.currentTurn === 0 ? "按规则跟牌或出牌" : "等待其他玩家行动"}`;
  if (game.result) {
    return `本局完成 · 底牌${game.result.bottomBaseScore || 0}分 × ${game.result.bottomMultiplier || 0} · 下一局打${game.levels[game.bankers[0] % 2]}`;
  }
  return `本局完成 · 闲家倒扣${game.bottomPenalty || 0}分 · 可开始下一局`;
}

function getView(game, selectedIds = new Set()) {
  const trump = game.trumpSuit ? SUITS[game.trumpSuit] : null;
  const bankerTeam = game.bankers.length ? game.bankers[0] % 2 : 0;
  const myTeam = 0;
  const otherTeam = 1;
  return {
    phase: game.phase,
    phaseLabel: phaseLabel(game),
    center: centerMessage(game, selectedIds.size),
    teamLevel: game.levels[myTeam],
    opponentLevel: game.levels[otherTeam],
    score: String(game.scores.defenders),
    baseScore: String(game.baseScore),
    bottomPenalty: game.bottomPenalty,
    bankerGuardScore: game.bankerGuardScore || 0,
    bankers: [...game.bankers],
    bankerTeam,
    bottomPicker: game.bottomPicker,
    result: game.result,
    level: game.level,
    trumpLabel: trump ? `${trump.symbol} ${trump.name}` : game.pendingTrumpSuit ? `${SUITS[game.pendingTrumpSuit].symbol} ${SUITS[game.pendingTrumpSuit].name}` : "待定",
    trumpColor: trump ? trump.color : "black",
    hand: game.hands[0].map(cloneCard),
    pickedBottomCards: game.pickedBottomCards.map(cloneCard),
    buriedCards: game.buriedCards.map(cloneCard),
    huanpaiOffer: (game.huanpaiOffer || []).map(cloneCard),
    huanpaiPickedCards: (game.huanpaiPickedCards || []).map(cloneCard),
    huanpaiReturnCards: (game.huanpaiReturnCards || []).map(cloneCard),
    chipaiEatenCards: (game.chipaiEatenCards || []).map(cloneCard),
    chipaiReturnCards: (game.chipaiReturnCards || []).map(cloneCard),
    chipaiReturnCandidates: chipaiReturnCandidates(game).map(cloneCard),
    played: visiblePlayed(game),
    players: {
      me: playerView(game, 0),
      left: playerView(game, 1),
      top: playerView(game, 2),
      right: playerView(game, 3)
    },
    recorderCounts: recorderCounts(game),
    trumpCandidates: getTrumpCandidates(game),
    handPrompt: handPrompt(game, selectedIds.size),
    canChipai: canChipai(game),
    canFanpai: game.phase === "fanpai",
    canShipai: game.phase === "huanpai" && game.liangzhuPlayer === 0,
    canKoupai: game.phase === "koupai",
    canPlay: game.phase === "playing" && game.currentTurn === 0,
    canSuggest: game.phase === "fanpai" || game.phase === "koupai" || game.phase === "playing",
    gameIndex: game.gameIndex
  };
}

module.exports = {
  SUITS,
  SEAT_NAMES,
  createGame,
  declareTrump,
  passTrump,
  chipaiTrump,
  returnChipaiCards,
  passChipai,
  buryCards,
  shipaiCards,
  passShipai,
  playCards,
  advanceToPlayerTurn,
  stepRobot,
  suggestIds,
  nextGame,
  getView,
  plainCards,
  sortHand,
  isTrump
};
