App({
  globalData: {
    // 开发阶段直连当前游戏服务；上架前需要换成 HTTPS/WSS 域名并配置合法域名。
    httpBase: "http://111.228.12.162:9999",
    wsUrl: "ws://111.228.12.162:9999/ws"
  }
});
