/* ============================================================
 * page-exam-list.js —— 考试列表页
 * 数据源：exam_paper（status=1 已发布）+ exam_record（本人成绩）
 * ============================================================ */
(function (global) {
  'use strict';

  var seq = 0;   // 路由代次令牌：防止上一个页面的异步回调画到新页面上

  function statCard(label, value, unit, cls) {
    return '<div class="card stat ' + (cls || '') + '">' +
      '<div class="k">' + UI.esc(label) + '</div>' +
      '<div class="v">' + UI.esc(value) + (unit ? '<small>' + UI.esc(unit) + '</small>' : '') + '</div>' +
      '</div>';
  }

  /* 考试状态标注：未开始 / 进行中 / 已结束 / 已完成 */
  var STATUS_TAG = {
    pending: ['tag-gray', '未开始'],
    ongoing: ['tag-multi', '进行中'],
    ended: ['tag-bad', '已结束'],
    finished: ['tag-ok', '已完成']
  };

  function statusCell(row) {
    var conf = STATUS_TAG[row.status] || ['tag-gray', '—'];
    var html = '<span class="tag ' + conf[0] + '">' + conf[1] + '</span>';
    if (row.status === 'pending' && row.ms_to_start > 0) {
      html += '<div class="muted">' + UI.esc(Api.utils.humanDuration(row.ms_to_start)) + '后开考</div>';
    } else if (row.status === 'ongoing') {
      if (row.ms_to_end > 0) {
        html += '<div class="muted">剩余 ' + UI.esc(Api.utils.humanDuration(row.ms_to_end)) + '</div>';
      }
    } else if (row.status === 'ended') {
      html += '<div class="muted">已截止</div>';
    }
    return html;
  }

  /* 考试时间窗口（开考 ~ 截止） */
  function windowCell(row) {
    if (!row.exam_start_time && !row.exam_end_time) {
      return '<span class="muted">长期开放</span>';
    }
    return '<div class="nowrap">' + UI.formatDate(row.exam_start_time) + '</div>' +
           '<div class="muted nowrap">至 ' + UI.formatDate(row.exam_end_time) + '</div>';
  }

  /* 操作按钮
     规则：一次考试只能考一次 —— 已交卷的试卷不再提供作答入口，只提供“查看成绩” */
  function actionCell(row) {
    /* 已交卷：只能查看成绩 */
    if (row.attempt_count > 0) {
      var last = row.last_record || {};
      return '<button class="btn btn-ghost" data-result="' + last.id + '">查看成绩</button>' +
             '<div class="muted" style="margin-top:4px">本场已交卷，不能重考</div>';
    }
    /* 有未交卷的考试：继续作答 */
    if (row.has_ongoing) {
      return '<button class="btn btn-ok" data-start="' + row.paper.id + '">继续考试</button>';
    }
    /* 其余按考试时间窗口判断 */
    if (!row.can_start) {
      var label = row.status === 'pending' ? '未开始' : '已结束';
      return '<button class="btn" disabled title="' +
        UI.esc(row.status === 'pending' ? '考试尚未开始，无法进入答题' : '考试已结束，无法进入答题') +
        '">' + label + '</button>';
    }
    return '<button class="btn" data-start="' + row.paper.id + '">开始考试</button>';
  }

  function scoreCell(value, total) {
    if (value === null || value === undefined) { return '<span class="muted">—</span>'; }
    var pass = value >= total * 0.6;
    return '<span class="score-cell ' + (pass ? 'pass' : 'fail') + '">' + value + '</span>' +
           '<span class="muted"> / ' + total + '</span>';
  }

  function render(root) {
    var my = ++seq;
    root.innerHTML = '<div class="card"><div class="empty"><div class="ico">⏳</div><p>正在读取考试数据…</p></div></div>';

    Promise.all([Api.listPapers(), Api.getMyStats(), Api.listMyRecords()])
      .then(function (res) {
        if (my !== seq) { return; }
        var papers = res[0], stats = res[1], records = res[2];
        root.innerHTML = build(papers, stats, records);
        bind(root);
      })
      .catch(function (err) {
        if (my !== seq) { return; }
        root.innerHTML = '<div class="card"><div class="empty"><div class="ico">⚠</div><p>' +
          UI.esc(err.message || '数据加载失败') + '</p></div></div>';
      });
  }

  function build(papers, stats, records) {
    var user = App.getUser() || { real_name: '同学', username: '' };

    /* ---- 统计卡片 ---- */
    var html = [
      '<div class="page-head">',
      '  <h2>你好，' + UI.esc(user.real_name) + ' 👋</h2>',
      '  <p>当前共有 <b>' + stats.paper_total + '</b> 场已发布考试，其中 <b>' + stats.todo_total + '</b> 场待完成。点击“开始考试”进入答题界面。</p>',
      '</div>',
      '<div class="stat-row">',
      statCard('已发布考试', stats.paper_total, '场', 'accent'),
      statCard('已完成', stats.done_total, '场', 'good'),
      statCard('平均分', stats.avg_score, '分'),
      statCard('最高分', stats.best_score, '分', stats.best_score >= 60 ? 'good' : ''),
      '</div>',

      '<h3 class="section-title">可参加的考试</h3>',
      '<div class="card" style="overflow:hidden">'
    ];

    if (!papers.length) {
      html.push('<div class="empty"><div class="ico">📄</div><p>暂无已发布的考试，请等待教师发布试卷。</p></div>');
    } else {
      html.push(
        '<table class="table">',
        '<thead><tr>',
        '<th style="min-width:200px">试卷名称</th><th>题库 / 科目</th><th class="center">题量</th>',
        '<th class="center">时长</th><th class="center">考试时间</th>',
        '<th class="center">考试状态</th><th class="center">我的最好成绩</th>',
        '<th class="center">操作</th>',
        '</tr></thead><tbody>'
      );
      papers.forEach(function (row) {
        var p = row.paper;
        html.push(
          '<tr>',
          '<td><div class="paper-name">' + UI.esc(p.paper_name) + '</div>',
          '<div class="muted">发布：' + UI.formatDate(p.create_time) + '</div></td>',
          '<td>' + UI.esc(row.bank_name) + '<div class="muted">' + UI.esc(row.subject) + '</div></td>',
          '<td class="center num">' + row.question_count + ' 题<div class="muted">' + row.question_score + ' 分</div></td>',
          '<td class="center num">' + p.duration + ' 分钟</td>',
          '<td class="center">' + windowCell(row) + '</td>',
          '<td class="center">' + statusCell(row) + '</td>',
          '<td class="center">' + scoreCell(row.best_score, p.total_score) + '</td>',
          '<td class="center">' + actionCell(row) + '</td>',
          '</tr>'
        );
      });
      html.push('</tbody></table>');
    }
    html.push('</div>');

    /* ---- 历史成绩 ---- */
    html.push('<h3 class="section-title" style="margin-top:28px">我的考试记录</h3><div class="card" style="overflow:hidden">');
    if (!records.length) {
      html.push('<div class="empty"><div class="ico">🗂</div><p>还没有已完成并提交的考试记录。</p></div>');
    } else {
      html.push(
        '<table class="table"><thead><tr>',
        '<th>试卷</th><th class="center">得分</th><th class="center">客观题</th><th class="center">主观题</th>',
        '<th class="center">用时</th><th>交卷时间</th><th class="center">状态</th><th class="center">操作</th>',
        '</tr></thead><tbody>'
      );
      records.forEach(function (item) {
        var r = item.record;
        var pass = (r.score || 0) >= item.total_score * 0.6;
        html.push(
          '<tr>',
          '<td class="paper-name">' + UI.esc(item.paper_name) + '</td>',
          '<td class="center">' + scoreCell(r.score, item.total_score) + '</td>',
          '<td class="center num">' + (r.objective_score || 0) + '</td>',
          '<td class="center num">' + (r.subjective_score || 0) + '</td>',
          '<td class="center num">' + UI.formatDuration(r.used_seconds) + '</td>',
          '<td>' + UI.formatDate(r.submit_time) +
            '<div class="muted">' + (r.submit_type === 2 ? '超时自动交卷' : '手动交卷') + '</div></td>',
          '<td class="center">' + (r.status === 1
            ? '<span class="tag tag-essay">待评阅</span>'
            : '<span class="tag ' + (pass ? 'tag-ok' : 'tag-bad') + '">' + (pass ? '及格' : '不及格') + '</span>') + '</td>',
          '<td class="center"><button class="btn btn-ghost" data-result="' + r.id + '">查看答卷</button></td>',
          '</tr>'
        );
      });
      html.push('</tbody></table>');
    }
    html.push('</div>');

    html.push(
      '<div class="result-actions">',
      '  <button class="btn btn-ghost" id="btnResetDemo">清空本机考试缓存（演示用）</button>',
      '</div>',
      '<p class="muted" style="font-size:12.5px;margin-top:8px">' +
      '考试记录保存在浏览器本地（localStorage），模拟 exam_record / exam_record_answer 两张表的持久化；刷新页面不会丢失，未交卷的考试可继续作答。</p>'
    );

    return html.join('');
  }

  function bind(root) {
    UI.$$('[data-start]', root).forEach(function (btn) {
      btn.onclick = function () {
        var paperId = Number(btn.getAttribute('data-start'));
        App.go('exam', { paperId: paperId });
      };
    });
    UI.$$('[data-result]', root).forEach(function (btn) {
      btn.onclick = function () {
        App.go('result', { recordId: Number(btn.getAttribute('data-result')) });
      };
    });
    var reset = UI.$('#btnResetDemo', root);
    if (reset) {
      reset.onclick = function () {
        UI.confirm({
          title: '清空本机考试缓存',
          body: '将删除浏览器中保存的全部考试记录与答题明细（不影响在线考试数据库）。确定继续吗？',
          okText: '确定清空', danger: true
        }).then(function (ok) {
          if (!ok) { return; }
          Api.resetLocalData().then(function () {
            UI.toast.ok('已清空本机缓存');
            render(root);
          });
        });
      };
    }
  }

  global.PageExamList = { render: render };
})(window);
