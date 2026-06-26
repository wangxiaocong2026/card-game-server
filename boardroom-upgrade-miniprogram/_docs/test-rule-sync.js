const assert = require("assert");
const engine = require("../engine");

function drainSetup(game, preferPass = false) {
  let guard = 0;
  while (guard < 20 && game.phase !== "playing" && game.phase !== "game_over") {
    guard += 1;
    if (game.phase === "liangzhu") {
      const view = engine.getView(game);
      const candidates = view.trumpCandidates || [];
      const result = preferPass || !candidates.length
        ? engine.passTrump(game)
        : engine.declareTrump(game, candidates[0].suit);
      assert.strictEqual(result.ok, true, result.message);
    } else if (game.phase === "chipai") {
      const view = engine.getView(game);
      const candidates = view.trumpCandidates || [];
      const result = candidates.length ? engine.chipaiTrump(game, candidates[0].suit) : engine.passChipai(game);
      assert.strictEqual(result.ok, true, result.message);
    } else if (game.phase === "koupai") {
      assert.strictEqual(game.bottomPicker, 0, "test helper expects human bottom picker at manual KOUPAI");
      const ids = engine.suggestIds(game);
      assert.strictEqual(ids.length, 4, "koupai suggestion should pick 4 cards");
      const result = engine.buryCards(game, ids);
      assert.strictEqual(result.ok, true, result.message);
    } else if (game.phase === "huanpai") {
      const result = game.liangzhuPlayer === 0 ? engine.shipaiCards(game) : engine.passShipai(game);
      assert.strictEqual(result.ok, true, result.message);
    } else {
      throw new Error(`Unhandled setup phase ${game.phase}`);
    }
  }
  assert.strictEqual(game.phase, "playing", `expected playing, got ${game.phase}`);
}

function playToEnd(game) {
  let guard = 0;
  while (game.phase !== "game_over" && guard < 220) {
    guard += 1;
    if (game.phase === "playing") {
      if (game.currentTurn === 0) {
        const ids = engine.suggestIds(game);
        assert(ids.length > 0, "player should have a suggested play");
        const result = engine.playCards(game, ids);
        assert.strictEqual(result.ok, true, result.message);
      } else {
        const result = engine.stepRobot(game);
        assert.strictEqual(result.ok, true, result.message);
      }
    } else if (game.phase === "koupai") {
      const result = engine.buryCards(game, engine.suggestIds(game));
      assert.strictEqual(result.ok, true, result.message);
    } else if (game.phase === "huanpai") {
      const result = game.liangzhuPlayer === 0 ? engine.shipaiCards(game) : engine.passShipai(game);
      assert.strictEqual(result.ok, true, result.message);
    } else {
      throw new Error(`Unexpected phase while playing: ${game.phase}`);
    }
  }
  assert.strictEqual(game.phase, "game_over", "game should finish");
  assert(game.result, "game result should exist");
  return guard;
}

function c(rank, suit, n = 0) {
  const meta = engine.SUITS[suit];
  if (rank === "BIG" || rank === "SMALL") {
    return {
      id: `${rank}-${n}`,
      rank: "JOKER",
      joker: rank === "BIG" ? "big" : "small",
      suit: "",
      symbol: "★",
      color: rank === "BIG" ? "red" : "black",
      label: rank === "BIG" ? "大王" : "小王"
    };
  }
  return {
    id: `${rank}-${suit}-${n}`,
    rank,
    suit,
    symbol: meta.symbol,
    color: meta.color,
    label: `${rank}${meta.symbol}`
  };
}

function filler(prefix, count, suit = "c") {
  const ranks = ["4", "6", "7", "8", "9", "10", "J", "Q", "K"];
  return Array.from({ length: count }, (_, index) => c(ranks[index % ranks.length], suit, `${prefix}-${index}`));
}

function noPairHand(prefix, count) {
  const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
  const suits = ["c", "d"];
  const cards = [];
  suits.forEach((suit) => {
    ranks.forEach((rank) => {
      cards.push(c(rank, suit, `${prefix}-${suit}-${rank}`));
    });
  });
  return cards.slice(0, count);
}

function testNoFallbackLiangzhu() {
  const game = engine.createGame({ seed: 1001 });
  const view = engine.getView(game);
  assert(view.trumpCandidates.every((item) => item.type !== "level" && item.type !== "fallback"), "level/fallback liangzhu must be removed");
}

function testHumanChipaiAutoReturn() {
  const game = engine.createGame({ seed: 2001 });
  game.phase = "liangzhu";
  game.level = "A";
  game.trumpSuit = "";
  game.bankers = [];
  game.hands = [
    [
      c("6", "s", 1), c("6", "s", 2), c("7", "s", 1), c("7", "s", 2), c("8", "s", 1), c("8", "s", 2),
      ...noPairHand("p0", 20)
    ],
    [c("4", "h", 1), c("4", "h", 2), c("SMALL", "", 1), ...noPairHand("p1", 23)],
    noPairHand("p2", 26),
    noPairHand("p3", 26)
  ];
  game.bottomCards = [c("5", "c", 1), c("9", "d", 1), c("K", "h", 1), c("2", "c", 1)];
  const pass = engine.passTrump(game);
  assert.strictEqual(pass.ok, true, pass.message);
  assert.strictEqual(game.phase, "chipai", "robot liangzhu should wait for human chipai");
  const eat = engine.chipaiTrump(game, "s");
  assert.strictEqual(eat.ok, true, eat.message);
  assert.strictEqual(game.liangzhuPlayer, 0, "human should become liangzhu player after chipai");
  assert.strictEqual(game.chipaiEatenCards.length, 3, "should eat all original liangzhu cards");
  assert.strictEqual(game.chipaiReturnCards.length, 3, "should auto return the same count");
}

function testHuanpaiFlow() {
  const game = engine.createGame({ seed: 3001 });
  game.phase = "koupai";
  game.level = "A";
  game.trumpSuit = "s";
  game.liangzhuPlayer = 0;
  game.bankers = [0, 2];
  game.bottomPicker = 0;
  game.bankerSeat = 0;
  game.hands[0] = [
    c("9", "s", 1), c("9", "h", 1), c("4", "d", 1), c("6", "c", 1),
    c("K", "h", 1), c("Q", "d", 1), ...filler("hp", 24, "c")
  ];
  const result = engine.buryCards(game, game.hands[0].slice(0, 4).map((card) => card.id));
  assert.strictEqual(result.ok, true, result.message);
  assert.strictEqual(game.phase, "huanpai", "burying trump-suit bottom should enter huanpai");
  const shipai = engine.shipaiCards(game);
  assert.strictEqual(shipai.ok, true, shipai.message);
  assert.strictEqual(game.phase, "playing", "shipai should enter playing");
  assert.strictEqual(game.currentTurn, 0, "shipai player should lead after picking bottom");
}

function testPairPlay() {
  const game = engine.createGame({ seed: 4001 });
  game.phase = "playing";
  game.level = "A";
  game.trumpSuit = "h";
  game.bankers = [0, 2];
  game.currentTurn = 0;
  game.currentTrick = [];
  game.hands[0] = [c("7", "s", 1), c("7", "s", 2), ...filler("pair", 24, "c")];
  const result = engine.playCards(game, [game.hands[0][0].id, game.hands[0][1].id]);
  assert.strictEqual(result.ok, true, result.message);
  assert.strictEqual(game.currentTrick[0].cards.length, 2, "pair play should keep two cards");
}

function testFiveFullGames() {
  const turns = [];
  for (let i = 0; i < 5; i += 1) {
    const game = engine.createGame({ seed: 20260624 + i });
    drainSetup(game, i % 2 === 0);
    turns.push(playToEnd(game));
  }
  return turns;
}

testNoFallbackLiangzhu();
testHumanChipaiAutoReturn();
testHuanpaiFlow();
testPairPlay();
const turns = testFiveFullGames();
console.log(JSON.stringify({ ok: true, fullGames: turns.length, turns }));
