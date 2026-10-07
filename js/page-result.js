/* ============================================================
 * page-result.js —— 成绩与答卷解析页
 * 数据源：exam_record + exam_record_answer + exam_question
 * ============================================================ */
(function (global) {
  'use strict';

  var seq = 0;   // 路由代次令牌：防止上一个页面的异步回调画到新页面上

  function render(root, params) {
    var my = ++seq;
    var recordId = params && params.recordId ? Number(params.recordId) : null;
    if (!recordId) { showError(root, my, '缺少考试记录参数'); return; }

    root.innerHTML = '<div class="card"><div class="empty"><div class="ico">📊</div><p>正在统计成绩…</p></div></div>';

    Api.getResult(recordId)
      .then(function (data) {
        if (my !== seq) { return; }
        root.innerHTML = build(data);
        bind(root);
      })
      .catch(function (err) {
        showError(root, my, err.message || '成绩加载失败');
      });
  }

  function bindBack(root) {
    var btn = UI.$('#backList2', root);
    if (btn) { btn.onclick = function () { App.go('exam-list'); }; }
  }

  function showError(root, mySeq, msg) {
    if (mySeq !== seq) { return; }
    root.innerHTML = tip(msg);
    bindBack(root);
  }

  function tip(msg) {
    return '<div class="card"><div class="empty"><div class="ico">⚠</div><p>' + UI.esc(msg) + '</p>' +
      '<div style="margin-top:16px"><button class="btn btn-ghost" id="backList2">返回考试列表</button></div></div></div>';
  }

  /* ---------------- 页面组装 ---------------- */
  function build(data) {
    var r = data.record;
    var total = data.total_score || 1;
    var score = r.score || 0;
    var rate = UI.degree(score, total);
    var pct = Math.round(rate * 100);
    var passLine = total * 0.6;
    var pending = data.pending_count > 0 || r.status === 1;

    var ringColor = pending ? '#d97706' : (score >= passLine ? '#16a34a' : '#dc2626');

    var html = [];

    /* ---- 成绩总览 ---- */
    html.push(
      '<div class="card result-hero">',
      '  <div class="score-ring" style="--pct:' + pct + ';--ring-color:' + ringColor + '">',
      '    <div class="inner">',
      '      <div class="val">' + score + '<small> / ' + total + '</small></div>',
      '      <div class="lb">得分率 ' + pct + '%</div>',
      '    </div>',
      '  </div>',
      '  <div class="result-info">',
      '    <h2>' + UI.esc(data.paper ? data.paper.paper_name : '考试') + '</h2>',
      '    <div class="meta">',
      '      <div><span>考生</span><b>' + UI.esc(data.user ? data.user.real_name : '—') +
             '（' + UI.esc(data.user ? data.user.username : '—') + '）</b></div>',
      '      <div><span>所属题库</span><b>' + UI.esc(data.bank ? data.bank.bank_name : '—') + '</b></div>',
      '      <div><span>开始时间</span><b>' + UI.formatDate(r.start_time) + '</b></div>',
      '      <div><span>交卷时间</span><b>' + UI.formatDate(r.submit_time) + '</b></div>',
      '      <div><span>考试用时</span><b>' + UI.formatDuration(r.used_seconds) + '</b></div>',
      '      <div><span>交卷方式</span><b>' + submitTypeLabel(r.submit_type) + '</b></div>',
      '      <div><span>客观题得分</span><b>' + (r.objective_score || 0) + ' 分</b></div>',
      '      <div><span>主观题得分</span><b>' + (r.subjective_score || 0) +
             ' 分' + (pending ? '（待教师复核）' : '') + '</b></div>',
      '    </div>',
      verdictHtml(score, passLine, pending, r),
      '  </div>',
      '</div>'
    );

    /* ---- 分题型统计 ---- */
    html.push('<div class="type-stats">');
    data.type_stats.forEach(function (t) {
      html.push(
        '<div class="card type-stat">',
        '  <div class="k">' + UI.esc(t.label) + '（' + t.count + ' 题）</div>',
        '  <div class="v">' + t.got + '<small> / ' + t.full + ' 分</small></div>',
        '  <div class="k">答对 ' + t.right + ' / ' + t.count + ' 题</div>',
        '</div>'
      );
    });
    html.push('</div>');

    /* ---- 答卷解析 ---- */
    html.push('<h3 class="section-title">答卷解析</h3>');
    data.details.forEach(function (d) {
      html.push(reviewItem(d));
    });

    /* ---- 操作区 ---- */
    html.push(
      '<div class="result-actions">',
      '  <button class="btn" id="btnBackList">返回考试列表</button>',
      '  <button class="btn btn-ghost" id="btnPrint">打印/导出成绩单</button>',
      '</div>',
      '<p class="muted" style="font-size:12.5px;margin-top:10px">' +
      '说明：一次考试只能考一次，本场已交卷，不能重复作答；如需再次考试，请等待教师发布新的试卷。<br>' +
      '成绩构成：客观题由判分模块依据 exam_question.answer 计算，主观题按参考答案要点预评分，' +
      '最终成绩以教师评阅为准（exam_record.score 会同步更新）。</p>'
    );

    return html.join('');
  }

  function submitTypeLabel(t) {
    return { 1: '手动交卷', 2: '超时自动交卷', 3: '超时未交卷', 0: '—' }[t] || '—';
  }

  function verdictHtml(score, passLine, pending, r) {
    if (pending) {
      return '<div class="result-verdict" style="background:#fffbeb;color:#d97706">' +
        '本场考试包含主观题，当前得分为系统预评分，教师评阅后成绩可能变动。</div>';
    }
    if (score >= passLine) {
      return '<div class="result-verdict pass">恭喜，本场考试已通过（及格线 ' + Math.round(passLine) + ' 分）。</div>';
    }
    return '<div class="result-verdict fail">很遗憾，本场考试未达到及格线（' + Math.round(passLine) +
      ' 分）。本场考试已交卷，不能重考。</div>';
  }

  /* ---------------- 单题解析 ---------------- */
  function reviewItem(d) {
    var q = d.question;
    var type = Number(q.question_type);
    var correct = d.is_correct === 1;
    var noAnswer = !String(d.user_answer || '').trim();

    var statusTag;
    if (noAnswer) {
      statusTag = '<span class="tag tag-gray">未作答</span>';
    } else if (type === 4) {
      statusTag = d.pending
        ? '<span class="tag tag-essay">待教师评阅</span>'
        : '<span class="tag ' + (d.score >= q.score * 0.6 ? 'tag-ok' : 'tag-bad') + '">机器预评分</span>';
    } else if (correct) {
      statusTag = '<span class="tag tag-ok">✔ 回答正确</span>';
    } else if (type === 2 && d.score > 0) {
      statusTag = '<span class="tag tag-essay">△ 少选得分</span>';
    } else {
      statusTag = '<span class="tag tag-bad">✘ 回答错误</span>';
    }

    var html = [
      '<div class="card review-item">',
      '  <div class="review-head">',
      '    <span class="q-index">第 ' + d.index + ' 题</span>',
      UI.typeTagHtml(type),
      statusTag,
      '    <span class="right">',
      '      <span class="muted">得分</span>',
      '      <b style="font-size:16px;color:' + (d.score >= q.score ? '#16a34a' : (d.score > 0 ? '#d97706' : '#dc2626')) + '">' +
             d.score + '</b><span class="muted"> / ' + d.full_score + '</span>',
      '    </span>',
      '  </div>',
      '  <div class="review-q">' + UI.esc(q.question_content) + '</div>'
    ];

    /* 选项型题目：逐项标注正确/错误 */
    if (type === 1 || type === 2 || type === 3) {
      var rightKeys = String(q.answer).toUpperCase().split('');
      var mineKeys = String(d.user_answer || '').toUpperCase().split('');

      if (type === 3) {
        html.push('<div class="review-options">');
        [['对', '√ 正确'], ['错', '× 错误']].forEach(function (pair) {
          var key = pair[0], label = pair[1];
          var isRight = rightKeys.indexOf(key) !== -1;
          var isMine = mineKeys.indexOf(key) !== -1;
          var cls = [];
          if (isRight) { cls.push('is-correct'); }
          if (isMine && !isRight) { cls.push('is-wrong'); }
          html.push('<div class="review-option ' + cls.join(' ') + '">' +
            '<span class="key">' + key + '</span><span>' + label + '</span>' +
            '<span class="mark">' + (isRight ? '正确答案' : (isMine ? '你的选择' : '')) + '</span></div>');
        });
        html.push('</div>');
      } else {
        html.push('<div class="review-options">');
        UI.optionKeys(q).forEach(function (o) {
          var isRight = rightKeys.indexOf(o.key) !== -1;
          var isMine = mineKeys.indexOf(o.key) !== -1;
          var cls = [];
          if (isRight) { cls.push('is-correct'); }
          if (isMine && !isRight) { cls.push('is-wrong'); }
          var marks = [];
          if (isRight) { marks.push('正确答案'); }
          if (isMine) { marks.push('你的选择'); }
          html.push('<div class="review-option ' + cls.join(' ') + '">' +
            '<span class="key">' + o.key + '</span><span>' + UI.esc(o.text) + '</span>' +
            '<span class="mark">' + marks.join(' · ') + '</span></div>');
        });
        html.push('</div>');
      }
    }

    /* 你的答案 / 参考答案 对照 */
    html.push('<div class="answer-compare">');
    html.push(
      '<div class="answer-box ' + (noAnswer ? '' : (type === 4 ? (d.pending ? '' : 'ok') : (correct ? 'ok' : 'bad'))) + '">',
      '  <span class="k">你的答案</span>',
      '  <span class="v">' + (noAnswer ? '<i style="color:#94a3b8">（未作答）</i>' : UI.esc(d.user_answer)) + '</span>',
      '</div>'
    );
    html.push(
      '<div class="answer-box ok">',
      '  <span class="k">参考答案</span>',
      '  <span class="v">' + UI.esc(d.correct_answer) + '</span>',
      '</div>'
    );
    html.push('</div>');

    /* 解析 */
    if (d.analysis) {
      html.push('<div class="analysis"><b>解析：</b>' + UI.esc(d.analysis));
      if (d.teacher_comment) {
        html.push('<span class="grade-note">教师评语：' + UI.esc(d.teacher_comment) + '</span>');
      }
      html.push('</div>');
    }

    html.push('</div>');
    return html.join('');
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind(root) {
    var back = UI.$('#btnBackList', root) || UI.$('#backList2', root);
    if (back) { back.onclick = function () { App.go('exam-list'); }; }
    var print = UI.$('#btnPrint', root);
    if (print) { print.onclick = function () { window.print(); }; }
  }

  global.PageResult = { render: render };
})(window);
