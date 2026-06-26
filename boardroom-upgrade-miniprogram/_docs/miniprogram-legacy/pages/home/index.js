Page({
  data: {
    creating: false,
    roomId: "",
    serverLabel: "111.228.12.162:9999"
  },

  onRoomInput(event) {
    this.setData({
      roomId: event.detail.value.trim()
    });
  },

  startRobotGame() {
    if (this.data.creating) {
      return;
    }
    const app = getApp();
    this.setData({ creating: true });
    wx.request({
      url: `${app.globalData.httpBase}/api/rooms`,
      method: "POST",
      success: (res) => {
        const roomId = res.data && res.data.room_id;
        if (!roomId) {
          wx.showToast({ title: "创建失败", icon: "none" });
          return;
        }
        wx.navigateTo({
          url: `/pages/game/index?roomId=${encodeURIComponent(roomId)}&name=${encodeURIComponent("玩家")}&autoStart=1`
        });
      },
      fail: () => {
        wx.showToast({ title: "无法连接服务器", icon: "none" });
      },
      complete: () => {
        this.setData({ creating: false });
      }
    });
  },

  joinRoom() {
    const roomId = this.data.roomId;
    if (!roomId) {
      wx.showToast({ title: "请输入房间号", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: `/pages/game/index?roomId=${encodeURIComponent(roomId)}&name=${encodeURIComponent("玩家")}`
    });
  }
});
