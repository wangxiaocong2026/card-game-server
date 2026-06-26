const BASE_W = 2048;
const BASE_H = 945;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rect(id, x, y, w, h, blocking = true) {
  return { id, x, y, w, h, right: x + w, bottom: y + h, blocking };
}

function scaleRect(id, box, s, ox, oy, blocking = true) {
  return rect(id, ox + box[0] * s, oy + box[1] * s, box[2] * s, box[3] * s, blocking);
}

function overlap(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  return x * y;
}

function centeredCards(id, centerX, y, count, cardW, cardH, step) {
  const groupW = count > 0 ? cardW + Math.max(0, count - 1) * step : 0;
  return rect(id, centerX - groupW / 2, y, groupW, cardH, true);
}

function computeLayout(width, height, handCount) {
  const scale = Math.min(width / BASE_W, height / BASE_H);
  const ox = (width - BASE_W * scale) / 2;
  const oy = (height - BASE_H * scale) / 2;
  const s = scale;

  const topPanels = [
    scaleRect("top-menu", [90, 26, 86, 86], s, ox, oy),
    scaleRect("top-team", [194, 26, 84, 84], s, ox, oy),
    scaleRect("top-opponent", [279, 26, 84, 84], s, ox, oy),
    scaleRect("top-trump", [364, 26, 118, 84], s, ox, oy),
    scaleRect("top-defender-score", [482, 26, 118, 84], s, ox, oy)
  ];

  const tableOuter = scaleRect("tableOuter", [104, 22, 1810, 870], s, ox, oy, false);
  const tableFelt = {
    id: "tableFelt",
    points: [
      [192, 88],
      [1810, 88],
      [1948, 850],
      [66, 850]
    ].map(([x, y]) => [ox + x * s, oy + y * s])
  };
  const tableInnerBounds = scaleRect("tableInnerBounds", [96, 84, 1840, 760], s, ox, oy, false);

  const players = {
    left: scaleRect("playerLeft", [84, 210, 120, 170], s, ox, oy),
    top: scaleRect("playerTop", [958, 22, 132, 170], s, ox, oy),
    right: scaleRect("playerRight", [1828, 210, 120, 170], s, ox, oy),
    me: scaleRect("playerMe", [90, 796, 122, 142], s, ox, oy)
  };

  const promo = scaleRect("promo", [1550, 32, 220, 88], s, ox, oy);
  const topIcons = [
    scaleRect("icon-dots", [1810, 34, 58, 58], s, ox, oy),
    scaleRect("icon-target", [1910, 28, 64, 64], s, ox, oy)
  ];
  const sideIcons = [
    scaleRect("voice-live", [1862, 432, 58, 58], s, ox, oy),
    scaleRect("voice-message", [1866, 512, 54, 54], s, ox, oy)
  ];
  const trumpButtons = [
    scaleRect("trump-s", [760, 444, 120, 56], s, ox, oy),
    scaleRect("trump-h", [910, 444, 120, 56], s, ox, oy),
    scaleRect("trump-c", [1060, 444, 120, 56], s, ox, oy),
    scaleRect("trump-d", [1210, 444, 120, 56], s, ox, oy)
  ];
  const controls = {
    prompt: scaleRect("control-prompt", [690, 574, 668, 42], s, ox, oy, false),
    suggest: scaleRect("control-suggest", [1180, 858, 150, 58], s, ox, oy),
    secondary: scaleRect("control-secondary", [1350, 858, 150, 58], s, ox, oy),
    primary: scaleRect("control-primary", [1520, 858, 170, 58], s, ox, oy)
  };
  const bottomCards = scaleRect("bottom-cards", [222, 150, 360, 92], s, ox, oy, false);

  const centerText = scaleRect("centerText", [760, 218, 520, 100], s, ox, oy, false);
  const watermark = scaleRect("watermark", [230, 466, 360, 70], s, ox, oy, false);
  const counter = scaleRect("counter", [342, 240, 90, 70], s, ox, oy, false);

  const playCardW = 52 * s;
  const playCardH = 76 * s;
  const playStep = 42 * s;
  const played = {
    left: centeredCards("playedLeft", ox + 610 * s, oy + 452 * s, 4, playCardW, playCardH, playStep),
    top: centeredCards("playedTop", ox + 1024 * s, oy + 336 * s, 4, playCardW, playCardH, playStep),
    right: centeredCards("playedRight", ox + 1438 * s, oy + 452 * s, 4, playCardW, playCardH, playStep),
    bottom: centeredCards("playedBottom", ox + 1024 * s, oy + 492 * s, 4, playCardW, playCardH, playStep)
  };

  const handCardH = 190 * s;
  const handCardW = 58 * s;
  const minStep = 28 * s;
  const maxStep = 54 * s;
  const handArea = scaleRect("handArea", [150, 646, 1660, 194], s, ox, oy, false);
  const availableW = handArea.w;
  const step = handCount <= 1 ? maxStep : clamp((availableW - handCardW) / (handCount - 1), minStep, maxStep);
  const groupW = handCount > 0 ? handCardW + Math.max(0, handCount - 1) * step : 0;
  const handStartX = handArea.x + (handArea.w - groupW) / 2;
  const handY = handArea.y;
  const handCards = Array.from({ length: handCount }, (_, index) => (
    rect(`hand-${index}`, handStartX + index * step, handY, handCardW, handCardH, false)
  ));

  const bottomBar = scaleRect("bottomBar", [88, 840, 1840, 104], s, ox, oy, false);
  const namePlate = scaleRect("namePlate", [220, 852, 420, 68], s, ox, oy);
  const recorder = scaleRect("recorder", [1720, 852, 210, 58], s, ox, oy);
  const recorderPanel = scaleRect("recorder-panel", [1510, 604, 398, 220], s, ox, oy, false);
  const progress = scaleRect("progress", [760, 912, 520, 12], s, ox, oy, false);

  const rects = [
    ...topPanels,
    ...topIcons,
    ...sideIcons,
    played.left,
    played.top,
    played.right,
    played.bottom,
    promo,
    players.left,
    players.top,
    players.right,
    namePlate,
    recorder
  ];

  return {
    width,
    height,
    scale,
    ox,
    oy,
    base: { width: BASE_W, height: BASE_H },
    topPanels,
    tableOuter,
    tableFelt,
    tableInnerBounds,
    players,
    promo,
    topIcons,
    sideIcons,
    trumpButtons,
    controls,
    bottomCards,
    centerText,
    watermark,
    counter,
    played,
    playCard: { w: playCardW, h: playCardH, step: playStep },
    handArea,
    handCards,
    handCard: { w: handCardW, h: handCardH, step, minStep },
    bottomBar,
    namePlate,
    recorder,
    recorderPanel,
    progress,
    rects
  };
}

function findLayoutIssues(layout) {
  const issues = [];
  const screen = rect("screen", 0, 0, layout.width, layout.height, false);
  for (const item of layout.rects) {
    if (item.x < screen.x - 1 || item.y < screen.y - 1 || item.right > screen.right + 1 || item.bottom > screen.bottom + 1) {
      issues.push(`${item.id} out of screen`);
    }
  }

  const blocking = layout.rects.filter((item) => item.blocking);
  for (let i = 0; i < blocking.length; i += 1) {
    for (let j = i + 1; j < blocking.length; j += 1) {
      const a = blocking[i];
      const b = blocking[j];
      if (overlap(a, b) > 1) {
        issues.push(`${a.id} overlaps ${b.id}`);
      }
    }
  }

  if (layout.handCard.step < layout.handCard.minStep - 0.5) {
    issues.push(`hand step ${layout.handCard.step.toFixed(1)} below min ${layout.handCard.minStep.toFixed(1)}`);
  }

  for (const card of layout.handCards) {
    if (card.x < layout.handArea.x - 1 || card.right > layout.handArea.right + 1 || card.y < layout.handArea.y - 1 || card.bottom > layout.handArea.bottom + 1) {
      issues.push(`${card.id} out of hand area`);
      break;
    }
  }

  return issues;
}

module.exports = {
  clamp,
  rect,
  overlap,
  computeLayout,
  findLayoutIssues
};
