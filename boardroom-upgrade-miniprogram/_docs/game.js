const canvas = wx.createCanvas();
const ctx = canvas.getContext("2d");

function wrapText(text, maxWidth) {
  const lines = [];
  let line = "";
  for (const char of text) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawFallback() {
  const info = wx.getSystemInfoSync();
  const width = info.windowWidth || 812;
  const height = info.windowHeight || 375;
  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = "#071c18";
  ctx.fillRect(0, 0, width, height);

  const pad = Math.max(24, Math.min(width, height) * 0.08);
  const panelX = pad;
  const panelY = pad;
  const panelW = width - pad * 2;
  const panelH = height - pad * 2;

  ctx.fillStyle = "#123a33";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = "#d8b65f";
  ctx.lineWidth = 3;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff4c2";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("董事会升级", width / 2, panelY + 46);

  ctx.fillStyle = "#ffffff";
  ctx.font = "18px sans-serif";
  const message = "当前开发者工具正在按小游戏模式启动。本工程是原生小程序，请关闭当前项目，从项目列表删除旧记录后，以小程序/测试号重新导入本目录。";
  const lines = wrapText(message, panelW - 48);
  lines.forEach((line, index) => {
    ctx.fillText(line, width / 2, panelY + 102 + index * 28);
  });

  ctx.fillStyle = "#d8b65f";
  ctx.fillRect(width / 2 - 130, panelY + panelH - 72, 260, 44);
  ctx.fillStyle = "#09231e";
  ctx.font = "bold 17px sans-serif";
  ctx.fillText("请切换到小程序模式预览", width / 2, panelY + panelH - 50);
}

drawFallback();
wx.onWindowResize(drawFallback);

wx.showModal({
  title: "启动模式错误",
  content: "开发者工具仍在按小游戏读取本项目。代码已补兼容文件，但正式预览请用“小程序模式/测试号”重新导入当前目录。",
  showCancel: false
});
