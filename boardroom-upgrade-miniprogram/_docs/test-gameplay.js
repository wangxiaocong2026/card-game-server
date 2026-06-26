const assert = require("assert");
const engine = require("../engine");

let cardSerial = 0;
function makeTestCard(rank, suit = "") {
  cardSerial += 1;
  if (rank === "BIG" || rank === "SMALL") {
    return {
      id: `${rank}-${cardSerial}`,
      rank: "JOKER",
      joker: rank === "BIG" ? "big" : "small",
      suit: "",
      symbol: "★",
      color: rank === "BIG" ? "red" : "black",
      label: rank === "BIG" ? "大王" : "小王"
    };
  }
  const meta = engine.SUITS[suit];
  return {
    id: `${rank}-${suit}-${cardSerial}`,
    rank,
    suit,
    symbol: meta.symbol,
    color: meta.color,
    label: `${rank}${meta.symbol}`
  };
}

function advanceUntilPlayer(game, limit = 40) {
  let guard = 0;
  while (game.phase === "playing" && game.currentTurn !== 0 && guard < limit) {
    const result = engine.stepRobot(game);
    assert.strictEqual(result.ok, true, result.message);
    guard += 1;
  }
}

function finishSetup(game) {
  let guard = 0;
  while (game.phase !== "playing" && game.phase !== "game_over" && guard < 20) {
    guard += 1;
    if (game.phase === "koupai") {
      assert.strictEqual(game.bottomPicker, 0, "manual setup helper expects player to bury");
      const result = engine.buryCards(game, engine.suggestIds(game));
      assert.strictEqual(result.ok, true, result.message);
    } else if (game.phase === "huanpai") {
      const result = game.liangzhuPlayer === 0 ? engine.shipaiCards(game) : engine.passShipai(game);
      assert.strictEqual(result.ok, true, result.message);
    } else if (game.phase === "chipai") {
      const result = engine.passChipai(game);
      assert.strictEqual(result.ok, true, result.message);
    } else {
      break;
    }
  }
}

function playTwoRounds(seed) {
  let game = engine.createGame({ seed });
  let view = engine.getView(game);

  assert.strictEqual(view.phase, "liangzhu", "new game should start at liangzhu");
  assert.strictEqual(view.teamLevel, "A", "our side should start from A");
  assert.strictEqual(view.opponentLevel, "A", "opponent side should start from A");
  assert.strictEqual(view.baseScore, "50", "HUD should expose base score");
  assert.ok(view.trumpCandidates.length > 0, "player should have trump choices");

  const trump = view.trumpCandidates[0];
  let result = engine.declareTrump(game, trump.suit);
  assert.strictEqual(result.ok, true, result.message);
  finishSetup(game);
  view = engine.getView(game);
  assert.strictEqual(view.phase, "playing", "player declaration should let opposite teammate pick and bury automatically");
  assert.strictEqual(game.bankerSeat, 2, "opposite teammate should pick the bottom after player declares trump");
  assert.strictEqual(view.pickedBottomCards.length, 4, "view should keep the picked bottom cards for display");
  assert.strictEqual(view.buriedCards.length, 4, "opposite teammate should bury four cards automatically");
  assert.strictEqual(view.players.me.count, 26, "player should not receive bottom cards when opposite teammate picks them");
  assert.strictEqual(view.players.me.role, "庄", "declarer side should be banker side on the first game");
  assert.strictEqual(view.players.left.role, "闲", "non-banker players should be marked as defenders");
  assert.strictEqual(view.players.top.role, "庄", "opposite teammate should be marked as banker and pick bottom");
  assert.strictEqual(view.players.right.role, "闲", "non-banker players should be marked as defenders");

  if (game.currentTurn !== 0) {
    advanceUntilPlayer(game);
    view = engine.getView(game);
  }
  assert.strictEqual(game.currentTurn, 0, "engine should advance until player can respond");

  const beforeRound1 = view.players.me.count;
  result = engine.playCards(game, engine.suggestIds(game));
  assert.strictEqual(result.ok, true, result.message);
  view = engine.getView(game);
  assert.ok(view.players.me.count < beforeRound1, "first play should remove a card");
  assert.ok(view.played.bottom.length || view.played.left.length || view.played.top.length || view.played.right.length, "table should show played cards");

  if (game.currentTurn !== 0) {
    advanceUntilPlayer(game);
    view = engine.getView(game);
  }
  assert.strictEqual(game.currentTurn, 0, "engine should advance until player can act again");

  const beforeRound2 = view.players.me.count;
  result = engine.playCards(game, engine.suggestIds(game));
  assert.strictEqual(result.ok, true, result.message);
  view = engine.getView(game);
  assert.ok(view.players.me.count < beforeRound2, "second play should remove a card");

  return {
    seed,
    trump: view.trumpLabel,
    phase: view.phase,
    playerCards: view.players.me.count,
    defenderScore: view.score,
    buried: engine.plainCards(view.buriedCards),
    lastMessage: game.selectedMessage
  };
}

function playFullGame(seed) {
  const game = engine.createGame({ seed });
  engine.declareTrump(game, engine.getView(game).trumpCandidates[0].suit);
  finishSetup(game);
  let guard = 0;
  while (game.phase !== "game_over" && guard < 80) {
    if (game.currentTurn !== 0) advanceUntilPlayer(game);
    const ids = engine.suggestIds(game);
    if (!ids.length) break;
    const result = engine.playCards(game, ids);
    assert.strictEqual(result.ok, true, result.message);
    guard += 1;
  }
  const view = engine.getView(game);
  assert.strictEqual(view.phase, "game_over", "full game should reach settlement");
  assert.ok(view.result, "settlement result should exist");
  assert.strictEqual(typeof view.bottomPenalty, "number", "bottom penalty should be numeric");
  assert.ok(view.center.includes("闲家倒扣"), "settlement message should show bottom penalty");
  return {
    seed,
    phase: view.phase,
    defenderScore: view.score,
    bottomPenalty: view.bottomPenalty,
    resultMessage: view.center
  };
}

function testPassThenChipai(seed) {
  const game = engine.createGame({ seed });
  const pass = engine.passTrump(game);
  assert.strictEqual(pass.ok, true, pass.message);
  if (game.phase !== "chipai") {
    assert.strictEqual(game.phase, "koupai", "if nobody can be eaten, passing should move to bottom-pick");
    return { seed, skipped: true, phase: game.phase, message: pass.message };
  }
  let view = engine.getView(game);
  assert.strictEqual(view.canChipai, true, "chipai controls should be enabled");
  const candidate = view.trumpCandidates[0];
  const targetSeat = game.chipaiTargetSeat;
  const targetBefore = game.hands[targetSeat].length;
  const eatenCount = game.liangzhuCards.length;
  const eaten = engine.chipaiTrump(game, candidate.suit);
  assert.strictEqual(eaten.ok, true, eaten.message);
  view = engine.getView(game);
  assert.notStrictEqual(view.phase, "fanpai", "eating trump should auto-return cards in the latest backend flow");
  assert.strictEqual(view.chipaiEatenCards.length, eatenCount, "player should receive the eaten declaration cards");
  assert.strictEqual(view.chipaiReturnCards.length, eatenCount, "auto-return count should match eaten declaration size");
  view = engine.getView(game);
  assert.strictEqual(game.hands[targetSeat].length, targetBefore, "original declarer should receive returned cards");
  return {
    seed,
    eaten: candidate.label,
    eatenCards: engine.plainCards(view.chipaiEatenCards),
    returnedCards: engine.plainCards(view.chipaiReturnCards),
    phase: view.phase,
    message: eaten.message
  };
}

function testChipaiEatsCommanderAndPair() {
  const game = engine.createGame({ seed: 20260630 });
  game.phase = "liangzhu";
  game.level = "A";
  game.hands = [
    [
      makeTestCard("7", "s"), makeTestCard("7", "s"),
      makeTestCard("8", "s"), makeTestCard("8", "s"),
      makeTestCard("BIG"),
      makeTestCard("2", "c"), makeTestCard("3", "d")
    ],
    [
      makeTestCard("Q", "h"), makeTestCard("Q", "h"),
      makeTestCard("SMALL"),
      makeTestCard("4", "c"), makeTestCard("6", "d")
    ],
    [makeTestCard("4", "s"), makeTestCard("5", "c")],
    [makeTestCard("9", "d"), makeTestCard("10", "c")]
  ];
  game.bottomCards = [makeTestCard("2", "s"), makeTestCard("3", "h"), makeTestCard("4", "d"), makeTestCard("5", "c")];
  game.hands.forEach((hand) => engine.sortHand(hand, game));

  const pass = engine.passTrump(game);
  assert.strictEqual(pass.ok, true, pass.message);
  assert.strictEqual(game.phase, "chipai", "robot commander+pair declaration should enter chipai");
  assert.strictEqual(game.liangzhuCards.length, 3, "robot should declare commander plus pair as a group");
  assert.strictEqual(engine.plainCards(game.liangzhuCards), "Q♥ Q♥ 小王");

  const eaten = engine.chipaiTrump(game, "s");
  assert.strictEqual(eaten.ok, true, eaten.message);
  assert.notStrictEqual(game.phase, "fanpai", "eating full declaration group should auto-return cards");
  assert.deepStrictEqual(
    [...game.chipaiEatenCards.map((card) => card.label)].sort(),
    ["Q♥", "Q♥", "小王"].sort(),
    "player should eat the full commander+pair group"
  );
  assert.strictEqual(game.chipaiReturnCards.length, 3, "return count should match eaten declaration group");
  assert.strictEqual(game.hands[1].length, 5, "eaten player should get the same number of returned cards");

  return {
    eaten: engine.plainCards(game.chipaiEatenCards),
    returned: engine.plainCards(game.chipaiReturnCards),
    phase: game.phase,
    message: eaten.message
  };
}

function testPairLead(seed) {
  const game = engine.createGame({ seed });
  game.phase = "playing";
  game.trumpSuit = "h";
  game.bankerSeat = 0;
  game.currentTurn = 0;
  game.currentTrick = [];
  const groups = new Map();
  for (const card of game.hands[0]) {
    const key = card.rank === "JOKER" ? `JOKER-${card.joker}` : `${card.rank}-${card.suit}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  const pair = [...groups.values()].find((cards) => cards.length >= 2).slice(0, 2);
  const before = game.hands[0].length;
  const result = engine.playCards(game, pair.map((card) => card.id));
  assert.strictEqual(result.ok, true, result.message);
  const view = engine.getView(game);
  assert.strictEqual(view.players.me.count, before - 2, "player should be able to lead a pair");
  assert.ok(view.played.bottom.length === 2 || game.lastTrick.some((play) => play.seat === 0 && play.cards.length === 2), "table should retain the pair play");
  return {
    seed,
    pair: engine.plainCards(pair),
    playerCards: view.players.me.count
  };
}

function testRecorderCounts(seed) {
  const game = engine.createGame({ seed });
  let view = engine.getView(game);
  const initialA = view.recorderCounts.find((item) => item.rank === "A").count;
  assert.strictEqual(initialA, 8, "recorder should start from all cards, not visible cards");

  game.phase = "playing";
  game.trumpSuit = "h";
  game.bankerSeat = 0;
  game.currentTurn = 0;
  game.currentTrick = [];
  const ace = game.hands[0].find((card) => card.rank === "A");
  assert.ok(ace, "test hand should contain an ace");
  const result = engine.playCards(game, [ace.id]);
  assert.strictEqual(result.ok, true, result.message);
  view = engine.getView(game);
  const afterA = view.recorderCounts.find((item) => item.rank === "A").count;
  assert.strictEqual(afterA, 7, "recorder should subtract cards that have been played");
  return {
    seed,
    played: ace.label,
    remainingA: afterA
  };
}

function card(game, rank, suit, index = 0) {
  return game.hands[0].filter((item) => item.rank === rank && item.suit === suit)[index];
}

function testMultiCardRules(seed) {
  const game = engine.createGame({ seed });
  game.phase = "playing";
  game.trumpSuit = "h";
  game.bankerSeat = 0;
  game.currentTurn = 0;
  game.currentTrick = [];

  const suitGroups = new Map();
  game.hands[0]
    .filter((item) => !engine.isTrump(item, game.level, game.trumpSuit))
    .forEach((item) => {
      if (!suitGroups.has(item.suit)) suitGroups.set(item.suit, []);
      suitGroups.get(item.suit).push(item);
    });
  const singles = [...suitGroups.values()].find((items) => items.length >= 3)?.slice(0, 3) || [];
  assert.strictEqual(singles.length, 3, "test hand should contain same-suit singles");
  let before = game.hands[0].length;
  let result = engine.playCards(game, singles.map((item) => item.id));
  assert.strictEqual(result.ok, true, result.message);
  assert.strictEqual(game.hands[0].length, before - 3, "player should be able to lead multiple loose cards");

  const followGame = engine.createGame({ seed });
  followGame.phase = "playing";
  followGame.trumpSuit = "h";
  followGame.bankerSeat = 2;
  followGame.currentTurn = 0;
  const followSuit = [...new Set(followGame.hands[0].filter((item) => !engine.isTrump(item, followGame.level, followGame.trumpSuit)).map((item) => item.suit))]
    .find((suit) => followGame.hands[0].filter((item) => item.suit === suit && !engine.isTrump(item, followGame.level, followGame.trumpSuit)).length >= 2);
  const sameSuit = followGame.hands[0].filter((item) => item.suit === followSuit && !engine.isTrump(item, followGame.level, followGame.trumpSuit));
  const offSuit = followGame.hands[0].filter((item) => item.suit !== followSuit && !engine.isTrump(item, followGame.level, followGame.trumpSuit));
  followGame.currentTrick = [{ seat: 2, cards: sameSuit.slice(0, 2).map((item) => ({ ...item, id: `lead-${item.id}` })) }];
  assert.ok(sameSuit.length >= 2 && offSuit.length >= 2, "test hand should contain same and off suit cards");
  result = engine.playCards(followGame, [sameSuit[0].id, offSuit[0].id]);
  assert.strictEqual(result.ok, false, "must follow same-suit cards before dumping off-suit");
  result = engine.playCards(followGame, [sameSuit[0].id, sameSuit[1].id]);
  assert.strictEqual(result.ok, true, result.message);

  const zhuGame = engine.createGame({ seed });
  zhuGame.phase = "playing";
  zhuGame.trumpSuit = "h";
  zhuGame.bankerSeat = 2;
  zhuGame.currentTurn = 0;
  zhuGame.currentTrick = [{ seat: 2, cards: zhuGame.hands[2].filter((item) => engine.isTrump(item, zhuGame.level, zhuGame.trumpSuit)).slice(0, 2) }];
  const suggested = engine.suggestIds(zhuGame);
  assert.ok(suggested.length <= 2 && suggested.length > 0, "trump-pair follow should suggest legal trump response");
  result = engine.playCards(zhuGame, suggested);
  assert.strictEqual(result.ok, true, result.message);

  return {
    seed,
    multiLead: engine.plainCards(singles),
    followCount: followGame.hands[0].length,
    trumpFollow: suggested.length
  };
}

const results = [
  playTwoRounds(20260624),
  playTwoRounds(20260625),
  playFullGame(20260626),
  testPassThenChipai(20260624),
  testChipaiEatsCommanderAndPair(),
  testPairLead(20260624),
  testRecorderCounts(20260624),
  testMultiCardRules(20260624)
];
console.log(JSON.stringify(results, null, 2));
