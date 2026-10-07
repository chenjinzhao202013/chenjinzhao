/* ============================================================
 * _smoke_test.js —— 端到端冒烟测试（Node，无浏览器）
 * ------------------------------------------------------------
 * 真实执行：自动登录 -> 考试列表 -> 开考 -> 作答 -> 交卷 -> 成绩解析
 * 用法：node _smoke_test.js      退出码 0 表示全部通过
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, 'js');
const files = ['md5.js', 'mock-db.js', 'api.js', 'ui.js',
  'page-exam-list.js', 'page-exam.js', 'page-result.js', 'app.js', 'selftest.js'];

/* ---- DOM stub：记录 innerHTML 以便断言页面确实渲染了内容 ---- */
function makeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), style: {}, dataset: {},
    children: [], _html: '', textContent: '', className: '', value: '',
    disabled: false, checked: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild(c) { el.children.push(c); return c; }, removeChild() {}, remove() {},
    insertAdjacentHTML() {}, addEventListener() {}, removeEventListener() {},
    focus() {}, select() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); }
  });
  return el;
}

const store = {};
const storage = () => ({
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); }
});

/* 关键元素单独持有一个实例，便于断言 */
const appEl = makeElement();
const fallback = makeElement();

const documentStub = {
  readyState: 'loading',        // 让 app.js 走 DOMContentLoaded 分支，由脚本手动触发 start()
  title: '',
  body: makeElement(),
  documentElement: makeElement(),
  _listeners: {},
  addEventListener(type, fn) { (documentStub._listeners[type] = documentStub._listeners[type] || []).push(fn); },
  removeEventListener() {},
  createElement: t => makeElement(t),
  querySelector: sel => (sel === '#app' ? appEl : fallback),
  querySelectorAll: () => [],
  getElementById: () => fallback
};

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, Date, Math, JSON, Number, String, Boolean, Array, Object, Error, RegExp,
  isNaN, parseInt, parseFloat,
  localStorage: storage(), sessionStorage: storage(),
  location: { hash: '', href: 'file:///index.html' },
  history: { replaceState() {}, pushState() {} },
  navigator: { userAgent: 'node' },
  document: documentStub
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = function () {};
sandbox.removeEventListener = function () {};
sandbox.scrollTo = function () {};
sandbox.pageYOffset = 0;
sandbox.alert = function () {};
sandbox.confirm = function () { return true; };

const ctx = vm.createContext(sandbox);
for (const f of files) {
  const file = path.join(dir, f);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f });
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (extra ? '  -> ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* 轮询等待条件成立，避免固定 sleep 与异步取数时序打架 */
async function waitFor(cond, timeout = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (cond()) { return true; }
    await sleep(50);
  }
  return false;
}

(async function run() {
  console.log('【1】启动与演示账号自动登录');
  const App = sandbox.App, Api = sandbox.Api;
  ok('App 已挂载', !!App);
  // 触发 DOMContentLoaded -> start() -> autoLogin() -> mount()
  (documentStub._listeners['DOMContentLoaded'] || []).forEach(fn => fn());
  await waitFor(() => !!Api.currentUser());
  const user = Api.currentUser();
  ok('自动登录成功且为 student01', !!user && user.username === 'student01', JSON.stringify(user));
  await waitFor(() => appEl.innerHTML.indexOf('可参加的考试') !== -1);
  ok('考试列表已渲染（命中页面标题）', appEl.innerHTML.indexOf('可参加的考试') !== -1);
  ok('列表出现“进行中”状态标注', appEl.innerHTML.indexOf('进行中') !== -1);
  ok('列表出现“已结束”状态标注', appEl.innerHTML.indexOf('已结束') !== -1);
  ok('列表出现“未开始”状态标注', appEl.innerHTML.indexOf('未开始') !== -1);
  ok('列表未出现未发布试卷', appEl.innerHTML.indexOf('未发布') === -1);
  ok('未开始/已结束的按钮被禁用', appEl.innerHTML.indexOf('disabled') !== -1);

  console.log('【2】开考与判分（模拟第 1 题正确、其余留空）');
  const detail = await Api.getPaperDetail(1);
  ok('试卷1 题目数 34', detail.questions.length === 34, String(detail.questions.length));
  ok('答题页未下发答案字段',
    detail.questions.every(q => q.answer === undefined && q.analysis === undefined));

  // 必须先清空本地记录：演示历史记录已占用试卷 1，会触发“只能考一次”
  await Api.resetLocalData({ reseed: false });

  const started = await Api.startExam(1);
  ok('开考成功且记录为进行中', started.record.status === 0);
  ok('续考标记为 false（首次开考）', started.resumed === false);

  const resumed = await Api.startExam(1);
  ok('未交卷时可继续作答（断点续答同一场）',
    resumed.resumed === true && resumed.record.id === started.record.id);

  // 只答第 1 题（正确），其余留空 -> 客观题应为 2 分
  await Api.saveDraft(started.record.id, { 1: 'B' });
  const submitted = await Api.submitExam(started.record.id, { used_seconds: 120 });
  ok('交卷后客观题得 2 分', submitted.record.objective_score === 2,
    String(submitted.record.objective_score));
  ok('交卷后状态为待评阅(1) 或 已评阅(2)',
    submitted.record.status === 1 || submitted.record.status === 2);

  console.log('【2.1】一次考试只能考一次');
  let rejectedMsg = '';
  try { await Api.startExam(1); } catch (e) { rejectedMsg = e.message; }
  ok('交卷后再次开考被拒绝', rejectedMsg.indexOf('只能考一次') !== -1, rejectedMsg);
  let dupMsg = '';
  try { await Api.submitExam(started.record.id, {}); } catch (e) { dupMsg = e.message; }
  ok('重复交卷被拒绝', dupMsg.indexOf('已交卷') !== -1, dupMsg);

  // 交卷后列表应显示“已完成 + 查看成绩”，且不再出现“再考一次”
  App.go('exam-list', {}, true);
  await waitFor(() => appEl.innerHTML.indexOf('查看成绩') !== -1);
  const listHtml = appEl.innerHTML;
  ok('列表显示“已完成”', listHtml.indexOf('已完成') !== -1);
  ok('列表提供“查看成绩”入口', listHtml.indexOf('查看成绩') !== -1);
  ok('列表不再出现“再考一次”', listHtml.indexOf('再考一次') === -1);
  ok('列表提示“本场已交卷，不能重考”', listHtml.indexOf('本场已交卷，不能重考') !== -1);

  console.log('【3】成绩与答卷解析');
  const result = await Api.getResult(submitted.record.id);
  ok('成绩单题目数 34', result.details.length === 34, String(result.details.length));
  ok('逐题得分之和 = 记录总分',
    result.details.reduce((t, x) => t + x.score, 0) === result.record.score);
  ok('第 1 题判为正确', result.details[0].is_correct === 1);
  ok('参考答案已下发到成绩页', result.details[0].correct_answer === 'B');
  ok('解析已下发到成绩页', !!result.details[0].analysis);
  ok('未作答的题目被识别', result.details.slice(1).every(d => !String(d.user_answer).trim()));

  console.log('【4】成绩页渲染');
  Api.setCurrentUser(user);
  App.go('result', { recordId: submitted.record.id }, true);
  await waitFor(() => appEl.innerHTML.indexOf('答卷解析') !== -1);
  ok('成绩页渲染出答卷解析', appEl.innerHTML.indexOf('答卷解析') !== -1);
  ok('成绩页渲染出得分圆环', appEl.innerHTML.indexOf('score-ring') !== -1);

  console.log('\n===> 冒烟测试：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail === 0 ? 0 : 2);
})().catch(e => {
  console.log('冒烟测试异常: ' + e.message + '\n' + e.stack);
  process.exit(3);
});
