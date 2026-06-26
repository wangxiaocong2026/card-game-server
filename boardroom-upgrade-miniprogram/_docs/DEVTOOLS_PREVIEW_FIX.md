# 预览报 `game.json` 的处理方式

这个工程是原生微信小程序，入口是 `app.json` 和 `pages/home/index`，不是小游戏工程。

如果开发者工具点击“预览”时提示 `game.json: 未找到 game.json 文件`，说明工具仍然沿用了旧项目缓存或旧小游戏 AppID，把当前目录按小游戏方式启动了。

当前代码已经补充了 `game.json` 和 `game.js` 兼容层，避免预览直接卡死。但真正测试小程序页面时，建议这样打开：

1. 关闭当前项目。
2. 在项目列表里删除这个旧项目记录。
3. 重新导入目录：`C:\Users\89598\Documents\Codex\2026-05-26\new-chat\boardroom-upgrade-miniprogram`
4. 类型选择“小程序”，AppID 使用“测试号”或 `touristappid`。
5. 进入后点“编译”，再点“预览”。

如果仍然进入小游戏兼容提示页，说明这次打开仍然不是小程序模式，需要重新导入而不是直接从历史项目打开。
