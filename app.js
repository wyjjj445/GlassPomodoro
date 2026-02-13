(() => {
  const BUILTIN_SOURCES = [
    { id: "builtin_yppp", name: "yppp(夜轻)", kind: "builtin", enabled: true, pc: "https://api.yppp.net/pc.php", mobile: "https://api.yppp.net/pe.php" },
    { id: "builtin_alcy", name: "alcy(栗次元API)", kind: "builtin", enabled: true, pc: "https://t.alcy.cc/", mobile: "https://t.alcy.cc/mp" },
  ];

  const DEFAULTS = { workM: 25, shortM: 5, longM: 15, longEvery: 4, autoSwitch: true, sound: true, autoBg: false, autoBgMin: 3 };
  const IDLE_TIMEOUT_MS = 15000;
  const IDB_NAME = "pomodoro_assets_v1";
  const IDB_STORE = "wallpapers";
  const LS_KEY = "pomodoro_mvp_v6_cinematic";
  const MAX_TASK_HISTORY = 100;
  const FOCUSABLE_SELECTOR = "button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

  const $ = (id) => document.getElementById(id);
  const els = {
    time: $("time"), bar: $("bar"), statusText: $("statusText"), cycle: $("cycle"), doneWork: $("doneWork"), doneBreak: $("doneBreak"), modeName: $("modeName"), remainText: $("remainText"), bgTip: $("bgTip"), bgSource: $("bgSource"), longEveryLabel: $("longEveryLabel"),
    startPauseBtn: $("startPauseBtn"), resetBtn: $("resetBtn"), skipBtn: $("skipBtn"), focusModeBtn: $("focusModeBtn"),
    overlay: $("overlay"), moreBtn: $("moreBtn"), moreMenu: $("moreMenu"), settingsModal: $("settingsModal"), sourceManagerModal: $("sourceManagerModal"),
    refreshBgBtn: $("refreshBgBtn"), downloadBgBtn: $("downloadBgBtn"), downloadBgDesc: $("downloadBgDesc"), openSourceManagerBtn: $("openSourceManagerBtn"), closeSourceManagerBtn: $("closeSourceManagerBtn"),
    bgProviderDropdown: $("bgProviderDropdown"), bgProviderTrigger: $("bgProviderTrigger"), bgProviderTriggerText: $("bgProviderTriggerText"), bgProviderMenu: $("bgProviderMenu"), bgProviderMenuList: $("bgProviderMenuList"),
    toggleAutoBtn: $("toggleAutoBtn"), toggleSoundBtn: $("toggleSoundBtn"), toggleAutoBgBtn: $("toggleAutoBgBtn"), autoBgMin: $("autoBgMin"), autoBgDesc: $("autoBgDesc"), bgOpacity: $("bgOpacity"), bgOpacityDesc: $("bgOpacityDesc"), toggleNightBtn: $("toggleNightBtn"), openSettingsBtn: $("openSettingsBtn"), closeSettingsBtn: $("closeSettingsBtn"),
    workM: $("workM"), shortM: $("shortM"), longM: $("longM"), longEvery: $("longEvery"),
    ambientClock: $("ambientClock"), ambientMode: $("ambientMode"), ambientTime: $("ambientTime"), exitFocusBtn: $("exitFocusBtn"),
    currentTaskInput: $("currentTaskInput"), saveTaskBtn: $("saveTaskBtn"), clearTaskBtn: $("clearTaskBtn"), clearTaskHistoryBtn: $("clearTaskHistoryBtn"), taskHistoryList: $("taskHistoryList"),
    sourceManagerList: $("sourceManagerList"), newSourceType: $("newSourceType"), newSourceTypeDropdown: $("newSourceTypeDropdown"), newSourceTypeTrigger: $("newSourceTypeTrigger"), newSourceTypeTriggerText: $("newSourceTypeTriggerText"), newSourceTypeMenu: $("newSourceTypeMenu"), newSourceTypeMenuList: $("newSourceTypeMenuList"), newSourceName: $("newSourceName"), newSourceUrl: $("newSourceUrl"), newSourceFile: $("newSourceFile"), newSourceUrlField: $("newSourceUrlField"), newSourceFileField: $("newSourceFileField"), addSourceBtn: $("addSourceBtn"),
  };

  const modeButtons = Array.from(document.querySelectorAll(".modeBtn"));

  const state = {
    mode: "work", running: false,
    durations: { work: 1500, short: 300, long: 900 }, remaining: 1500, total: 1500, timerId: null, endAtMs: null,
    cycle: 1, doneWork: 0, doneBreak: 0,
    autoSwitch: true, sound: true, autoBg: false, autoBgMin: 3,
    autoBgTimerId: null, nightMode: false, bgOpacity: 1,
    bgSources: [], bgCurrentSourceId: null, lastBgUrl: "", currentObjectUrl: "",
    currentBgSnapshotBlob: null, currentBgSnapshotExt: null, downloadState: "unavailable", downloadReason: "尚未加载背景",
    currentTask: "", taskHistory: [],
    idb: { db: null, ready: false },
    cinematic: { active: false, manual: false, idleTimerId: null, dragging: false, pos: null },
    ui: { focusTrapLayer: null, lastFocusEl: null, bgProviderMenuOpen: false, newSourceTypeMenuOpen: false },
  };

  const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const isMobileLayout = () => window.matchMedia("(max-width: 760px)").matches;
  const clampInt = (v, min, max, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  const modeLabel = (m) => (m === "work" ? "工作" : m === "short" ? "短休" : "长休");
  const sourceKindLabel = (k) => (k === "builtin" ? "内置" : k === "remote_api" ? "远程 API" : k === "remote_image" ? "图片直链" : "本地文件");
  const escapeHtml = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const setBgTip = (t, ms = 0) => { els.bgTip.textContent = t; if (ms > 0) setTimeout(() => { if (els.bgTip.textContent === t) els.bgTip.textContent = ""; }, ms); };
  const fmtTime = (sec) => `${String(Math.floor(Math.max(0, sec) / 60)).padStart(2, "0")}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;
  const fmtDateTime = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };

  function normalizeBgSource(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : uid("src");
    const kind = ["builtin", "remote_image", "remote_api", "local_file"].includes(raw.kind) ? raw.kind : null;
    if (!kind) return null;
    const now = Date.now();
    const item = { id, name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "未命名源", kind, enabled: raw.enabled !== false, createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now, updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now };
    if (kind === "builtin") {
      const b = BUILTIN_SOURCES.find((x) => x.id === id); if (!b) return null;
      item.pc = b.pc; item.mobile = b.mobile; if (!raw.name) item.name = b.name;
    }
    if (kind === "remote_image" || kind === "remote_api") { if (typeof raw.url !== "string" || !raw.url.trim()) return null; item.url = raw.url.trim(); }
    if (kind === "local_file") { if (typeof raw.fileId !== "string" || !raw.fileId.trim()) return null; item.fileId = raw.fileId; }
    return item;
  }

  function mergeSourcesWithBuiltin(savedSources) {
    const byId = new Map();
    BUILTIN_SOURCES.forEach((b) => byId.set(b.id, normalizeBgSource(b)));
    (Array.isArray(savedSources) ? savedSources : []).forEach((raw) => {
      const n = normalizeBgSource(raw); if (!n) return;
      if (n.kind === "builtin") {
        const base = byId.get(n.id); if (!base) return;
        base.name = n.name || base.name; base.enabled = n.enabled; base.updatedAt = n.updatedAt;
      } else byId.set(n.id, n);
    });
    return Array.from(byId.values());
  }

  const findSourceById = (id) => state.bgSources.find((s) => s.id === id) || null;
  const getEnabledSources = () => state.bgSources.filter((s) => s.enabled);

  function ensureSourceAvailability() {
    if (!Array.isArray(state.bgSources) || state.bgSources.length === 0) state.bgSources = mergeSourcesWithBuiltin([]);
    if (state.bgSources.every((s) => !s.enabled) && state.bgSources[0]) state.bgSources[0].enabled = true;
    if (!findSourceById(state.bgCurrentSourceId)) {
      const first = getEnabledSources()[0];
      state.bgCurrentSourceId = first ? first.id : null;
    }
  }

  function save() {
    const data = {
      workM: parseInt(els.workM.value, 10), shortM: parseInt(els.shortM.value, 10), longM: parseInt(els.longM.value, 10), longEvery: parseInt(els.longEvery.value, 10),
      autoSwitch: state.autoSwitch, sound: state.sound,
      mode: state.mode, running: state.running, remaining: state.remaining, total: state.total, endAtMs: state.endAtMs, cycle: state.cycle, doneWork: state.doneWork, doneBreak: state.doneBreak,
      autoBg: state.autoBg, autoBgMin: state.autoBgMin, nightMode: state.nightMode, bgOpacity: state.bgOpacity,
      currentTask: state.currentTask, taskHistory: state.taskHistory,
      bgSources: state.bgSources.map((s) => ({ id: s.id, name: s.name, kind: s.kind, enabled: s.enabled, url: s.url, fileId: s.fileId, createdAt: s.createdAt, updatedAt: s.updatedAt })),
      bgCurrentSourceId: state.bgCurrentSourceId,
      ambientClockPos: state.cinematic.pos,
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) { state.bgSources = mergeSourcesWithBuiltin([]); ensureSourceAvailability(); return; }
      const data = JSON.parse(raw);
      const workM = clampInt(data.workM, 1, 180, DEFAULTS.workM);
      const shortM = clampInt(data.shortM, 1, 60, DEFAULTS.shortM);
      const longM = clampInt(data.longM, 1, 120, DEFAULTS.longM);
      const longEvery = clampInt(data.longEvery, 2, 12, DEFAULTS.longEvery);
      els.workM.value = String(workM); els.shortM.value = String(shortM); els.longM.value = String(longM); els.longEvery.value = String(longEvery);
      state.durations = { work: workM * 60, short: shortM * 60, long: longM * 60 };
      state.autoSwitch = data.autoSwitch ?? DEFAULTS.autoSwitch; state.sound = data.sound ?? DEFAULTS.sound;
      state.mode = ["work", "short", "long"].includes(data.mode) ? data.mode : "work";
      state.total = clampInt(data.total, 1, 86400, state.durations[state.mode]);
      state.remaining = clampInt(data.remaining, 0, 86400, state.total);
      state.endAtMs = Number.isFinite(data.endAtMs) ? data.endAtMs : null;
      state.running = Boolean(data.running);
      state.cycle = clampInt(data.cycle, 1, 999, 1); state.doneWork = clampInt(data.doneWork, 0, 99999, 0); state.doneBreak = clampInt(data.doneBreak, 0, 99999, 0);
      state.autoBg = data.autoBg ?? DEFAULTS.autoBg; state.autoBgMin = clampInt(data.autoBgMin, 1, 60, DEFAULTS.autoBgMin); els.autoBgMin.value = String(state.autoBgMin);
      state.nightMode = Boolean(data.nightMode); state.bgOpacity = Math.max(0.3, Math.min(1, Number(data.bgOpacity) || 1)); els.bgOpacity.value = String(Math.round(state.bgOpacity * 100));
      state.currentTask = typeof data.currentTask === "string" ? data.currentTask : "";
      state.taskHistory = Array.isArray(data.taskHistory) ? data.taskHistory.map((t) => ({ id: typeof t.id === "string" ? t.id : uid("task"), title: typeof t.title === "string" ? t.title : "", count: clampInt(t.count, 1, 99999, 1), lastCompletedAt: Number.isFinite(t.lastCompletedAt) ? t.lastCompletedAt : Date.now() })).filter((t) => t.title.trim()).sort((a,b)=>b.lastCompletedAt-a.lastCompletedAt).slice(0, MAX_TASK_HISTORY) : [];
      state.bgSources = mergeSourcesWithBuiltin(data.bgSources);
      state.bgCurrentSourceId = typeof data.bgCurrentSourceId === "string" ? data.bgCurrentSourceId : null;
      if (!state.bgCurrentSourceId && Number.isFinite(data.bgProviderIndex)) {
        const idx = clampInt(data.bgProviderIndex, 0, BUILTIN_SOURCES.length - 1, 0);
        state.bgCurrentSourceId = BUILTIN_SOURCES[idx]?.id || null;
      }
      ensureSourceAvailability();
      if (data.ambientClockPos && Number.isFinite(data.ambientClockPos.left) && Number.isFinite(data.ambientClockPos.top)) state.cinematic.pos = data.ambientClockPos;
      if (state.running) {
        const remainingMs = (state.endAtMs || (Date.now() + state.remaining * 1000)) - Date.now();
        state.remaining = Math.max(0, Math.ceil(remainingMs / 1000)); state.running = false; state.endAtMs = null;
        els.statusText.textContent = state.remaining <= 0 ? "到点啦（刷新后已暂停）" : "已暂停（刷新后恢复）";
      }
    } catch (_) {
      state.bgSources = mergeSourcesWithBuiltin([]); ensureSourceAvailability();
    }
  }

  function render() {
    const text = fmtTime(state.remaining);
    els.time.textContent = text;
    els.remainText.textContent = text;
    els.ambientTime.textContent = text;
    els.ambientMode.textContent = modeLabel(state.mode);
    const progress = state.total > 0 ? (1 - state.remaining / state.total) : 0;
    els.bar.style.width = `${(Math.max(0, Math.min(1, progress)) * 100).toFixed(2)}%`;
    document.title = `${state.running ? "⏳" : "🍅"} ${text} · ${modeLabel(state.mode)}`;
    els.startPauseBtn.textContent = state.running ? "暂停" : "开始";
  }

  function renderStats() {
    const longEvery = clampInt(els.longEvery.value, 2, 12, DEFAULTS.longEvery);
    els.longEveryLabel.textContent = String(longEvery);
    els.cycle.textContent = String(state.cycle);
    els.doneWork.textContent = String(state.doneWork);
    els.doneBreak.textContent = String(state.doneBreak);
    els.modeName.textContent = modeLabel(state.mode);
    modeButtons.forEach((btn) => btn.setAttribute("aria-pressed", btn.dataset.mode === state.mode ? "true" : "false"));
  }

  function renderToggles() {
    els.toggleAutoBtn.textContent = `自动切换：${state.autoSwitch ? "开" : "关"}`;
    els.toggleSoundBtn.textContent = `提示音：${state.sound ? "开" : "关"}`;
    els.toggleAutoBgBtn.textContent = `自动：${state.autoBg ? "开" : "关"}`;
    els.autoBgDesc.textContent = `每 ${state.autoBgMin} 分钟换一次`;
    els.toggleNightBtn.textContent = `黑夜模式：${state.nightMode ? "开" : "关"}`;
    els.bgOpacityDesc.textContent = `当前 ${Math.round(state.bgOpacity * 100)}%`;
    els.focusModeBtn.textContent = state.cinematic.active ? "退出沉浸" : "沉浸模式";
  }

  function renderTaskPanel() {
    els.currentTaskInput.value = state.currentTask;
    if (!state.taskHistory.length) {
      els.taskHistoryList.innerHTML = '<div class="mono">暂无历史，完成一个工作番茄后会出现在这里</div>';
      return;
    }
    els.taskHistoryList.innerHTML = state.taskHistory.slice(0, 8).map((it) => `
      <div class="taskHistoryItem">
        <div class="taskHistoryBody">
          <div class="taskHistoryTitle">${escapeHtml(it.title)}</div>
          <div class="taskHistoryMeta">已完成 ${it.count} 个番茄 · ${fmtDateTime(it.lastCompletedAt)}</div>
        </div>
        <button class="taskHistoryDelete" data-act="remove-task" data-task-id="${escapeHtml(it.id)}" title="删除此记录">删除</button>
      </div>
    `).join("");
  }

  function updateDownloadState(stateName, reason, blob = null, ext = null) {
    state.downloadState = stateName;
    state.downloadReason = reason || "";
    state.currentBgSnapshotBlob = blob;
    state.currentBgSnapshotExt = ext;
    if (stateName === "ready") {
      els.downloadBgBtn.disabled = false;
      els.downloadBgBtn.textContent = "下载";
      if (els.downloadBgDesc) els.downloadBgDesc.textContent = "优先精确下载当前图像";
    } else {
      els.downloadBgBtn.disabled = true;
      els.downloadBgBtn.textContent = "不可下载";
      if (els.downloadBgDesc) els.downloadBgDesc.textContent = reason || "当前图像不可精确下载";
    }
  }

  function renderBgProviderMenu() {
    const enabled = getEnabledSources();
    if (!enabled.length) {
      els.bgProviderTriggerText.textContent = "无可用源";
      els.bgProviderMenuList.innerHTML = '<div class="mono" style="padding:8px 10px;">无可用源</div>';
      return;
    }

    if (!findSourceById(state.bgCurrentSourceId)?.enabled) {
      state.bgCurrentSourceId = enabled[0].id;
    }

    const current = findSourceById(state.bgCurrentSourceId) || enabled[0];
    els.bgProviderTriggerText.textContent = current.name;
    els.bgProviderMenuList.innerHTML = enabled.map((s) => `
      <button
        type="button"
        role="option"
        class="glassSelectOption ${s.id === state.bgCurrentSourceId ? "active" : ""}"
        aria-selected="${s.id === state.bgCurrentSourceId ? "true" : "false"}"
        data-act="select-bg-provider"
        data-source-id="${escapeHtml(s.id)}"
      >${escapeHtml(s.name)}</button>
    `).join("");
  }

  function openBgProviderMenu() {
    if (state.ui.bgProviderMenuOpen) return;
    state.ui.bgProviderMenuOpen = true;
    els.bgProviderDropdown.classList.add("open");
    els.bgProviderMenu.setAttribute("aria-hidden", "false");
    els.bgProviderTrigger.setAttribute("aria-expanded", "true");
  }

  function closeBgProviderMenu() {
    if (!state.ui.bgProviderMenuOpen) return;
    state.ui.bgProviderMenuOpen = false;
    els.bgProviderDropdown.classList.remove("open");
    els.bgProviderMenu.setAttribute("aria-hidden", "true");
    els.bgProviderTrigger.setAttribute("aria-expanded", "false");
  }

  function renderBgSourceSelect() {
    renderBgProviderMenu();
  }

  function renderNewSourceTypeMenu() {
    const options = [
      { value: "remote_image", label: "远程图片直链" },
      { value: "remote_api", label: "远程 API" },
      { value: "local_file", label: "本地文件" },
    ];
    const current = options.find((it) => it.value === els.newSourceType.value) || options[0];
    els.newSourceType.value = current.value;
    els.newSourceTypeTriggerText.textContent = current.label;
    els.newSourceTypeMenuList.innerHTML = options.map((it) => `
      <button
        type="button"
        role="option"
        class="glassSelectOption ${it.value === current.value ? "active" : ""}"
        aria-selected="${it.value === current.value ? "true" : "false"}"
        data-act="select-new-source-type"
        data-value="${it.value}"
      >${it.label}</button>
    `).join("");
  }

  function openNewSourceTypeMenu() {
    if (state.ui.newSourceTypeMenuOpen) return;
    state.ui.newSourceTypeMenuOpen = true;
    els.newSourceTypeDropdown.classList.add("open");
    els.newSourceTypeMenu.setAttribute("aria-hidden", "false");
    els.newSourceTypeTrigger.setAttribute("aria-expanded", "true");
  }

  function closeNewSourceTypeMenu() {
    if (!state.ui.newSourceTypeMenuOpen) return;
    state.ui.newSourceTypeMenuOpen = false;
    els.newSourceTypeDropdown.classList.remove("open");
    els.newSourceTypeMenu.setAttribute("aria-hidden", "true");
    els.newSourceTypeTrigger.setAttribute("aria-expanded", "false");
  }

  function selectNewSourceType(value) {
    if (!["remote_image", "remote_api", "local_file"].includes(value)) return;
    els.newSourceType.value = value;
    renderNewSourceTypeMenu();
    updateSourceCreateFields();
    closeNewSourceTypeMenu();
  }

  function renderBgSourceManager() {
    if (!state.bgSources.length) { els.sourceManagerList.innerHTML = '<div class="mono">暂无背景源</div>'; return; }
    els.sourceManagerList.innerHTML = state.bgSources.map((s, idx) => {
      const canDelete = s.kind !== "builtin";
      return `<div class="sourceItem" data-source-id="${escapeHtml(s.id)}"><div class="sourceInfo"><div class="sourceName">${escapeHtml(s.name)} ${s.id === state.bgCurrentSourceId ? '<span class="mono">(当前)</span>' : ''}</div><div class="sourceMeta">${sourceKindLabel(s.kind)} · ${s.enabled ? '已启用' : '已禁用'}</div></div><div class="sourceActions"><button data-act="set-current">设为当前</button><button data-act="edit">编辑</button><button data-act="toggle">${s.enabled ? '禁用' : '启用'}</button><button data-act="up" ${idx > 0 ? '' : 'disabled'}>上移</button><button data-act="down" ${idx < state.bgSources.length - 1 ? '' : 'disabled'}>下移</button><button data-act="remove" ${canDelete ? '' : 'disabled'}>删除</button></div></div>`;
    }).join("");
  }

  function setCurrentTask(text) {
    state.currentTask = (text || "").trim();
    renderTaskPanel();
    save();
  }

  function recordTaskCompletion() {
    const title = (state.currentTask || "").trim();
    if (!title) return;
    const existing = state.taskHistory.find((it) => it.title === title);
    if (existing) { existing.count += 1; existing.lastCompletedAt = Date.now(); }
    else state.taskHistory.push({ id: uid("task"), title, count: 1, lastCompletedAt: Date.now() });
    state.taskHistory = state.taskHistory.sort((a, b) => b.lastCompletedAt - a.lastCompletedAt).slice(0, MAX_TASK_HISTORY);
    renderTaskPanel();
    save();
  }

  function removeTaskHistoryItem(taskId) {
    const before = state.taskHistory.length;
    state.taskHistory = state.taskHistory.filter((it) => it.id !== taskId);
    if (state.taskHistory.length !== before) {
      renderTaskPanel();
      save();
      setBgTip("已删除任务历史", 1000);
    }
  }

  function clearTaskHistory() {
    if (!state.taskHistory.length) return;
    state.taskHistory = [];
    renderTaskPanel();
    save();
    setBgTip("任务历史已清空", 1200);
  }

  function withNoCache(url) { const sep = url.includes("?") ? "&" : "?"; return `${url}${sep}t=${Date.now()}_${Math.random().toString(16).slice(2)}`; }

  function preloadImage(url, timeoutMs = 4500) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let done = false;
      const timer = setTimeout(() => { if (done) return; done = true; img.src = ""; reject(new Error("timeout")); }, timeoutMs);
      img.onload = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
      img.onerror = () => { if (done) return; done = true; clearTimeout(timer); reject(new Error("error")); };
      img.referrerPolicy = "no-referrer";
      img.src = url;
    });
  }

  function clearCurrentObjectUrl() {
    if (state.currentObjectUrl) { URL.revokeObjectURL(state.currentObjectUrl); state.currentObjectUrl = ""; }
  }

  function setBackground(url, sourceName, isObjectUrl = false) {
    if (!isObjectUrl) clearCurrentObjectUrl();
    document.documentElement.style.setProperty("--bg-image", `url("${url}")`);
    state.lastBgUrl = url;
    els.bgSource.textContent = sourceName;
  }

  function getSourceStartIndex(startFrom) {
    const enabled = getEnabledSources();
    if (!enabled.length) return -1;
    const currentIdx = enabled.findIndex((s) => s.id === state.bgCurrentSourceId);
    if (startFrom === "next") return currentIdx < 0 ? 0 : (currentIdx + 1) % enabled.length;
    if (typeof startFrom === "string" && startFrom.startsWith("id:")) {
      const idx = enabled.findIndex((s) => s.id === startFrom.slice(3));
      if (idx >= 0) return idx;
    }
    return currentIdx < 0 ? 0 : currentIdx;
  }

  async function idbInit() {
    if (state.idb.ready && state.idb.db) return state.idb.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: "id" });
      };
      req.onsuccess = () => { state.idb.db = req.result; state.idb.ready = true; resolve(state.idb.db); };
      req.onerror = () => reject(req.error || new Error("idb_open_failed"));
    });
  }

  async function idbPutWallpaper(file) {
    const db = await idbInit();
    const id = uid("file");
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put({ id, blob: file, name: file.name, type: file.type, createdAt: Date.now() });
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error || new Error("idb_put_failed"));
    });
  }

  async function idbGetWallpaperBlob(fileId) {
    const db = await idbInit();
    return new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(fileId);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error || new Error("idb_get_failed"));
    });
  }

  async function idbDeleteWallpaper(fileId) {
    const db = await idbInit();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(fileId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("idb_delete_failed"));
    });
  }

  async function loadSourceAsset(source) {
    if (source.kind === "builtin") {
      const endpoint = isMobileLayout() ? (source.mobile || source.pc) : (source.pc || source.mobile);
      const url = withNoCache(endpoint);
      await preloadImage(url);
      return { url, downloadUrl: url, isObjectUrl: false };
    }
    if (source.kind === "remote_api") {
      const url = withNoCache(source.url);
      await preloadImage(url);
      return { url, downloadUrl: url, isObjectUrl: false };
    }
    if (source.kind === "remote_image") {
      const url = withNoCache(source.url);
      await preloadImage(url);
      return { url, downloadUrl: source.url, isObjectUrl: false };
    }
    const blob = await idbGetWallpaperBlob(source.fileId);
    if (!blob) throw new Error("local_file_missing");
    const objUrl = URL.createObjectURL(blob);
    await preloadImage(objUrl);
    clearCurrentObjectUrl();
    state.currentObjectUrl = objUrl;
    return { url: objUrl, downloadUrl: null, isObjectUrl: true, blob };
  }

  async function captureDownloadSnapshot(loaded, source) {
    if (source.kind === "local_file" && loaded.blob) {
      const ext = extByType(loaded.blob.type || "");
      updateDownloadState("ready", "", loaded.blob, ext);
      return;
    }

    try {
      const res = await fetch(loaded.url, { mode: "cors" });
      if (!res.ok) throw new Error("fetch_failed");
      const blob = await res.blob();
      const ext = extByType(res.headers.get("content-type") || blob.type || "");
      updateDownloadState("ready", "", blob, ext);
    } catch (_) {
      updateDownloadState("unavailable", "源站不允许跨域读取当前图像", null, null);
    }
  }

  async function refreshBackground({ startFrom = "current" } = {}) {
    ensureSourceAvailability();
    const enabled = getEnabledSources();
    if (!enabled.length) {
      updateDownloadState("unavailable", "没有可用背景源", null, null);
      setBgTip("没有可用背景源", 1600);
      return;
    }
    setBgTip("背景加载中…");
    const start = getSourceStartIndex(startFrom);
    for (let i = 0; i < enabled.length; i++) {
      const source = enabled[(start + i) % enabled.length];
      try {
        const loaded = await loadSourceAsset(source);
        setBackground(loaded.url, source.name, loaded.isObjectUrl);
        if (loaded.downloadUrl) state.lastBgUrl = loaded.downloadUrl;
        state.bgCurrentSourceId = source.id;
        await captureDownloadSnapshot(loaded, source);
        renderBgSourceSelect();
        renderBgSourceManager();
        save();
        setBgTip(`背景已更新（${source.name}）`, 1400);
        return;
      } catch (err) {
        const reason = err && err.message === "local_file_missing" ? "本地文件缺失" : "加载失败";
        setBgTip(`${source.name} ${reason}，尝试下一个…`);
      }
    }
    updateDownloadState("unavailable", "所有背景源均不可精确下载", null, null);
    setBgTip("所有背景源都加载失败（检查网络/配置）", 2200);
  }

  function renderBgAfterSourceChange(id, refresh = true) {
    const target = findSourceById(id);
    if (!target || !target.enabled) { setBgTip("该背景源不可用或已禁用", 1600); return; }
    state.bgCurrentSourceId = id;
    save();
    renderBgSourceSelect();
    if (refresh) refreshBackground({ startFrom: `id:${id}` }).catch(() => {});
  }

  function selectBgProvider(sourceId) {
    renderBgAfterSourceChange(sourceId, true);
    closeBgProviderMenu();
  }

  function addBgSource(payload) {
    const item = normalizeBgSource({ id: uid("src"), name: payload.name, kind: payload.kind, enabled: true, url: payload.url, fileId: payload.fileId, createdAt: Date.now(), updatedAt: Date.now() });
    if (!item) throw new Error("invalid_source_payload");
    state.bgSources.push(item);
    ensureSourceAvailability();
    save();
    renderBgSourceSelect();
    renderBgSourceManager();
  }

  function updateBgSource(id, patch) {
    const src = findSourceById(id);
    if (!src) return;
    if (typeof patch.name === "string" && patch.name.trim()) src.name = patch.name.trim();
    if ((src.kind === "remote_image" || src.kind === "remote_api") && typeof patch.url === "string" && patch.url.trim()) src.url = patch.url.trim();
    src.updatedAt = Date.now();
    save();
    renderBgSourceSelect();
    renderBgSourceManager();
  }

  async function removeBgSource(id) {
    const idx = state.bgSources.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const src = state.bgSources[idx];
    if (src.kind === "builtin") { setBgTip("内置源不可删除", 1600); return; }
    state.bgSources.splice(idx, 1);
    if (src.kind === "local_file" && src.fileId) await idbDeleteWallpaper(src.fileId).catch(() => {});
    ensureSourceAvailability();
    if (state.bgCurrentSourceId === id) {
      const first = getEnabledSources()[0];
      state.bgCurrentSourceId = first ? first.id : null;
    }
    save();
    renderBgSourceSelect();
    renderBgSourceManager();
  }

  function moveBgSource(id, dir) {
    const idx = state.bgSources.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = dir === "up" ? idx - 1 : idx + 1;
    if (next < 0 || next >= state.bgSources.length) return;
    const [item] = state.bgSources.splice(idx, 1);
    state.bgSources.splice(next, 0, item);
    save();
    renderBgSourceSelect();
    renderBgSourceManager();
  }

  function toggleBgSourceEnabled(id) {
    const src = findSourceById(id);
    if (!src) return;
    if (src.enabled) {
      if (getEnabledSources().length <= 1) { setBgTip("至少保留 1 个启用源", 1600); return; }
      src.enabled = false;
      if (state.bgCurrentSourceId === id) {
        const next = getEnabledSources()[0];
        state.bgCurrentSourceId = next ? next.id : null;
      }
    } else src.enabled = true;
    src.updatedAt = Date.now();
    ensureSourceAvailability();
    save();
    renderBgSourceSelect();
    renderBgSourceManager();
  }

  function updateSourceCreateFields() {
    const isLocal = els.newSourceType.value === "local_file";
    els.newSourceUrlField.style.display = isLocal ? "none" : "";
    els.newSourceFileField.style.display = isLocal ? "" : "none";
  }

  async function addSourceFromForm() {
    const type = els.newSourceType.value;
    const name = (els.newSourceName.value || "").trim();
    if (!name) { setBgTip("请填写背景源名称", 1600); return; }
    if (type === "remote_image" || type === "remote_api") {
      const url = (els.newSourceUrl.value || "").trim();
      if (!url) { setBgTip("请填写 URL", 1600); return; }
      try { new URL(url); } catch (_) { setBgTip("URL 格式不正确", 1600); return; }
      addBgSource({ name, kind: type, url });
      els.newSourceName.value = ""; els.newSourceUrl.value = "";
      setBgTip("背景源已新增", 1000);
      return;
    }
    const file = els.newSourceFile.files && els.newSourceFile.files[0];
    if (!file) { setBgTip("请选择本地图片", 1600); return; }
    if (!file.type.startsWith("image/")) { setBgTip("仅支持图片文件", 1600); return; }
    const fileId = await idbPutWallpaper(file);
    addBgSource({ name, kind: "local_file", fileId });
    els.newSourceName.value = ""; els.newSourceFile.value = "";
    setBgTip("本地背景源已新增", 1000);
  }

  function onSourceManagerListClick(e) {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const item = e.target.closest(".sourceItem");
    if (!item) return;
    const id = item.getAttribute("data-source-id");
    const act = btn.getAttribute("data-act");
    if (act === "set-current") return renderBgAfterSourceChange(id, true);
    if (act === "toggle") return toggleBgSourceEnabled(id);
    if (act === "up") return moveBgSource(id, "up");
    if (act === "down") return moveBgSource(id, "down");
    if (act === "remove") { if (window.confirm("确认删除该背景源？")) removeBgSource(id).catch(() => setBgTip("删除失败", 1600)); return; }
    if (act === "edit") {
      const src = findSourceById(id); if (!src) return;
      const name = window.prompt("编辑名称", src.name); if (name === null) return;
      const patch = { name: name.trim() || src.name };
      if (src.kind === "remote_image" || src.kind === "remote_api") {
        const nextUrl = window.prompt("编辑 URL", src.url || ""); if (nextUrl === null) return;
        const u = nextUrl.trim(); if (!u) { setBgTip("URL 不能为空", 1600); return; }
        try { new URL(u); } catch (_) { setBgTip("URL 格式不正确", 1600); return; }
        patch.url = u;
      }
      updateBgSource(id, patch);
      setBgTip("背景源已更新", 1000);
    }
  }

  function extByType(t) {
    if (!t) return "jpg";
    if (t.includes("png")) return "png";
    if (t.includes("webp")) return "webp";
    if (t.includes("gif")) return "gif";
    if (t.includes("bmp")) return "bmp";
    if (t.includes("svg")) return "svg";
    return "jpg";
  }

  function fileNameByNow(ext) {
    const d = new Date();
    const p = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}${String(d.getSeconds()).padStart(2,"0")}`;
    return `pomodoro-bg-${p}.${ext}`;
  }

  async function downloadBlob(blob, fileName) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 500);
  }

  async function downloadCurrentBackground() {
    if (state.downloadState !== "ready" || !state.currentBgSnapshotBlob) {
      setBgTip(state.downloadReason || "当前图像不可精确下载", 2200);
      return;
    }
    const ext = state.currentBgSnapshotExt || extByType(state.currentBgSnapshotBlob.type || "");
    await downloadBlob(state.currentBgSnapshotBlob, fileNameByNow(ext));
    setBgTip("已精确下载当前背景", 1200);
  }

  function start() {
    if (state.running) return;
    state.running = true;
    state.endAtMs = Date.now() + Math.max(0, state.remaining) * 1000;
    els.statusText.textContent = "进行中…";
    state.timerId = setInterval(tick, 1000);
    render();
    save();
  }

  function pause() {
    if (state.running && Number.isFinite(state.endAtMs)) {
      state.remaining = Math.max(0, Math.ceil((state.endAtMs - Date.now()) / 1000));
    }
    state.running = false;
    state.endAtMs = null;
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
    els.statusText.textContent = "已暂停";
    render();
    save();
  }

  function reset() {
    pause();
    state.remaining = state.durations[state.mode];
    state.total = state.durations[state.mode];
    els.statusText.textContent = "准备开始";
    render();
    save();
  }

  function applyMode(mode, opts = {}) {
    const { resetRemaining = true, stop = true } = opts;
    if (stop) pause();
    state.mode = mode;
    state.total = state.durations[mode];
    if (resetRemaining) state.remaining = state.total;
    els.statusText.textContent = "准备开始";
    renderStats();
    render();
    save();
  }

  function nextSegment() {
    const longEvery = clampInt(els.longEvery.value, 2, 12, DEFAULTS.longEvery);
    if (state.mode === "work") {
      state.doneWork += 1;
      recordTaskCompletion();
      applyMode((state.cycle % longEvery === 0) ? "long" : "short", { resetRemaining: true, stop: true });
    } else {
      state.doneBreak += 1;
      state.cycle += 1;
      applyMode("work", { resetRemaining: true, stop: true });
    }
    renderStats();
    save();
  }

  function tick() {
    if (!state.running) return;
    if (!Number.isFinite(state.endAtMs)) state.endAtMs = Date.now() + state.remaining * 1000;
    state.remaining = Math.max(0, Math.ceil((state.endAtMs - Date.now()) / 1000));
    if (state.remaining <= 0) {
      state.remaining = 0;
      render();
      if (state.sound) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.04;
          o.connect(g); g.connect(ctx.destination); o.start();
          setTimeout(() => { o.stop(); ctx.close(); }, 240);
        } catch (_) {}
      }
      pause();
      nextSegment();
      refreshBackground({ startFrom: "next" }).catch(() => {});
      if (state.autoSwitch) start();
      else els.statusText.textContent = "到点啦（等待你开始下一段）";
      return;
    }
    render();
  }

  function clearAutoBgScheduler() {
    if (state.autoBgTimerId) clearInterval(state.autoBgTimerId);
    state.autoBgTimerId = null;
  }

  function ensureAutoBgScheduler() {
    clearAutoBgScheduler();
    if (!state.autoBg) return;
    state.autoBgTimerId = setInterval(() => refreshBackground({ startFrom: "next" }).catch(() => {}), Math.max(1, state.autoBgMin) * 60000);
  }

  function applyDurationsFromInputs() {
    const workM = clampInt(els.workM.value, 1, 180, DEFAULTS.workM);
    const shortM = clampInt(els.shortM.value, 1, 60, DEFAULTS.shortM);
    const longM = clampInt(els.longM.value, 1, 120, DEFAULTS.longM);
    const longEvery = clampInt(els.longEvery.value, 2, 12, DEFAULTS.longEvery);
    els.workM.value = String(workM); els.shortM.value = String(shortM); els.longM.value = String(longM); els.longEvery.value = String(longEvery);
    state.durations.work = workM * 60; state.durations.short = shortM * 60; state.durations.long = longM * 60;
    pause(); state.total = state.durations[state.mode]; state.remaining = state.total;
    els.statusText.textContent = "设置已保存";
    renderStats(); render(); save();
  }

  function setOverlay(open) {
    if (open) { els.overlay.classList.add("open"); els.overlay.setAttribute("aria-hidden", "false"); }
    else { els.overlay.classList.remove("open"); els.overlay.setAttribute("aria-hidden", "true"); }
    if (isMobileLayout()) document.body.style.overflow = open ? "hidden" : "";
  }

  function getFocusableInLayer(layerEl) { return Array.from(layerEl.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el instanceof HTMLElement && (el.offsetParent !== null || el === document.activeElement)); }
  function focusFirstInLayer(layerEl) { const list = getFocusableInLayer(layerEl); if (list[0]) list[0].focus(); }
  function restoreLayerFocus() { if (state.ui.lastFocusEl && typeof state.ui.lastFocusEl.focus === "function") state.ui.lastFocusEl.focus(); state.ui.lastFocusEl = null; }

  function trapFocusIfNeeded(e) {
    if (e.key !== "Tab") return;
    const layer = state.ui.focusTrapLayer;
    if (!layer || !layer.classList.contains("open")) return;
    const list = getFocusableInLayer(layer);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function anyLayerOpen() { return els.moreMenu.classList.contains("open") || els.settingsModal.classList.contains("open") || els.sourceManagerModal.classList.contains("open"); }

  function positionMoreMenuNearButton() {
    if (isMobileLayout()) return;
    const btnRect = els.moreBtn.getBoundingClientRect();
    const gap = 10;
    const pad = 12;
    const menuW = els.moreMenu.offsetWidth;
    const menuH = els.moreMenu.offsetHeight;
    let left = btnRect.right - menuW;
    left = Math.max(pad, Math.min(left, window.innerWidth - menuW - pad));
    let top = btnRect.bottom + gap;
    const bottomSpace = window.innerHeight - top;
    if (bottomSpace < menuH + pad) {
      top = Math.max(pad, btnRect.top - gap - menuH);
    }
    els.moreMenu.style.left = `${left}px`;
    els.moreMenu.style.top = `${top}px`;
  }

  function openMore() {
    closeBgProviderMenu();
    state.ui.lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : els.moreBtn;
    els.moreMenu.classList.add("open"); els.moreMenu.setAttribute("aria-hidden", "false"); els.moreBtn.setAttribute("aria-expanded", "true");
    state.ui.focusTrapLayer = els.moreMenu; setOverlay(true); positionMoreMenuNearButton(); focusFirstInLayer(els.moreMenu);
  }

  function closeMore(restoreFocus = true) {
    closeBgProviderMenu();
    els.moreMenu.classList.remove("open"); els.moreMenu.setAttribute("aria-hidden", "true"); els.moreBtn.setAttribute("aria-expanded", "false");
    if (!els.settingsModal.classList.contains("open") && !els.sourceManagerModal.classList.contains("open")) { state.ui.focusTrapLayer = null; if (restoreFocus) restoreLayerFocus(); }
    if (!anyLayerOpen()) setOverlay(false);
  }

  function openSettings() { closeMore(false); closeSourceManager(false); state.ui.lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : els.openSettingsBtn; els.settingsModal.classList.add("open"); els.settingsModal.setAttribute("aria-hidden", "false"); state.ui.focusTrapLayer = els.settingsModal; setOverlay(true); focusFirstInLayer(els.settingsModal); }
  function closeSettings(restoreFocus = true) { closeBgProviderMenu(); els.settingsModal.classList.remove("open"); els.settingsModal.setAttribute("aria-hidden", "true"); if (!els.moreMenu.classList.contains("open") && !els.sourceManagerModal.classList.contains("open")) { state.ui.focusTrapLayer = null; if (restoreFocus) restoreLayerFocus(); } if (!anyLayerOpen()) setOverlay(false); }
  function openSourceManager() { closeBgProviderMenu(); closeMore(false); closeSettings(false); state.ui.lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : els.openSourceManagerBtn; renderBgSourceManager(); els.sourceManagerModal.classList.add("open"); els.sourceManagerModal.setAttribute("aria-hidden", "false"); state.ui.focusTrapLayer = els.sourceManagerModal; setOverlay(true); focusFirstInLayer(els.sourceManagerModal); }
  function closeSourceManager(restoreFocus = true) { closeNewSourceTypeMenu(); els.sourceManagerModal.classList.remove("open"); els.sourceManagerModal.setAttribute("aria-hidden", "true"); if (!els.moreMenu.classList.contains("open") && !els.settingsModal.classList.contains("open")) { state.ui.focusTrapLayer = null; if (restoreFocus) restoreLayerFocus(); } if (!anyLayerOpen()) setOverlay(false); }

  function applyThemeSettings() { document.body.classList.toggle("night-mode", state.nightMode); document.documentElement.style.setProperty("--bg-opacity", String(state.bgOpacity)); }

  function clampAmbientPosition(left, top, width, height) {
    const pad = 8;
    return { left: Math.max(pad, Math.min(left, Math.max(pad, window.innerWidth - width - pad))), top: Math.max(pad, Math.min(top, Math.max(pad, window.innerHeight - height - pad))) };
  }

  function applyAmbientPosition() {
    if (!state.cinematic.pos) { els.ambientClock.classList.remove("freePos"); els.ambientClock.style.left = "50%"; els.ambientClock.style.top = "50%"; return; }
    const rect = els.ambientClock.getBoundingClientRect();
    const next = clampAmbientPosition(state.cinematic.pos.left, state.cinematic.pos.top, rect.width || 220, rect.height || 120);
    state.cinematic.pos = next;
    els.ambientClock.classList.add("freePos");
    els.ambientClock.style.left = `${next.left}px`; els.ambientClock.style.top = `${next.top}px`;
  }

  function setCinematicMode(active, manual = false) {
    state.cinematic.active = active; state.cinematic.manual = active ? manual : false;
    if (active) { closeMore(false); closeSettings(false); closeSourceManager(false); state.ui.focusTrapLayer = null; state.ui.lastFocusEl = null; setOverlay(false); els.statusText.textContent = manual ? "沉浸模式（手动）" : "沉浸模式（自动）"; }
    else if (!state.running) els.statusText.textContent = "准备开始";
    document.body.classList.toggle("cinematic", active); if (active) applyAmbientPosition(); renderToggles();
  }

  function clearIdleTimer() { if (state.cinematic.idleTimerId) clearTimeout(state.cinematic.idleTimerId); state.cinematic.idleTimerId = null; }
  function armIdleTimer() { clearIdleTimer(); state.cinematic.idleTimerId = setTimeout(() => { if (!state.cinematic.active) setCinematicMode(true, false); }, IDLE_TIMEOUT_MS); }
  function markInteraction() { armIdleTimer(); if (state.cinematic.active && !state.cinematic.manual) setCinematicMode(false, false); }

  function setupAmbientDrag() {
    let dragOffsetX = 0, dragOffsetY = 0;
    const onMove = (e) => {
      if (!state.cinematic.dragging) return;
      const rect = els.ambientClock.getBoundingClientRect();
      const next = clampAmbientPosition(e.clientX - dragOffsetX, e.clientY - dragOffsetY, rect.width || 220, rect.height || 120);
      state.cinematic.pos = next;
      applyAmbientPosition();
    };
    const onUp = () => {
      if (!state.cinematic.dragging) return;
      state.cinematic.dragging = false;
      els.ambientClock.classList.remove("dragging");
      save();
    };
    els.ambientClock.addEventListener("pointerdown", (e) => {
      if (!state.cinematic.active || e.target.closest("#exitFocusBtn")) return;
      const rect = els.ambientClock.getBoundingClientRect();
      if (!state.cinematic.pos) state.cinematic.pos = { left: rect.left, top: rect.top };
      dragOffsetX = e.clientX - rect.left; dragOffsetY = e.clientY - rect.top;
      state.cinematic.dragging = true;
      els.ambientClock.classList.add("dragging");
      els.ambientClock.setPointerCapture(e.pointerId);
    });
    els.ambientClock.addEventListener("pointermove", onMove);
    els.ambientClock.addEventListener("pointerup", onUp);
    els.ambientClock.addEventListener("pointercancel", onUp);
  }

  function bindEvents() {
    els.startPauseBtn.addEventListener("click", () => state.running ? pause() : start());
    els.resetBtn.addEventListener("click", reset);
    els.skipBtn.addEventListener("click", () => { pause(); nextSegment(); refreshBackground({ startFrom: "next" }).catch(() => {}); });
    els.focusModeBtn.addEventListener("click", () => setCinematicMode(!(state.cinematic.active && state.cinematic.manual), true));
    els.exitFocusBtn.addEventListener("click", () => setCinematicMode(false));

    els.moreBtn.addEventListener("click", (e) => { e.stopPropagation(); els.moreMenu.classList.contains("open") ? closeMore() : openMore(); });
    els.moreMenu.addEventListener("click", (e) => e.stopPropagation());
    els.settingsModal.addEventListener("click", (e) => e.stopPropagation());
    els.sourceManagerModal.addEventListener("click", (e) => e.stopPropagation());
    els.bgProviderDropdown.addEventListener("click", (e) => e.stopPropagation());
    els.newSourceTypeDropdown.addEventListener("click", (e) => e.stopPropagation());

    els.overlay.addEventListener("click", () => {
      if (state.ui.bgProviderMenuOpen) closeBgProviderMenu();
      if (els.sourceManagerModal.classList.contains("open")) closeSourceManager();
      else if (els.settingsModal.classList.contains("open")) closeSettings();
      else if (els.moreMenu.classList.contains("open")) closeMore();
      if (!anyLayerOpen()) setOverlay(false);
    });

    els.refreshBgBtn.addEventListener("click", () => refreshBackground({ startFrom: "current" }));
    els.downloadBgBtn.addEventListener("click", () => downloadCurrentBackground().catch(() => setBgTip("下载背景失败", 1800)));
    els.bgProviderTrigger.addEventListener("click", () => {
      if (state.ui.bgProviderMenuOpen) closeBgProviderMenu();
      else openBgProviderMenu();
    });
    els.bgProviderMenuList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act='select-bg-provider']");
      if (!btn) return;
      selectBgProvider(btn.getAttribute("data-source-id"));
    });

    els.openSourceManagerBtn.addEventListener("click", openSourceManager);
    els.closeSourceManagerBtn.addEventListener("click", () => closeSourceManager(true));
    els.newSourceTypeTrigger.addEventListener("click", () => {
      if (state.ui.newSourceTypeMenuOpen) closeNewSourceTypeMenu();
      else openNewSourceTypeMenu();
    });
    els.newSourceTypeMenuList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act='select-new-source-type']");
      if (!btn) return;
      selectNewSourceType(btn.getAttribute("data-value"));
    });
    els.addSourceBtn.addEventListener("click", () => addSourceFromForm().catch(() => setBgTip("新增背景源失败", 1800)));
    els.sourceManagerList.addEventListener("click", onSourceManagerListClick);

    els.toggleAutoBtn.addEventListener("click", () => { state.autoSwitch = !state.autoSwitch; renderToggles(); save(); });
    els.toggleSoundBtn.addEventListener("click", () => { state.sound = !state.sound; renderToggles(); save(); });
    els.toggleAutoBgBtn.addEventListener("click", () => { state.autoBg = !state.autoBg; renderToggles(); ensureAutoBgScheduler(); save(); });
    els.toggleNightBtn.addEventListener("click", () => { state.nightMode = !state.nightMode; applyThemeSettings(); renderToggles(); save(); });
    els.autoBgMin.addEventListener("change", () => { state.autoBgMin = clampInt(els.autoBgMin.value, 1, 60, DEFAULTS.autoBgMin); els.autoBgMin.value = String(state.autoBgMin); renderToggles(); ensureAutoBgScheduler(); save(); });
    els.bgOpacity.addEventListener("input", () => { state.bgOpacity = Math.max(0.3, Math.min(1, Number(els.bgOpacity.value) / 100)); applyThemeSettings(); renderToggles(); save(); });

    els.openSettingsBtn.addEventListener("click", openSettings);
    els.closeSettingsBtn.addEventListener("click", () => closeSettings(true));

    modeButtons.forEach((btn) => btn.addEventListener("click", () => applyMode(btn.dataset.mode, { resetRemaining: true, stop: true })));
    ["workM", "shortM", "longM", "longEvery"].forEach((id) => els[id].addEventListener("change", applyDurationsFromInputs));

    els.saveTaskBtn.addEventListener("click", () => { setCurrentTask(els.currentTaskInput.value); setBgTip("任务已保存", 1000); });
    els.clearTaskBtn.addEventListener("click", () => { setCurrentTask(""); setBgTip("已清空当前任务", 1000); });
    els.clearTaskHistoryBtn.addEventListener("click", () => {
      if (!state.taskHistory.length) return;
      if (!window.confirm("确认清空任务历史？")) return;
      clearTaskHistory();
    });
    els.currentTaskInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); setCurrentTask(els.currentTaskInput.value); setBgTip("任务已保存", 1000); } });
    els.taskHistoryList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act='remove-task']");
      if (!btn) return;
      removeTaskHistoryItem(btn.getAttribute("data-task-id"));
    });

    window.addEventListener("keydown", (e) => {
      trapFocusIfNeeded(e);
      if (e.key === "Escape") {
        if (state.ui.newSourceTypeMenuOpen) {
          closeNewSourceTypeMenu();
          return;
        }
        if (state.ui.bgProviderMenuOpen) {
          closeBgProviderMenu();
          return;
        }
        if (state.cinematic.active) setCinematicMode(false);
        else if (els.sourceManagerModal.classList.contains("open")) closeSourceManager(true);
        else if (els.settingsModal.classList.contains("open")) closeSettings(true);
        else if (els.moreMenu.classList.contains("open")) closeMore(true);
        if (!anyLayerOpen()) setOverlay(false);
        return;
      }
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.code === "Space") { e.preventDefault(); state.running ? pause() : start(); }
      if (e.key.toLowerCase() === "r") reset();
      if (e.key.toLowerCase() === "n") { pause(); nextSegment(); refreshBackground({ startFrom: "next" }).catch(() => {}); }
      if (e.key.toLowerCase() === "i") setCinematicMode(!(state.cinematic.active && state.cinematic.manual), true);
      if (e.key.toLowerCase() === "d") { state.nightMode = !state.nightMode; applyThemeSettings(); renderToggles(); save(); }
    });

    window.addEventListener("resize", () => { if (els.moreMenu.classList.contains("open")) positionMoreMenuNearButton(); if (state.cinematic.pos) applyAmbientPosition(); });
    window.addEventListener("visibilitychange", () => { if (!document.hidden && state.running) tick(); });
    window.addEventListener("click", () => {
      if (state.ui.bgProviderMenuOpen) closeBgProviderMenu();
      if (state.ui.newSourceTypeMenuOpen) closeNewSourceTypeMenu();
    });
    window.addEventListener("beforeunload", () => { clearCurrentObjectUrl(); save(); });
    window.addEventListener("pagehide", save);
    ["mousemove", "mousedown", "touchstart", "keydown", "scroll"].forEach((type) => window.addEventListener(type, markInteraction, { passive: true }));
  }

  async function bootstrap() {
    await idbInit().catch(() => setBgTip("本地壁纸功能不可用（IndexedDB 打开失败）", 2200));
    load();
    ensureSourceAvailability();
    state.autoBgMin = clampInt(els.autoBgMin.value, 1, 60, state.autoBgMin);
    state.autoBg = state.autoBg ?? DEFAULTS.autoBg;
    if (!Number.isFinite(state.total) || state.total <= 0) state.total = state.durations[state.mode];
    if (!Number.isFinite(state.remaining) || state.remaining < 0 || state.remaining > state.total) state.remaining = state.total;

    renderStats();
    renderToggles();
    renderTaskPanel();
    renderBgSourceSelect();
    renderNewSourceTypeMenu();
    renderBgSourceManager();
    applyThemeSettings();
    ensureAutoBgScheduler();
    updateDownloadState("unavailable", "尚未加载背景", null, null);
    render();
    applyAmbientPosition();
    setupAmbientDrag();
    updateSourceCreateFields();

    await refreshBackground({ startFrom: "current" }).catch(() => {});
    armIdleTimer();
  }

  bindEvents();
  bootstrap().catch(() => setBgTip("初始化失败，请刷新重试", 2200));
})();
