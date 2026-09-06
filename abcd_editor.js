'use strict';
/*! abcd_editor.js — 体验·内容 创作模块
    作者端 UI（独立于原生播放器与可玩导出运行时，不改动其实现）：
      A 收藏品集合（CG/音乐/结局/成就）CRUD + 安全条件校验 + 媒体预览
      B 主页 Logo / BGM / 开场动画 + 可拖拽菜单定位（百分比坐标持久化）
      C 台词批量编辑（保留元数据）+ 台词内查找替换（复用现有全文替换机制）
      D 场景外观预设（捕捉/应用，可撤销）+ 章节 CRUD + 进度设置
    加载方式：index.html 内联主脚本之后 <script src="abcd_editor.js"></script>。
    模型函数为纯逻辑（Node 可直接 require 测试）；编辑器接入自动安装。 */
(function (root) {
  const IS_NODE = typeof module !== 'undefined' && !!module.exports;
  const PARSER = IS_NODE ? (function () { try { return require('./condition_parser'); } catch (e) { return null; } })() : null;

  /* ---------------- 基础工具 ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function nid(p) { return (p || 'a') + '_' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8); }
  function str(v) { return v == null ? '' : String(v); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }
  function clamp01(v, d) { const n = num(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; }
  function clampPct(v, d) { const n = num(v); return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n)) * 10) / 10 : d; }
  function nowMs() { return new Date().getTime(); }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  /* 编辑器主脚本环境访问：尽量直接使用裸标识（同一全局词法环境），全部 try/typeof 兜底，
    使本模块既可在真实浏览器/内联环境中运行，也可在 Node 中被 require 做纯逻辑测试。 */
  function curProject() { try { if (typeof project !== 'undefined' && project) return project; } catch (e) {} return null; }
  function curSceneId() { try { if (typeof selectedSceneId !== 'undefined') return selectedSceneId; } catch (e) {} return null; }
  function qe(sel) { try { if (typeof $ === 'function') return $(sel); } catch (e) {} try { if (typeof document !== 'undefined' && document) return document.querySelector(sel); } catch (e) {} return null; }
  function qel(sel) { try { if (typeof $$ === 'function') return $$(sel); } catch (e) {} try { if (typeof document !== 'undefined' && document) return Array.prototype.slice.call(document.querySelectorAll(sel)); } catch (e) {} return []; }
  function gel(id) { try { if (typeof document !== 'undefined' && document && document.getElementById) return document.getElementById(id); } catch (e) {} return null; }
  function snapBefore() { try { if (typeof commitUndoSnapshot === 'function') commitUndoSnapshot(); } catch (e) {} }
  function snapAfter() { try { if (typeof commitUndoSnapshot === 'function') commitUndoSnapshot(); } catch (e) {} }
  function persistSave() { try { if (typeof saveEditor === 'function') saveEditor(); } catch (e) {} }
  function persistNow() { try { if (typeof flushSaveEditor === 'function') flushSaveEditor(); } catch (e) { persistSave(); } }
  function redrawAll() { try { if (typeof renderAll === 'function') renderAll(); } catch (e) {} }
  function toastMsg(m) { try { if (typeof toast === 'function') toast(m); } catch (e) {} }
  function baselineReset() { try { if (typeof editorResetBaseline === 'function') editorResetBaseline(); } catch (e) {} }

  /* ---------------- 公开常量 ---------------- */
  const BUCKETS = [
    { key: 'cgs', label: 'CG 画廊', media: 'image', hint: '标题 / 图片来源 / 解锁条件 / 解锁场景' },
    { key: 'music', label: '音乐鉴赏', media: 'audio', hint: '标题 / 音频来源 / 解锁条件 / 解锁场景' },
    { key: 'endings', label: '结局收藏', media: 'auto', hint: '标题 / 图片或视频来源 / 解锁条件 / 解锁场景' },
    { key: 'achievements', label: '成就', media: 'auto', hint: '标题 / 图标来源 / 解锁条件 / 解锁场景' }
  ];
  const MENU_KEYS = ['start', 'continue', 'load', 'gallery', 'settings', 'chapters'];
  const MENU_LABELS = { start: '开始游戏', continue: '继续游戏', load: '读取存档', gallery: '画廊', settings: '设置', chapters: '章节选择' };
  const MENU_DEFAULT_POS = {
    start: { x: 78, y: 16 }, continue: { x: 78, y: 30 }, load: { x: 78, y: 43 },
    gallery: { x: 78, y: 57 }, settings: { x: 78, y: 70 }, chapters: { x: 78, y: 84 }
  };
  const HOME_FIELDS = ['logo', 'bgm'];

  /* ================= A. 体验模式结构补齐（默认值 + 归一化，幂等） ================= */
  function normEntry(e) {
    const out = Object.assign({}, e || {});
    if (!out.id) out.id = nid('col');
    out.title = str(out.title); out.source = str(out.source);
    out.condition = str(out.condition); out.sceneId = str(out.sceneId);
    return out;
  }
  function normChapter(c) {
    const out = Object.assign({}, c || {});
    if (!out.id) out.id = nid('ch');
    out.title = str(out.title); out.sceneId = str(out.sceneId);
    return out;
  }
  function normAppearance(c) {
    const out = { charId: str(c && c.charId), name: str(c && c.name) };
    ['image', 'x', 'y', 'scale', 'opacity', 'rotate', 'dialogueIndex', 'actionId', 'expressionId'].forEach(function (k) {
      if (c && typeof c[k] !== 'undefined' && c[k] !== null) out[k] = c[k];
    });
    return out;
  }
  function looksLikeSceneChar(o) {
    return o && typeof o === 'object' && ('x' in o || 'scale' in o || 'charId' in o || 'opacity' in o);
  }
  function normPreset(pr) {
    const base = pr && typeof pr === 'object' ? pr : {};
    const out = { id: str(base.id) || nid('ap'), name: str(base.name) || '外观预设', entries: [] };
    if (base.sceneId) out.sceneId = str(base.sceneId);
    if (base.created) out.created = base.created;
    const raw = Array.isArray(base.entries) ? base.entries : (looksLikeSceneChar(base) ? [base] : []);
    out.entries = raw.filter(Boolean).map(normAppearance);
    return out;
  }
  function abcdEnsureSchema(p) {
    if (!p || typeof p !== 'object') return p;
    const h = p.home = p.home || {};
    HOME_FIELDS.forEach(function (f) { if (typeof h[f] === 'undefined') h[f] = ''; });
    const x = p.experience = p.experience || {};
    x.collections = x.collections && typeof x.collections === 'object' ? x.collections : {};
    BUCKETS.forEach(function (b) {
      if (!Array.isArray(x.collections[b.key])) x.collections[b.key] = [];
      x.collections[b.key] = x.collections[b.key].filter(Boolean).map(normEntry);
    });
    x.chapters = Array.isArray(x.chapters) ? x.chapters.filter(Boolean).map(normChapter) : [];
    x.menuPositions = x.menuPositions && typeof x.menuPositions === 'object' ? x.menuPositions : {};
    MENU_KEYS.forEach(function (k) {
      const d = MENU_DEFAULT_POS[k] || { x: 50, y: 50 };
      const cur = x.menuPositions[k] || {};
      x.menuPositions[k] = { x: clampPct(cur.x, d.x), y: clampPct(cur.y, d.y) };
    });
    const o = x.opening = x.opening || {};
    o.enabled = typeof o.enabled === 'boolean' ? o.enabled : false;
    o.duration = Number.isFinite(num(o.duration)) ? Math.max(0, Math.min(600000, num(o.duration))) : 900;
    o.image = str(o.image);
    x.appearancePresets = Array.isArray(x.appearancePresets) ? x.appearancePresets.filter(Boolean).map(normPreset) : [];
    return p;
  }
  function abcdSchemaChanged(p) {
    if (!p) return false;
    const before = JSON.stringify(p);
    abcdEnsureSchema(p);
    return before !== JSON.stringify(p);
  }

  /* 安全条件校验：编辑器环境复用内联 validateCond（递归下降解析，非 eval）；Node 用同源 condition_parser。 */
  function abcdCondValid(cond) {
    const c = str(cond).trim();
    if (!c) return true;
    try { if (typeof validateCond === 'function') return !!validateCond(c); } catch (e) {}
    if (PARSER && PARSER.ExprParser) {
      try {
        // 语法校验：编辑器运行时内置条件函数集是固定的，这里用同名单存根做纯语法检查
        // （sceneRead/endingSeen 等真正求值依赖运行时状态，校验阶段只关心表达式能否解析）。
        const stubs = { chance: function () { return true; }, sceneRead: function () { return true; },
          endingSeen: function () { return true; }, hourBetween: function () { return true; },
          minuteNow: function () { return true; }, sceneCount: function () { return true; },
          endings: function () { return true; }, abs: function () { return true; } };
        const p = new PARSER.ExprParser(c, stubs);
        p.flags = {};
        p.parse();
        return true;
      } catch (e) { return false; }
    }
    return /^[\s\S]*$/.test(c) && c.length <= 400;
  }
  function abcdCondEvaluate(cond, flags) {
    const c = str(cond).trim();
    if (!c) return true;
    try {
      if (typeof evalCond === 'function') return !!evalCond(c, flags || {});
    } catch (e) { return false; }
    return abcdCondValid(c);
  }

  /* ================= 收藏品集合（BUCKETS 通用 CRUD，entries 形如 {id,title,source,condition,sceneId}） ================= */
  function abcdCol(p, kind) { const c = p && p.experience && p.experience.collections; return (c && Array.isArray(c[kind])) ? c[kind] : []; }
  function abcdColAdd(p, kind, partial) {
    if (!p) return null;
    const list = p.experience.collections[kind] = p.experience.collections[kind] || [];
    const entry = normEntry(Object.assign({}, partial || {}, { id: nid('col') }));
    list.push(entry);
    return entry;
  }
  function abcdColPatch(p, kind, id, patch) {
    const list = abcdCol(p, kind); const e = list.find(function (v) { return v.id === id; });
    if (!e) return false;
    const safe = {};
    ['title', 'source', 'condition', 'sceneId'].forEach(function (k) { if (typeof patch[k] !== 'undefined') safe[k] = str(patch[k]); });
    Object.assign(e, safe);
    return true;
  }
  function abcdColRemove(p, kind, id) {
    const list = abcdCol(p, kind); const i = list.findIndex(function (v) { return v.id === id; });
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }
  function abcdColMove(p, kind, id, delta) {
    const list = abcdCol(p, kind); const i = list.findIndex(function (v) { return v.id === id; });
    if (i < 0) return false;
    const j = i + delta;
    if (j < 0 || j >= list.length) return false;
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    return true;
  }

  /* ================= 主页 logo / bgm / 开场 + 菜单定位 ================= */
  function abcdHomeField(p, field, value) {
    if (!p) return null;
    if (HOME_FIELDS.indexOf(field) < 0) return null;
    p.home[field] = str(value);
    return p.home[field];
  }
  function abcdOpening(p, patch) {
    if (!p) return null;
    const o = p.experience.opening = p.experience.opening || {};
    if (typeof patch.enabled === 'boolean') o.enabled = patch.enabled;
    if (patch.duration !== undefined) o.duration = Number.isFinite(num(patch.duration)) ? Math.max(0, Math.min(600000, num(patch.duration))) : o.duration;
    if (typeof patch.image === 'string') o.image = patch.image;
    return o;
  }
  function abcdMenuPos(p, key) { return p && p.experience && p.experience.menuPositions ? p.experience.menuPositions[key] : null; }
  function abcdSetMenuPos(p, key, x, y) {
    if (!p || MENU_KEYS.indexOf(key) < 0) return null;
    const m = p.experience.menuPositions = p.experience.menuPositions || {};
    const cur = m[key] = m[key] || {};
    const d = MENU_DEFAULT_POS[key] || { x: 50, y: 50 };
    if (x !== undefined && x !== null) cur.x = clampPct(x, d.x);
    if (y !== undefined && y !== null) cur.y = clampPct(y, d.y);
    return { x: cur.x, y: cur.y };
  }
  function abcdResetMenuPos(p) {
    if (!p) return false;
    const before = JSON.stringify(p.experience.menuPositions || {});
    p.experience.menuPositions = {};
    MENU_KEYS.forEach(function (k) {
      const d = MENU_DEFAULT_POS[k] || { x: 50, y: 50 };
      p.experience.menuPositions[k] = { x: d.x, y: d.y };
    });
    return before !== JSON.stringify(p.experience.menuPositions);
  }
  function abcdHomeMenu(p) { return p && p.experience && Array.isArray(p.experience.homeMenu) ? p.experience.homeMenu : []; }
  function abcdHomeMenuToggle(p, key, on) {
    if (!p || MENU_KEYS.indexOf(key) < 0) return null;
    const x = p.experience;
    const list = x.homeMenu = Array.isArray(x.homeMenu) ? x.homeMenu.filter(function (k) { return k !== key; }) : [];
    if (on) list.push(key);
    return x.homeMenu;
  }
  /* 指针坐标 → 舞台百分比（拖拽与测试共用，安全钳制到 0..100） */
  function abcdPosPct(rect, clientX, clientY) {
    const w = rect && rect.width ? rect.width : 1, h = rect && rect.height ? rect.height : 1;
    const lx = rect ? rect.left : 0, ty = rect ? rect.top : 0;
    return { x: clampPct((clientX - lx) / w * 100, 0), y: clampPct((clientY - ty) / h * 100, 0) };
  }

  /* ================= 章节 CRUD（{id,title,sceneId}）+ 进度设置 ================= */
  const CH_ID_RE = /^[\u4e00-\u9fa5A-Za-z0-9_][\u4e00-\u9fa5A-Za-z0-9_-]*$/;
  function abcdChapters(p) { return p && p.experience && Array.isArray(p.experience.chapters) ? p.experience.chapters : []; }
  function abcdChapterAdd(p, title, sceneId) {
    if (!p) return null;
    const list = p.experience.chapters = p.experience.chapters || [];
    const ch = { id: nid('ch'), title: str(title) || ('第 ' + (list.length + 1) + ' 章'), sceneId: str(sceneId || (p.startScene || '')) };
    list.push(ch);
    return ch;
  }
  function abcdChapterPatch(p, id, patch) {
    const list = abcdChapters(p); const ch = list.find(function (c) { return c.id === id; });
    if (!ch) return { ok: false, msg: '章节不存在' };
    if (typeof patch.id === 'string') {
      const nid2 = patch.id.trim();
      if (!CH_ID_RE.test(nid2)) return { ok: false, msg: '章节 ID 只能使用中英文、数字、_ / -，且不能以 - 或数字开头' };
      if (nid2 !== ch.id && list.some(function (c) { return c !== ch && c.id === nid2; })) return { ok: false, msg: '章节 ID 已存在：' + nid2 };
      ch.id = nid2;
    }
    if (typeof patch.title === 'string') ch.title = patch.title.trim();
    if (typeof patch.sceneId === 'string') ch.sceneId = patch.sceneId;
    return { ok: true };
  }
  function abcdChapterRemove(p, id) {
    const list = abcdChapters(p); const i = list.findIndex(function (c) { return c.id === id; });
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }
  function abcdChapterMove(p, id, delta) {
    const list = abcdChapters(p); const i = list.findIndex(function (c) { return c.id === id; });
    if (i < 0) return false;
    const j = i + delta;
    if (j < 0 || j >= list.length) return false;
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    return true;
  }

  /* ================= 外观预设：捕捉场景角色外观 / 应用到场景角色（可撤销由动作层保证） ================= */
  function abcdPresets(p) { return p && p.experience && Array.isArray(p.experience.appearancePresets) ? p.experience.appearancePresets : []; }
  function sceneCharsOf(p, sceneId) {
    if (!p) return [];
    const sc = p.scenes.find(function (s) { return s.id === sceneId; });
    return sc && Array.isArray(sc.characters) ? sc.characters : [];
  }
  function abcdPresetCapture(p, sceneId, name) {
    if (!p) return null;
    const sc = p.scenes.find(function (s) { return s.id === sceneId; });
    if (!sc) return null;
    const preset = normPreset({
      id: nid('ap'),
      name: str(name).trim() || ('外观预设 ' + (abcdPresets(p).length + 1)),
      sceneId: sc.id, created: nowMs(),
      entries: (sc.characters || []).map(normAppearance)
    });
    return preset;
  }
  const APPEAR_APPLY_KEYS = ['name', 'image', 'x', 'y', 'scale', 'opacity', 'rotate', 'actionId', 'expressionId', 'dialogueIndex'];
  /* 匹配：优先 charId，其次非空 name，最后按位置；返回 {matched,applied,total,skipped} */
  function abcdPresetApply(p, presetId, sceneId) {
    const out = { ok: false, msg: '', matched: 0, applied: 0, total: 0 };
    const preset = abcdPresets(p).find(function (pr) { return pr.id === presetId; });
    if (!preset) { out.msg = '预设不存在'; return out; }
    const chars = sceneCharsOf(p, sceneId);
    if (!chars.length) { out.msg = '目标场景没有立绘角色'; return out; }
    const used = [];
    out.total = preset.entries.length;
    preset.entries.forEach(function (entry) {
      let idx = -1;
      if (entry.charId) idx = chars.findIndex(function (c, i) { return used.indexOf(i) < 0 && c.charId === entry.charId; });
      if (idx < 0 && entry.name) idx = chars.findIndex(function (c, i) { return used.indexOf(i) < 0 && c.name === entry.name && String(c.name).trim() !== ''; });
      if (idx < 0) idx = chars.findIndex(function (c, i) { return used.indexOf(i) < 0; });
      if (idx < 0) return;
      used.push(idx);
      out.matched++;
      const target = chars[idx];
      APPEAR_APPLY_KEYS.forEach(function (k) {
        if (k in entry) target[k] = entry[k];           // charId / id 属于身份字段，绝不覆盖
      });
      out.applied++;
    });
    out.ok = true;
    out.msg = '已应用 ' + out.applied + ' / ' + out.total + ' 个角色外观';
    return out;
  }
  function abcdPresetRemove(p, presetId) {
    const list = abcdPresets(p); const i = list.findIndex(function (pr) { return pr.id === presetId; });
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }

  /* ================= 台词批量编辑（保留元数据：id / charId / actionId / expressionId / voice 等一律不动） ================= */
  function abcdDialogueRows(p, scopeSceneId, query) {
    const out = [];
    if (!p) return out;
    const q = str(query).trim().toLowerCase();
    const scopes = scopeSceneId ? p.scenes.filter(function (s) { return s.id === scopeSceneId; }) : p.scenes;
    scopes.forEach(function (sc) {
      const dlg = Array.isArray(sc.dialogues) ? sc.dialogues : [];
      dlg.forEach(function (d, i) {
        const hit = !q || str(d.text).toLowerCase().indexOf(q) >= 0 || str(d.speaker).toLowerCase().indexOf(q) >= 0;
        if (hit) out.push({ sceneId: sc.id, sceneName: sc.name || sc.id, index: i, d: d });
      });
    });
    return out;
  }
  function abcdDialoguePatch(p, sceneId, index, patch) {
    const rows = abcdDialogueRows(p, sceneId, '');
    const row = rows.find(function (r) { return r.index === index; });
    if (!row) return false;
    if (typeof patch.speaker === 'string') row.d.speaker = patch.speaker;
    if (typeof patch.text === 'string') row.d.text = patch.text;
    return true;
  }
  function abcdDialogueAdd(p, sceneId, text, speaker) {
    if (!p) return null;
    const sc = p.scenes.find(function (s) { return s.id === sceneId; });
    if (!sc) return null;
    sc.dialogues = sc.dialogues || [];
    const d = { id: nid('d'), speaker: str(speaker), text: str(text), charId: '', actionId: '' };
    sc.dialogues.push(d);
    return d;
  }
  function abcdDialogueRemove(p, sceneId, index) {
    if (!p) return false;
    const sc = p.scenes.find(function (s) { return s.id === sceneId; });
    if (!sc || !Array.isArray(sc.dialogues) || index < 0 || index >= sc.dialogues.length) return false;
    sc.dialogues.splice(index, 1);
    return true;
  }
  /* 台词内查找替换：与现有全文替换（batchMakeMatcher）同语义，但仅作用于台词 text 字段，不改任何元数据。 */
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function makeMatcher(find, caseSensitive, useRegex) {
    if (useRegex) return new RegExp(find, caseSensitive ? 'g' : 'gi');
    return new RegExp(escRe(find), caseSensitive ? 'g' : 'gi');
  }
  function abcdDialogueReplace(p, opts) {
    const find = str(opts && opts.find);
    const replace = str(opts && opts.replace);
    const caseSensitive = !!(opts && opts.caseSensitive);
    const useRegex = !!(opts && opts.useRegex);
    if (!find) return { ok: false, msg: '请填写查找内容' };
    let re;
    try { re = makeMatcher(find, caseSensitive, useRegex); }
    catch (e) { return { ok: false, msg: '正则表达式无效：' + e.message }; }
    const sceneId = opts && opts.sceneId ? opts.sceneId : '';
    const rows = abcdDialogueRows(p, sceneId, '');
    let changed = 0, occurrences = 0;
    const examples = [];
    rows.forEach(function (row) {
      const before = str(row.d.text);
      if (!before) return;
      re.lastIndex = 0;
      const hits = before.match(re);
      if (!hits) return;
      occurrences += hits.length;
      re.lastIndex = 0;
      const after = before.replace(re, replace);
      if (after !== before) {
        row.d.text = after;
        changed++;
        if (examples.length < 6) examples.push(row.sceneName + '：' + (row.d.speaker ? row.d.speaker + '：' : '') + after.slice(0, 70));
      }
    });
    return { ok: true, changed: changed, occurrences: occurrences, examples: examples, reSource: useRegex ? find : escRe(find) };
  }

  const ABCD = {
    esc: esc,
    BUCKETS: BUCKETS, MENU_KEYS: MENU_KEYS, MENU_LABELS: MENU_LABELS, MENU_DEFAULT_POS: MENU_DEFAULT_POS,
    ensureSchema: abcdEnsureSchema, schemaChanged: abcdSchemaChanged,
    condValid: abcdCondValid, condEvaluate: abcdCondEvaluate,
    col: abcdCol, colAdd: abcdColAdd, colPatch: abcdColPatch, colRemove: abcdColRemove, colMove: abcdColMove,
    looksImage: looksImage, looksAudio: looksAudio, mediaKind: mediaKindOfSource,
    homeField: abcdHomeField, opening: abcdOpening,
    menuPos: abcdMenuPos, setMenuPos: abcdSetMenuPos, resetMenuPos: abcdResetMenuPos,
    homeMenu: abcdHomeMenu, homeMenuToggle: abcdHomeMenuToggle, posPct: abcdPosPct,
    chapters: abcdChapters, chapterAdd: abcdChapterAdd, chapterPatch: abcdChapterPatch,
    chapterRemove: abcdChapterRemove, chapterMove: abcdChapterMove,
    presets: abcdPresets, presetCapture: abcdPresetCapture, presetApply: abcdPresetApply, presetRemove: abcdPresetRemove,
    dialogueRows: abcdDialogueRows, dialoguePatch: abcdDialoguePatch, dialogueAdd: abcdDialogueAdd,
    dialogueRemove: abcdDialogueRemove, dialogueReplace: abcdDialogueReplace
  };

  /* 供 Node 直接 require：仅纯模型 + UI 动作（动作层由下方 UI 部分补充后挂载） */
  if (IS_NODE) {
    module.exports = { ABCD: ABCD, _raw: ABCD };
    try { root.__ABCD__ = ABCD; } catch (e) {}
  }
  if (typeof root !== 'undefined') { try { root.__ABCD__ = ABCD; } catch (e) {} }
  /* =====================================================================
     UI 层：所有写入均走 动作层（快照前/后 + 保存），文本输入走防抖保存，
     不重建焦点所在节点；结构操作后重绘当前标签。
     ===================================================================== */
  const uiState = { open: false, tab: 'A', bucket: 'cgs', presetScene: '', scope: '', q: '', find: '', replace: '', useRegex: false, caseSensitive: false };
  const ui = {
    el: null, body: null,
    open: function () { return uiState.open; },
    tab: function () { return uiState.tab; },
    sceneOptions: function (selId, includeEmpty) {
      const p = curProject(); const opts = [];
      if (includeEmpty) opts.push('<option value="">' + (selId ? '—' : '全部场景') + '</option>');
      (p && p.scenes ? p.scenes : []).forEach(function (s) { opts.push('<option value="' + esc(s.id) + '"' + (s.id === selId ? ' selected' : '') + '>' + esc(s.name || s.id) + '</option>'); });
      return opts.join('');
    }
  };
  function shell() {
    if (ui.el && ui.el.parentNode) return ui.el;
    const ov = document.createElement('div');
    ov.id = 'abcdModal'; ov.className = 'modal hidden';
    ov.innerHTML =
      '<div class="modal-box" style="width:min(1180px,96vw)">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid #E3E5E7;padding-bottom:10px;margin-bottom:10px">' +
      '<h3 style="margin:0;font-size:15px">🎬 体验·内容 创作</h3>' +
      '<button data-abcd-tab="A" class="mini primary">🖼 A 收藏品</button>' +
      '<button data-abcd-tab="B" class="mini">🏠 B 主页·菜单</button>' +
      '<button data-abcd-tab="C" class="mini">💬 C 台词批编</button>' +
      '<button data-abcd-tab="D" class="mini">🎭 D 预设·章节</button>' +
      '<span style="flex:1"></span><button id="btnAbcdClose" class="mini">✕ 关闭</button></div>' +
      '<div id="abcdBody" style="max-height:72vh;overflow:auto;padding:2px 2px 10px"></div></div>';
    document.body.appendChild(ov);
    ui.el = ov; ui.body = ov.querySelector('#abcdBody');
    ov.querySelectorAll('[data-abcd-tab]').forEach(function (b) {
      b.addEventListener('click', function () { openAbcd(b.dataset.abcdTab); });
    });
    ov.querySelector('#btnAbcdClose').addEventListener('click', closeAbcd);
    return ov;
  }
  function openAbcd(tab) {
    if (typeof document === 'undefined' || !document.body) return;
    if (!uiState.open) {
      const otherModals = qel('.modal');
      otherModals.forEach(function (m) { if (m && m.id && m.id !== 'abcdModal') m.classList.add('hidden'); });
    }
    const ov = shell();
    uiState.open = true; uiState.tab = tab || uiState.tab;
    ov.classList.remove('hidden');
    ov.querySelectorAll('[data-abcd-tab]').forEach(function (b) {
      const on = b.dataset.abcdTab === uiState.tab;
      b.classList.toggle('primary', on);
    });
    renderAbcd();
  }
  function closeAbcd() {
    uiState.open = false;
    if (ui.el) ui.el.classList.add('hidden');
    persistSave();
  }
  function renderAbcd() {
    if (!uiState.open || !ui.body) return;
    try {
      if (uiState.tab === 'A') renderA();
      else if (uiState.tab === 'B') renderB();
      else if (uiState.tab === 'C') renderC();
      else renderD();
    } catch (e) { toastMsg('渲染失败：' + e.message); if (window.console) window.console.error(e); }
  }
  function refreshBody() { if (uiState.open && ui.body) renderAbcd(); }
  /* 动作层：结构性变更 = 变更前快照 + 变更 + 变更后快照 + 防抖保存（可撤销） */
  function beginAction() { snapBefore(); }
  function endAction(refresh) { snapAfter(); persistSave(); if (refresh !== false) refreshBody(); }
  function setField(proj, mutator) { mutator(proj); persistSave(); }
  function mediaKindOf(kind) { const meta = BUCKETS.find(function (b) { return b.key === kind; }); return meta ? meta.media : 'auto'; }
  function looksImage(src) { return /^data:image\//i.test(src) || /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/i.test(src); }
  function looksAudio(src) { return /^data:audio\//i.test(src) || /\.(mp3|wav|ogg|oga|m4a|aac|flac)(\?|#|$)/i.test(src); }
  function mediaKindOfSource(src) {
    const s = str(src).trim();
    if (looksImage(s)) return 'image';
    if (looksAudio(s)) return 'audio';
    return '';
  }

  /* ================= A 收藏品集合 ================= */
  function currentBucket() { return uiState.bucket; }
  function bucketMeta() { return BUCKETS.find(function (b) { return b.key === currentBucket(); }) || BUCKETS[0]; }
  function renderA() {
    const meta = bucketMeta();
    const p = curProject();
    const list = p ? abcdCol(p, meta.key) : [];
    ui.body.innerHTML =
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
      BUCKETS.map(function (b) {
        return '<button type="button" class="mini' + (b.key === meta.key ? ' primary' : '') + '" data-abcd-bucket="' + b.key + '">' +
          (b.key === meta.key ? '▸ ' : '') + esc(b.label) + '（' + (p ? abcdCol(p, b.key).length : 0) + '）</button>';
      }).join('') +
      '<span style="flex:1"></span><button type="button" id="abcdColAdd" class="mini primary">＋ 新增 ' + esc(meta.label) + '</button></div>' +
      '<p style="margin:0 0 8px;font-size:12px;color:#9499A0">字段：标题 · 媒体来源(URL/Data URI) · 解锁条件 · 解锁场景　条目形如 {id,title,source,condition,sceneId}，导出的播放器按解锁条件展示。</p>' +
      '<div id="abcdColList" style="display:flex;flex-direction:column;gap:8px"></div>' +
      '<p id="abcdColEmpty" class="hint' + (list.length ? ' hidden' : '') + '">还没有' + esc(meta.label) + '条目，点上方「新增」开始。</p>';
    ui.body.querySelectorAll('[data-abcd-bucket]').forEach(function (b) {
      b.addEventListener('click', function () { uiState.bucket = b.dataset.abcdBucket; renderA(); });
    });
    const addBtn = ui.body.querySelector('#abcdColAdd');
    if (addBtn) addBtn.addEventListener('click', function () {
      const proj = curProject(); if (!proj) { toastMsg('请先新建或打开项目'); return; }
      beginAction();
      abcdEnsureSchema(proj);
      abcdColAdd(proj, currentBucket(), { title: '新' + meta.label + '条目' });
      endAction();
    });
    renderColRows(list);
  }
  function renderColRows(list) {
    const box = ui.body ? ui.body.querySelector('#abcdColList') : null;
    if (!box) return;
    const p = curProject(); const meta = bucketMeta();
    box.innerHTML = list.map(function (e) {
      const valid = abcdCondValid(e.condition);
      const media = mediaKindOf(meta.key);
      return '<div class="choice-card" data-acc-id="' + esc(e.id) + '" style="padding:8px;display:flex;flex-direction:column;gap:6px">' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
        '<input type="text" data-acc="title" value="' + esc(e.title) + '" placeholder="标题" style="flex:1.2;min-width:120px">' +
        '<span class="abcd-thumbwrap" data-acc-media="' + esc(e.id) + '"></span>' +
        '<span style="flex:1"></span>' +
        '<button type="button" class="mini" data-acc="up" title="上移">▲</button>' +
        '<button type="button" class="mini" data-acc="down" title="下移">▼</button>' +
        '<button type="button" class="mini danger" data-acc="del" title="删除">✕</button></div>' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
        '<input type="text" data-acc="source" value="' + esc(e.source) + '" placeholder="' + (media === 'audio' ? '音频 URL / Data URI' : '图片 / 媒体 URL / Data URI') + '" style="flex:3;min-width:200px">' +
        '<button type="button" class="mini" data-acc="upload">上传</button>' +
        (looksImage(e.source) ? '<img class="abcd-thumb" src="' + esc(e.source) + '" alt="预览">' : looksAudio(e.source) ? '<audio class="abcd-thumb" controls preload="none" src="' + esc(e.source) + '"></audio>' : '') +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
        '<input type="text" data-acc="cond" value="' + esc(e.condition) + '" placeholder="解锁条件，留空 = 始终解锁，如：好感度 >= 5" style="flex:2.4;min-width:180px">' +
        '<span class="mini badge" data-acc-condbadge style="' + (valid ? 'background:#E8F7EE;color:#1A7F37' : 'background:#FDECEA;color:#C62828') + '">' + (valid ? '✓ 条件安全' : '✗ 条件无法解析') + '</span>' +
        '<label style="font-size:11px;color:#61666D">解锁场景</label>' +
        '<select data-acc="scene" style="flex:1;min-width:110px">' + ui.sceneOptions(e.sceneId, true) + '</select>' +
        '</div></div>';
    }).join('') || '';
    const empty = ui.body ? ui.body.querySelector('#abcdColEmpty') : null;
    if (empty) empty.classList.toggle('hidden', !!list.length);
    box.querySelectorAll('[data-acc-media]').forEach(function (wrap) { /* 预留：复杂媒体容器可在此展开 */ });
    /* 行内控件只改模型与徽标，不重建行（保住输入焦点） */
    box.addEventListener('input', function (ev) {
      const inp = ev.target.closest('[data-acc]');
      if (!inp) return;
      const row = inp.closest('[data-acc-id]'); if (!row) return;
      const id = row.dataset.accId; const proj = curProject(); if (!proj) return;
      const f = inp.dataset.acc;
      if (f === 'title' || f === 'source' || f === 'cond') {
        const patch = {}; patch[f === 'cond' ? 'condition' : f] = inp.value;
        abcdColPatch(proj, currentBucket(), id, patch);
        if (f === 'cond') {
          const badge = row.querySelector('[data-acc-condbadge]');
          if (badge) {
            const valid = abcdCondValid(inp.value);
            badge.textContent = valid ? '✓ 条件安全' : '✗ 条件无法解析';
            badge.style.background = valid ? '#E8F7EE' : '#FDECEA';
            badge.style.color = valid ? '#1A7F37' : '#C62828';
          }
        }
        if (f === 'source') refreshRowSource(row, id, inp.value);
        setField(proj, function () {});
      }
    });
    box.addEventListener('change', function (ev) {
      const sel = ev.target.closest('[data-acc=scene]');
      if (!sel) return;
      const row = sel.closest('[data-acc-id]'); if (!row) return;
      const proj = curProject(); if (!proj) return;
      beginAction();
      abcdColPatch(proj, currentBucket(), row.dataset.accId, { sceneId: sel.value });
      endAction();
    });
    box.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-acc]');
      if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'SELECT') return;
      const row = btn.closest('[data-acc-id]'); if (!row) return;
      const id = row.dataset.accId; const proj = curProject(); if (!proj) return;
      const act = btn.dataset.acc;
      if (act === 'up') { beginAction(); abcdColMove(proj, currentBucket(), id, -1); endAction(); }
      else if (act === 'down') { beginAction(); abcdColMove(proj, currentBucket(), id, 1); endAction(); }
      else if (act === 'del') {
        if (!confirm('删除这条' + bucketMeta().label + '条目？')) return;
        beginAction(); abcdColRemove(proj, currentBucket(), id); endAction();
      } else if (act === 'upload') {
        const file = document.createElement('input');
        file.type = 'file';
        file.accept = 'image/*,audio/*,video/*';
        file.style.display = 'none';
        document.body.appendChild(file);
        file.addEventListener('change', function () {
          const f0 = file.files && file.files[0];
          if (!f0) { document.body.removeChild(file); return; }
          const reader = new FileReader();
          reader.onload = function () {
            beginAction();
            abcdColPatch(proj, currentBucket(), id, { source: String(reader.result) });
            const srcInp = row.querySelector('[data-acc=source]');
            if (srcInp) { srcInp.value = String(reader.result); refreshRowSource(row, id, srcInp.value); }
            endAction();
            document.body.removeChild(file);
          };
          reader.readAsDataURL(f0);
        });
        file.click();
      }
    });
  }
  function refreshRowSource(row, id, src) {
    const wrap = row.querySelector('[data-acc-media]');
    if (!wrap) return;
    const old = row.querySelector('.abcd-thumb');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const meta = bucketMeta();
    const oldAudio = row.querySelector('audio.abcd-thumb');
    if (oldAudio && oldAudio.parentNode) oldAudio.parentNode.removeChild(oldAudio);
    if (looksImage(src)) {
      const img = document.createElement('img');
      img.className = 'abcd-thumb'; img.src = src; img.alt = '预览';
      row.insertBefore(img, row.querySelector('input[data-acc=source]').nextSibling || null);
    } else if (looksAudio(src)) {
      const au = document.createElement('audio');
      au.className = 'abcd-thumb'; au.controls = true; au.preload = 'none'; au.src = src;
      row.insertBefore(au, row.querySelector('input[data-acc=source]').nextSibling || null);
    }
  }
  const ABCD_UI_PART_A = true;
  /* ================= B 主页 · Logo / BGM / 开场动画 / 菜单定位 ================= */
  let openingPreviewTimer = null;
  function renderB() {
    const proj = curProject();
    const h = proj && proj.home ? proj.home : {};
    const x = proj && proj.experience ? proj.experience : {};
    const o = x.opening || {};
    const menu = Array.isArray(x.homeMenu) ? x.homeMenu : [];
    ui.body.innerHTML =
      '<div style="display:grid;grid-template-columns:minmax(280px,380px) 1fr;gap:16px">' +
      /* ---- 左列：字段 ---- */
      '<div style="display:flex;flex-direction:column;gap:6px">' +
      '<h4 style="margin:2px 0">主页标识与音频</h4>' +
      '<label style="font-size:12px;color:#61666D">Logo（主页顶部，URL / Data URI）</label>' +
      '<div style="display:flex;gap:6px"><input id="abcdLogo" type="text" value="' + esc(h.logo || '') + '" placeholder="https://… 或 data:image/…" style="flex:1"><button type="button" class="mini" data-abcd-file="logo">上传</button></div>' +
      '<div id="abcdLogoPrev" style="min-height:52px;border:1px dashed #E3E5E7;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:4px;overflow:hidden;background:#FAFBFC">' +
      (h.logo && looksImage(h.logo) ? '<img src="' + esc(h.logo) + '" alt="Logo 预览" style="max-height:64px;max-width:100%;object-fit:contain">' : '<span style="font-size:12px;color:#C0C4CC">暂无 Logo（显示作品标题）</span>') + '</div>' +
      '<label style="font-size:12px;color:#61666D;margin-top:4px">主页 BGM（标题页循环播放）</label>' +
      '<div style="display:flex;gap:6px"><input id="abcdBgm" type="text" value="' + esc(h.bgm || '') + '" placeholder="https://… 或 data:audio/…" style="flex:1"><button type="button" class="mini" data-abcd-file="bgm">上传</button></div>' +
      '<audio id="abcdBgmPrev" controls preload="none" style="width:100%;height:32px"' + (h.bgm ? ' src="' + esc(h.bgm) + '"' : '') + '></audio>' +
      '<h4 style="margin:12px 0 2px">开场动画（opening）</h4>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input id="abcdOpeningEnabled" type="checkbox"' + (o.enabled ? ' checked' : '') + '> 播放开场动画（进入标题前）</label>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><label style="font-size:12px;color:#61666D">时长(ms)</label><input id="abcdOpeningDur" type="number" min="0" step="100" value="' + (o.duration != null ? o.duration : 900) + '" style="width:110px">' +
      '<label style="font-size:12px;color:#61666D">画面</label><input id="abcdOpeningImg" type="text" value="' + esc(o.image || '') + '" placeholder="开场图片 URL / Data URI" style="flex:1;min-width:150px"><button type="button" class="mini" data-abcd-file="opening">上传</button></div>' +
      '<div style="display:flex;gap:6px;align-items:center"><button type="button" id="abcdOpeningPlay" class="mini primary">▶ 预览开场</button><span id="abcdOpeningStatus" style="font-size:12px;color:#9499A0"></span></div>' +
      '<p style="font-size:12px;color:#9499A0;margin-top:6px;line-height:1.6">标题页文字 / 背景图 / 配色 / 按钮文案请在顶部「试玩 → 游戏主页」继续编辑；位置与 Logo / BGM / 开场在此设置并随项目保存。</p>' +
      '</div>' +
      /* ---- 右列：可拖拽舞台 ---- */
      '<div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><h4 style="margin:0">标题菜单按钮定位（可拖拽 · 百分比存 experience.menuPositions）</h4>' +
      '<span style="flex:1"></span><button type="button" id="abcdMenuReset" class="mini">↺ 重置默认布局</button></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">' +
      MENU_KEYS.map(function (k) {
        return '<label style="display:flex;align-items:center;gap:4px;font-size:12px"><input type="checkbox" data-abcd-menukey="' + k + '"' + (menu.indexOf(k) >= 0 ? ' checked' : '') + '>' + esc(MENU_LABELS[k]) + '</label>';
      }).join('') + '</div>' +
      '<div id="abcdStageWrap" style="position:relative;width:100%;aspect-ratio:16/9;border:1px solid #D5D8DD;border-radius:10px;overflow:hidden;background:' + esc(h.backgroundColor || '#181421') + ';touch-action:none">' +
      (h.background ? '<div style="position:absolute;inset:0;background-image:url(&quot;' + esc(h.background) + '&quot;);background-size:cover;background-position:center"></div>' : '') +
      '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:6%;pointer-events:none">' +
      (h.logo ? '<img src="' + esc(h.logo) + '" alt="logo" style="max-height:22%;max-width:70%;object-fit:contain;pointer-events:none">' : '<span style="font-size:clamp(16px,3vw,30px);font-weight:800;color:' + esc(h.textColor || '#fff') + '">' + esc(h.title || (proj && proj.title) || '作品标题') + '</span>') +
      '<span style="color:' + esc(h.textColor || '#fff') + ';opacity:.75;font-size:11px">' + esc(h.subtitle || '') + '</span></div>' +
      '<div id="abcdStage" style="position:absolute;inset:0"></div></div>' +
      '<p style="font-size:12px;color:#61666D;margin:6px 0 2px">坐标 = 按钮中心相对舞台的百分比（0–100）。直接拖动按钮；松开或输入数值后保存，一次拖拽 = 一步撤销。</p>' +
      '<div id="abcdPosList" style="display:flex;flex-direction:column;gap:3px"></div>' +
      '</div></div>';
    bindHomeFields(proj, o);
    bindMenuToggles(proj, menu);
    bindStageItems(proj);
    bindPosInputs(proj);
    const reset = gel('abcdMenuReset');
    if (reset) reset.addEventListener('click', function () {
      beginAction();
      abcdResetMenuPos(proj);
      endAction();
    });
    const play = gel('abcdOpeningPlay');
    if (play) play.addEventListener('click', function () { previewOpening(proj); });
  }
  function bindHomeFields(proj, o) {
    const logo = gel('abcdLogo'), bgm = gel('abcdBgm');
    const opener = gel('abcdOpeningEnabled');
    const dur = gel('abcdOpeningDur'), img = gel('abcdOpeningImg');
    const bind = function (el, fn) { if (el) el.addEventListener('input', function () { fn(el.value); }); };
    const bindChk = function (el, fn) { if (el) el.addEventListener('change', function () { beginAction(); fn(el.checked); endAction(false); }); };
    if (logo) bind(logo, function (v) { abcdHomeField(proj, 'logo', v); const prev = gel('abcdLogoPrev'); if (prev) { prev.innerHTML = v && looksImage(v) ? '<img src="' + esc(v) + '" alt="Logo 预览" style="max-height:64px;max-width:100%;object-fit:contain">' : '<span style="font-size:12px;color:#C0C4CC">暂无 Logo（显示作品标题）</span>'; } setField(proj, function () {}); });
    if (bgm) bind(bgm, function (v) { abcdHomeField(proj, 'bgm', v); const au = gel('abcdBgmPrev'); if (au) au.src = v; setField(proj, function () {}); });
    if (opener) bindChk(opener, function (v) { abcdOpening(proj, { enabled: v }); });
    if (dur) bind(dur, function (v) { abcdOpening(proj, { duration: Number(v) }); setField(proj, function () {}); });
    if (img) bind(img, function (v) { abcdOpening(proj, { image: v }); setField(proj, function () {}); });
    ui.body.querySelectorAll('[data-abcd-file]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const kind = btn.dataset.abcdFile;
        const accept = kind === 'bgm' ? 'audio/*' : kind === 'opening' ? 'image/*' : 'image/*';
        const file = document.createElement('input');
        file.type = 'file'; file.accept = accept; file.style.display = 'none';
        document.body.appendChild(file);
        file.addEventListener('change', function () {
          const f0 = file.files && file.files[0];
          if (!f0) { document.body.removeChild(file); return; }
          const reader = new FileReader();
          reader.onload = function () {
            const src = String(reader.result);
            beginAction();
            if (kind === 'bgm') abcdHomeField(proj, 'bgm', src);
            else if (kind === 'opening') abcdOpening(proj, { image: src });
            else abcdHomeField(proj, 'logo', src);
            endAction(false);
            renderB();
            document.body.removeChild(file);
          };
          reader.readAsDataURL(f0);
        });
        file.click();
      });
    });
  }
  function stageRect() { const st = gel('abcdStage'); return st ? st.getBoundingClientRect() : { left: 0, top: 0, width: 640, height: 360 }; }
  function stageLabel(key, proj) {
    const h = proj && proj.home ? proj.home : {};
    if (key === 'start') return h.startLabel || MENU_LABELS.start;
    if (key === 'continue') return h.continueLabel || MENU_LABELS.continue;
    if (key === 'load') return h.loadLabel || MENU_LABELS.load;
    return MENU_LABELS[key] || key;
  }
  function itemStyle(key, proj) {
    const pos = abcdMenuPos(proj, key) || { x: 50, y: 50 };
    return 'left:' + pos.x + '%;top:' + pos.y + '%;transform:translate(-50%,-50%)';
  }
  function bindMenuToggles(proj, menu) {
    ui.body.querySelectorAll('[data-abcd-menukey]').forEach(function (chk) {
      chk.addEventListener('change', function () {
        beginAction();
        abcdHomeMenuToggle(proj, chk.dataset.abcdMenukey, chk.checked);
        endAction();
      });
    });
  }
  function bindStageItems(proj) {
    const stage = gel('abcdStage');
    if (!stage) return;
    const menu = Array.isArray(proj.experience.homeMenu) ? proj.experience.homeMenu : [];
    menu.forEach(function (key) {
      if (MENU_KEYS.indexOf(key) < 0) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'abcd-menu-item';
      b.dataset.key = key;
      b.textContent = stageLabel(key, proj);
      b.style.cssText = 'position:absolute;' + itemStyle(key, proj) + ';padding:6px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.55);background:' + esc((proj.home && proj.home.accentColor) || '#FB7299') + ';color:' + esc((proj.home && proj.home.textColor) || '#fff') + ';font-size:13px;cursor:grab;user-select:none;touch-action:none;z-index:2;box-shadow:0 3px 8px rgba(0,0,0,.3)';
      stage.appendChild(b);
      b.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        beginAction();                       // 整段拖拽记为一个撤销步
        if (b.setPointerCapture) { try { b.setPointerCapture(e.pointerId); } catch (err) {} }
        const move = function (ev) {
          const pos = abcdPosPct(stage.getBoundingClientRect(), ev.clientX, ev.clientY);
          applyMenuPosLive(key, pos.x, pos.y);
        };
        const up = function (ev) {
          b.removeEventListener('pointermove', move);
          b.removeEventListener('pointerup', up);
          b.removeEventListener('pointercancel', up);
          if (b.releasePointerCapture) { try { b.releasePointerCapture(ev.pointerId); } catch (err) {} }
          endAction(false);
          persistNow();
        };
        b.addEventListener('pointermove', move);
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
      });
    });
    if (!menu.length) {
      const tip = document.createElement('span');
      tip.textContent = '（勾选上方菜单项后在舞台上拖动定位）';
      tip.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.55);font-size:13px;pointer-events:none';
      stage.appendChild(tip);
    }
  }
  function applyMenuPosLive(key, x, y) {
    const proj = curProject(); if (!proj) return;
    const pos = abcdSetMenuPos(proj, key, x, y);
    const stage = gel('abcdStage');
    if (stage) {
      const item = stage.querySelector('[data-key="' + key + '"]');
      if (item) item.style.left = pos.x + '%', item.style.top = pos.y + '%';
    }
    const xi = gel('abcdPosX_' + key), yi = gel('abcdPosY_' + key);
    if (xi) xi.value = String(pos.x);
    if (yi) yi.value = String(pos.y);
  }
  function bindPosInputs(proj) {
    const box = gel('abcdPosList');
    if (!box) return;
    box.innerHTML = MENU_KEYS.map(function (k) {
      const pos = abcdMenuPos(proj, k) || { x: 50, y: 50 };
      return '<div style="display:flex;gap:6px;align-items:center;font-size:12px">' +
        '<span style="width:64px;color:#61666D">' + esc(MENU_LABELS[k]) + '</span>' +
        '<span style="color:#C0C4CC">x</span><input id="abcdPosX_' + k + '" type="number" min="0" max="100" step="0.1" value="' + pos.x + '" style="width:70px" title="水平百分比">' +
        '<span style="color:#C0C4CC">y</span><input id="abcdPosY_' + k + '" type="number" min="0" max="100" step="0.1" value="' + pos.y + '" style="width:70px" title="垂直百分比">' +
        '</div>';
    }).join('');
    MENU_KEYS.forEach(function (k) {
      const xi = gel('abcdPosX_' + k), yi = gel('abcdPosY_' + k);
      const commit = function () {
        beginAction();
        applyMenuPosLive(k, xi ? Number(xi.value) : undefined, yi ? Number(yi.value) : undefined);
        endAction(false);
      };
      if (xi) xi.addEventListener('change', commit);
      if (yi) yi.addEventListener('change', commit);
    });
  }
  function previewOpening(proj) {
    const o = proj && proj.experience ? proj.experience.opening : null;
    const dur = o && Number.isFinite(Number(o.duration)) ? Number(o.duration) : 0;
    const status = gel('abcdOpeningStatus');
    if (!o || !o.image) { if (status) status.textContent = '请先设置开场画面图片'; return; }
    let old = gel('abcdOpenPrev');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (openingPreviewTimer) { clearTimeout(openingPreviewTimer); openingPreviewTimer = null; }
    const ov = document.createElement('div');
    ov.id = 'abcdOpenPrev';
    ov.style.cssText = 'position:fixed;inset:0;z-index:500;background:#000 url(&quot;' + esc(o.image) + '&quot;) center/contain no-repeat;cursor:pointer';
    ov.title = '点击关闭开场预览';
    ov.addEventListener('click', function () { if (ov.parentNode) ov.parentNode.removeChild(ov); });
    document.body.appendChild(ov);
    const t0 = Date.now();
    if (status) status.textContent = '开场播放中…';
    const tick = setInterval(function () {
      const left = dur - (Date.now() - t0);
      if (left <= 0) {
        clearInterval(tick);
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        if (status) status.textContent = '开场预览结束（' + dur + ' ms）';
      } else if (status) status.textContent = '开场剩余 ' + left + ' ms';
    }, 200);
    openingPreviewTimer = dur > 0 ? setTimeout(function () { clearInterval(tick); }, dur + 300) : null;
  }
  const ABCD_UI_PART_B = true;
  /* ================= C 台词批量编辑（保留元数据）+ 台词内查找替换 ================= */
  function reuseMatcher(find, caseSensitive, useRegex) {
    try { if (typeof batchMakeMatcher === 'function') return batchMakeMatcher(find, caseSensitive, useRegex); } catch (e) {}
    try { if (typeof makeMatcher === 'function') return makeMatcher(find, caseSensitive, useRegex); } catch (e) {}
    return null;
  }
  function renderC() {
    const proj = curProject();
    const opts = uiState.scope ? '<option value="">全部场景</option>' + ui.sceneOptions(uiState.scope, false) : ui.sceneOptions('', true);
    const rows = abcdDialogueRows(proj, uiState.scope || '', uiState.q);
    let lineCount = 0;
    rows.forEach(function (r) { if (r.d && str(r.d.text).trim()) lineCount++; });
    ui.body.innerHTML =
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px">' +
      '<h4 style="margin:0">台词批量编辑</h4>' +
      '<span style="flex:1"></span>' +
      '<button type="button" class="mini" id="abcdOpenBatch" title="调用现有全文替换弹窗（可替换台词以外的所有文本字段）">⚡ 打开现有全文替换</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">' +
      '<label style="font-size:12px;color:#61666D">范围</label>' +
      '<select id="abcdScope" style="width:200px">' + opts + '</select>' +
      '<input id="abcdCq" type="search" placeholder="过滤台词（角色 / 内容）…" value="' + esc(uiState.q) + '" style="flex:1;min-width:160px">' +
      '<span id="abcdCcount" style="font-size:12px;color:#61666D">' + rows.length + ' 行（含正文 ' + lineCount + ' 行）</span>' +
      '<button type="button" id="abcdDlgAdd" class="mini primary">＋ 添加台词</button></div>' +
      '<p style="margin:0 0 6px;font-size:12px;color:#9499A0">行内只编辑 说话人 / 正文；id、charId、actionId、expressionId、voice 等元数据一律保留。</p>' +
      '<div style="border:1px solid #E3E5E7;border-radius:10px;padding:8px;margin-bottom:10px;background:#FBFCFD">' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
      '<input id="abcdFind" type="text" placeholder="查找…（留空 = 统计）" value="' + esc(uiState.find) + '" style="flex:2;min-width:140px">' +
      '<input id="abcdReplace" type="text" placeholder="替换为…" value="' + esc(uiState.replace) + '" style="flex:2;min-width:140px">' +
      '<label style="font-size:12px;display:flex;gap:4px;align-items:center"><input id="abcdCase" type="checkbox">区分大小写</label>' +
      '<label style="font-size:12px;display:flex;gap:4px;align-items:center"><input id="abcdRegex" type="checkbox"' + (uiState.useRegex ? ' checked' : '') + '>正则</label>' +
      '<button type="button" id="abcdRepPrev" class="mini">预览匹配</button>' +
      '<button type="button" id="abcdRepApply" class="mini primary">应用替换</button></div>' +
      '<p id="abcdRepResult" style="margin:6px 0 0;font-size:12px;color:#61666D;white-space:pre-wrap"></p></div>' +
      '<div id="abcdDlgList" style="display:flex;flex-direction:column;gap:6px"></div>' +
      '<p id="abcdDlgEmpty" class="hint' + (rows.length ? ' hidden' : '') + '">当前范围没有台词（可在左侧场景中先输入正文，或用「＋ 添加台词」）。</p>';
    const scope = gel('abcdScope');
    if (scope) scope.addEventListener('change', function () { uiState.scope = scope.value; renderC(); });
    const cq = gel('abcdCq');
    if (cq) cq.addEventListener('input', function () {
      uiState.q = cq.value;
      const r2 = abcdDialogueRows(proj, uiState.scope || '', uiState.q);
      const cnt = gel('abcdCcount');
      if (cnt) cnt.textContent = r2.length + ' 行';
      renderDlgRows(r2);           // 只重建列表，不重建输入框（保住过滤输入焦点）
    });
    const addBtn = gel('abcdDlgAdd');
    if (addBtn) addBtn.addEventListener('click', function () {
      let sceneId = uiState.scope;
      if (!sceneId) sceneId = curSceneId();
      if (!sceneId) { toastMsg('请先在上方选择添加台词的目标场景'); return; }
      if (!proj || !proj.scenes.some(function (s) { return s.id === sceneId; })) { toastMsg('场景不存在：' + sceneId); return; }
      beginAction();
      abcdDialogueAdd(proj, sceneId, '', '');
      endAction();
    });
    const ob = gel('abcdOpenBatch');
    if (ob) ob.addEventListener('click', function () {
      try {
        const b = qe('#btnBatch');
        if (b && typeof b.click === 'function') { b.click(); return; }
      } catch (e) {}
      toastMsg('未找到现有批量工具入口');
    });
    const ff = gel('abcdFind'), rr = gel('abcdReplace');
    const caseChk = gel('abcdCase'), regexChk = gel('abcdRegex');
    const remember = function () {
      if (ff) uiState.find = ff.value;
      if (rr) uiState.replace = rr.value;
      if (regexChk) uiState.useRegex = regexChk.checked;
    };
    const preview = function () {
      remember();
      const find = uiState.find;
      if (!find) { const res = gel('abcdRepResult'); if (res) res.textContent = '请先填写查找内容（统计全部台词长度可留空？——请填写查找文本）'; return; }
      const scoped = abcdDialogueRows(proj, uiState.scope || '', '');
      const re = reuseMatcher(find, caseChk ? caseChk.checked : false, regexChk ? regexChk.checked : false);
      if (!re) { const res = gel('abcdRepResult'); if (res) res.textContent = '正则表达式无效'; return; }
      let rowsHit = 0, occ = 0;
      const examples = [];
      scoped.forEach(function (row) {
        const t = str(row.d.text); if (!t) return;
        re.lastIndex = 0;
        const hits = t.match(re);
        if (!hits) return;
        occ += hits.length; rowsHit++;
        if (examples.length < 5) examples.push(row.sceneName + '：' + t.slice(0, 60));
      });
      const res = gel('abcdRepResult');
      if (res) res.textContent = '匹配台词行 ' + rowsHit + ' 行 / 共 ' + occ + ' 处' + (examples.length ? '\n' + examples.join('\n') : '');
    };
    if (ff) ff.addEventListener('input', function () { uiState.find = ff.value; });
    if (rr) rr.addEventListener('input', function () { uiState.replace = rr.value; });
    if (regexChk) regexChk.addEventListener('change', function () { uiState.useRegex = regexChk.checked; });
    const pv = gel('abcdRepPrev');
    if (pv) pv.addEventListener('click', preview);
    const ap = gel('abcdRepApply');
    if (ap) ap.addEventListener('click', function () {
      remember();
      const scopeSel = uiState.scope || '';
      beginAction();
      const out = abcdDialogueReplace(proj, {
        sceneId: scopeSel, find: uiState.find, replace: uiState.replace,
        caseSensitive: caseChk ? caseChk.checked : false, useRegex: regexChk ? regexChk.checked : false
      });
      const res = gel('abcdRepResult');
      if (!out.ok) { if (res) res.textContent = out.msg; return; }
      if (!out.changed) {
        snapBefore();
        if (res) res.textContent = '没有匹配到需要替换的台词文本（仅统计：' + out.occurrences + ' 处）';
        return;
      }
      endAction(false);
      if (res) res.textContent = '已替换台词文本 ' + out.changed + ' 行 / ' + out.occurrences + ' 处（仅正文，元数据未改动；可用 Ctrl+Z 撤销）';
      renderC();
    });
    renderDlgRows(rows);
  }
  function renderDlgRows(rows) {
    const box = gel('abcdDlgList');
    if (!box) return;
    const proj = curProject();
    box.innerHTML = rows.map(function (row, idx) {
      return '<div class="choice-card" style="padding:6px 8px;display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap" data-dlg-row="' + idx + '" data-dlg-scene="' + esc(row.sceneId) + '" data-dlg-idx="' + row.index + '">' +
        '<span style="font-size:11px;color:#9499A0;border:1px solid #E3E5E7;border-radius:6px;padding:2px 6px;margin-top:4px;white-space:nowrap">' + esc(row.sceneName) + ' #' + row.index + '</span>' +
        '<input type="text" data-dlg="speaker" value="' + esc(row.d.speaker) + '" placeholder="说话人（可选）" style="width:130px;min-width:90px">' +
        '<input type="text" data-dlg="text" value="' + esc(row.d.text) + '" placeholder="正文…（拖动右下角可加高）" style="flex:1;min-width:220px">' +
        (row.d.charId ? '<span style="font-size:11px;color:#C75C7E;margin-top:6px" title="绑定角色：charId=' + esc(row.d.charId) + '">🎭' + esc(row.d.charId) + '</span>' : '') +
        (row.d.voice ? '<span style="font-size:11px;color:#61666D;margin-top:6px" title="语音">🔊</span>' : '') +
        '<button type="button" class="mini danger" data-dlg="del" title="删除此行（整句移除）">✕</button>' +
        '</div>';
    }).join('');
    const empty = gel('abcdDlgEmpty');
    if (empty) empty.classList.toggle('hidden', !!rows.length);
    box.addEventListener('input', function (ev) {
      const inp = ev.target.closest('[data-dlg]');
      if (!inp || !inp.dataset || (inp.dataset.dlg !== 'speaker' && inp.dataset.dlg !== 'text')) return;
      const rowEl = inp.closest('[data-dlg-row]');
      if (!rowEl) return;
      const patch = {};
      patch[inp.dataset.dlg] = inp.value;
      abcdDialoguePatch(proj, rowEl.dataset.dlgScene, Number(rowEl.dataset.dlgIdx), patch);
      persistSave();
    });
    box.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-dlg=del]');
      if (!btn) return;
      const rowEl = btn.closest('[data-dlg-row]');
      if (!rowEl) return;
      if (!confirm('删除台词 #' + rowEl.dataset.dlgIdx + '？')) return;
      beginAction();
      abcdDialogueRemove(proj, rowEl.dataset.dlgScene, Number(rowEl.dataset.dlgIdx));
      endAction();
    });
  }

  /* ================= D 外观预设 + 章节 CRUD + 进度设置 ================= */
  function sceneName(proj, id) { const s = proj && proj.scenes ? proj.scenes.find(function (x) { return x.id === id; }) : null; return s ? (s.name || s.id) : (id || '—'); }
  function renderD() {
    const proj = curProject();
    const exp = proj && proj.experience ? proj.experience : {};
    const presets = abcdPresets(proj);
    const chapters = abcdChapters(proj);
    const ps = uiState.presetScene || curSceneId() || (proj && proj.startScene) || '';
    ui.body.innerHTML =
      /* ---- 进度设置 ---- */
      '<div style="border:1px solid #E3E5E7;border-radius:10px;padding:10px 12px;margin-bottom:12px">' +
      '<h4 style="margin:0 0 6px">进度设置（experience 开关，导出播放器直接生效）</h4>' +
      '<label style="display:flex;gap:6px;align-items:center;font-size:13px;margin-right:14px"><input type="checkbox" data-abcd-prog="autosave"' + (exp.autosave !== false ? ' checked' : '') + '> 自动存档</label>' +
      '<label style="display:flex;gap:6px;align-items:center;font-size:13px;margin-right:14px"><input type="checkbox" data-abcd-prog="chapterSelection"' + (exp.chapterSelection !== false ? ' checked' : '') + '> 允许章节选择</label>' +
      '<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" data-abcd-prog="skipRead"' + (exp.skipRead !== false ? ' checked' : '') + '> 已读快进可用</label>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
      /* ---- 外观预设 ---- */
      '<div style="border:1px solid #E3E5E7;border-radius:10px;padding:10px 12px">' +
      '<h4 style="margin:0 0 6px">🎭 场景外观预设（捕捉 / 应用，可撤销）</h4>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">' +
      '<select id="abcdPScene" style="flex:1.4;min-width:140px">' + ui.sceneOptions(ps, false) + '</select>' +
      '<input id="abcdApName" type="text" placeholder="预设名称" value="' + esc('') + '" style="flex:1;min-width:110px">' +
      '<button type="button" id="abcdCapture" class="mini primary">捕捉场景</button></div>' +
      '<p style="margin:0 0 6px;font-size:12px;color:#9499A0">捕捉 = 把该场景所有立绘角色的站位/缩放/透明度/表情快照存入 appearancePresets；应用 = 按 charId → 名称 → 顺序匹配回填到目标场景（身份字段不覆盖）。</p>' +
      '<div id="abcdPresetList" style="display:flex;flex-direction:column;gap:6px"></div>' +
      '<p id="abcdPresetEmpty" class="hint' + (presets.length ? ' hidden' : '') + '">还没有外观预设。</p>' +
      '<p id="abcdApplyMsg" style="font-size:12px;color:#1A7F37;min-height:16px"></p></div>' +
      /* ---- 章节 ---- */
      '<div style="border:1px solid #E3E5E7;border-radius:10px;padding:10px 12px">' +
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><h4 style="margin:0">📖 章节（{id,title,sceneId}）</h4>' +
      '<span style="flex:1"></span><button type="button" id="abcdChapterAdd" class="mini primary">＋ 添加章节</button></div>' +
      '<p style="margin:0 0 6px;font-size:12px;color:#9499A0">供「章节选择」菜单按章节跳转（ID 全局唯一，场景 = 该章起点）。</p>' +
      '<div id="abcdChapterList" style="display:flex;flex-direction:column;gap:6px"></div>' +
      '<p id="abcdChapterEmpty" class="hint' + (chapters.length ? ' hidden' : '') + '">还没有章节。不设章节时播放器走线性流程。</p></div>' +
      '</div>';
    /* 进度开关 */
    ui.body.querySelectorAll('[data-abcd-prog]').forEach(function (chk) {
      chk.addEventListener('change', function () {
        beginAction();
        exp[chk.dataset.abcdProg] = chk.checked;
        endAction(false);
      });
    });
    /* 预设：场景 / 名称 / 捕捉 */
    const psc = gel('abcdPScene');
    if (psc) psc.addEventListener('change', function () { uiState.presetScene = psc.value; });
    const cap = gel('abcdCapture');
    if (cap) cap.addEventListener('click', function () {
      const sceneId = psc ? psc.value : (curSceneId() || '');
      const name = gel('abcdApName');
      const preset = abcdPresetCapture(proj, sceneId, name ? name.value : '');
      if (!preset) { toastMsg('请先选择要捕捉的场景'); return; }
      beginAction();
      exp.appearancePresets = exp.appearancePresets || [];
      exp.appearancePresets.push(preset);
      endAction();
      toastMsg('已捕捉「' + preset.name + '」（' + preset.entries.length + ' 个角色）');
    });
    renderPresetList(proj, presets, psc ? psc.value : ps);
    renderChapterList(proj, chapters);
    const ca = gel('abcdChapterAdd');
    if (ca) ca.addEventListener('click', function () {
      beginAction();
      const ch = abcdChapterAdd(proj, '', psc ? psc.value : (proj && proj.startScene) || '');
      endAction();
      const msg = gel('abcdApplyMsg');
      if (ch) toastMsg('已添加章节 ' + (ch.title || ch.id));
    });
  }
  function renderPresetList(proj, presets, targetScene) {
    const box = gel('abcdPresetList');
    if (!box) return;
    const empty = gel('abcdPresetEmpty');
    if (empty) empty.classList.toggle('hidden', !!presets.length);
    box.innerHTML = presets.map(function (pr, i) {
      return '<div class="choice-card" style="padding:6px 8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap" data-ap-id="' + esc(pr.id) + '">' +
        '<input type="text" data-ap="name" value="' + esc(pr.name) + '" style="flex:1.2;min-width:120px">' +
        '<span style="font-size:11px;color:#9499A0">来源 ' + esc(sceneName(proj, pr.sceneId)) + ' · ' + (pr.entries ? pr.entries.length : 0) + ' 角色</span>' +
        '<span style="flex:1"></span>' +
        '<button type="button" class="mini primary" data-ap="apply" title="应用到右侧选择的目标场景">应用到场景</button>' +
        '<button type="button" class="mini danger" data-ap="del">删除</button></div>';
    }).join('');
    box.addEventListener('input', function (ev) {
      const inp = ev.target.closest('[data-ap=name]');
      if (!inp) return;
      const row = inp.closest('[data-ap-id]');
      if (!row) return;
      const pr = presets.find(function (x) { return x.id === row.dataset.apId; });
      if (pr) { pr.name = inp.value; persistSave(); }
    });
    box.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-ap]');
      if (!btn) return;
      const row = btn.closest('[data-ap-id]');
      if (!row) return;
      const id = row.dataset.apId;
      const psc = gel('abcdPScene');
      const sceneId = psc ? psc.value : '';
      if (btn.dataset.ap === 'del') {
        if (!confirm('删除预设？')) return;
        beginAction(); abcdPresetRemove(proj, id); endAction();
      } else if (btn.dataset.ap === 'apply') {
        if (!sceneId) { toastMsg('请先在右侧选择要应用的目标场景'); return; }
        beginAction();
        const out = abcdPresetApply(proj, id, sceneId);
        endAction(false);
        const msg = gel('abcdApplyMsg');
        if (msg) msg.textContent = out.ok ? out.msg + '（目标：' + sceneName(proj, sceneId) + '）' : out.msg;
        if (out.ok && out.applied > 0) { redrawAll(); toastMsg(out.msg); }
      }
    });
  }
  function renderChapterList(proj, chapters) {
    const box = gel('abcdChapterList');
    if (!box) return;
    const empty = gel('abcdChapterEmpty');
    if (empty) empty.classList.toggle('hidden', !!chapters.length);
    box.innerHTML = chapters.map(function (ch) {
      return '<div class="choice-card" style="padding:6px 8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap" data-ch-id="' + esc(ch.id) + '">' +
        '<input type="text" data-ch="id" value="' + esc(ch.id) + '" title="章节 ID（唯一）" style="width:110px">' +
        '<input type="text" data-ch="title" value="' + esc(ch.title) + '" placeholder="章节标题" style="flex:1.2;min-width:120px">' +
        '<select data-ch="scene" style="flex:1;min-width:130px">' + ui.sceneOptions(ch.sceneId, true) + '</select>' +
        '<span style="flex:1"></span>' +
        '<button type="button" class="mini" data-ch="up">▲</button>' +
        '<button type="button" class="mini" data-ch="down">▼</button>' +
        '<button type="button" class="mini danger" data-ch="del">✕</button></div>';
    }).join('');
    box.addEventListener('input', function (ev) {
      const inp = ev.target.closest('[data-ch]');
      if (!inp) return;
      const row = inp.closest('[data-ch-id]');
      if (!row) return;
      const f = inp.dataset.ch;
      if (f === 'title') {
        abcdChapterPatch(proj, row.dataset.chId, { title: inp.value });
        persistSave();          // 文本输入走防抖保存；结构操作/换 ID/换场景才记快照
      }
    });
    box.addEventListener('change', function (ev) {
      const el = ev.target.closest('[data-ch]');
      if (!el) return;
      const row = el.closest('[data-ch-id]');
      if (!row) return;
      const f = el.dataset.ch;
      if (f === 'id') {
        beginAction();
        const out = abcdChapterPatch(proj, row.dataset.chId, { id: el.value });
        if (!out.ok) {
          snapAfter();
          el.value = row.dataset.chId;
          toastMsg(out.msg || '章节 ID 无效');
        } else {
          endAction(false);
        }
      } else if (f === 'scene') {
        beginAction();
        abcdChapterPatch(proj, row.dataset.chId, { sceneId: el.value });
        endAction(false);
      }
    });
    box.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-ch]');
      if (!btn) return;
      const row = btn.closest('[data-ch-id]');
      if (!row) return;
      const act = btn.dataset.ch;
      if (act === 'del') {
        if (!confirm('删除章节「' + row.dataset.chId + '」？')) return;
        beginAction(); abcdChapterRemove(proj, row.dataset.chId); endAction();
      } else if (act === 'up') { beginAction(); abcdChapterMove(proj, row.dataset.chId, -1); endAction(); }
      else if (act === 'down') { beginAction(); abcdChapterMove(proj, row.dataset.chId, 1); endAction(); }
    });
  }

  /* ================= 安装：包装编辑入口 + Schema 补齐 + 按钮 + Esc ================= */
  function wrapEditorFns() {
    if (root.__abcdWrapped) return true;
    root.__abcdWrapped = true;
    try {
      if (typeof migrateProject === 'function' && !root.__abcdOrigMigrate) {
        root.__abcdOrigMigrate = migrateProject;
        migrateProject = function (p) {
          const out = root.__abcdOrigMigrate ? root.__abcdOrigMigrate(p || {}) : (p || {});
          try { abcdEnsureSchema(out); } catch (e) {}
          return out;
        };
      }
    } catch (e) {}
    try {
      if (typeof newProject === 'function' && !root.__abcdOrigNew) {
        root.__abcdOrigNew = newProject;
        newProject = function () {
          if (root.__abcdOrigNew) root.__abcdOrigNew();
          const p2 = curProject();
          if (p2) { try { abcdEnsureSchema(p2); } catch (e) {} }
        };
      }
    } catch (e) {}
    return true;
  }
  function menuBtnHTML() {
    return '<button type="button" id="btnAbcdCollections" title="管理 CG / 音乐 / 结局 / 成就 收藏与解锁预览">🖼 收藏品</button>' +
      '<button type="button" id="btnAbcdHomeMenu" title="主页 Logo / BGM / 开场动画 / 可拖拽菜单定位">🏠 主页·菜单</button>' +
      '<button type="button" id="btnAbcdDialogue" title="批量编辑台词正文并替换（保留角色/语音等元数据）">💬 台词批编</button>' +
      '<button type="button" id="btnAbcdChapters" title="场景外观预设 / 章节 CRUD / 进度设置">🎭 预设·章节</button>';
  }
  function bindButtons() {
    const attach = function (btn, tab) {
      if (!btn) return;
      btn.addEventListener('click', function () { openAbcd(tab); });
    };
    ['btnAbcdCollections', 'btnAbcdHomeMenu', 'btnAbcdDialogue', 'btnAbcdChapters'].forEach(function (id) {
      let b = gel(id);
      if (!b) {
        const panel = gel('designMenuPanel') || qe('#designMenuPanel');
        if (panel) {
          b = document.createElement('button');
          b.type = 'button';
          b.id = id;
          const titles = { btnAbcdCollections: '收藏品（CG/音乐/结局/成就）', btnAbcdHomeMenu: '主页·菜单', btnAbcdDialogue: '台词批编', btnAbcdChapters: '预设·章节' };
          b.title = titles[id];
          b.textContent = { btnAbcdCollections: '🖼 收藏品', btnAbcdHomeMenu: '🏠 主页·菜单', btnAbcdDialogue: '💬 台词批编', btnAbcdChapters: '🎭 预设·章节' }[id];
          panel.appendChild(b);
        }
      }
      if (b) attach(b, { btnAbcdCollections: 'A', btnAbcdHomeMenu: 'B', btnAbcdDialogue: 'C', btnAbcdChapters: 'D' }[id]);
    });
  }
  function onDocKey(e) {
    if (!uiState.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAbcd();
    }
  }
  function install() {
    try { wrapEditorFns(); } catch (e) {}
    const p0 = curProject();
    if (p0 && abcdSchemaChanged(p0)) {
      try { baselineReset(); } catch (e) {}
      try { persistNow(); } catch (e) {}
    }
    try { bindButtons(); } catch (e) {}
    try { if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('keydown', onDocKey); } catch (e) {}
  }
  /* UI 公共接口 */
  ABCD.open = openAbcd;
  ABCD.close = closeAbcd;
  ABCD.uiState = uiState;
  ABCD.install = install;
  ABCD._internals = {
    beginAction: beginAction, endAction: endAction, persistSave: persistSave, setField: setField,
    applyMenuPosLive: applyMenuPosLive, reuseMatcher: reuseMatcher, stageRect: stageRect
  };

  const canInstall = (function () {
    try { return typeof document !== 'undefined' && !!document.body && typeof project !== 'undefined'; }
    catch (e) { return false; }
  })();
  if (canInstall) {
    try { install(); } catch (e) { try { if (typeof console !== 'undefined' && console.error) console.error('abcd_editor install:', e); } catch (e2) {} }
  }
})(typeof window !== 'undefined' ? window : globalThis);
