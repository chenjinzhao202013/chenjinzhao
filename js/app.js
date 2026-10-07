/* ============================================================
 * app.js —— 路由、会话与顶栏控制（学生端）
 * 路由表：
 *   #/exam-list                  考试列表（默认）
 *   #/exam?paperId=1             在线答题
 *   #/result?recordId=2          成绩与答卷解析
 *
 * 说明：本项目为演示版本，已移除登录界面，进入页面时自动以演示考生
 *       student01 登录（见 autoLogin），因此不再有 #/login 路由。
 * ============================================================ */
(function (global) {
  'use strict';

  var ROUTES = {
    'exam-list': { page: function () { return global.PageExamList; },  title: '我的考试',       auth: true },
    'exam':      { page: function () { return global.PageExam; },      title: '在线答题',       auth: true },
    'result':    { page: function () { return global.PageResult; },    title: '成绩与解析',     auth: true }
  };

  /* 演示账号：密码为 123456（与 sys_user 表中的 MD5 摘要一致） */
  var DEMO_ACCOUNT = { username: 'student01', password: '123456' };

  var DEFAULT_ROUTE = 'exam-list';
  var mounted = null;       // 当前已挂载的页面对象，用于调用 destroy()
  var current = { name: '', params: {} };

  /* ---------------- URL <-> 路由对象 ---------------- */
  function parseHash() {
    var raw = String(location.hash || '').replace(/^#\/?/, '');
    var qs = '';
    var qi = raw.indexOf('?');
    if (qi >= 0) { qs = raw.slice(qi + 1); raw = raw.slice(0, qi); }
    var name = raw || DEFAULT_ROUTE;
    var params = {};
    qs.split('&').forEach(function (kv) {
      if (!kv) { return; }
      var i = kv.indexOf('=');
      var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      var v = decodeURIComponent(i < 0 ? '' : kv.slice(i + 1));
      params[k] = v;
    });
    return { name: name, params: params };
  }

  function buildHash(name, params) {
    var qs = Object.keys(params || {})
      .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
    return '#/' + name + (qs ? '?' + qs : '');
  }

  /* ---------------- 会话 ---------------- */
  function getUser() { return Api.currentUser(); }

  function setUser(user) { Api.setCurrentUser(user); updateTopbar(); }

  /* 演示版自动登录：进入系统即用演示考生身份，无需登录界面 */
  function autoLogin() {
    if (getUser()) { return Promise.resolve(getUser()); }
    return Api.login(DEMO_ACCOUNT.username, DEMO_ACCOUNT.password)
      .then(function (user) {
        updateTopbar();
        return user;
      })
      .catch(function (err) {
        UI.toast.error('演示账号初始化失败：' + (err.message || '未知错误'));
        return null;
      });
  }

  /* 退出演示账号：清除会话后回到考试列表（下次进入会自动重新登录） */
  function logout() {
    return UI.confirm({
      title: '退出演示账号',
      body: '退出后将清除当前会话，返回考试列表时系统会自动重新以演示考生身份登录。确定继续吗？',
      okText: '确定退出'
    }).then(function (ok) {
      if (!ok) { return; }
      return Api.logout().then(function () {
        updateTopbar();
        UI.toast.info('已退出演示账号');
        go(DEFAULT_ROUTE, {}, true);
      });
    });
  }

  /* ---------------- 顶栏 ---------------- */
  function updateTopbar() {
    var user = getUser();
    var chip = UI.$('#userChip');
    var btnLogout = UI.$('#btnLogout');
    var examStatus = UI.$('#examStatus');

    if (user) {
      chip.classList.remove('hidden');
      btnLogout.classList.remove('hidden');
      UI.$('#userRealName').textContent = user.real_name;
      UI.$('#userAccount').textContent = user.username + ' · 学生';
      UI.$('#userAvatar').textContent = String(user.real_name || '学').charAt(0);
    } else {
      chip.classList.add('hidden');
      btnLogout.classList.add('hidden');
    }
    /* 只有在答题页才显示倒计时状态区 */
    if (current.name === 'exam' && user) {
      examStatus.classList.remove('hidden');
    } else {
      examStatus.classList.add('hidden');
    }
  }

  /* ---------------- 路由跳转 ---------------- */
  function go(name, params, replace) {
    var target = buildHash(name, params);
    if (location.hash === target) {
      /* 同一个地址：强制重新渲染 */
      var route = parseHash();
      mount(route.name, route.params);
      return;
    }
    if (replace) {
      history.replaceState(null, '', target);
      mount(name, params || {});
    } else {
      location.hash = target;   // 触发 hashchange -> mount
    }
  }

  function mount(name, params) {
    var route = ROUTES[name];
    var root = UI.$('#app');
    var user = getUser();

    if (!route) {
      UI.toast.error('页面不存在：' + name);
      go(DEFAULT_ROUTE, {}, true);
      return;
    }

    /* 演示版已移除登录界面：会话失效时先自动登录，再继续访问当前页面 */
    if (!user) {
      autoLogin().then(function (u) {
        if (!u) { return; }
        mount(name, params);
      });
      root.innerHTML = '<div class="card"><div class="empty"><div class="ico">⏳</div><p>正在初始化演示账号…</p></div></div>';
      return;
    }

    /* 卸载上一页（清理定时器 / 事件监听） */
    if (mounted && typeof mounted.destroy === 'function') {
      try { mounted.destroy(); } catch (e) { /* ignore */ }
    }

    current = { name: name, params: params };
    document.title = (route.title ? route.title + ' · ' : '') + '在线考试系统 · 学生端';
    updateTopbar();

    var page = route.page();
    if (!page || typeof page.render !== 'function') {
      root.innerHTML = '<div class="card"><div class="empty"><div class="ico">⚠</div><p>页面脚本未加载：' +
        UI.esc(name) + '</p></div></div>';
      return;
    }
    mounted = page;
    page.render(root, params);
    UI.scrollTop();
  }

  /* ---------------- 启动 ---------------- */
  function start() {
    var btnLogout = UI.$('#btnLogout');
    if (btnLogout) { btnLogout.onclick = logout; }

    window.addEventListener('hashchange', function () {
      var route = parseHash();
      mount(route.name, route.params);
    });

    updateTopbar();

    /* 先自动登录演示账号，再渲染当前路由 */
    autoLogin().then(function () {
      var route = parseHash();
      mount(route.name, route.params);
    });
  }

  global.App = {
    go: go,
    getUser: getUser,
    setUser: setUser,
    autoLogin: autoLogin,
    logout: logout,
    updateTopbar: updateTopbar,
    currentParams: function () { return current.params; },
    currentRoute: function () { return current.name; },
    routes: ROUTES
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
