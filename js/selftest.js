/* ============================================================
 * selftest.js —— 学生端数据自检（同学 3 负责范围的回归检查）
 * ------------------------------------------------------------
 * 打开页面后按 F12，在控制台输入：
 *     selfTest()
 * 用于自证【学生端】用到的数据通路无误：
 *   · 演示账号能登录（消费同学 1 的登录接口）
 *   · 可考列表能取到，且带考试状态与开考资格（消费同学 2 的试卷数据）
 *   · 取题接口不下发答案（答题页只能拿到题干与选项）
 *   · 开考 / 断点续答 / 暂存答案 / 交卷上报 / 查询本人成绩 全流程可用
 *
 * 注意：判分规则、题库组织、试卷配置属于同学 1 / 同学 2 的模块，
 * 本自检只验证“能否正确调用并拿到结果”，不校验他们的业务规则。
 * 本文件不影响页面功能，可从 index.html 中直接移除。
 * ============================================================ */
(function (global) {
  'use strict';

  function selfTest() {
    var Api = global.Api;
    var pass = 0, fail = 0;
    var lines = [];
    var pending = [];

    function check(name, actual, expected) {
      var ok = actual === expected;
      ok ? pass++ : fail++;
      lines.push((ok ? '  ✔ ' : '  ✘ ') + name + '：' + actual + (ok ? '' : '（期望 ' + expected + '）'));
    }
    function checkAsync(name, promise, expected) {
      pending.push(promise.then(function (actual) {
        if (typeof expected === 'function') {
          var ok = !!expected(actual);
          ok ? pass++ : fail++;
          lines.push((ok ? '  ✔ ' : '  ✘ ') + name + '：' + JSON.stringify(actual));
        } else {
          check(name, actual, expected);
        }
      }).catch(function (err) {
        fail++;
        lines.push('  ✘ ' + name + '：抛出异常 ' + err.message);
      }));
    }

    /* 自检需要登录态：这里临时以演示考生 student01(id=3) 身份执行，结束后恢复 */
    var savedUser = Api.currentUser();
    Api.setCurrentUser({ id: 3, username: 'student01', real_name: '学生张三', role: 'student' });

    lines.push('【1】登录（接口来自同学 1，学生端只消费）');
    checkAsync('以 student01 / 123456 登录成功', Api.login('student01', '123456').then(function (u) {
      return u.username + '/' + u.role;
    }), 'student01/student');
    checkAsync('错误密码被拒绝', Api.login('student01', 'wrong').then(function () {
      return '未拒绝';
    }).catch(function (err) { return err.message.indexOf('账号或密码错误') !== -1 ? '已拒绝' : err.message; }), '已拒绝');
    checkAsync('已禁用账号被拒绝', Api.login('student03', '123456').then(function () {
      return '未拒绝';
    }).catch(function (err) { return err.message.indexOf('禁用') !== -1 ? '已拒绝' : err.message; }), '已拒绝');
    checkAsync('教师账号被拒绝', Api.login('teacher01', '123456').then(function () {
      return '未拒绝';
    }).catch(function (err) { return err.message.indexOf('学生端') !== -1 ? '已拒绝' : err.message; }), '已拒绝');

    lines.push('【2】可考考试列表与考试状态（试卷数据来自同学 2）');
    checkAsync('列表非空', Api.listPapers().then(function (r) { return r.length > 0; }), true);
    checkAsync('每行都带考试状态与开考资格', Api.listPapers().then(function (r) {
      return r.every(function (x) {
        return !!x.status_text && typeof x.can_start === 'boolean' && x.paper && x.question_count >= 0;
      });
    }), true);
    checkAsync('列表只含已发布试卷（草稿不可见）', Api.listPapers().then(function (r) {
      return r.every(function (x) { return x.paper.status === 1; });
    }), true);
    checkAsync('三种考试状态在演示数据中都有体现', Api.listPapers().then(function (r) {
      var set = {};
      r.forEach(function (x) { set[x.time_status] = 1; });
      return ['pending', 'ongoing', 'ended'].every(function (s) { return set[s]; });
    }), true);
    checkAsync('未开始 / 已结束的试卷不能开考（可开考数 < 总数）', Api.listPapers().then(function (r) {
      var can = r.filter(function (x) { return x.can_start; }).length;
      return can > 0 && can < r.length;
    }), true);
    checkAsync('未开始的试卷开考被拒绝', Api.startExam(4).then(function () {
      return '未拒绝';
    }).catch(function (err) { return err.message.indexOf('尚未开始') !== -1 ? '已拒绝' : err.message; }), '已拒绝');
    checkAsync('已结束的试卷开考被拒绝', Api.startExam(3).then(function () {
      return '未拒绝';
    }).catch(function (err) { return err.message.indexOf('结束') !== -1 ? '已拒绝' : err.message; }), '已拒绝');

    lines.push('【3】答题页取题（必须拿不到答案）');
    checkAsync('取到题目', Api.getPaperDetail(1).then(function (d) { return d.questions.length > 0; }), true);
    checkAsync('题目中不含 answer / analysis 字段', Api.getPaperDetail(1).then(function (d) {
      return d.questions.every(function (q) { return q.answer === undefined && q.analysis === undefined; });
    }), true);
    checkAsync('每题都有题干、题型与分值', Api.getPaperDetail(1).then(function (d) {
      return d.questions.every(function (q) {
        return !!q.question_content && !!q.question_type && q.score > 0;
      });
    }), true);

    lines.push('【4】开考 / 暂存 / 交卷上报 / 查成绩 全流程');
    /* 这一段必须串行执行：后面的步骤依赖前面产生的考试记录 ID，
       因此不再使用并行的 checkAsync，而是链式 then。
       开始前先把本地考试记录恢复成初始状态，否则演示历史记录会占用
       试卷 1，触发“一次考试只能考一次”而无法走完整流程。 */
    pending.push(
      Api.resetLocalData({ reseed: false })
        .then(function () { return Api.startExam(1); })
        .then(function (r) {
          var ok = r.record.status === 0;
          ok ? pass++ : fail++;
          lines.push((ok ? '  ✔ ' : '  ✘ ') + '开考成功（状态=进行中 0）：' + r.record.status);
          return r.record.id;
        })
        .then(function (recId) {
          return Api.startExam(1).then(function (r) {
            var ok = r.resumed === true && r.record.id === recId;
            ok ? pass++ : fail++;
            lines.push((ok ? '  ✔ ' : '  ✘ ') + '重复进入会续考同一场（断点续答）');
            return recId;
          });
        })
        .then(function (recId) {
          return Api.saveDraft(recId, { 1: 'B' })
            .then(function () { return Api.loadDraft(recId); })
            .then(function (draft) {
              var ok = draft[1] === 'B';
              ok ? pass++ : fail++;
              lines.push((ok ? '  ✔ ' : '  ✘ ') + '暂存答案后可读回（自动保存有效）：' + draft[1]);
              return recId;
            });
        })
        .then(function (recId) {
          var dl = Api.getDeadline(recId);
          var ok = dl instanceof Date && dl.getTime() > Date.now();
          ok ? pass++ : fail++;
          lines.push((ok ? '  ✔ ' : '  ✘ ') + '倒计时截止时间可算（= 开考时间 + 时长）');
          return recId;
        })
        .then(function (recId) {
          /* 交卷前：还不能查成绩 */
          return Api.getResult(recId).then(function () {
            fail++;
            lines.push('  ✘ 未交卷的记录不能查成绩：未拒绝');
            return recId;
          }).catch(function (err) {
            var ok = err.message.indexOf('尚未交卷') !== -1;
            ok ? pass++ : fail++;
            lines.push((ok ? '  ✔ ' : '  ✘ ') + '未交卷的记录不能查成绩：' + err.message);
            return recId;
          });
        })
        .then(function (recId) {
          return Api.submitExam(recId, { used_seconds: 60 }).then(function (r) {
            var ok = !!(r.record && typeof r.record.score === 'number' && r.record.submit_time);
            ok ? pass++ : fail++;
            lines.push((ok ? '  ✔ ' : '  ✘ ') + '交卷上报成功并返回成绩对象（得分 ' +
              (r.record ? r.record.score : '?') + '）');
            return recId;
          });
        })
        .then(function (recId) {
          /* 一次考试只能考一次：交卷后不允许再次进入 */
          return Api.startExam(1).then(function () {
            fail++;
            lines.push('  ✘ 交卷后不能再次考试：未拒绝');
            return recId;
          }).catch(function (err) {
            var ok = err.message.indexOf('只能考一次') !== -1;
            ok ? pass++ : fail++;
            lines.push((ok ? '  ✔ ' : '  ✘ ') + '交卷后不能再次考试：' + err.message);
            return recId;
          });
        })
        .then(function (recId) {
          return Api.submitExam(recId, {}).then(function () {
            fail++;
            lines.push('  ✘ 重复交卷被拒绝：未拒绝');
          }).catch(function (err) {
            var ok = err.message.indexOf('已交卷') !== -1;
            ok ? pass++ : fail++;
            lines.push((ok ? '  ✔ ' : '  ✘ ') + '重复交卷被拒绝：' + err.message);
          });
        })
        .then(function () {
          return Api.listMyRecords().then(function (rec) {
            var last = rec[0];
            return Api.getResult(last.record.id).then(function (d) {
              var ok = d.details.length > 0;
              ok ? pass++ : fail++;
              lines.push((ok ? '  ✔ ' : '  ✘ ') + '成绩单可查（含逐题明细 ' + d.details.length + ' 题）');
              var ok2 = d.details.every(function (x) {
                return x.correct_answer !== undefined && x.user_answer !== undefined &&
                       (x.is_correct === 1 || x.is_correct === 0 || x.is_correct === -1);
              });
              ok2 ? pass++ : fail++;
              lines.push((ok2 ? '  ✔ ' : '  ✘ ') + '逐题明细带 你的答案 / 参考答案 / 对错');
            });
          });
        })
        .catch(function (err) {
          fail++;
          lines.push('  ✘ 全流程串行检查异常：' + err.message);
        })
        /* 这两项必须在流程结束之后再查，否则此时还没有考试记录 */
        .then(function () {
          lines.push('【5】个人成绩与统计（上述流程完成后）');
          return Api.listMyRecords().then(function (r) {
            var ok = r.length > 0 && !!r[0].paper_name;
            ok ? pass++ : fail++;
            lines.push((ok ? '  ✔ ' : '  ✘ ') + '我的考试记录列表可查（' + r.length + ' 条）');
          });
        })
        .then(function () {
          return Api.getMyStats().then(function (s) {
            var ok = typeof s.paper_total === 'number' && typeof s.avg_score === 'number' && s.done_total > 0;
            ok ? pass++ : fail++;
            lines.push((ok ? '  ✔ ' : '  ✘ ') + '首页统计可查（已完成 ' + s.done_total + ' 场，平均 ' + s.avg_score + ' 分）');
          });
        })
    );

    return Promise.all(pending).then(function () {
      Api.setCurrentUser(savedUser);          // 恢复原会话

      var report = '学生端数据自检：通过 ' + pass + ' 项，失败 ' + fail + ' 项\n' + lines.join('\n');
      if (fail === 0) { console.log('%c' + report, 'color:#16a34a'); }
      else { console.warn(report); }
      return { pass: pass, fail: fail, detail: lines };
    });
  }

  global.selfTest = selfTest;
  console.log('在线考试系统（学生端）已就绪。输入 selfTest() 可执行学生端数据自检。');
})(window);
