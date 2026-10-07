/* ============================================================
 * api.js —— 数据访问层（学生端 / 同学 3 负责范围）
 * ------------------------------------------------------------
 * 【模块边界】本文件只应包含“学生端”需要的数据操作：
 *   登录会话（消费同学 1 的登录接口）、可考列表、取题、暂存答案、
 *   交卷上报、查询本人成绩与答题详情。
 * ------------------------------------------------------------
 * 【属于其他同学、此处仅作依赖调用的部分】——正式项目里应改为调用
 * 他们提供的接口，本文件不承担其实现：
 *   · 账号校验（MD5 / 角色 / 禁用）      -> 同学 1：用户身份认证模块
 *   · exam_question / exam_question_bank -> 同学 1：题库管理模块
 *   · exam_paper 与考试起止时间          -> 同学 2：试卷管理模块
 *   · 客观题自动判分、主观题批改          -> 同学 2：自动阅卷成绩模块
 * 下面的 grade*() 函数是【同学 2 判分模块的占位实现】，仅为了让本端
 * 演示能闭环（学生端自身不做判分）。接真实后端时，submitExam 应把
 * 答题卡上报给后端，由后端判分并返回成绩。
 * ============================================================ */
(function (global) {
  'use strict';

  var DB = global.MockDB;

  /* ---------- 本地持久化（模拟数据库落库） ---------- */
  var LS_RECORD = 'online_exam.records';        // exam_record
  var LS_ANSWER = 'online_exam.answers';        // exam_record_answer
  var SS_USER = 'online_exam.currentUser';      // 登录会话

  function readStore(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
  }
  function writeStore(key, rows) {
    try { localStorage.setItem(key, JSON.stringify(rows)); } catch (e) { /* 隐私模式下忽略 */ }
  }

  /* 数据库中所有时间均为 'YYYY-MM-DD HH:mm:ss' 字符串 */
  function now() {
    var d = new Date(), p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
           p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function toDate(str) { return new Date(String(str).replace(/-/g, '/')); }
  function addMinutes(str, minutes) { return new Date(toDate(str).getTime() + minutes * 60000); }
  function diffSeconds(a, b) { return Math.max(0, Math.round((toDate(b) - toDate(a)) / 1000)); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function nextId(table) {
    var seq = DB.sequences[table] || 1;
    DB.sequences[table] = seq + 1;
    return seq;
  }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }

  /* ============================================================
   * 【占位】判分规则 —— 属于同学 2 的“自动阅卷与成绩模块”
   * ------------------------------------------------------------
   * 学生端不实现判分：交卷时只上报答题卡，成绩由后端返回。
   * 这里保留一份最小实现，仅为让脱离后端的演示能显示成绩；
   * 若同学 2 提供了判分接口，请整体替换本段与 submitExam 的判分调用。
   * ============================================================ */

  /* 多选：完全一致得满分，漏选得一半，错选不得分（与多数考试系统一致） */
  function gradeChoice(question, userAnswer) {
    var right = String(question.answer).toUpperCase().split('').sort().join('');
    var mine = String(userAnswer || '').toUpperCase().split('').sort().join('');
    if (!mine) return 0;
    if (mine === right) return question.score;
    var wrong = mine.split('').some(function (c) { return right.indexOf(c) === -1; });
    if (wrong) return 0;
    return Math.floor(question.score / 2);   // 漏选
  }

  /* 参考答案切分成评分要点 */
  function keywordsOf(question) {
    return String(question.answer || '')
      .split(/[：:；;，,。.、\s（）()]+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length >= 2; });
  }

  /* 简答题自动评分：命中要点数 / 要点总数 × 分值，最高不超过满分 */
  function gradeEssay(question, userAnswer) {
    var text = String(userAnswer || '').trim();
    if (!text) return { score: 0, hits: 0, total: 0, auto: true };
    var keys = keywordsOf(question);
    if (!keys.length) return { score: 0, hits: 0, total: 0, auto: true };
    var hits = keys.filter(function (k) { return text.indexOf(k) !== -1; }).length;
    var score = Math.min(question.score, Math.round(question.score * hits / keys.length));
    return { score: score, hits: hits, total: keys.length, auto: true };
  }

  /* 统一判分入口：返回 { score, isCorrect, needReview } */
  function grade(question, userAnswer) {
    var type = Number(question.question_type);
    if (type === 4) {
      var r = gradeEssay(question, userAnswer);
      return { score: r.score, isCorrect: -1, needReview: r.score < question.score * 0.6, essay: r };
    }
    if (type === 2) {
      var s = gradeChoice(question, userAnswer);
      return { score: s, isCorrect: s === question.score ? 1 : 0, needReview: false };
    }
    var ok = String(userAnswer || '').trim().toUpperCase() === String(question.answer).trim().toUpperCase();
    return { score: ok ? question.score : 0, isCorrect: ok ? 1 : 0, needReview: false };
  }

  /* ============================================================
   * 考试状态（依据 exam_paper.exam_start_time / exam_end_time 实时计算）
   *   'pending'   未开始：当前时间早于开考时间
   *   'ongoing'   进行中：处于考试时间窗口内
   *   'ended'     已结束：当前时间晚于截止时间
   *   'finished'  已完成：本人已交卷（展示时优先于时间状态）
   *   未配置起止时间的试卷视为长期开放。
   * ============================================================ */
  function sessionWindow(paper) {
    return {
      start: paper.exam_start_time ? toDate(paper.exam_start_time) : null,
      end: paper.exam_end_time ? toDate(paper.exam_end_time) : null
    };
  }

  function paperStatus(paper) {
    var w = sessionWindow(paper);
    var nowMs = Date.now();
    if (w.start && nowMs < w.start.getTime()) { return 'pending'; }
    if (w.end && nowMs > w.end.getTime()) { return 'ended'; }
    return 'ongoing';
  }

  function statusText(status) {
    return { pending: '未开始', ongoing: '进行中', ended: '已结束', finished: '已完成' }[status] || '—';
  }

  /* 距开考还剩多少毫秒；未配置开考时间返回 0 */
  function msToStart(paper) {
    var w = sessionWindow(paper);
    return w.start ? Math.max(0, w.start.getTime() - Date.now()) : 0;
  }

  function msToEnd(paper) {
    var w = sessionWindow(paper);
    return w.end ? Math.max(0, w.end.getTime() - Date.now()) : 0;
  }

  /* ============================================================
   * 查询辅助
   * ============================================================ */
  /* exam_record 查询一律带 is_deleted = 0，与文档中的 SQL 保持一致 */
  function allRecords() {
    return readStore(LS_RECORD).filter(function (r) { return !r.is_deleted; });
  }
  function allAnswers() { return readStore(LS_ANSWER); }

  function findRecord(recordId) {
    var id = Number(recordId);
    var rows = allRecords().filter(function (r) { return r.id === id; });
    return rows.length ? rows[0] : null;
  }

  function findAnswers(recordId) {
    var id = Number(recordId);
    return allAnswers().filter(function (a) { return a.record_id === id; });
  }

  function upsertRecord(record) {
    var rows = allRecords();
    var idx = -1;
    rows.forEach(function (r, i) { if (r.id === record.id) idx = i; });
    if (idx >= 0) { rows[idx] = record; } else { rows.push(record); }
    writeStore(LS_RECORD, rows);
    return record;
  }

  function upsertAnswer(answer) {
    var rows = allAnswers();
    var idx = -1;
    rows.forEach(function (a, i) {
      if (a.record_id === answer.record_id && a.question_id === answer.question_id) idx = i;
    });
    if (idx >= 0) { rows[idx] = answer; } else { rows.push(answer); }
    writeStore(LS_ANSWER, rows);
    return answer;
  }

  function questionsOfBank(bankId) {
    return DB.exam_question.filter(function (q) {
      return q.bank_id === Number(bankId) && !q.is_deleted;
    });
  }

  function questionsOfPaper(paper) {
    return questionsOfBank(paper.bank_id);
  }

  function questionById(id) {
    var rows = DB.exam_question.filter(function (q) { return q.id === Number(id); });
    return rows.length ? rows[0] : null;
  }

  function paperById(id) {
    var rows = DB.exam_paper.filter(function (p) { return p.id === Number(id); });
    return rows.length ? rows[0] : null;
  }

  function bankById(id) {
    var rows = DB.exam_question_bank.filter(function (b) { return b.id === Number(id); });
    return rows.length ? rows[0] : null;
  }

  /* 供 UI 使用的小工具 */
  function typeLabel(t) { return DB.QUESTION_TYPE_LABEL[t] || '未知'; }
  function typeTag(t) { return DB.QUESTION_TYPE_TAG[t] || 'tag-gray'; }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ============================================================
   * 对外接口
   * ============================================================ */
  var Api = {

    /* ---------------- 会话 ---------------- */
    currentUser: function () {
      try { return JSON.parse(sessionStorage.getItem(SS_USER)); } catch (e) { return null; }
    },
    setCurrentUser: function (user) {
      if (user) { sessionStorage.setItem(SS_USER, JSON.stringify(user)); }
      else { sessionStorage.removeItem(SS_USER); }
    },

    /* ------------------------------------------------------------
     * 登录
     * SELECT id, username, real_name, role, status
     *   FROM sys_user
     *  WHERE username = ? AND password = MD5(?) AND is_deleted = 0
     * ---------------------------------------------------------- */
    login: function (username, rawPassword) {
      return delay(320).then(function () {
        var account = String(username || '').trim();
        var pwd = global.md5(String(rawPassword || ''));
        var user = DB.sys_user.filter(function (u) {
          return u.username === account && u.password === pwd && !u.is_deleted;
        })[0];

        if (!user) { throw new Error('账号或密码错误，请重新输入'); }
        if (user.status !== 1) { throw new Error('该账号已被禁用，请联系管理员'); }
        if (user.role !== 'student') {
          throw new Error('当前账号角色为“' + user.role + '”，本系统为【学生端】，请使用学生账号登录');
        }
        var session = {
          id: user.id, username: user.username, real_name: user.real_name,
          role: user.role, login_time: now()
        };
        Api.setCurrentUser(session);
        return session;
      });
    },

    logout: function () { Api.setCurrentUser(null); return delay(120); },

    /* ------------------------------------------------------------
     * 可参加的考试列表
     * SELECT p.*, b.bank_name, b.subject
     *   FROM exam_paper p
     *   LEFT JOIN exam_question_bank b ON b.id = p.bank_id
     *  WHERE p.status = 1 AND p.is_deleted = 0
     *  ORDER BY p.create_time DESC
     * ---------------------------------------------------------- */
    listPapers: function () {
      var user = Api.currentUser();
      return delay(280).then(function () {
        return DB.exam_paper
          .filter(function (p) { return p.status === 1 && !p.is_deleted; })
          .sort(function (a, b) { return toDate(b.create_time) - toDate(a.create_time); })
          .map(function (p) {
            var bank = bankById(p.bank_id);
            var qs = questionsOfPaper(p);
            var sum = qs.reduce(function (t, q) { return t + q.score; }, 0);
            var myRecords = allRecords().filter(function (r) {
              return r.paper_id === p.id && (!user || r.user_id === user.id);
            });
            var done = myRecords.filter(function (r) { return r.status !== 0; });
            var ongoingRecord = myRecords.filter(function (r) { return r.status === 0; })[0];
            var best = done.length ? Math.max.apply(null, done.map(function (r) { return r.score || 0; })) : null;
            /* 最近一次已交卷的记录：用于“查看成绩”按钮 */
            var lastDone = done.slice().sort(function (a, b) {
              return toDate(b.submit_time) - toDate(a.submit_time);
            })[0] || null;
            var timeStatus = paperStatus(p);          // pending / ongoing / ended
            /* 列表状态：一次考试只能考一次，已交卷即显示“已完成”；
               否则按考试时间窗口显示（进行中 / 未开始 / 已结束） */
            var displayStatus = done.length
              ? 'finished'
              : (timeStatus === 'ongoing' && ongoingRecord ? 'ongoing' : timeStatus);
            return {
              paper: p,
              bank_name: bank ? bank.bank_name : '—',
              subject: bank ? bank.subject : '—',
              question_count: qs.length,
              question_score: sum,
              attempt_count: done.length,
              last_record: lastDone,
              best_score: best,
              has_ongoing: !!ongoingRecord,
              /* 考试状态：未开始 / 进行中 / 已结束 / 已完成 */
              time_status: timeStatus,
              status: displayStatus,
              status_text: statusText(displayStatus),
              can_start: timeStatus === 'ongoing',      // 仅“进行中”可进入答题
              ms_to_start: msToStart(p),
              ms_to_end: msToEnd(p),
              exam_start_time: p.exam_start_time || null,
              exam_end_time: p.exam_end_time || null
            };
          });
      });
    },

    /* ------------------------------------------------------------
     * 试卷详情 + 题目（答题页数据源）
     * SELECT * FROM exam_paper   WHERE id = ?;
     * SELECT * FROM exam_question WHERE bank_id = ? AND is_deleted = 0 ORDER BY question_type, id;
     * ---------------------------------------------------------- */
    getPaperDetail: function (paperId) {
      var paper = paperById(paperId);
      if (!paper) { return Promise.reject(new Error('试卷不存在或已被删除')); }
      if (paper.status !== 1) { return Promise.reject(new Error('该试卷尚未发布，无法作答')); }
      var bank = bankById(paper.bank_id);
      var source = questionsOfPaper(paper).slice().sort(function (a, b) {
        return a.question_type - b.question_type || a.id - b.id;
      });
      var sum = source.reduce(function (t, q) { return t + q.score; }, 0);
      /* 只下发答题必需的字段：绝不能把 answer / analysis 送到客户端，
         否则考生可直接在开发者工具里看到答案（判分在 submitExam 内重新读库） */
      var questions = source.map(function (q) {
        return {
          id: q.id,
          bank_id: q.bank_id,
          question_type: q.question_type,
          question_content: q.question_content,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          score: q.score
        };
      });
      return delay(260).then(function () {
        return {
          paper: paper,
          bank: bank,
          questions: questions,
          question_score: sum,
          /* 卷面总分与题库实际分值不一致时，答题页会给出提示 */
          score_mismatch: sum !== paper.total_score
        };
      });
    },

    /* ------------------------------------------------------------
     * 我的考试记录（成绩页 / 列表页统计）
     * SELECT r.*, p.paper_name, p.total_score
     *   FROM exam_record r LEFT JOIN exam_paper p ON p.id = r.paper_id
     *  WHERE r.user_id = ? AND r.status <> 0
     *  ORDER BY r.submit_time DESC
     * ---------------------------------------------------------- */
    listMyRecords: function () {
      var user = Api.currentUser();
      return delay(200).then(function () {
        return allRecords()
          .filter(function (r) { return !user || r.user_id === user.id; })
          .filter(function (r) { return r.status !== 0; })
          .sort(function (a, b) { return toDate(b.submit_time) - toDate(a.submit_time); })
          .map(function (r) {
            var p = paperById(r.paper_id);
            return {
              record: r,
              paper_name: p ? p.paper_name : '—',
              total_score: p ? p.total_score : r.total_score
            };
          });
      });
    },

    /* 学生首页统计：待考 / 已完成 / 平均分 / 最高分 */
    getMyStats: function () {
      var user = Api.currentUser();
      return delay(160).then(function () {
        var papers = DB.exam_paper.filter(function (p) { return p.status === 1 && !p.is_deleted; });
        var records = allRecords().filter(function (r) {
          return (!user || r.user_id === user.id) && r.status !== 0;
        });
        var scores = records.map(function (r) { return r.score || 0; });
        var todo = papers.filter(function (p) {
          return !records.some(function (r) { return r.paper_id === p.id; });
        }).length;
        return {
          paper_total: papers.length,
          done_total: records.length,
          todo_total: todo,
          avg_score: scores.length ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : 0,
          best_score: scores.length ? Math.max.apply(null, scores) : 0,
          pass_rate: scores.length
            ? Math.round(scores.filter(function (s) { return s >= 60; }).length / scores.length * 100) : 0
        };
      });
    },

    /* ------------------------------------------------------------
     * 开始考试 / 继续上次未完成的考试
     * 规则（按需求文档“不设计补考、重考等复杂考试策略”）：
     *   · 同一份试卷【只能考一次】：已交卷（status<>0）后不再允许进入
     *   · 未交卷（status=0）则续考，倒计时按原开考时间继续
     * INSERT INTO exam_record (paper_id, user_id, score, objective_score, subjective_score,
     *        total_score, duration, used_seconds, start_time, status,
     *        submit_type, tab_switch_count, report_count, create_time, update_time)
     *   VALUES (...)
     * ---------------------------------------------------------- */
    startExam: function (paperId) {
      var user = Api.currentUser();
      if (!user) { return Promise.reject(new Error('登录状态已失效，请重新登录')); }
      var paper = paperById(paperId);
      if (!paper) { return Promise.reject(new Error('试卷不存在')); }
      if (paper.status !== 1) { return Promise.reject(new Error('该试卷尚未发布，无法作答')); }

      /* 考试时间窗口校验：未开始 / 已结束均不允许进入答题 */
      var timeStatus = paperStatus(paper);
      if (timeStatus === 'pending') {
        return Promise.reject(new Error('该考试尚未开始，开考时间：' + paper.exam_start_time));
      }
      if (timeStatus === 'ended') {
        return Promise.reject(new Error('该考试已于 ' + paper.exam_end_time + ' 结束，无法作答'));
      }

      /* 一次考试只能考一次：已交卷的试卷不允许再次进入 */
      var submitted = allRecords().filter(function (r) {
        return r.paper_id === paper.id && r.user_id === user.id && r.status !== 0;
      })[0];
      if (submitted) {
        return Promise.reject(new Error('本场考试你已交卷，同一场考试只能考一次，不能重复作答'));
      }

      var mine = allRecords().filter(function (r) {
        return r.paper_id === paper.id && r.user_id === user.id;
      });
      var ongoing = mine.filter(function (r) { return r.status === 0; })[0];

      if (ongoing) {
        var deadline = addMinutes(ongoing.start_time, paper.duration);
        if (deadline.getTime() > Date.now()) {
          return delay(200).then(function () { return { record: clone(ongoing), resumed: true }; });
        }
        /* 已超时未交卷：自动交卷后重新开考 */
        return Api.submitExam(ongoing.id, { auto: true }).then(function () {
          return Api.startExam(paperId);
        });
      }

      var start = now();
      var record = {
        id: nextId('exam_record'),
        paper_id: paper.id,
        user_id: user.id,
        score: 0,
        objective_score: 0,
        subjective_score: 0,
        total_score: paper.total_score,
        duration: paper.duration,
        used_seconds: 0,
        start_time: start,
        submit_time: null,
        status: 0,
        submit_type: 0,          // 0-未交 1-手动交卷 2-超时自动交卷 3-超时未交（作废）
        tab_switch_count: 0,
        report_count: 0,
        create_time: start,
        update_time: start
      };
      upsertRecord(record);
      return delay(240).then(function () { return { record: clone(record), resumed: false }; });
    },

    /* 考试倒计时截止时间（服务端时间，防止改本机时间） */
    getDeadline: function (recordId) {
      var r = findRecord(recordId);
      if (!r) { return null; }
      return addMinutes(r.start_time, r.duration);
    },

    /* ------------------------------------------------------------
     * 暂存答案（自动保存 / 手动保存）
     * INSERT INTO exam_record_answer (record_id, question_id, user_answer, ...)
     *   VALUES (...) ON DUPLICATE KEY UPDATE user_answer = VALUES(user_answer)
     * ---------------------------------------------------------- */
    saveDraft: function (recordId, answers) {
      var record = findRecord(recordId);
      if (!record) { return Promise.reject(new Error('考试记录不存在')); }
      if (record.status !== 0) { return Promise.reject(new Error('本场考试已结束，无法继续保存')); }

      var stamp = now();
      Object.keys(answers).forEach(function (qid) {
        var q = questionById(qid);
        if (!q) { return; }
        var val = answers[qid];
        var exists = findAnswers(recordId).filter(function (a) { return a.question_id === Number(qid); })[0];
        if (!exists && (val === '' || val == null || (Array.isArray(val) && !val.length))) { return; }
        upsertAnswer({
          id: exists ? exists.id : nextId('exam_record_answer'),
          record_id: record.id,
          question_id: Number(qid),
          user_answer: Array.isArray(val) ? val.join('') : String(val == null ? '' : val),
          is_correct: -1,
          score: exists ? exists.score : 0,   // 保留可能已有的评分（如教师已评阅）
          teacher_comment: exists ? exists.teacher_comment : null,
          create_time: exists ? exists.create_time : stamp
        });
      });

      record.update_time = stamp;
      record.used_seconds = diffSeconds(record.start_time, stamp);
      upsertRecord(record);
      return delay(60).then(function () { return { saved_at: stamp, used_seconds: record.used_seconds }; });
    },

    /* 读取已暂存答案，用于断点续答 */
    loadDraft: function (recordId) {
      var map = {};
      findAnswers(recordId).forEach(function (a) { map[a.question_id] = a.user_answer; });
      return delay(120).then(function () { return map; });
    },

    /* ------------------------------------------------------------
     * 交卷：批量判分，写回 exam_record / exam_record_answer
     * UPDATE exam_record SET score=?, objective_score=?, subjective_score=?,
     *        submit_time=?, used_seconds=?, status=?, submit_type=? WHERE id=?
     * ---------------------------------------------------------- */
    submitExam: function (recordId, options) {
      var opts = options || {};
      var record = findRecord(recordId);
      if (!record) { return Promise.reject(new Error('考试记录不存在')); }
      if (record.status !== 0) { return Promise.reject(new Error('本场考试已交卷，请勿重复提交')); }

      var paper = paperById(record.paper_id);
      var questions = questionsOfPaper(paper);
      var answers = {};
      findAnswers(recordId).forEach(function (a) { answers[a.question_id] = a.user_answer; });

      var objective = 0, subjective = 0, needReview = 0;
      questions.forEach(function (q) {
        var raw = answers[q.id];
        var val = q.question_type === 2 ? String(raw || '').split('') : (raw || '');
        var res = grade(q, Array.isArray(val) ? val.join('') : val);
        if (q.question_type === 4) {
          subjective += res.score;
          if (res.needReview) { needReview++; }
        } else {
          objective += res.score;
        }
        upsertAnswer({
          id: (findAnswers(recordId).filter(function (a) { return a.question_id === q.id; })[0] || {}).id ||
              nextId('exam_record_answer'),
          record_id: record.id,
          question_id: q.id,
          user_answer: Array.isArray(val) ? val.join('') : String(val == null ? '' : val),
          is_correct: res.isCorrect,
          score: res.score,
          teacher_comment: null,
          create_time: now()
        });
      });

      var stamp = now();
      record.score = objective + subjective;
      record.objective_score = objective;
      record.subjective_score = subjective;
      record.submit_time = stamp;
      record.used_seconds = opts.used_seconds != null ? opts.used_seconds : diffSeconds(record.start_time, stamp);
      record.status = needReview > 0 ? 1 : 2;      // 有主观题需复核 -> 待评阅
      record.submit_type = opts.auto ? 2 : 1;
      record.update_time = stamp;
      if (opts.tab_switch_count != null) { record.tab_switch_count = opts.tab_switch_count; }
      if (opts.report_count != null) { record.report_count = opts.report_count; }
      upsertRecord(record);

      return delay(420).then(function () {
        return { record: clone(record), need_review: needReview };
      });
    },

    /* 违规行为上报（切屏 / 退出全屏），累加计数 */
    reportViolation: function (recordId, type) {
      var record = findRecord(recordId);
      if (!record || record.status !== 0) { return Promise.resolve(null); }
      if (type === 'tab_switch') { record.tab_switch_count = (record.tab_switch_count || 0) + 1; }
      record.report_count = (record.report_count || 0) + 1;
      record.update_time = now();
      upsertRecord(record);
      return Promise.resolve({ tab_switch_count: record.tab_switch_count, report_count: record.report_count });
    },

    /* ------------------------------------------------------------
     * 成绩 / 答卷详情（成绩页数据源）
     * SELECT * FROM exam_record WHERE id = ?;
     * SELECT a.*, q.question_content, q.answer, q.analysis, q.score, q.question_type
     *   FROM exam_record_answer a LEFT JOIN exam_question q ON q.id = a.question_id
     *  WHERE a.record_id = ? ORDER BY q.question_type, q.id
     * ---------------------------------------------------------- */
    getResult: function (recordId) {
      var record = findRecord(recordId);
      if (!record) { return Promise.reject(new Error('成绩记录不存在')); }
      if (record.status === 0) { return Promise.reject(new Error('本场考试尚未交卷')); }

      var paper = paperById(record.paper_id);
      var bank = paper ? bankById(paper.bank_id) : null;
      var user = DB.sys_user.filter(function (u) { return u.id === record.user_id; })[0];
      var questions = paper ? questionsOfPaper(paper).slice().sort(function (a, b) {
        return a.question_type - b.question_type || a.id - b.id;
      }) : [];
      var answerMap = {};
      findAnswers(recordId).forEach(function (a) { answerMap[a.question_id] = a; });

      var details = questions.map(function (q, i) {
        var a = answerMap[q.id] || null;
        var userAnswer = a ? a.user_answer : '';
        var res = grade(q, userAnswer);
        /* 已落库的作答明细优先（含教师评阅后的分数，包括评 0 分的情况）；
           没有明细时才用机器判分结果推算 */
        var scored = a ? a.score : res.score;
        return {
          index: i + 1,
          question: q,
          user_answer: userAnswer,
          correct_answer: q.answer,
          analysis: q.analysis,
          is_correct: a ? a.is_correct : (String(userAnswer).trim() ? res.isCorrect : 0),
          score: scored,
          full_score: q.score,
          teacher_comment: a ? a.teacher_comment : null,
          pending: q.question_type === 4 && scored === 0 && !!String(userAnswer).trim()
        };
      });

      var byType = {};
      details.forEach(function (d) {
        var t = d.question.question_type;
        if (!byType[t]) { byType[t] = { type: t, label: typeLabel(t), count: 0, full: 0, got: 0, right: 0 }; }
        byType[t].count++;
        byType[t].full += d.full_score;
        byType[t].got += d.score;
        if (d.is_correct === 1) { byType[t].right++; }
      });

      return delay(320).then(function () {
        return {
          record: record,
          paper: paper,
          bank: bank,
          user: user,
          details: details,
          type_stats: Object.keys(byType).map(function (k) { return byType[k]; }),
          total_score: paper ? paper.total_score : record.total_score,
          pending_count: details.filter(function (d) { return d.pending; }).length
        };
      });
    },

    /* 清空本地考试缓存。
       options.reseed = true（默认）时重新写入演示用的历史成绩，
       便于反复演示；传 false 则只清空，得到“从未考过”的全新考生状态
       （自检需要这种状态，否则演示记录会占用试卷 1）。 */
    resetLocalData: function (options) {
      var reseed = !(options && options.reseed === false);
      if (DB.seedStores && reseed) {
        DB.seedStores(true);
      } else {
        localStorage.removeItem(LS_RECORD);
        localStorage.removeItem(LS_ANSWER);
      }
      return delay(120);
    },

    /* ---------------- 工具方法导出 ---------------- */
    utils: {
      now: now,
      toDate: toDate,
      addMinutes: addMinutes,
      questionTypeLabel: typeLabel,
      keywordsOf: keywordsOf,
      paperStatus: paperStatus,
      statusText: statusText,
      msToStart: msToStart,
      msToEnd: msToEnd,
      /* 毫秒 -> “x天x小时 / x小时x分 / x分x秒” */
      humanDuration: function (ms) {
        var s = Math.max(0, Math.floor((ms || 0) / 1000));
        var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
        if (d > 0) { return d + ' 天 ' + h + ' 小时'; }
        if (h > 0) { return h + ' 小时 ' + m + ' 分'; }
        if (m > 0) { return m + ' 分'; }
        return s + ' 秒';
      },
      diffSeconds: diffSeconds,
      escapeHtml: escapeHtml,
      typeLabel: typeLabel,
      typeTag: typeTag,
      formatDuration: function (seconds) {
        var s = Math.max(0, Math.floor(seconds || 0));
        var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return (h > 0 ? p(h) + ':' : '') + p(m) + ':' + p(sec);
      },
      formatClock: function (date) {
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return p(date.getHours()) + ':' + p(date.getMinutes()) + ':' + p(date.getSeconds());
      },
      formatDate: function (str) {
        if (!str) { return '—'; }
        var d = toDate(str);
        return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' +
               p2(d.getHours()) + ':' + p2(d.getMinutes());
      }
    }
  };

  function p2(n) { return n < 10 ? '0' + n : '' + n; }

  global.Api = Api;
})(window);
