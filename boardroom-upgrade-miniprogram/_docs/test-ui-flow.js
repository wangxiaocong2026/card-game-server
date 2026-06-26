const assert = require("assert");

function noop() {}

function createMockContext() {
  const ctx = {};
  [
    "setTransform", "clearRect", "fillRect", "strokeRect", "beginPath", "moveTo",
    "lineTo", "quadraticCurveTo", "closePath", "fill", "stroke", "save", "restore",
    "arc", "ellipse", "fillText"
  ].forEach((name) => {
    ctx[name] = noop;
  });
  ctx.createLinearGradient = () => ({ addColorStop: noop });
  ctx.measureText = (text) => ({ width: String(text).length * 12 });
  return ctx;
}

const touches = [];
global.wx = {
  createCanvas() {
    return {
      width: 0,
      height: 0,
      style: {},
      getContext: () => createMockContext()
    };
  },
  getSystemInfoSync() {
    return { windowWidth: 844, windowHeight: 390, pixelRatio: 1 };
  },
  onTouchStart(handler) {
    touches.push(handler);
  },
  onWindowResize() {},
  showToast() {}
};

require("../game");

const debug = global.__BOARDROOM_MINIGAME_DEBUG__;
assert.ok(debug, "debug API should be exposed");

function tapRect(rect) {
  touches[0]({ touches: [{ clientX: rect.x + rect.w / 2, clientY: rect.y + rect.h / 2 }] });
}

let view = debug.view;
assert.strictEqual(view.phase, "liangzhu", "initial UI phase should be liangzhu");

const layout1 = debug.computeLayout(844, 390, view.hand.length);
assert.strictEqual(layout1.topPanels.length, 5, "HUD should include defender score next to trump");
tapRect(layout1.controls.secondary);
if (debug.view.phase === "chipai") {
  assert.strictEqual(debug.view.canChipai, true, "chipai controls should be enabled");
  const chipaiButton = debug.view.trumpCandidates[0];
  let layoutChipai = debug.computeLayout(844, 390, debug.view.hand.length);
  tapRect(layoutChipai.trumpButtons.find((item) => item.id === `trump-${chipaiButton.suit}`));
  assert.notStrictEqual(debug.view.phase, "fanpai", "chipai should auto-return in the latest flow");
  assert.ok(debug.view.chipaiEatenCards.length > 0, "eaten declaration cards should display");
  assert.strictEqual(debug.view.chipaiReturnCards.length, debug.view.chipaiEatenCards.length, "returned cards should display");
}

while (debug.view.phase === "koupai" || debug.view.phase === "huanpai") {
  const layoutSetup = debug.computeLayout(844, 390, debug.view.hand.length);
  if (debug.view.phase === "koupai") {
    tapRect(layoutSetup.controls.suggest);
    tapRect(layoutSetup.controls.primary);
  } else if (debug.view.canShipai) {
    tapRect(layoutSetup.controls.primary);
  } else {
    tapRect(layoutSetup.controls.secondary);
  }
}

assert.strictEqual(debug.view.phase, "playing", "setup flow should continue to playing");
assert.strictEqual(debug.view.pickedBottomCards.length, 4, "picked bottom cards should display");
assert.strictEqual(debug.view.buriedCards.length, 4, "buried cards should display");

while (debug.view.phase === "playing" && !debug.view.canPlay) {
  const robot = debug.stepRobot();
  assert.strictEqual(robot.ok, true, robot.message);
  debug.redraw();
}

let layout = debug.computeLayout(844, 390, debug.view.hand.length);
tapRect(layout.sideIcons[0]);
tapRect(layout.sideIcons[1]);
tapRect(layout.recorder);
tapRect(layout.controls.suggest);
assert.ok(debug.selectedIds.length > 0, "suggest should select playable cards");

layout = debug.computeLayout(844, 390, debug.view.hand.length);
tapRect(layout.controls.primary);
assert.strictEqual(debug.view.phase, "playing", "play button should keep game playable");
assert.ok(debug.view.players.me.count < 26, "playing should remove player cards");
if (!debug.view.canPlay && debug.view.phase === "playing") {
  const robot = debug.stepRobot();
  assert.strictEqual(robot.ok, true, robot.message);
  debug.redraw();
  assert.ok(debug.view.played.left.length || debug.view.played.top.length || debug.view.played.right.length || debug.view.played.bottom.length, "robot play should stay visible on table");
}

let guard = 0;
while (debug.view.phase !== "game_over" && guard < 80) {
  while (debug.view.phase === "playing" && !debug.view.canPlay) {
    const robot = debug.stepRobot();
    assert.strictEqual(robot.ok, true, robot.message);
    debug.redraw();
  }
  layout = debug.computeLayout(844, 390, debug.view.hand.length);
  if (debug.view.canSuggest) tapRect(layout.controls.suggest);
  if (debug.view.canPlay) tapRect(layout.controls.primary);
  guard += 1;
}
assert.strictEqual(debug.view.phase, "game_over", "UI flow should reach settlement");
assert.ok(debug.view.center.includes("闲家倒扣"), "settlement should show bottom penalty");

console.log(JSON.stringify({
  phase: debug.view.phase,
  playerCards: debug.view.players.me.count,
  buried: debug.view.buriedCards.map((card) => card.label),
  bottomPenalty: debug.view.bottomPenalty,
  selected: debug.selectedIds.length
}, null, 2));
