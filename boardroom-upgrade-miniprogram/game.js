const canvas = wx.createCanvas();
const ctx = canvas.getContext("2d");
const { clamp, rect, computeLayout, findLayoutIssues } = require("./layout");
const engine = require("./engine");

let currentLayout = null;
let currentView = null;
let game = engine.createGame();
let selectedIds = new Set();
let lastMessage = "";
let recorderOpen = false;
let voiceRecording = false;
let voiceRecorder = null;
let voiceStartedAt = 0;
let robotTimer = null;

function systemSize() {
  const info = wx.getSystemInfoSync();
  return {
    width: info.windowWidth || 844,
    height: info.windowHeight || 390,
    pixelRatio: info.pixelRatio || 1
  };
}

function resizeCanvas() {
  const { width, height, pixelRatio } = systemSize();
  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);
  canvas.style = canvas.style || {};
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { width, height };
}

function roundPath(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fillRound(box, radius, color) {
  roundPath(box.x, box.y, box.w, box.h, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRound(box, radius, color, lineWidth = 1) {
  roundPath(box.x, box.y, box.w, box.h, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawText(value, x, y, size, color, align = "center", weight = "normal") {
  ctx.font = `${weight} ${size}px Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(String(value), x, y);
}

function drawFitText(value, x, y, maxWidth, maxSize, minSize, color, align = "center", weight = "bold") {
  let size = maxSize;
  ctx.font = `${weight} ${size}px Arial, sans-serif`;
  while (size > minSize && ctx.measureText(String(value)).width > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
  }
  drawText(value, x, y, size, color, align, weight);
}

function drawPolygon(points, fill, stroke, lineWidth = 1) {
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawWoodBackground(layout) {
  const bg = ctx.createLinearGradient(0, 0, layout.width, layout.height);
  bg.addColorStop(0, "#7b5239");
  bg.addColorStop(0.32, "#b98452");
  bg.addColorStop(0.55, "#dfb478");
  bg.addColorStop(1, "#69452d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.save();
  ctx.globalAlpha = 0.16;
  for (let i = -20; i < layout.width + 80; i += 88 * layout.scale) {
    ctx.fillStyle = i % 2 ? "#3f2418" : "#e2b777";
    ctx.fillRect(i, 0, 2 * layout.scale, layout.height);
  }
  ctx.restore();
}

function drawTable(layout) {
  const outer = [
    [layout.ox + 115 * layout.scale, layout.oy + 38 * layout.scale],
    [layout.ox + 1886 * layout.scale, layout.oy + 32 * layout.scale],
    [layout.ox + 2010 * layout.scale, layout.oy + 892 * layout.scale],
    [layout.ox + 42 * layout.scale, layout.oy + 900 * layout.scale]
  ];
  drawPolygon(outer, "#3a302a", "rgba(0,0,0,0.35)", 4 * layout.scale);
  drawPolygon(layout.tableFelt.points, "#169485", "#30413c", 10 * layout.scale);

  const feltShade = ctx.createLinearGradient(0, layout.oy, 0, layout.oy + layout.base.height * layout.scale);
  feltShade.addColorStop(0, "rgba(255,255,255,0.22)");
  feltShade.addColorStop(0.38, "rgba(18,150,135,0.05)");
  feltShade.addColorStop(1, "rgba(0,34,36,0.36)");
  drawPolygon(layout.tableFelt.points, feltShade, null);

  ctx.save();
  ctx.globalAlpha = 0.08;
  for (let x = layout.ox + 160 * layout.scale; x < layout.ox + 1880 * layout.scale; x += 84 * layout.scale) {
    ctx.beginPath();
    ctx.moveTo(x, layout.oy + 90 * layout.scale);
    ctx.lineTo(x - 44 * layout.scale, layout.oy + 850 * layout.scale);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1 * layout.scale;
    ctx.stroke();
  }
  ctx.restore();
}

function drawTopStatus(layout) {
  const menu = layout.topPanels[0];
  fillRound(menu, 5 * layout.scale, "rgba(32,43,54,0.92)");
  drawText("☷", menu.x + menu.w / 2, menu.y + menu.h / 2, 48 * layout.scale, "#d9eef7", "center", "bold");

  const labels = [
    ["我方", currentView.teamLevel],
    ["对方", currentView.opponentLevel],
    ["主牌", currentView.trumpLabel],
    ["闲分", currentView.score]
  ];
  for (let i = 1; i < layout.topPanels.length; i += 1) {
    const panel = layout.topPanels[i];
    fillRound(panel, 2 * layout.scale, "rgba(32,43,54,0.86)");
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1 * layout.scale;
    ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);
    drawFitText(labels[i - 1][0], panel.x + panel.w / 2, panel.y + panel.h * 0.27, panel.w - 8 * layout.scale, 25 * layout.scale, 11 * layout.scale, "#dff5ac", "center", "bold");
    drawFitText(labels[i - 1][1], panel.x + panel.w / 2, panel.y + panel.h * 0.68, panel.w - 8 * layout.scale, 32 * layout.scale, 13 * layout.scale, i === 3 && currentView.trumpColor === "red" ? "#ff8088" : i === 3 ? "#f4d545" : "#ffffff", "center", "bold");
  }

  const promo = layout.promo;
  fillRound(promo, 4 * layout.scale, "#fff2dc");
  ctx.fillStyle = "#ee8240";
  ctx.fillRect(promo.x, promo.y, promo.w, promo.h * 0.48);
  drawFitText("再赢36倍", promo.x + promo.w / 2, promo.y + promo.h * 0.24, promo.w - 10 * layout.scale, 28 * layout.scale, 12 * layout.scale, "#ffffff", "center", "bold");
  drawFitText("Ⓦ x30万", promo.x + promo.w / 2, promo.y + promo.h * 0.72, promo.w - 10 * layout.scale, 24 * layout.scale, 12 * layout.scale, "#7a5430", "center", "bold");

  drawText("•••", layout.topIcons[0].x + layout.topIcons[0].w / 2, layout.topIcons[0].y + layout.topIcons[0].h / 2, 34 * layout.scale, "#ffffff", "center", "bold");
  strokeRound(layout.topIcons[1], layout.topIcons[1].w / 2, "rgba(255,255,255,0.78)", 6 * layout.scale);
  drawText("○", layout.topIcons[1].x + layout.topIcons[1].w / 2, layout.topIcons[1].y + layout.topIcons[1].h / 2, 32 * layout.scale, "#ffffff", "center", "bold");
}

function drawAvatarImage(box, tone) {
  const grad = ctx.createLinearGradient(box.x, box.y, box.right, box.bottom);
  grad.addColorStop(0, tone[0]);
  grad.addColorStop(1, tone[1]);
  fillRound(box, 3 * currentLayout.scale, grad);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(box.x + box.w * 0.35, box.y + box.h * 0.35, box.w * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "rgba(240,250,255,0.92)";
  ctx.beginPath();
  ctx.arc(box.x + box.w * 0.5, box.y + box.h * 0.38, Math.min(box.w, box.h) * 0.23, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(18,49,71,0.58)";
  ctx.beginPath();
  ctx.ellipse(box.x + box.w * 0.5, box.y + box.h * 0.82, box.w * 0.38, box.h * 0.26, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 3 * currentLayout.scale;
  ctx.strokeRect(box.x + 4 * currentLayout.scale, box.y + 4 * currentLayout.scale, box.w - 8 * currentLayout.scale, box.h - 8 * currentLayout.scale);
  ctx.restore();
}

function drawPlayer(layout, box, options) {
  const s = layout.scale;
  fillRound(box, 4 * s, "rgba(34, 35, 34, 0.76)");
  const avatar = rect("avatar", box.x + 9 * s, box.y + 28 * s, box.w - 18 * s, box.w - 18 * s, false);
  drawAvatarImage(avatar, options.tone);

  const tag = rect("tag", box.x - 5 * s, box.y, 42 * s, 32 * s, false);
  fillRound(tag, 3 * s, "#ee604a");
  drawText(options.role, tag.x + tag.w / 2, tag.y + tag.h / 2, 24 * s, "#fff", "center", "bold");
  const side = rect("side", box.x + 36 * s, box.y, 54 * s, 32 * s, false);
  fillRound(side, 2 * s, "#d96442");
  drawText(options.side, side.x + side.w / 2, side.y + side.h / 2, 20 * s, "#fff4c8", "center", "bold");

  drawFitText(options.name, box.x + box.w / 2, box.y + box.h - 58 * s, box.w - 8 * s, 22 * s, 11 * s, "#fff4c8", "center", "bold");
  drawFitText(`${options.count} 张`, box.x + box.w / 2, box.y + box.h - 28 * s, box.w - 8 * s, 24 * s, 12 * s, "#ffffff", "center", "bold");
}

function drawTopPlayer(layout) {
  const box = layout.players.top;
  const player = currentView.players.top;
  fillRound(box, 4 * layout.scale, "rgba(22,55,72,0.85)");
  const avatar = rect("avatarTop", box.x + 12 * layout.scale, box.y + 10 * layout.scale, box.w - 24 * layout.scale, 92 * layout.scale, false);
  drawAvatarImage(avatar, ["#a8c8f0", "#3b72a4"]);
  const tag = rect("mateTag", box.x + 5 * layout.scale, box.y, box.w - 10 * layout.scale, 32 * layout.scale, false);
  fillRound(tag, 2 * layout.scale, "#347adb");
  drawText(player.role, tag.x + tag.w * 0.16, tag.y + tag.h / 2, 20 * layout.scale, "#fff", "center", "bold");
  drawText(player.side, tag.x + tag.w * 0.58, tag.y + tag.h / 2, 20 * layout.scale, "#fff", "center", "bold");
  drawText(player.name.replace("机器人", "机"), box.x + box.w / 2, box.y + box.h - 56 * layout.scale, 22 * layout.scale, "#fff4c8", "center", "bold");
  drawText(`${player.count}张`, box.x + box.w / 2, box.y + box.h - 28 * layout.scale, 23 * layout.scale, "#ffffff", "center", "bold");
}

function drawCenter(layout) {
  drawFitText(currentView.center, layout.centerText.x + layout.centerText.w / 2, layout.centerText.y + layout.centerText.h / 2, layout.centerText.w, 42 * layout.scale, 16 * layout.scale, "#ffffff", "center", "bold");
  ctx.save();
  ctx.globalAlpha = 0.18;
  drawText("董事会升级", layout.watermark.x + layout.watermark.w / 2, layout.watermark.y + layout.watermark.h / 2, 44 * layout.scale, "#083c40", "center", "bold");
  ctx.restore();
  drawText(String(game.hands[0].length), layout.counter.x + layout.counter.w / 2, layout.counter.y + layout.counter.h / 2, 58 * layout.scale, "#ffffff", "center", "bold");
}

function drawCard(cardBox, data, selected = false) {
  if (!data) return;
  const s = currentLayout.scale;
  const y = cardBox.y - (selected ? 18 * s : 0);
  const box = rect("card", cardBox.x, y, cardBox.w, cardBox.h, false);
  const grad = ctx.createLinearGradient(box.x, box.y, box.x, box.bottom);
  grad.addColorStop(0, "#fbfaf7");
  grad.addColorStop(1, "#e3e0db");
  fillRound(box, 8 * s, grad);
  strokeRound(box, 8 * s, selected ? "#f7c856" : "#bdb8b0", selected ? 4 * s : 1 * s);

  const color = data.color === "red" ? "#b6262c" : "#151515";
  const pipSize = clamp(box.w * 0.44, 9 * s, 26 * s);
  const suitSize = clamp(box.w * 0.48, 10 * s, 27 * s);
  const jokerSize = clamp(box.w * 0.30, 8 * s, 19 * s);
  const leftX = box.x + box.w * 0.23;
  const rankY = box.y + box.h * 0.14;
  const suitY = box.y + box.h * 0.34;
  if (data.rank === "JOKER") {
    const chars = ["J", "O", "K", "E", "R"];
    chars.forEach((char, index) => {
      drawText(char, leftX, box.y + box.h * (0.12 + index * 0.12), jokerSize, color, "center", "bold");
    });
  } else {
    drawFitText(data.rank, leftX, rankY, box.w * 0.52, pipSize, 8 * s, color, "center", "bold");
    drawText(data.symbol, leftX, suitY, suitSize, color, "center", "bold");
  }

  if (cardBox.w > 46 * s && cardBox.h > 126 * s && data.rank !== "JOKER") {
    ctx.save();
    ctx.globalAlpha = 0.88;
    drawText(data.symbol, box.x + box.w * 0.68, box.y + box.h * 0.78, clamp(box.w * 0.86, 24 * s, 58 * s), color, "center", "bold");
    ctx.restore();
  }
}

function drawPlayedGroup(layout, cards, box) {
  if (!cards.length) return;
  const groupW = layout.playCard.w + Math.max(0, cards.length - 1) * layout.playCard.step;
  const startX = box.x + (box.w - groupW) / 2;
  cards.forEach((cardData, index) => {
    drawCard(rect("played", startX + index * layout.playCard.step, box.y, layout.playCard.w, layout.playCard.h, false), cardData);
  });
}

function drawSmallCards(cards, area, label) {
  const s = currentLayout.scale;
  if (!cards.length) return;
  const title = rect("small-title", area.x, area.y - 28 * s, area.w, 24 * s, false);
  drawFitText(label, title.x + title.w / 2, title.y + title.h / 2, title.w, 20 * s, 10 * s, "#fff4c8", "center", "bold");
  const cardW = Math.min(area.w / Math.max(4.2, cards.length), 42 * s);
  const cardH = 62 * s;
  cards.forEach((card, index) => {
    drawCard(rect("small-card", area.x + index * (cardW * 0.82), area.y, cardW, cardH, false), card, false);
  });
}

function drawTrumpButtons(layout) {
  if (currentView.phase !== "liangzhu" && currentView.phase !== "chipai") return;
  currentView.trumpCandidates.forEach((candidate) => {
    const button = layout.trumpButtons.find((item) => item.id === `trump-${candidate.suit}`);
    if (!button) return;
    fillRound(button, 8 * layout.scale, "rgba(242,236,224,0.94)");
    strokeRound(button, 8 * layout.scale, candidate.color === "red" ? "#ce3f45" : "#17202a", 2 * layout.scale);
    drawFitText(candidate.label, button.x + button.w / 2, button.y + button.h / 2, button.w - 10 * layout.scale, 24 * layout.scale, 11 * layout.scale, candidate.color === "red" ? "#b6262c" : "#15212c", "center", "bold");
  });
}

function drawButton(box, label, mode = "normal") {
  const fill = mode === "primary"
    ? "#c73a34"
    : mode === "gold"
      ? "#9f790d"
      : "rgba(255,251,239,0.94)";
  const color = mode === "primary" || mode === "gold" ? "#fff7dc" : "#163229";
  fillRound(box, 8 * currentLayout.scale, fill);
  strokeRound(box, 8 * currentLayout.scale, mode === "primary" ? "#8d2822" : "#c9b26a", 2 * currentLayout.scale);
  drawFitText(label, box.x + box.w / 2, box.y + box.h / 2, box.w - 12 * currentLayout.scale, 25 * currentLayout.scale, 11 * currentLayout.scale, color, "center", "bold");
}

function drawControls(layout) {
  const controls = layout.controls;
  fillRound(controls.prompt, controls.prompt.h / 2, "rgba(7,62,70,0.82)");
  drawFitText(lastMessage || currentView.handPrompt, controls.prompt.x + controls.prompt.w / 2, controls.prompt.y + controls.prompt.h / 2, controls.prompt.w - 18 * layout.scale, 20 * layout.scale, 10 * layout.scale, "#fff4c8", "center", "bold");

  if (currentView.canSuggest) drawButton(controls.suggest, "智能建议");
  if (currentView.phase === "liangzhu") {
    drawButton(controls.secondary, "不亮");
  } else if (currentView.phase === "chipai") {
    drawButton(controls.secondary, "不吃");
  } else if (currentView.phase === "huanpai") {
    drawButton(controls.secondary, "不拾");
  } else if (currentView.phase === "game_over") {
    drawButton(controls.primary, "下一局", "primary");
  }
  if (currentView.canFanpai) drawButton(controls.primary, "返牌", "primary");
  if (currentView.canShipai) drawButton(controls.primary, "拾牌", "primary");
  if (currentView.canKoupai) drawButton(controls.primary, "扣底", "primary");
  if (currentView.canPlay) drawButton(controls.primary, "出牌", "primary");
}

function drawSideIcons(layout) {
  const live = layout.sideIcons[0];
  fillRound(live, live.w / 2, "rgba(33,45,63,0.9)");
  drawText("语", live.x + live.w / 2, live.y + live.h / 2, 25 * layout.scale, "#dbe9ff", "center", "bold");
  const message = layout.sideIcons[1];
  fillRound(message, message.w / 2, voiceRecording ? "#af3b34" : "#293445");
  drawText(voiceRecording ? "停" : "讯", message.x + message.w / 2, message.y + message.h / 2, 23 * layout.scale, "#ffd77a", "center", "bold");
}

function drawRecorderPanel(layout) {
  if (!recorderOpen) return;
  const panel = layout.recorderPanel;
  fillRound(panel, 8 * layout.scale, "rgba(13,31,39,0.92)");
  strokeRound(panel, 8 * layout.scale, "rgba(255,226,130,0.72)", 2 * layout.scale);
  drawFitText("记牌器", panel.x + panel.w / 2, panel.y + 22 * layout.scale, panel.w - 18 * layout.scale, 18 * layout.scale, 9 * layout.scale, "#ffe28a", "center", "bold");
  const items = currentView.recorderCounts || [];
  const cols = 5;
  const cellW = panel.w / cols;
  const cellH = (panel.h - 34 * layout.scale) / 3;
  items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = panel.x + col * cellW + 4 * layout.scale;
    const y = panel.y + 34 * layout.scale + row * cellH + 4 * layout.scale;
    const box = rect("recorder-card", x, y, cellW - 8 * layout.scale, cellH - 7 * layout.scale, false);
    fillRound(box, 4 * layout.scale, "rgba(246,242,232,0.96)");
    const red = item.rank === "A" || item.rank === "K" || item.rank === "Q" || item.rank === "J";
    drawFitText(item.rank, box.x + box.w * 0.35, box.y + box.h * 0.35, box.w * 0.7, 13 * layout.scale, 7 * layout.scale, red ? "#b6262c" : "#141414", "center", "bold");
    drawFitText(String(item.count), box.x + box.w * 0.68, box.y + box.h * 0.72, box.w * 0.6, 15 * layout.scale, 8 * layout.scale, "#0f2b35", "center", "bold");
  });
}

function drawBottom(layout) {
  const bar = ctx.createLinearGradient(0, layout.bottomBar.y, 0, layout.bottomBar.bottom);
  bar.addColorStop(0, "rgba(12,76,86,0.92)");
  bar.addColorStop(1, "rgba(7,48,61,0.95)");
  ctx.fillStyle = bar;
  ctx.fillRect(layout.bottomBar.x, layout.bottomBar.y, layout.bottomBar.w, layout.bottomBar.h);

  drawAvatarImage(layout.players.me, ["#a5d0ff", "#2d6eb8"]);
  fillRound(layout.namePlate, 3 * layout.scale, "rgba(13,67,84,0.82)");
  drawFitText("朝阳董事", layout.namePlate.x + 108 * layout.scale, layout.namePlate.y + layout.namePlate.h / 2, 180 * layout.scale, 31 * layout.scale, 14 * layout.scale, "#ffffff", "center", "bold");
  drawText("Ⓦ+", layout.namePlate.x + 250 * layout.scale, layout.namePlate.y + layout.namePlate.h / 2, 28 * layout.scale, "#ffd658", "center", "bold");
  drawText("585万", layout.namePlate.x + 350 * layout.scale, layout.namePlate.y + layout.namePlate.h / 2, 28 * layout.scale, "#ffffff", "center", "bold");

  fillRound(layout.recorder, 2 * layout.scale, "rgba(54,83,99,0.82)");
  drawFitText(recorderOpen ? "收起记牌器" : "记牌器", layout.recorder.x + layout.recorder.w / 2, layout.recorder.y + layout.recorder.h / 2, layout.recorder.w - 12 * layout.scale, 24 * layout.scale, 12 * layout.scale, "#e7f0f6", "center", "bold");
  drawText("上轮", layout.recorder.x - 62 * layout.scale, layout.recorder.y + layout.recorder.h / 2, 25 * layout.scale, "#ffffff", "center", "bold");

  ctx.fillStyle = "rgba(190,220,230,0.35)";
  ctx.fillRect(layout.progress.x, layout.progress.y, layout.progress.w, layout.progress.h);
  drawFitText(currentView.handPrompt, layout.progress.x + layout.progress.w / 2, layout.progress.y - 22 * layout.scale, 720 * layout.scale, 20 * layout.scale, 10 * layout.scale, "rgba(255,255,255,0.66)", "center");
}

function drawHand(layout) {
  layout.handCards.forEach((cardBox, index) => {
    const card = currentView.hand[index];
    drawCard(cardBox, card, card && selectedIds.has(card.id));
  });
}

function drawScene() {
  const { width, height } = resizeCanvas();
  currentView = engine.getView(game, selectedIds);
  currentLayout = computeLayout(width, height, currentView.hand.length);
  ctx.clearRect(0, 0, width, height);

  drawWoodBackground(currentLayout);
  drawTable(currentLayout);
  drawTopStatus(currentLayout);
  drawSmallCards(
    currentView.phase === "huanpai" && currentView.huanpaiOffer.length
      ? currentView.huanpaiOffer
      : currentView.phase === "fanpai" && currentView.chipaiEatenCards.length
      ? currentView.chipaiEatenCards
      : currentView.buriedCards.length
        ? currentView.buriedCards
        : currentView.pickedBottomCards,
    currentLayout.bottomCards,
    currentView.phase === "huanpai" && currentView.huanpaiOffer.length
      ? "可拾底牌"
      : currentView.phase === "fanpai" && currentView.chipaiEatenCards.length
      ? "已吃亮牌"
      : currentView.buriedCards.length
        ? "已扣底牌"
        : currentView.pickedBottomCards.length
          ? "已拾底牌"
          : ""
  );
  drawPlayer(currentLayout, currentLayout.players.left, { ...currentView.players.left, tone: ["#526d8d", "#20314f"] });
  drawTopPlayer(currentLayout);
  drawPlayer(currentLayout, currentLayout.players.right, { ...currentView.players.right, tone: ["#f2e7dd", "#af9ad4"] });
  drawCenter(currentLayout);
  drawPlayedGroup(currentLayout, currentView.played.left, currentLayout.played.left);
  drawPlayedGroup(currentLayout, currentView.played.top, currentLayout.played.top);
  drawPlayedGroup(currentLayout, currentView.played.right, currentLayout.played.right);
  drawPlayedGroup(currentLayout, currentView.played.bottom, currentLayout.played.bottom);
  drawTrumpButtons(currentLayout);
  drawBottom(currentLayout);
  drawHand(currentLayout);
  drawRecorderPanel(currentLayout);
  drawControls(currentLayout);
  drawSideIcons(currentLayout);
}

function inside(box, x, y) {
  return x >= box.x && x <= box.right && y >= box.y && y <= box.bottom;
}

function showMessage(message) {
  lastMessage = message || "";
  if (message && wx.showToast) {
    wx.showToast({ title: message, icon: "none", duration: 900 });
  }
}

function clearRobotTimer() {
  if (robotTimer) {
    clearTimeout(robotTimer);
    robotTimer = null;
  }
}

function scheduleRobotTurn(delay = 1000) {
  clearRobotTimer();
  if (game.phase !== "playing" || game.currentTurn === 0) {
    drawScene();
    return;
  }
  robotTimer = setTimeout(() => {
    robotTimer = null;
    const result = engine.stepRobot(game);
    if (result.ok && result.message) showMessage(result.message);
    drawScene();
    if (game.phase === "playing" && game.currentTurn !== 0) {
      scheduleRobotTurn(1000);
    }
  }, delay);
}

function ensureVoiceRecorder() {
  if (voiceRecorder) return voiceRecorder;
  if (!wx.getRecorderManager) return null;
  voiceRecorder = wx.getRecorderManager();
  if (voiceRecorder.onStop) {
    voiceRecorder.onStop((result) => {
      voiceRecording = false;
      const seconds = Math.max(1, Math.round((Date.now() - voiceStartedAt) / 1000));
      showMessage(result && result.tempFilePath ? `语音短消息 ${seconds} 秒` : "语音短消息已结束");
      drawScene();
    });
  }
  if (voiceRecorder.onError) {
    voiceRecorder.onError(() => {
      voiceRecording = false;
      showMessage("语音录制失败");
      drawScene();
    });
  }
  return voiceRecorder;
}

function toggleVoiceMessage() {
  const recorder = ensureVoiceRecorder();
  if (!recorder) {
    showMessage("当前环境不支持语音录制");
    return;
  }
  if (voiceRecording) {
    recorder.stop();
    return;
  }
  voiceStartedAt = Date.now();
  voiceRecording = true;
  recorder.start({
    duration: 60000,
    sampleRate: 16000,
    numberOfChannels: 1,
    encodeBitRate: 24000,
    format: "mp3"
  });
  showMessage("正在录制语音短消息");
}

function setSelected(ids) {
  selectedIds = new Set(ids);
}

function toggleCard(card) {
  if (!card) return;
  if (selectedIds.has(card.id)) selectedIds.delete(card.id);
  else selectedIds.add(card.id);
}

function handlePrimary() {
  let result;
  if (game.phase === "fanpai") {
    result = engine.returnChipaiCards(game, [...selectedIds]);
    if (result.ok) setSelected([]);
    showMessage(result.message);
    drawScene();
    if (result.ok) scheduleRobotTurn(1000);
    return;
  }
  if (game.phase === "huanpai") {
    result = engine.shipaiCards(game);
    if (result.ok) setSelected([]);
    showMessage(result.message);
    drawScene();
    if (result.ok) scheduleRobotTurn(1000);
    return;
  }
  if (game.phase === "koupai") {
    result = engine.buryCards(game, [...selectedIds]);
    if (result.ok) setSelected([]);
    showMessage(result.message);
    drawScene();
    if (result.ok) scheduleRobotTurn(1000);
    return;
  }
  if (game.phase === "playing") {
    result = engine.playCards(game, [...selectedIds]);
    if (result.ok) setSelected([]);
    showMessage(result.message);
    drawScene();
    if (result.ok) scheduleRobotTurn(1000);
    return;
  }
  if (game.phase === "game_over") {
    clearRobotTimer();
    game = engine.nextGame(game);
    setSelected([]);
    showMessage("已开始下一局");
    drawScene();
  }
}

function handleSuggest() {
  const ids = engine.suggestIds(game);
  if (!ids.length) {
    showMessage("暂无建议");
    drawScene();
    return;
  }
  setSelected(ids);
  showMessage(game.phase === "fanpai" ? "已选择建议返牌" : game.phase === "koupai" ? "已选择建议扣底" : "已选择建议出牌");
  drawScene();
}

function handleTap(x, y) {
  if (!currentLayout) return;
  if (currentView.phase === "liangzhu") {
    for (const candidate of currentView.trumpCandidates) {
      const button = currentLayout.trumpButtons.find((item) => item.id === `trump-${candidate.suit}`);
      if (button && inside(button, x, y)) {
        const result = engine.declareTrump(game, candidate.suit);
        setSelected([]);
        showMessage(result.message);
        drawScene();
        if (result.ok) scheduleRobotTurn(1000);
        return;
      }
    }
    if (inside(currentLayout.controls.secondary, x, y)) {
      const result = engine.passTrump(game);
      setSelected([]);
      showMessage(result.message);
      drawScene();
      if (result.ok && game.phase === "playing") scheduleRobotTurn(1000);
      return;
    }
  }

  if (currentView.phase === "chipai") {
    for (const candidate of currentView.trumpCandidates) {
      const button = currentLayout.trumpButtons.find((item) => item.id === `trump-${candidate.suit}`);
      if (button && inside(button, x, y)) {
        const result = engine.chipaiTrump(game, candidate.suit);
        setSelected([]);
        showMessage(result.message);
        drawScene();
        if (result.ok) scheduleRobotTurn(1000);
        return;
      }
    }
    if (inside(currentLayout.controls.secondary, x, y)) {
      const result = engine.passChipai(game);
      setSelected([]);
      showMessage(result.message);
      drawScene();
      if (result.ok) scheduleRobotTurn(1000);
      return;
    }
  }

  if (currentView.phase === "huanpai") {
    if (inside(currentLayout.controls.secondary, x, y)) {
      const result = engine.passShipai(game);
      setSelected([]);
      showMessage(result.message);
      drawScene();
      if (result.ok) scheduleRobotTurn(1000);
      return;
    }
  }

  if (currentView.canSuggest && inside(currentLayout.controls.suggest, x, y)) {
    handleSuggest();
    return;
  }
  if (inside(currentLayout.recorder, x, y)) {
    recorderOpen = !recorderOpen;
    drawScene();
    return;
  }
  if (inside(currentLayout.sideIcons[0], x, y)) {
    showMessage("实时语音入口已开启");
    drawScene();
    return;
  }
  if (inside(currentLayout.sideIcons[1], x, y)) {
    toggleVoiceMessage();
    drawScene();
    return;
  }
  if ((currentView.canFanpai || currentView.canShipai || currentView.canKoupai || currentView.canPlay || currentView.phase === "game_over") && inside(currentLayout.controls.primary, x, y)) {
    handlePrimary();
    return;
  }

  for (let i = currentLayout.handCards.length - 1; i >= 0; i -= 1) {
    if (inside(currentLayout.handCards[i], x, y)) {
      toggleCard(currentView.hand[i]);
      drawScene();
      return;
    }
  }
}

wx.onTouchStart((event) => {
  const touch = event.touches && event.touches[0];
  if (touch) handleTap(touch.clientX, touch.clientY);
});

wx.onWindowResize(drawScene);

if (typeof globalThis !== "undefined") {
  globalThis.__BOARDROOM_MINIGAME_DEBUG__ = {
    computeLayout,
    findLayoutIssues,
    engine,
    get game() {
      return game;
    },
    get view() {
      return currentView;
    },
    get selectedIds() {
      return [...selectedIds];
    },
    stepRobot() {
      return engine.stepRobot(game);
    },
    runRobotTimer() {
      scheduleRobotTurn(0);
    },
    redraw: drawScene
  };
}

drawScene();
