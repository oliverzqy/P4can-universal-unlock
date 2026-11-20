'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dashboard_source.html'), 'utf8');
const match = html.match(/<script id="tlsscOfflineLabScript">([\s\S]*?)<\/script>/);
assert(match, 'The standalone offline script must be present');
const script = match[1];
assert(!/\b(fetch|WebSocket|XMLHttpRequest|EventSource|jget|post|featurePostJson)\b/.test(script),
  'The simulator must have no network or existing API dependency');

function fixture(url) {
  const location = new URL(url);
  const elements = new Map();
  const observers = [];
  const pendingMutations = new Set();
  const timers = new Map();
  const documentEvents = new Map();
  const windowEvents = new Map();
  let timerId = 0;
  let networkAttempts = 0;

  class FakeElement {
    constructor(tag = 'div', attributes = '') {
      this.tagName = tag.toUpperCase();
      this.id = attributes.match(/\bid="([^"]+)"/)?.[1] || '';
      this.className = attributes.match(/\bclass="([^"]+)"/)?.[1] || '';
      this.hidden = /\bhidden(?:\s|$)/.test(attributes);
      this.disabled = /\bdisabled(?:\s|$)/.test(attributes);
      this.checked = false;
      this.textContent = '';
      this.children = [];
      this.attributes = new Map();
      this.classList = {
        contains: value => this.className.split(/\s+/).includes(value),
        add: value => {
          if (!this.classList.contains(value)) this.className += ' ' + value;
          this.changed();
        },
        remove: value => {
          this.className = this.className.split(/\s+/).filter(item => item !== value).join(' ');
          this.changed();
        }
      };
    }

    changed() {
      for (const observer of observers) {
        if (observer.target === this) pendingMutations.add(observer);
      }
    }

    setAttribute(name, value) { this.attributes.set(name, value); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = [...children]; }
    focus() { this.focused = true; }
  }

  for (const tag of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="(?:tlsscOffline[^"\s]*|panelOfflineTlssc)"[^>]*)>/gi)) {
    const element = new FakeElement(tag[1], tag[2]);
    assert(!elements.has(element.id), 'Offline DOM IDs must be unique');
    elements.set(element.id, element);
  }
  for (const id of ['tlsscRestoreToggle', 'tlsscToggle']) {
    const element = new FakeElement();
    element.checked = true;
    elements.set(id, element);
  }
  const otherPanel = new FakeElement('section', 'class="panel show"');
  elements.set('otherPanel', otherPanel);

  function networkTrap() {
    networkAttempts += 1;
    throw new Error('Network access is forbidden in the offline simulator');
  }

  const document = {
    hidden: false,
    getElementById: id => elements.get(id) || null,
    createElement: tag => new FakeElement(tag),
    querySelectorAll: selector => {
      assert.equal(selector, '.panel.show');
      return [...elements.values()].filter(element =>
        element.classList.contains('panel') && element.classList.contains('show'));
    },
    addEventListener: (name, callback) => documentEvents.set(name, callback)
  };
  const window = {
    addEventListener: (name, callback) => windowEvents.set(name, callback),
    fetch: networkTrap,
    WebSocket: networkTrap,
    XMLHttpRequest: networkTrap
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe(target) { this.target = target; observers.push(this); }
  }
  const context = vm.createContext({
    document, window, location, MutationObserver, Date,
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: networkTrap,
    WebSocket: networkTrap,
    XMLHttpRequest: networkTrap,
    EventSource: networkTrap,
    navigator: {sendBeacon: networkTrap},
    post: networkTrap,
    jget: networkTrap,
    featurePostJson: networkTrap,
    setTlsscEnabled: networkTrap,
    setAutoBlinkerEnabled: networkTrap,
    localStorage: new Proxy({}, {get: networkTrap})
  });
  vm.runInContext(script, context, {filename: 'tlsscOfflineLabScript'});

  const get = id => {
    const element = elements.get(id);
    assert(element, 'Missing DOM element ' + id);
    return element;
  };
  return {
    get,
    timers,
    open: () => get('tlsscOfflineEntry').onclick(),
    enable(value = true) {
      get('tlsscOfflineEnabled').checked = value;
      get('tlsscOfflineEnabled').onchange();
    },
    tick() {
      const next = timers.entries().next().value;
      assert(next, 'Expected a scheduled simulator step');
      timers.delete(next[0]);
      next[1]();
    },
    flushMutations() {
      for (const observer of [...pendingMutations]) observer.callback();
      pendingMutations.clear();
    },
    hidePage() { document.hidden = true; documentEvents.get('visibilitychange')(); },
    leavePage() { windowEvents.get('pagehide')(); },
    assertIsolated() {
      assert.equal(networkAttempts, 0, 'The simulator attempted network, storage or vehicle access');
      assert.equal(get('tlsscRestoreToggle').checked, true);
      assert.equal(get('tlsscToggle').checked, true);
    }
  };
}

for (const url of ['file:///tmp/dashboard_source.html', 'http://localhost:8080/',
  'http://127.0.0.1:8080/', 'http://[::1]:8080/']) {
  const page = fixture(url);
  assert.equal(page.get('tlsscOfflineEntry').hidden, false);
  assert.equal(page.get('tlsscOfflineEnabled').checked, false);
  assert.equal(page.get('tlsscOfflineStatus').textContent, '关闭');
  assert.equal(page.get('tlsscOfflineStage').textContent, '等待样本');
  assert.equal(page.timers.size, 0);
  page.open();
  page.enable();
  page.get('tlsscOfflineStep').onclick();
  assert.equal(page.get('tlsscOfflineStage').textContent, '模拟配置变化');
  assert.match(page.get('tlsscOfflineTimestamp').textContent, /^\d{4}-\d{2}-\d{2}T/);
  page.get('tlsscOfflineStart').onclick();
  page.tick();
  assert.equal(page.get('tlsscOfflineStage').textContent, '模拟车机重新加载');
  page.tick();
  assert.equal(page.get('tlsscOfflineStage').textContent, '模拟功能可见');
  assert.equal(page.get('tlsscOfflineStatus').textContent, '已完成');
  assert.equal(page.timers.size, 0);
  assert.equal(page.get('tlsscOfflineStep').disabled, true);
  page.assertIsolated();
}

for (const url of ['http://192.168.4.1/', 'http://example.com/', 'https://localhost/',
  'http://localhost.example.com/', 'http://127.0.0.2/', 'https://example.com/']) {
  const page = fixture(url);
  assert.equal(page.get('tlsscOfflineEntry').hidden, true);
  assert.equal(page.get('panelOfflineTlssc').hidden, true);
  assert.equal(page.get('tlsscOfflineEnabled').disabled, true);
  page.open();
  page.enable();
  for (const id of ['tlsscOfflineStart', 'tlsscOfflineStep', 'tlsscOfflineReset']) page.get(id).onclick();
  assert.equal(page.get('tlsscOfflineEnabled').checked, false);
  assert.equal(page.get('tlsscOfflineStatus').textContent, '关闭');
  assert.equal(page.get('tlsscOfflineLog').children.length, 0);
  assert.equal(page.timers.size, 0);
  page.assertIsolated();
}

const page = fixture('http://localhost:8080/');
page.open();
page.enable();
page.get('tlsscOfflineStart').onclick();
page.get('tlsscOfflineStart').onclick();
assert.equal(page.timers.size, 1, 'Repeated start must not duplicate timers');
page.tick();
page.get('tlsscOfflinePause').onclick();
assert.equal(page.get('tlsscOfflineStatus').textContent, '已暂停');
assert.equal(page.timers.size, 0);
const pausedStage = page.get('tlsscOfflineStage').textContent;
page.get('tlsscOfflineStart').onclick();
page.get('panelOfflineTlssc').classList.remove('show');
page.flushMutations();
assert.equal(page.get('tlsscOfflineStatus').textContent, '已暂停');
assert.equal(page.timers.size, 0);
assert.equal(page.get('tlsscOfflineStage').textContent, pausedStage);
page.open();
assert.equal(page.timers.size, 0, 'Returning to the panel must not resume automatically');
page.get('tlsscOfflineStart').onclick();
page.get('tlsscOfflineBack').onclick();
assert.equal(page.timers.size, 0);
assert.equal(page.get('panelOfflineTlssc').classList.contains('show'), false);
page.open();
page.get('tlsscOfflineStart').onclick();
page.hidePage();
assert.equal(page.timers.size, 0);
page.assertIsolated();

const navigationRace = fixture('http://127.0.0.1:8080/');
let keyboardDefaultPrevented = false;
navigationRace.get('tlsscOfflineEntry').onkeydown({
  key: 'Enter',
  preventDefault() { keyboardDefaultPrevented = true; }
});
assert.equal(keyboardDefaultPrevented, true);
navigationRace.enable();
navigationRace.get('tlsscOfflineStart').onclick();
navigationRace.get('panelOfflineTlssc').classList.remove('show');
navigationRace.tick();
assert.equal(navigationRace.get('tlsscOfflineStage').textContent, '等待样本',
  'A pending timer must not advance after navigation, before the observer runs');
assert.equal(navigationRace.timers.size, 0);
navigationRace.assertIsolated();

const bounded = fixture('file:///tmp/dashboard_source.html');
bounded.open();
for (let index = 0; index < 100; index += 1) bounded.enable(index % 2 === 0);
const entries = bounded.get('tlsscOfflineLog').children;
assert.equal(entries.length, 64, 'Old events must be evicted at the log bound');
for (const entry of entries) {
  assert.equal(entry.children[0].tagName, 'TIME');
  assert.match(entry.children[0].dateTime, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(entry.children[0].dateTime, entry.children[0].textContent);
}
bounded.enable();
bounded.get('tlsscOfflineStart').onclick();
bounded.get('tlsscOfflineReset').onclick();
assert.equal(bounded.timers.size, 0);
assert.equal(bounded.get('tlsscOfflineEnabled').checked, false);
assert.equal(bounded.get('tlsscOfflineStage').textContent, '等待样本');
assert.equal(bounded.get('tlsscOfflineStatus').textContent, '关闭');
assert.equal(bounded.get('tlsscOfflineLog').children.length, 0);
assert.equal(bounded.get('tlsscOfflineTimestamp').textContent, '—');
bounded.enable();
bounded.get('tlsscOfflineStart').onclick();
bounded.leavePage();
assert.equal(bounded.timers.size, 0);
bounded.assertIsolated();

const reloaded = fixture('file:///tmp/dashboard_source.html');
assert.equal(reloaded.get('tlsscOfflineEnabled').checked, false);
assert.equal(reloaded.get('tlsscOfflineLog').children.length, 0);
assert.equal(reloaded.timers.size, 0);
reloaded.assertIsolated();
console.log('PASS: offline TLSSC default OFF, host restriction, stages, pause, reset, log bound and zero network access');
