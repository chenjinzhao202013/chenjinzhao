/* ============================================================
 * page-exam.js —— 在线答题页（学生端考试全流程核心）
 * ------------------------------------------------------------
 * 需求对应（专业实践 · 同学 3）：
 *   ① 题目展示、逐题切换        -> 整卷模式 / 逐题模式 双模式切换
 *   ② 倒计时提醒                -> 顶栏倒计时，剩 5 分钟提示、剩 1 分钟变红
 *   ③ 自动强制交卷              -> 倒计时归零自动交卷并判分
 *   ④ 手动提前交卷，提交后不可改 -> 交卷确认（列出未答/标记题）后锁定作答
 *   ⑤ 考试进行中的状态标注      -> 顶栏显示试卷名、已答进度、自动保存状态
 * ------------------------------------------------------------
 * 其他功能：
 *   · 答题卡导航（已答/未答/当前题/标记待检查），点击任意题号跳转
 *   · 自动保存：作答后 1.2 秒静默保存 + 每 20 秒兜底保存，顶栏实时提示
 *   · 断点续答：未交卷的考试刷新/重进时恢复进度与剩余时间
 *   · 防作弊：切屏计数上报、离开页面确认、禁用右键
 *   · 交卷前先把内存答案落库，避免最后 1.2 秒的作答被判为空白
 * ============================================================ */
(function (global) {
  'use strict';

  var S = null;              // 当前考试状态
  var timer = null;          // 倒计时定时器
  var autoSaveTimer = null;  // 兜底保存定时器
  var visHandler = null;     // 切屏监听
  var beforeUnload = null;   // 离开提醒
  var saving = false;
  var pendingSave = false;   // 保存进行中又有新改动 -> 结束后补一次
  var seq = 0;               // 路由代次令牌：防止上一个页面的异步回调画到新页面上

  /* ---------------- 路由离开 / 错误页 ---------------- */
  function bindBack(root) {
    var btn = UI.$('#backList', root);
    if (btn) { btn.onclick = function () { App.go('exam-list'); }; }
  }

  function showError(root, mySeq, msg) {
    if (mySeq !== seq) { return; }    // 页面已切走，不要覆盖当前页面
    root.innerHTML = tip(msg);
    bindBack(root);
  }

  function tip(msg) {
    return '<div class="card"><div class="empty"><div class="ico">⚠</div><p>' + UI.esc(msg) + '</p>' +
           '<div style="margin-top:16px"><button class="btn btn-ghost" id="backList">返回考试列表</button></div></div></div>';
  }

  /* ---------------- 清理 ---------------- */
  function teardown() {
    if (timer) { clearInterval(timer); timer = null; }
    if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
    if (visHandler) { document.removeEventListener('visibilitychange', visHandler); visHandler = null; }
    if (beforeUnload) { window.removeEventListener('beforeunload', beforeUnload); beforeUnload = null; }
    document.oncontextmenu = null;
    saving = false;
    pendingSave = false;
    S = null;
  }

  /* ---------------- 渲染入口 ---------------- */
  function render(root, params) {
    teardown();
    var my = ++seq;
    var paperId = params && params.paperId ? Number(params.paperId) : null;
    if (!paperId) { showError(root, my, '缺少试卷参数'); return; }

    root.innerHTML = '<div class="card"><div class="empty"><div class="ico">⏳</div><p>正在载入试卷并恢复答题进度…</p></div></div>';

    Promise.all([Api.getPaperDetail(paperId), Api.startExam(paperId)])
      .then(function (res) {
        var detail = res[0], start = res[1];
        if (my !== seq) { return; }                       // 已切到别的试卷/页面
        if (!detail.questions.length) {
          showError(root, my, '该试卷暂无题目，请联系教师检查题库配置');
          return;
        }
        return Api.loadDraft(start.record.id).then(function (draft) {
          if (my !== seq) { return; }                     // 页面已切走
          initState(detail, start, draft);
          paint(root);
          if (start.resumed) {
            UI.toast.warn('检测到未交卷的考试，已恢复上次答题进度', 3200);
          }
        });
      })
      .catch(function (err) {
        showError(root, my, err.message || '试卷加载失败');
      });
  }

  function initState(detail, start, draft) {
    S = {
      paper: detail.paper,
      bank: detail.bank,
      questions: detail.questions,
      record: start.record,
      resumed: start.resumed,
      current: 0,
      answers: {},
      flags: {},
      deadline: Api.getDeadline(start.record.id),
      submitType: 0,
      submitted: false,
      tabSwitches: start.record.tab_switch_count || 0,
      /* 展示模式：single 逐题切换 / full 整卷展示 */
      viewMode: 'single',
      /* 题库实际分值 与 exam_paper.total_score 不一致时在横幅上提示 */
      scoreMismatch: !!detail.score_mismatch,
      questionScore: detail.question_score
    };
    detail.questions.forEach(function (q) {
      /* 续考才恢复草稿；重新开考则从空白答题卡开始 */
      S.answers[q.id] = (start.resumed && draft[q.id] !== undefined) ? draft[q.id] : '';
    });
  }

  /* ---------------- 页面骨架 ---------------- */
  function paint(root) {
    root.innerHTML = [
      '<div class="exam-layout">',
      '  <div>',
      '    <div class="card exam-banner" id="examBanner"></div>',
      '    <div id="questionHost"></div>',
      '  </div>',
      '  <aside class="card sheet">',
      '    <h3>答题卡 <small id="sheetProgress">已答 0/0</small></h3>',
      '    <div class="sheet-legend">',
      '      <span><i class="lg-done"></i>已答</span>',
      '      <span><i class="lg-todo"></i>未答</span>',
      '      <span><i class="lg-cur"></i>当前</span>',
      '    </div>',
      '    <div class="sheet-grid" id="sheetGrid"></div>',
      '    <div class="sheet-actions">',
      '      <button class="btn btn-ghost btn-block" id="btnFlag">标记待检查</button>',
      '      <button class="btn btn-ghost btn-block" id="btnSave">保存答题卡</button>',
      '      <button class="btn btn-ok btn-block" id="btnSubmit">交 卷</button>',
      '    </div>',
      '    <div id="violationHost"></div>',
      '    <div class="sheet-note">',
      '      · 作答后自动保存，无需手动提交<br>',
      '      · 倒计时结束系统将自动交卷<br>',
      '      · 主观题由教师评阅，客观题系统自动判分<br>',
      '      · 快捷键：A/B/C/D 选项、←/→ 翻题、M 切换整卷/逐题、F 标记、Ctrl+Enter 交卷',
      '    </div>',
      '  </aside>',
      '</div>'
    ].join('');

    renderBanner();
    renderQuestionArea();
    renderSheet();
    renderViolation();
    startCountdown();
    startAutoSave();
    bindGuards();
  }

  /* ---------------- 顶部信息条（含模式切换） ---------------- */
  function renderBanner() {
    var host = UI.$('#examBanner');
    if (!host) { return; }
    var total = S.questions.length;
    var answered = answeredCount();
    var pct = total ? Math.round(answered / total * 100) : 0;
    var isSingle = S.viewMode === 'single';

    host.innerHTML = [
      '<div style="flex:1;min-width:0">',
      '  <h2>' + UI.esc(S.paper.paper_name) + '</h2>',
      '  <div class="meta">',
      '    <span>题库：<b>' + UI.esc(S.bank ? S.bank.bank_name : '—') + '</b></span>',
      '    <span>科目：<b>' + UI.esc(S.bank ? S.bank.subject : '—') + '</b></span>',
      '    <span>题量：<b>' + total + '</b> 题</span>',
      '    <span>时长：<b>' + S.paper.duration + '</b> 分钟</span>',
      '    <span>卷面总分：<b>' + S.paper.total_score + '</b> 分</span>',
      (S.scoreMismatch
        ? '<span style="color:#d97706">⚠ 题库实际 ' + total + ' 题 / ' + S.questionScore +
          ' 分，与卷面 ' + S.paper.total_score + ' 分不一致，最终以卷面总分为准</span>'
        : ''),
      '  </div>',
      '  <div class="progress-track"><div class="progress-bar" id="progressBar" style="width:' + pct + '%"></div></div>',
      '</div>',
      '<div class="banner-side">',
      '  <div class="view-switch">',
      '    <button type="button" class="' + (isSingle ? 'active' : '') + '" id="btnViewSingle">逐题切换</button>',
      '    <button type="button" class="' + (isSingle ? '' : 'active') + '" id="btnViewFull">整卷展示</button>',
      '  </div>',
      '</div>'
    ].join('');

    UI.$('#btnViewSingle').onclick = function () { switchView('single'); };
    UI.$('#btnViewFull').onclick = function () { switchView('full'); };
  }

  function switchView(mode) {
    if (!S || S.viewMode === mode) { return; }
    S.viewMode = mode;
    renderBanner();
    renderQuestionArea();
    UI.toast.info(mode === 'single' ? '已切换为逐题模式' : '已切换为整卷模式，所有题目同屏展示', 1800);
  }

  /* ---------------- 主体：按模式渲染 ---------------- */
  function renderQuestionArea() {
    if (S.viewMode === 'full') { renderFullView(); } else { renderSingleView(); }
  }

  /* ---- 逐题模式 ---- */
  function renderSingleView() {
    var host = UI.$('#questionHost');
    if (!host) { return; }
    var q = S.questions[S.current];
    var total = S.questions.length;
    var isLast = S.current === total - 1;

    host.innerHTML = [
      '<div class="card q-card">',
      '  <div class="q-head">',
      '    <span class="q-index">第 ' + (S.current + 1) + ' 题 <small>/ 共 ' + total + ' 题</small></span>',
      UI.typeTagHtml(q.question_type),
      '    <span class="q-score">本题 ' + q.score + ' 分</span>',
      '  </div>',
      '  <div class="q-content">' + UI.esc(q.question_content) + '</div>',
      '  <div>' + answerAreaHtml(q, S.answers[q.id], false) + '</div>',
      '  <div class="q-nav">',
      '    <button class="btn btn-ghost" id="btnPrev"' + (S.current === 0 ? ' disabled' : '') + '>上一题</button>',
      '    <span class="hint">' + (isLast ? '这是最后一题，可检查答题卡后交卷' : '作答后自动保存') + '</span>',
      '    <span class="spacer"></span>',
      '    <button class="btn" id="btnNext"' + (isLast ? ' disabled' : '') + '>下一题</button>',
      '  </div>',
      '</div>'
    ].join('');

    bindAnswerArea(q, false);
    UI.$('#btnPrev').onclick = function () { goTo(S.current - 1); };
    UI.$('#btnNext').onclick = function () { goTo(S.current + 1); };
    UI.scrollTop();
    renderSheet();
  }

  /* ---- 整卷模式 ---- */
  function renderFullView() {
    var host = UI.$('#questionHost');
    if (!host) { return; }
    var html = [
      '<div class="card full-view-bar">',
      '  <span>整卷展示：' + S.questions.length + ' 道题同屏，滚动作答；点击右侧答题卡题号可快速定位。</span>',
      '</div>'
    ];
    S.questions.forEach(function (q, i) {
      html.push(
        '<div class="card q-card full-q" id="q-card-' + i + '" data-qidx="' + i + '">',
        '  <div class="q-head">',
        '    <span class="q-index">第 ' + (i + 1) + ' 题 <small>/ 共 ' + S.questions.length + ' 题</small></span>',
        UI.typeTagHtml(q.question_type),
        (S.flags[q.id] ? '<span class="tag tag-essay">已标记待检查</span>' : ''),
        '    <span class="q-score">本题 ' + q.score + ' 分</span>',
        '  </div>',
        '  <div class="q-content">' + UI.esc(q.question_content) + '</div>',
        '  <div>' + answerAreaHtml(q, S.answers[q.id], true) + '</div>',
        '</div>'
      );
    });
    host.innerHTML = html.join('');

    S.questions.forEach(function (q) { bindAnswerArea(q, true); });
    renderSheet();
  }

  /* ---------------- 作答控件 ---------------- */
  function answerAreaHtml(q, value, fullView) {
    var type = Number(q.question_type);
    var suffix = fullView ? '_' + q.id : '';   // 整卷模式下同屏多题，控件 id 需区分

    if (type === 1 || type === 2) {
      var multi = type === 2;
      var picked = multi ? String(value || '').split('') : [String(value || '')];
      return '<div class="options">' + UI.optionKeys(q).map(function (o) {
        var checked = picked.indexOf(o.key) !== -1;
        return '<label class="option' + (checked ? ' checked' : '') + '">' +
          '<input type="' + (multi ? 'checkbox' : 'radio') + '" name="q' + q.id + '" value="' + o.key + '"' +
          (checked ? ' checked' : '') + '>' +
          '<span class="key">' + o.key + '</span>' +
          '<span class="txt">' + UI.esc(o.text) + '</span>' +
          '</label>';
      }).join('') + '</div>' +
      (multi
        ? '<div class="essay-info"><span>多选题：少选得一半分，错选不得分</span>' +
          '<span id="multiCount' + suffix + '">已选 ' + String(value || '').length + ' 项</span></div>'
        : '');
    }

    if (type === 3) {
      return '<div class="judge-row">' + ['对', '错'].map(function (v) {
        var checked = String(value) === v;
        return '<label class="option' + (checked ? ' checked' : '') + '">' +
          '<input type="radio" name="q' + q.id + '" value="' + v + '"' + (checked ? ' checked' : '') + '>' +
          '<span class="txt">' + (v === '对' ? '√ 正确' : '× 错误') + '</span>' +
          '</label>';
      }).join('') + '</div>';
    }

    /* 简答题（需求中的“填空题”在本库中对应 question_type=4 的主观题） */
    var text = String(value || '');
    return '<textarea class="essay-input" id="essayInput' + suffix + '" ' +
      'placeholder="请在此输入你的答案要点…">' + UI.esc(text) + '</textarea>' +
      '<div class="essay-info"><span>主观题由教师评阅，请尽量分点作答</span>' +
      '<span id="essayCount' + suffix + '">' + text.length + ' 字</span></div>';
  }

  function bindAnswerArea(q, fullView) {
    var type = Number(q.question_type);
    var suffix = fullView ? '_' + q.id : '';

    if (type === 1 || type === 2) {
      UI.$$('input[name="q' + q.id + '"]').forEach(function (input) {
        input.onchange = function () {
          if (type === 2) {
            S.answers[q.id] = UI.$$('input[name="q' + q.id + '"]:checked')
              .map(function (i) { return i.value; }).sort().join('');
            var counter = UI.$('#multiCount' + suffix);
            if (counter) { counter.textContent = '已选 ' + S.answers[q.id].length + ' 项'; }
          } else {
            S.answers[q.id] = input.value;
          }
          syncOptionStyle(q.id);
          afterChange(q.id);
        };
      });
      return;
    }

    if (type === 3) {
      UI.$$('input[name="q' + q.id + '"]').forEach(function (input) {
        input.onchange = function () {
          S.answers[q.id] = input.value;
          syncOptionStyle(q.id);
          afterChange(q.id);
        };
      });
      return;
    }

    var ta = UI.$('#essayInput' + suffix);
    if (!ta) { return; }
    var counter = UI.$('#essayCount' + suffix);
    var debounced = UI.debounce(function () { scheduleSave(); }, 1200);
    ta.oninput = function () {
      S.answers[q.id] = ta.value;
      if (counter) { counter.textContent = ta.value.length + ' 字'; }
      afterChange(q.id, true);
      debounced();
    };
    /* 整卷模式：聚焦某个简答框即视为“当前题”，便于答题卡联动 */
    ta.onfocus = function () {
      S.current = indexOfQuestion(q.id);
      highlightCurrentCell();
    };
  }

  function syncOptionStyle(qid) {
    UI.$$('label.option').forEach(function (label) {
      var input = label.querySelector('input');
      if (input && input.name === 'q' + qid) {
        label.classList.toggle('checked', input.checked);
      }
    });
  }

  function afterChange(qid) {
    S.current = indexOfQuestion(qid);
    var cell = UI.$('.sheet-cell[data-idx="' + S.current + '"]');
    if (cell) {
      cell.classList.toggle('done', isAnswered(qid));
      if (S.viewMode === 'single') { highlightCurrentCell(); }
    }
    updateProgress();
    scheduleSave();
  }

  function indexOfQuestion(qid) {
    for (var i = 0; i < S.questions.length; i++) {
      if (S.questions[i].id === Number(qid)) { return i; }
    }
    return 0;
  }

  /* ---------------- 答题卡 ---------------- */
  function renderSheet() {
    var grid = UI.$('#sheetGrid');
    if (!grid) { return; }
    grid.innerHTML = S.questions.map(function (q, i) {
      var cls = ['sheet-cell'];
      if (isAnswered(q.id)) { cls.push('done'); }
      if (i === S.current) { cls.push('current'); }
      if (S.flags[q.id]) { cls.push('flag'); }
      return '<button type="button" class="' + cls.join(' ') + '" data-idx="' + i + '" title="第 ' + (i + 1) +
        ' 题 · ' + UI.esc(Api.utils.questionTypeLabel(q.question_type)) +
        (S.flags[q.id] ? ' · 已标记待检查' : '') + '">' + (i + 1) + '</button>';
    }).join('');
    UI.$$('.sheet-cell', grid).forEach(function (cell) {
      cell.onclick = function () { goTo(Number(cell.getAttribute('data-idx'))); };
    });
    updateProgress();
  }

  /* 只移动“当前题”高亮，不重建答题卡（整卷模式滚动时用） */
  function highlightCurrentCell() {
    var grid = UI.$('#sheetGrid');
    if (!grid) { return; }
    UI.$$('.sheet-cell', grid).forEach(function (cell) {
      cell.classList.toggle('current', Number(cell.getAttribute('data-idx')) === S.current);
    });
  }

  function updateProgress() {
    var answered = answeredCount(), total = S.questions.length;
    var el = UI.$('#sheetProgress');
    if (el) { el.textContent = '已答 ' + answered + '/' + total; }
    var bar = UI.$('#progressBar');
    if (bar) { bar.style.width = (total ? Math.round(answered / total * 100) : 0) + '%'; }
    var head = UI.$('#examStatusProgress');
    if (head) { head.textContent = answered + '/' + total; }
  }

  function answeredCount() {
    return S.questions.filter(function (q) { return isAnswered(q.id); }).length;
  }
  function isAnswered(qid) {
    var v = S.answers[qid];
    return !(v === '' || v === null || v === undefined);
  }

  /* 跳转到第 idx 题：逐题模式直接渲染，整卷模式滚动到对应卡片 */
  function goTo(idx) {
    if (idx < 0 || idx >= S.questions.length) { return; }
    S.current = idx;
    if (S.viewMode === 'full') {
      var card = UI.$('#q-card-' + idx);
      if (card) {
        var top = card.getBoundingClientRect().top + window.pageYOffset - 80;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
      refreshSheetCells();
      return;
    }
    renderSingleView();
  }

  /* 整卷模式：只刷新答题卡格子状态，避免滚动位置丢失 */
  function refreshSheetCells() {
    var grid = UI.$('#sheetGrid');
    if (!grid) { return; }
    UI.$$('.sheet-cell', grid).forEach(function (cell) {
      var i = Number(cell.getAttribute('data-idx'));
      var q = S.questions[i];
      cell.classList.toggle('flag', !!S.flags[q.id]);
      cell.classList.toggle('done', isAnswered(q.id));
      cell.classList.toggle('current', i === S.current);
    });
  }

  function toggleFlag() {
    var qid = S.questions[S.current].id;
    S.flags[qid] = !S.flags[qid];
    if (S.viewMode === 'full') {
      refreshSheetCells();
      var card = UI.$('#q-card-' + S.current);
      if (card) {
        var head = card.querySelector('.q-head');
        var old = head.querySelector('.tag-essay');
        if (S.flags[qid] && !old) {
          head.insertAdjacentHTML('beforeend', '<span class="tag tag-essay">已标记待检查</span>');
        } else if (!S.flags[qid] && old) {
          old.remove();
        }
      }
    } else {
      renderSheet();
    }
    UI.toast.info(S.flags[qid] ? '已标记第 ' + (S.current + 1) + ' 题待检查' : '已取消标记');
  }

  /* ---------------- 自动保存 ---------------- */
  function setSaveState(cls, text) {
    var el = UI.$('#examStatusSave');
    if (!el) { return; }
    el.className = 'save-state ' + (cls || '');
    el.textContent = text;
  }

  /* 把当前答题卡写回服务端；返回 Promise，交卷前会 await 它，确保答案不丢。
     force = true 用于交卷前的最后一次落库（此时 S.submitted 已置位，但保存仍须执行） */
  function flushAnswers(force) {
    if (!S) { return Promise.resolve(null); }
    if (S.submitted && !force) { return Promise.resolve(null); }
    setSaveState('saving', '保存中…');
    return Api.saveDraft(S.record.id, S.answers)
      .then(function (res) {
        if (S) {
          setSaveState('saved', '已保存 ' + UI.formatClock(new Date(String(res.saved_at).replace(/-/g, '/'))));
        }
        return res;
      })
      .catch(function (err) {
        setSaveState('', '保存失败');
        UI.toast.error(err.message || '答案保存失败');
        throw err;
      });
  }

  /* 静默保存：一轮保存进行中时只打标记，结束后立刻补一次，避免丢改动 */
  function scheduleSave() {
    if (!S || S.submitted) { return; }
    if (saving) { pendingSave = true; return; }
    saving = true;
    flushAnswers()
      .catch(function () { /* 已在 flushAnswers 内提示 */ })
      .then(function () {
        saving = false;
        if (pendingSave) { pendingSave = false; scheduleSave(); }
      });
  }

  function saveDraft(manual) {
    scheduleSave();
    if (manual) { UI.toast.ok('答题卡已保存'); }
  }

  function startAutoSave() {
    autoSaveTimer = setInterval(function () { scheduleSave(); }, 20000);
  }

  /* ---------------- 倒计时 ---------------- */
  function startCountdown() {
    tick();
    timer = setInterval(tick, 1000);
  }

  function tick() {
    if (!S || S.submitted) { return; }
    var remain = Math.max(0, Math.floor((S.deadline.getTime() - Date.now()) / 1000));
    var el = UI.$('#countdown');
    if (el) {
      el.textContent = UI.formatCountdown(remain);
      el.className = 'countdown' + (remain <= 60 ? ' danger' : (remain <= 300 ? ' warn' : ''));
    }
    var paperEl = UI.$('#examStatusPaper');
    if (paperEl) { paperEl.textContent = S.paper.paper_name; }

    if (remain === 300) { UI.toast.warn('距离考试结束还有 5 分钟，请及时检查答题卡', 4000); }
    if (remain === 0) {
      clearInterval(timer);
      timer = null;
      doSubmit(true);          // 时间到，自动强制交卷
    }
  }

  /* ---------------- 违规监测 / 离开提醒 ---------------- */
  function bindGuards() {
    visHandler = function () {
      if (!S || S.submitted || document.visibilityState !== 'hidden') { return; }
      S.tabSwitches++;
      Api.reportViolation(S.record.id, 'tab_switch').then(renderViolation);
      if (S.tabSwitches === 1) {
        UI.toast.warn('检测到切换窗口/标签页，本场考试将记录该行为', 3600);
      } else if (S.tabSwitches === 3) {
        UI.toast.error('已累计切屏 ' + S.tabSwitches + ' 次，请专注考试，再次切屏将上报监考教师', 4200);
      }
    };
    document.addEventListener('visibilitychange', visHandler);

    beforeUnload = function (e) {
      if (!S || S.submitted) { return; }
      e.preventDefault();
      e.returnValue = '考试尚未交卷，离开页面将保留答题进度。确定离开吗？';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', beforeUnload);
  }

  function renderViolation() {
    var host = UI.$('#violationHost');
    if (!host || !S) { return; }
    if (!S.tabSwitches) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="violation-badge' + (S.tabSwitches >= 3 ? ' danger' : '') + '">' +
      '⚠ 已记录切屏行为 <b>' + S.tabSwitches + '</b> 次' +
      (S.tabSwitches >= 3 ? '（将影响考试成绩评定）' : '') + '</div>';
  }

  /* ---------------- 交卷 ---------------- */
  function confirmSubmit() {
    if (!S || S.submitted) { return; }
    var unanswered = S.questions.filter(function (q) { return !isAnswered(q.id); });
    var flagged = S.questions.filter(function (q) { return S.flags[q.id]; });

    var html = [
      '<p>交卷后无法再修改答案，请确认答题情况：</p>',
      '<ul>',
      '<li>共 <b>' + S.questions.length + '</b> 题，已作答 <b>' + answeredCount() + '</b> 题</li>'
    ];
    if (unanswered.length) {
      html.push('<li style="color:#dc2626">未作答 <b>' + unanswered.length + '</b> 题：第 ' +
        unanswered.map(function (q) { return indexOfQuestion(q.id) + 1; }).join('、') + ' 题</li>');
    }
    if (flagged.length) {
      html.push('<li style="color:#d97706">标记待检查 <b>' + flagged.length + '</b> 题：第 ' +
        flagged.map(function (q) { return indexOfQuestion(q.id) + 1; }).join('、') + ' 题</li>');
    }
    html.push('<li>剩余时间：<b>' + UI.formatCountdown(Math.max(0, Math.floor((S.deadline - Date.now()) / 1000))) + '</b></li>');
    html.push('</ul>');

    UI.confirm({
      title: '确认交卷',
      html: html.join(''),
      okText: '确认交卷',
      okClass: 'btn-ok',
      cancelText: unanswered.length ? '再检查一下' : '取消'
    }).then(function (ok) {
      if (!ok) {
        /* 弹窗等待期间可能已超时自动交卷，此时 S 已被释放 */
        if (!S || S.submitted) { return; }
        if (unanswered.length) {
          var target = indexOfQuestion(unanswered[0].id);
          goTo(target);
          UI.toast.warn('已跳转到第 ' + (target + 1) + ' 题');
        }
        return;
      }
      doSubmit(false);
    });
  }

  function doSubmit(auto) {
    if (!S || S.submitted) { return; }
    S.submitted = true;
    S.submitType = auto ? 2 : 1;
    if (beforeUnload) { window.removeEventListener('beforeunload', beforeUnload); beforeUnload = null; }
    if (timer) { clearInterval(timer); timer = null; }
    if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }

    /* 交卷过程中锁定作答入口：提交后不可修改答案 */
    ['#btnSubmit', '#btnSave', '#btnFlag', '#btnPrev', '#btnNext', '#btnViewSingle', '#btnViewFull']
      .forEach(function (sel) {
        var btn = UI.$(sel);
        if (btn) { btn.disabled = true; }
      });
    UI.$$('#questionHost input, #questionHost textarea').forEach(function (el) { el.disabled = true; });
    document.oncontextmenu = function () { return false; };

    var used = Api.utils.diffSeconds(S.record.start_time, Api.utils.now());
    var recordId = S.record.id;
    var host = UI.$('#questionHost');
    if (host) {
      host.innerHTML = '<div class="card"><div class="empty"><div class="ico">📤</div><p>' +
        (auto ? '考试时间已到，正在保存答案并自动交卷…' : '正在保存答案并交卷判分，请稍候…') + '</p></div></div>';
    }

    /* 关键：先把内存中的答题卡落库，再由服务端判分。
       否则最后 1.2 秒内的作答（简答题防抖）会以旧数据判分。 */
    Promise.resolve()
      .then(function () { return flushAnswers(true); })
      .catch(function () {
        /* 保存失败也必须继续交卷，但明确告知考生 */
        UI.toast.error('交卷前保存失败，将以最后一次成功保存的答案判分');
      })
      .then(function () {
        return Api.submitExam(recordId, {
          auto: auto,
          used_seconds: used,
          tab_switch_count: S ? S.tabSwitches : 0
        });
      })
      .then(function (res) {
        var newRecordId = res.record.id;
        App.go('result', { recordId: newRecordId }, true);
        teardown();
        UI.toast.ok(auto ? '时间到，已自动交卷' : '交卷成功，正在生成成绩单', 2600);
      })
      .catch(function (err) {
        if (!S) { UI.toast.error(err.message || '交卷失败，请刷新页面重试'); return; }
        S.submitted = false;
        UI.toast.error(err.message || '交卷失败，请重试');
        ['#btnSubmit', '#btnSave', '#btnFlag', '#btnPrev', '#btnNext', '#btnViewSingle', '#btnViewFull']
          .forEach(function (sel) {
            var btn = UI.$(sel);
            if (btn) { btn.disabled = false; }
          });
        UI.$$('#questionHost input, #questionHost textarea').forEach(function (el) { el.disabled = false; });
        document.oncontextmenu = null;
        renderQuestionArea();
      });
  }

  /* ---------------- 键盘快捷键 ---------------- */
  function onKey(e) {
    if (!S || S.submitted) { return; }
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') { return; }

    if (e.key === 'ArrowRight' || e.key === 'PageDown') { goTo(S.current + 1); e.preventDefault(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { goTo(S.current - 1); e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { confirmSubmit(); e.preventDefault(); return; }

    var upper = String(e.key).toUpperCase();
    if (upper === 'M') {                                  // M 切换整卷 / 逐题
      switchView(S.viewMode === 'single' ? 'full' : 'single');
      e.preventDefault();
      return;
    }
    if (upper === 'F') { toggleFlag(); e.preventDefault(); return; }

    var q = S.questions[S.current];
    var type = Number(q.question_type);

    if (type === 1 && 'ABCD'.indexOf(upper) !== -1) { pickOption(q.id, upper, false); }
    if (type === 2 && 'ABCD'.indexOf(upper) !== -1) { pickOption(q.id, upper, true); }
    if (type === 3) {
      if (upper === 'T') { pickOption(q.id, '对', false); }
      if (upper === 'G') { pickOption(q.id, '错', false); }
    }
  }

  function pickOption(qid, key, multi) {
    var input = null;
    UI.$$('input[name="q' + qid + '"]').forEach(function (i) {
      if (i.value === key) { input = i; }
    });
    if (!input) { return; }
    if (multi) { input.checked = !input.checked; } else { input.checked = true; }
    input.onchange();
  }

  global.PageExam = {
    render: function (root, params) {
      document.addEventListener('keydown', onKey);
      render(root, params);
    },
    /* 路由离开时确保定时器与监听全部释放 */
    destroy: function () {
      document.removeEventListener('keydown', onKey);
      teardown();
    }
  };
})(window);
