# 董事会升级小程序接入工程

这是给微信开发者工具使用的原生小程序工程。当前不使用 `web-view`，首页和牌桌都由 WXML/WXSS/JS 实现，实时对局通过 `wx.request` 与 `wx.connectSocket` 连接现有游戏后端。

## 打开方式

使用微信开发者工具导入本目录：

`C:\Users\89598\Documents\Codex\2026-05-26\new-chat\boardroom-upgrade-miniprogram`

当前 `appid` 使用 `touristappid`，可以在开发者工具里先用测试号/游客模式调试。拿到正式 AppID 后，把 `project.config.json` 里的 `appid` 换成正式值。

## 当前接入地址

`app.js` 里的服务配置当前指向：

- HTTP: `http://111.228.12.162:9999`
- WebSocket: `ws://111.228.12.162:9999/ws`

这只适合开发调试。提交审核前需要：

- 游戏服务改成 HTTPS。
- WebSocket 改成 WSS。
- 在微信公众平台配置 `request` 与 `socket` 合法域名。
- 如果走小游戏/游戏类目，按平台要求补齐类目、备案、资质和内容合规材料。

## 后续推荐路线

短期：用本工程验证小程序入口、头像、名称、介绍和原生牌桌主流程。

中期：继续补齐语音、表情、横屏模式和更多极端牌局 UI 校验。

长期：如果按“小游戏”上架，建议重做为小游戏工程，牌桌使用 Canvas 渲染，服务端规则逻辑继续复用当前 Python 后端。
