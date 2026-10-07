/* ============================================================
 * _verify_selftest.js —— 无浏览器环境下运行 selfTest() 的自检脚本
 * ------------------------------------------------------------
 * 用法（在项目目录下）：
 *     node _verify_selftest.js
 * 输出：数据自检的 “通过 N 项，失败 M 项” 与逐项结果，退出码 0 表示全通过。
 * 原理：用极简 DOM stub 在 Node 中依次载入全部前端 js，然后真实调用 selfTest()。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, 'js');
const files = ['md5.js', 'mock-db.js', 'api.js', 'ui.js',
  'page-exam-list.js', 'page-exam.js', 'page-result.js', 'app.js', 'selftest.js'];

/* 极简 DOM stub：只提供脚本运行期会用到的接口 */
function makeElement() {
  const el = {
    style: {}, dataset: {}, children: [], innerHTML: '', textContent: '', className: '', value: '',
    disabled: false, checked: false, files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild(c) { el.children.push(c); return c; }, removeChild() {}, remove() {},
    insertAdjacentHTML() {}, addEventListener() {}, removeEventListener() {}, focus() {}, select() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
  };
  return el;
}

const store = {};
function makeStorage() {
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

const fallbackEl = makeElement();
const documentStub = {
  readyState: 'complete',
  title: '',
  body: makeElement(),
  documentElement: makeElement(),
  addEventListener() {}, removeEventListener() {},
  createElement: () => makeElement(),
  querySelector: () => fallbackEl,
  querySelectorAll: () => [],
  getElementById: () => fallbackEl
};

const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, Date, Math, JSON, Number, String, Boolean, Array, Object, Error, RegExp,
  isNaN, parseInt, parseFloat,
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
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
sandbox.innerWidth = 1280;
sandbox.innerHeight = 800;
sandbox.alert = function () {};
sandbox.confirm = function () { return false; };

const ctx = vm.createContext(sandbox);

/* 捕获 selfTest 的输出 */
const captured = [];
sandbox.console = Object.assign({}, console, {
  log: (...a) => { captured.push(a.join(' ')); },
  warn: (...a) => { captured.push('WARN ' + a.join(' ')); }
});

for (const f of files) {
  const file = path.join(dir, f);
  if (!fs.existsSync(file)) { console.log('缺少文件 ' + f); process.exit(1); }
  try {
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f });
  } catch (e) {
    console.log('加载失败 ' + f + ': ' + e.message);
    process.exit(1);
  }
}

vm.runInContext('selfTest()', ctx)
  .then(res => {
    console.log(captured
      .filter(l => l.indexOf('数据自检') !== -1 || l.indexOf('✔') !== -1 || l.indexOf('✘') !== -1)
      .join('\n'));
    console.log('\n===> 通过 ' + res.pass + ' 项，失败 ' + res.fail + ' 项');
    process.exit(res.fail === 0 ? 0 : 2);
  })
  .catch(e => {
    console.log('selfTest 抛出异常: ' + e.message + '\n' + e.stack);
    process.exit(3);
  });
