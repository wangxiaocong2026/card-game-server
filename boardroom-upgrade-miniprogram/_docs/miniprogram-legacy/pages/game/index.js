const PHASE_LABELS = {
  waiting: "等待",
  liangzhu: "亮主",
  chipai: "吃牌",
  koupai: "扣底",
  huanpai: "拾牌",
  playing: "出牌中",
  scoring: "结算",
  game_over: "结束"
};

const COLOR_SYMBOLS = { a: "♠", b: "♥", c: "♣", d: "♦", z: "★" };
const COLOR_NAMES = { a: "黑桃", b: "红桃", c: "梅花", d: "方块", z: "王" };
const COLOR_ORDER = { a: 0, b: 1, c: 2, d: 3, z: 4 };
const FIXED_TRUMP_NAMES = ["5", "3", "2"];
const FIXED_TRUMP_ORDER = { 5: 0, 3: 1, 2: 2 };
const SEAT_NAMES = ["南", "西", "北", "东"];
const LIANG_TYPE_LABELS = {
  danlian: "单对子",
  shuanglian: "双连对",
  threeking: "三王",
  duolian: "多连对"
};

function parseCard(card) {
  if (card && typeof card === "object") {
    return {
      cardType: card.card_type || card.cardType,
      name: card.name,
      rank: Number(card.rank) || 0,
      color: card.color
    };
  }
  const [name, rank, color] = String(card || "").split("-");
  return { cardType: card, name, rank: Number(rank) || 0, color };
}

function formatCard(card, keyPrefix = "card", index = 0) {
  const parsed = parseCard(card);
  const displayRank = parsed.name === "w" ? "小" : parsed.name === "W" ? "大" : parsed.name;
  return {
    ...parsed,
    key: `${keyPrefix}-${index}-${parsed.cardType || parsed.name}`,
    displayRank,
    suit: COLOR_SYMBOLS[parsed.color] || "",
    red: parsed.color === "b" || parsed.color === "d"
  };
}

function plainCards(cards) {
  return (cards || []).map((card) => {
    const parsed = parseCard(card);
    const rank = parsed.name === "w" ? "小王" : parsed.name === "W" ? "大王" : parsed.name;
    return `${rank}${COLOR_SYMBOLS[parsed.color] || ""}`;
  }).join(" ");
}

function cardSelectionKey(cards, index) {
  const cardType = cards[index];
  let occurrence = 0;
  for (let i = 0; i <= index; i += 1) {
    if (cards[i] === cardType) {
      occurrence += 1;
    }
  }
  return `${cardType}#${occurrence}`;
}

function relativePositions(seat) {
  if (seat < 0) {
    return { left: 1, top: 2, right: 3 };
  }
  return {
    left: (seat + 1) % 4,
    top: (seat + 2) % 4,
    right: (seat + 3) % 4
  };
}

function numericRank(card) {
  return Number(card.rank) || 0;
}

function isDisplayTrump(card, level, trumpColor) {
  if (card.color === "z") return true;
  if (card.name === level) return true;
  if (FIXED_TRUMP_NAMES.includes(card.name)) return true;
  return Boolean(trumpColor && card.color === trumpColor);
}

function trumpSortKey(card, level, trumpColor) {
  if (card.color === "z") {
    return card.name === "W" ? 0 : 1;
  }
  if (card.name === level) {
    return 10 + (COLOR_ORDER[card.color] ?? 9);
  }
  if (FIXED_TRUMP_NAMES.includes(card.name)) {
    return 20 + (FIXED_TRUMP_ORDER[card.name] ?? 9) * 10 + (COLOR_ORDER[card.color] ?? 9);
  }
  if (trumpColor && card.color === trumpColor) {
    return 100 + numericRank(card);
  }
  return 200 + numericRank(card);
}

function compareCardsForDisplay(a, b, level, trumpColor) {
  const cardA = parseCard(a);
  const cardB = parseCard(b);
  const groupA = isDisplayTrump(cardA, level, trumpColor) ? 0 : 1 + (COLOR_ORDER[cardA.color] ?? 9);
  const groupB = isDisplayTrump(cardB, level, trumpColor) ? 0 : 1 + (COLOR_ORDER[cardB.color] ?? 9);
  if (groupA !== groupB) return groupA - groupB;
  if (groupA === 0) {
    return trumpSortKey(cardA, level, trumpColor)
      - trumpSortKey(cardB, level, trumpColor)
      || numericRank(cardA) - numericRank(cardB)
      || (COLOR_ORDER[cardA.color] ?? 9) - (COLOR_ORDER[cardB.color] ?? 9);
  }
  return (COLOR_ORDER[cardA.color] ?? 9) - (COLOR_ORDER[cardB.color] ?? 9)
    || numericRank(cardA) - numericRank(cardB);
}

function inferLiangzhuColor(cardTypes) {
  for (const cardType of cardTypes || []) {
    const card = parseCard(cardType);
    if (card.color && card.color !== "z") {
      return card.color;
    }
  }
  return "z";
}

function clientId() {
  const key = "boardroom_upgrade_client_id";
  let value = wx.getStorageSync(key);
  if (!value) {
    value = `mp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    wx.setStorageSync(key, value);
  }
  return value;
}

Page({
  data: {
    roomId: "",
    name: "玩家",
    mySeat: -1,
    connected: false,
    state: {},
    phaseLabel: "连接中",
    trumpLabel: "待定",
    trumpRed: false,
    centerMessage: "正在连接牌桌",
    players: {
      me: { name: "玩家", avatar: "我", count: 0, role: "闲家", active: false },
      left: { name: "--", avatar: "L", count: 0, role: "闲家", active: false },
      top: { name: "--", avatar: "T", count: 0, role: "闲家", active: false },
      right: { name: "--", avatar: "R", count: 0, role: "闲家", active: false }
    },
    handCards: [],
    played: { top: [], left: [], right: [], bottom: [] },
    displayKittyCards: [],
    koupaiCards: [],
    handPrompt: "",
    canLiang: false,
    canPass: false,
    canKoupai: false,
    canHuanpai: false,
    canSuggest: false,
    canPlay: false,
    liangButtonText: "亮主",
    passButtonText: "不亮",
    liangModalVisible: false,
    liangOptions: [],
    resultVisible: false,
    gameResult: {}
  },

  socket: null,
  selectedKeys: null,
  selectedOfferIndexes: null,
  rawHandCards: null,
  autoStart: false,

  onLoad(options) {
    this.selectedKeys = new Set();
    this.selectedOfferIndexes = new Set();
    this.rawHandCards = [];
    const roomId = options.roomId || "";
    const name = options.name || "玩家";
    this.autoStart = options.autoStart === "1";
    this.setData({ roomId, name });
    if (!roomId) {
      wx.showToast({ title: "缺少房间号", icon: "none" });
      return;
    }
    this.connectRoom(roomId, name);
  },

  onUnload() {
    this.closeSocket();
  },

  connectRoom(roomId, name) {
    const app = getApp();
    this.closeSocket();
    const socket = wx.connectSocket({
      url: app.globalData.wsUrl,
      success: () => {}
    });
    this.socket = socket;
    socket.onOpen(() => {
      this.setData({ connected: true });
      this.send({
        action: "join",
        room_id: roomId,
        name,
        seat: -1,
        client_id: clientId()
      });
    });
    socket.onMessage((event) => {
      try {
        this.handleMessage(JSON.parse(event.data));
      } catch (error) {
        wx.showToast({ title: "消息解析失败", icon: "none" });
      }
    });
    socket.onClose(() => {
      this.setData({ connected: false });
    });
    socket.onError(() => {
      wx.showToast({ title: "连接失败", icon: "none" });
      this.setData({ connected: false });
    });
  },

  closeSocket() {
    if (this.socket) {
      try {
        this.socket.close({});
      } catch (error) {}
    }
    this.socket = null;
  },

  handleMessage(message) {
    if (message.action === "joined") {
      this.setData({
        mySeat: Number.isInteger(message.seat) ? message.seat : -1,
        roomId: message.room_id || this.data.roomId
      });
      if (message.msg) {
        wx.showToast({ title: message.msg, icon: "none" });
      }
      this.updateState(message.state || {});
      if (this.autoStart && message.seat >= 0 && message.state && message.state.phase === "waiting") {
        this.autoStart = false;
        this.send({ action: "start_game" });
      }
      return;
    }

    if (message.action === "state_update" || message.action === "state") {
      this.updateState(message.state || {});
      return;
    }

    if (["play_result", "koupai_result", "liangzhu_result", "huanpai_result"].includes(message.action)) {
      if (message.status === "error") {
        wx.showToast({ title: message.msg || "操作失败", icon: "none" });
      }
      return;
    }

    if (message.action === "suggest_play_result") {
      this.applySuggestion(message.suggestions || []);
    }
  },

  updateState(state) {
    const mySeat = Number.isInteger(state.my_seat) ? state.my_seat : this.data.mySeat;
    if (mySeat !== this.data.mySeat) {
      this.setData({ mySeat });
    }
    if (state.phase === "game_over" && state.game_result) {
      this.setData({ resultVisible: true, gameResult: state.game_result });
    }
    const derived = this.deriveViewState(state, mySeat);
    this.setData({
      state,
      ...derived
    });
  },

  deriveViewState(state, mySeat) {
    const trumpColor = state.now_color || "";
    const trumpLabel = trumpColor ? `${COLOR_SYMBOLS[trumpColor] || ""} ${COLOR_NAMES[trumpColor] || ""}` : "待定";
    const trumpRed = trumpColor === "b" || trumpColor === "d";
    const phaseLabel = PHASE_LABELS[state.phase] || state.phase || "等待";
    const rawCards = this.getMyCards(state, mySeat);
    this.rawHandCards = rawCards;
    const selectedIndexes = this.selectedIndexes(rawCards);
    const handCards = rawCards.map((cardType, index) => {
      const item = formatCard(cardType, "hand", index);
      item.selected = selectedIndexes.includes(index);
      item.disabled = !this.isHandCardSelectable(state, cardType);
      return item;
    });

    const positions = relativePositions(mySeat);
    const players = {
      me: this.playerView(state, mySeat, "我"),
      left: this.playerView(state, positions.left, "L"),
      top: this.playerView(state, positions.top, "T"),
      right: this.playerView(state, positions.right, "R")
    };

    const played = this.playedView(state, positions);
    const koupaiCards = (state.public_koupai_cards || state.koupai_cards || []).map((card, index) => formatCard(card, "koupai", index));
    const holeCards = (state.hole_cards || []).map((card, index) => formatCard(card, "hole", index));
    const offerCards = (state.huanpai_offer || []).map((card, index) => {
      const item = formatCard(card, "offer", index);
      item.pickable = state.phase === "huanpai" && state.liangzhu_player === mySeat;
      item.selected = this.selectedOfferIndexes.has(index);
      return item;
    });
    const displayKittyCards = koupaiCards.length
      ? koupaiCards
      : offerCards.length
        ? offerCards
        : holeCards.length ? holeCards : Array.from({ length: state.hole_cards_count || 4 }, (_, index) => ({
      key: `back-${index}`,
      displayRank: "",
      suit: "",
      red: false
    }));

    const canLiang = Boolean(state.can_liangzhu);
    const canPass = state.phase === "liangzhu" || Boolean(state.chipai_needs_action || state.can_chipai_pass);
    const canKoupai = state.phase === "koupai" && state.koupai_picker === mySeat;
    const canHuanpai = state.phase === "huanpai" && state.liangzhu_player === mySeat;
    const canPlay = state.phase === "playing" && state.current_turn === mySeat;
    const canSuggest = canKoupai || canHuanpai || canPlay;

    const liangOptions = (state.liangzhu_available_types || []).map((candidate, index) => {
      const color = candidate.color || inferLiangzhuColor(candidate.cards || []);
      return {
        ...candidate,
        index,
        suit: COLOR_SYMBOLS[color] || "★",
        title: `${COLOR_NAMES[color] || "主"} · ${candidate.label || LIANG_TYPE_LABELS[candidate.type] || "亮主"}`,
        cardsText: plainCards(candidate.cards || []),
        red: color === "b" || color === "d"
      };
    });

    return {
      phaseLabel,
      trumpLabel,
      trumpRed,
      players,
      handCards,
      played,
      displayKittyCards,
      koupaiCards,
      centerMessage: this.centerMessage(state, mySeat),
      handPrompt: this.handPrompt(state, mySeat, selectedIndexes.length),
      canLiang,
      canPass,
      canKoupai,
      canHuanpai,
      canSuggest,
      canPlay,
      liangButtonText: state.phase === "chipai" ? "吃牌" : "亮主",
      passButtonText: state.phase === "chipai" ? "不吃" : "不亮",
      liangOptions
    };
  },

  getPlayer(state, seat) {
    return (state.players || []).find((player) => player.seat === seat);
  },

  playerView(state, seat, fallbackAvatar) {
    const player = this.getPlayer(state, seat);
    const bankers = state.bankers || [];
    const active = state.current_turn === seat;
    const isBanker = bankers.includes(seat) || player?.is_banker;
    const avatar = fallbackAvatar === "我" ? "我" : fallbackAvatar;
    return {
      name: player?.name || "--",
      avatar,
      count: player?.card_count || 0,
      role: isBanker ? "庄家" : "闲家",
      active
    };
  },

  getMyCards(state, mySeat) {
    const player = this.getPlayer(state, mySeat);
    const cards = [...(player?.cards || [])];
    if (state.phase === "koupai" && state.koupai_picker === mySeat && state.hole_cards?.length) {
      cards.push(...state.hole_cards.map((card) => card.card_type || card.cardType || card));
    }
    return cards.sort((a, b) => compareCardsForDisplay(a, b, state.now_level || "A", state.now_color || ""));
  },

  selectedIndexes(cards) {
    const indexes = [];
    cards.forEach((_, index) => {
      if (this.selectedKeys.has(cardSelectionKey(cards, index))) {
        indexes.push(index);
      }
    });
    return indexes;
  },

  selectedCardTypes() {
    const cards = this.rawHandCards || [];
    return this.selectedIndexes(cards).map((index) => cards[index]).filter(Boolean);
  },

  selectCardTypes(cardTypes) {
    const remaining = [...cardTypes];
    const cards = this.rawHandCards || [];
    this.selectedKeys = new Set();
    cards.forEach((cardType, index) => {
      const matchIndex = remaining.indexOf(cardType);
      if (matchIndex >= 0) {
        this.selectedKeys.add(cardSelectionKey(cards, index));
        remaining.splice(matchIndex, 1);
      }
    });
    this.updateState(this.data.state);
  },

  clearSelection() {
    this.selectedKeys = new Set();
    this.updateState(this.data.state);
  },

  isHandCardSelectable(state, cardType) {
    if (state.phase === "huanpai" && state.liangzhu_player === this.data.mySeat) {
      const picked = this.getSelectedHuanpaiOfferCards(state);
      if (!picked.length) return false;
      const pickedNames = new Set(picked.map((card) => parseCard(card.card_type || card).name));
      return pickedNames.has(parseCard(cardType).name);
    }
    return true;
  },

  playedView(state, positions) {
    const slotBySeat = {
      [positions.top]: "top",
      [positions.left]: "left",
      [positions.right]: "right",
      [state.my_seat]: "bottom"
    };
    const result = { top: [], left: [], right: [], bottom: [] };
    const players = state.epoch_players || [];
    const cards = state.epoch_cards || [];
    players.forEach((seat, index) => {
      const slot = slotBySeat[seat];
      if (slot) {
        result[slot] = (cards[index] || []).map((card, cardIndex) => formatCard(card, `${slot}-${index}`, cardIndex));
      }
    });
    if (!players.length && state.last_epoch_players?.length) {
      state.last_epoch_players.forEach((seat, index) => {
        const slot = slotBySeat[seat];
        if (slot) {
          result[slot] = (state.last_epoch_cards[index] || []).map((card, cardIndex) => formatCard(card, `${slot}-last-${index}`, cardIndex));
        }
      });
    }
    return result;
  },

  centerMessage(state, mySeat) {
    if (!state.phase) return "等待连接";
    if (state.phase === "playing") {
      return `轮到 ${SEAT_NAMES[state.current_turn] || "玩家"} 出牌`;
    }
    if (state.phase === "liangzhu") {
      return state.can_liangzhu ? "亮主阶段：请选择亮主或不亮" : "亮主阶段：等待其他玩家";
    }
    if (state.phase === "chipai") {
      return state.can_liangzhu ? "吃牌阶段：可选择更大的亮主牌型" : "吃牌阶段：等待回应";
    }
    if (state.phase === "koupai") {
      return state.koupai_picker === mySeat ? "整理底牌阶段：请选择4张扣回底牌" : "整理底牌阶段：等待扣牌";
    }
    if (state.phase === "huanpai") {
      return state.liangzhu_player === mySeat ? "拾牌阶段：选择要拾的底牌并返牌" : "拾牌阶段：等待处理";
    }
    if (state.phase === "game_over") return "本局结束";
    return PHASE_LABELS[state.phase] || state.phase;
  },

  handPrompt(state, mySeat, selectedCount) {
    if (state.phase === "koupai" && state.koupai_picker === mySeat) {
      const picked = state.hole_cards?.length ? ` · 拾取：${plainCards(state.hole_cards)}` : "";
      return `请选择4张扣牌，已选${selectedCount}张${picked}`;
    }
    if (state.phase === "huanpai" && state.liangzhu_player === mySeat) {
      const picked = this.getSelectedHuanpaiOfferCards(state);
      const candidates = state.huanpai_return_candidates || [];
      return picked.length
        ? `已拾：${plainCards(picked)} · 可扣：${plainCards(candidates)} · 已选${selectedCount}张`
        : "请选择要拾的底牌";
    }
    if (state.phase === "playing" && state.current_turn === mySeat) {
      return `轮到你出牌，已选${selectedCount}张`;
    }
    return state.liangzhu_player >= 0
      ? `${SEAT_NAMES[state.liangzhu_player]} 已亮主 · ${plainCards(state.liangzhu_cards || [])}`
      : "等待亮主";
  },

  toggleCard(event) {
    const index = Number(event.currentTarget.dataset.index);
    const cards = this.rawHandCards || [];
    if (!Number.isInteger(index) || !cards[index]) return;
    if (!this.isHandCardSelectable(this.data.state, cards[index])) {
      wx.showToast({ title: "当前不能选择这张牌", icon: "none" });
      return;
    }
    const key = cardSelectionKey(cards, index);
    if (this.selectedKeys.has(key)) {
      this.selectedKeys.delete(key);
    } else {
      this.selectedKeys.add(key);
    }
    this.updateState(this.data.state);
  },

  toggleOfferCard(event) {
    const state = this.data.state;
    if (!(state.phase === "huanpai" && state.liangzhu_player === this.data.mySeat)) {
      return;
    }
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || !(state.huanpai_offer || [])[index]) {
      return;
    }
    if (this.selectedOfferIndexes.has(index)) {
      this.selectedOfferIndexes.delete(index);
    } else {
      this.selectedOfferIndexes.add(index);
    }
    this.selectedKeys = new Set();
    this.updateState(state);
  },

  openLiangModal() {
    if (!this.data.liangOptions.length) {
      wx.showToast({ title: "当前没有可亮的牌", icon: "none" });
      return;
    }
    if (this.data.liangOptions.length === 1) {
      const choice = this.data.liangOptions[0];
      this.send({ action: "liangzhu", cards: choice.cards || [], color: choice.color || inferLiangzhuColor(choice.cards || []) });
      return;
    }
    this.setData({ liangModalVisible: true });
  },

  closeLiangModal() {
    this.setData({ liangModalVisible: false });
  },

  noop() {},

  chooseLiang(event) {
    const index = Number(event.currentTarget.dataset.index);
    const choice = this.data.liangOptions[index];
    if (!choice) return;
    this.setData({ liangModalVisible: false });
    this.send({ action: "liangzhu", cards: choice.cards || [], color: choice.color || inferLiangzhuColor(choice.cards || []) });
  },

  passLiang() {
    this.send({ action: "pass_liangzhu" });
  },

  submitKoupai() {
    const cards = this.selectedCardTypes();
    if (cards.length !== 4) {
      wx.showToast({ title: `请选择4张扣牌，当前${cards.length}张`, icon: "none" });
      return;
    }
    this.send({ action: "koupai", cards });
    this.selectedKeys = new Set();
  },

  getSelectedHuanpaiOfferCards(state) {
    const offer = state.huanpai_offer || [];
    return [...this.selectedOfferIndexes].map((index) => offer[index]).filter(Boolean);
  },

  acceptHuanpai() {
    const pickCards = this.getSelectedHuanpaiOfferCards(this.data.state).map((card) => card.card_type || card);
    const cards = this.selectedCardTypes();
    if (!pickCards.length) {
      wx.showToast({ title: "请先选择要拾的底牌", icon: "none" });
      return;
    }
    if (cards.length !== pickCards.length) {
      wx.showToast({ title: `请返${pickCards.length}张同点数牌`, icon: "none" });
      return;
    }
    this.send({ action: "huanpai", accept: true, pick_cards: pickCards, cards });
    this.selectedKeys = new Set();
    this.selectedOfferIndexes = new Set();
  },

  passHuanpai() {
    this.send({ action: "huanpai", accept: false, cards: [] });
    this.selectedKeys = new Set();
    this.selectedOfferIndexes = new Set();
  },

  requestSuggestion() {
    if (this.data.state.phase === "playing") {
      this.send({ action: "suggest_play" });
      return;
    }
    if (this.data.state.phase === "koupai") {
      this.selectCardTypes((this.rawHandCards || []).slice(0, 4));
      return;
    }
    if (this.data.state.phase === "huanpai") {
      const offer = this.data.state.huanpai_offer || [];
      this.selectedOfferIndexes = new Set(offer.map((_, index) => index));
      const cards = [];
      const used = new Set();
      const hand = this.rawHandCards || [];
      offer.forEach((offerCard) => {
        const offerName = parseCard(offerCard).name;
        const index = hand.findIndex((cardType, cardIndex) => !used.has(cardIndex) && parseCard(cardType).name === offerName);
        if (index >= 0) {
          used.add(index);
          cards.push(hand[index]);
        }
      });
      this.selectCardTypes(cards);
    }
  },

  applySuggestion(suggestions) {
    if (!suggestions.length) {
      wx.showToast({ title: "暂无建议", icon: "none" });
      return;
    }
    this.selectCardTypes(suggestions[0].cards || []);
    wx.showToast({ title: suggestions[0].label || "已选择建议出牌", icon: "none" });
  },

  playCards() {
    const cards = this.selectedCardTypes();
    if (!cards.length) {
      wx.showToast({ title: "请先选择要出的牌", icon: "none" });
      return;
    }
    this.send({ action: "play", cards });
    this.selectedKeys = new Set();
  },

  continueNextGame() {
    this.setData({ resultVisible: false, gameResult: {} });
    this.selectedKeys = new Set();
    this.selectedOfferIndexes = new Set();
    this.send({ action: "start_game" });
  },

  leaveRoom() {
    this.send({ action: "leave" });
    this.closeSocket();
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: "/pages/home/index" })
    });
  },

  send(payload) {
    if (!this.socket || !this.data.connected) {
      wx.showToast({ title: "尚未连接房间", icon: "none" });
      return;
    }
    this.socket.send({
      data: JSON.stringify(payload),
      fail: () => wx.showToast({ title: "发送失败", icon: "none" })
    });
  }
});
