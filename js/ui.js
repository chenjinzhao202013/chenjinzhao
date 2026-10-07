/* ============================================================
 * ui.js —— 公共 UI 工具：DOM 查询、转义、提示、确认框、格式化
 * ============================================================ */
(function (global) {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* ---------------- Toast ---------------- */
  var toastTimers = [];
  function toast(message, type, ms) {
    var host = $('#toastHost');
    if (!host) { return; }
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.innerHTML = esc(message);
    host.appendChild(el);
    var t = setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 220);
    }, ms || 2400);
    toastTimers.push(t);
  }
  toast.ok = function (m, ms) { toast(m, 'ok', ms); };
  toast.warn = function (m, ms) { toast(m, 'warn', ms || 3200); };
  toast.error = function (m, ms) { toast(m, 'error', ms || 3200); };
  toast.info = function (m, ms) { toast(m, '', ms); };

  /* ---------------- 确认框：返回 Promise<boolean> ---------------- */
  function confirmBox(opts) {
    var options = typeof opts === 'string' ? { body: opts } : (opts || {});
    return new Promise(function (resolve) {
      var mask = $('#modalMask');
      $('#modalTitle').textContent = options.title || '提示';
      $('#modalBody').innerHTML = options.html || esc(options.body || '');
      var actions = $('#modalActions');
      actions.innerHTML = '';

      var cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost';
      cancel.type = 'button';
      cancel.textContent = options.cancelText || '取消';

      var ok = document.createElement('button');
      ok.className = 'btn ' + (options.danger ? 'btn-danger' : (options.okClass || ''));
      ok.type = 'button';
      ok.textContent = options.okText || '确定';

      function close(result) {
        mask.classList.add('hidden');
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') { close(false); }
        if (e.key === 'Enter') { close(true); }
      }
      cancel.onclick = function () { close(false); };
      ok.onclick = function () { close(true); };
      document.addEventListener('keydown', onKey);

      actions.appendChild(cancel);
      actions.appendChild(ok);
      mask.classList.remove('hidden');
      ok.focus();
    });
  }

  /* ---------------- 数字/时间格式化 ---------------- */
  function formatClock(date) {
    return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }
  function formatDuration(seconds) {
    var s = Math.max(0, Math.floor(seconds || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h > 0 ? pad(h) + ':' : '') + pad(m) + ':' + pad(sec);
  }
  function formatCountdown(seconds) {
    var s = Math.max(0, Math.floor(seconds || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(sec);
  }
  function formatDate(str) {
    if (!str) { return '—'; }
    var d = new Date(String(str).replace(/-/g, '/'));
    if (isNaN(d.getTime())) { return String(str); }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
           pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function degree(score, total) {
    if (!total) { return 0; }
    return Math.max(0, Math.min(1, score / total));
  }

  /* ---------------- 其他 ---------------- */
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

  /* 题型标签 */
  function typeTagHtml(type) {
    var map = { 1: ['tag-single', '单选题'], 2: ['tag-multi', '多选题'], 3: ['tag-judge', '判断题'], 4: ['tag-essay', '简答题'] };
    var m = map[type] || ['tag-gray', '未知'];
    return '<span class="tag ' + m[0] + '">' + m[1] + '</span>';
  }

  function optionKeys(question) {
    var keys = [];
    ['option_a', 'option_b', 'option_c', 'option_d'].forEach(function (k, i) {
      if (question[k] !== null && question[k] !== undefined && String(question[k]) !== '') {
        keys.push({ key: String.fromCharCode(65 + i), text: question[k] });
      }
    });
    return keys;
  }

  global.UI = {
    $: $, $$: $$, esc: esc, toast: toast, confirm: confirmBox,
    formatClock: formatClock, formatDuration: formatDuration,
    formatCountdown: formatCountdown, formatDate: formatDate,
    degree: degree, debounce: debounce, scrollTop: scrollTop,
    typeTagHtml: typeTagHtml, optionKeys: optionKeys
  };
})(window);
