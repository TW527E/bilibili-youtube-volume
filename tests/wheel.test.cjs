const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'bilibili-youtube-volume.user.js'), 'utf8');
const handlers = source.slice(source.indexOf('      const sync = () => {'), source.indexOf('      // 原生按鈕'));
let checks = 0;
function fixture(platform) {
  const video = { volume: .125, muted: false };
  const listeners = {};
  const input = {
    value: '50', disabled: false, setAttribute() {},
    get valueAsNumber() { return Number(this.value); },
    addEventListener(type, listener) { listeners[type] = listener; }
  };
  const group = { dataset: {}, style: { setProperty() {} }, addEventListener(type, listener) { listeners[type] = listener; } };
  vm.runInNewContext(`let lastVolume=0;${handlers}`, { media: () => video, video, input, group, navigator: { platform } });
  return {
    video, input,
    reset() { video.volume = .125; video.muted = false; },
    wheel(deltaY = 0, deltaX = 0, extra = {}) {
      const event = { deltaMode: 0, deltaY, deltaX, ...extra, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
      listeners.wheel(event);
      return event;
    }
  };
}
function at(f, expected, message) {
  assert.ok(Math.abs(f.input.valueAsNumber - expected) < 1e-8, `${message}: ${f.input.value}`);
  assert.ok(Math.abs(f.video.volume - (expected / 100) ** 3) < 1e-12, `${message}: gain`);
  checks++;
}
for (const platform of ['MacIntel', 'Linux x86_64', 'Win32']) {
  const f = fixture(platform);
  for (const flag of [undefined, true, false]) {
    const inverted = flag ?? platform === 'MacIntel';
    for (const [dy, dx] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) {
      f.reset();
      const e = f.wheel(dy, dx, { webkitDirectionInvertedFromDevice: flag });
      at(f, 50 + (dx || -dy) * .05 * (inverted ? -1 : 1), `${platform}, inversion=${flag}, delta=${dx},${dy}`);
      assert.ok(e.prevented && e.stopped);
    }
  }
}
const mac = fixture('MacIntel');
for (let i=0; i<100; i++) mac.wheel(.1);
at(mac, 50.5, 'Tiny Mac events accumulate');
mac.wheel(-10);
at(mac, 50, 'Equal reverse travel returns to baseline');
mac.wheel(.25, -.5);
at(mac, 50.025, 'Dominant horizontal axis handles diagonals once');
mac.reset(); mac.wheel(-3, 0, {deltaMode:1}); at(mac, 55, 'Line-mode wheel retains direction');
mac.reset(); mac.wheel(-1, 0, {deltaMode:2}); at(mac, 55, 'Page-mode wheel retains direction');
for (const modifier of ['ctrlKey', 'shiftKey']) {
  mac.reset(); const e=mac.wheel(10,0,{[modifier]:true});
  assert.equal(mac.video.volume,.125); assert.equal(e.prevented,false); checks++;
}
mac.video.muted=true; mac.wheel(.25); at(mac,.0125,'Small natural-scroll increase unmutes');
mac.wheel(1e5); at(mac,100,'Natural scrolling clamps at maximum');
mac.wheel(-.25); at(mac,99.9875,'Upper bound reverses immediately');
mac.wheel(-1e5); at(mac,0,'Natural scrolling clamps at zero');
mac.wheel(.25); at(mac,.0125,'Lower bound reverses immediately');
console.log(`${checks} wheel direction and precision checks passed (actual handler, simulated platform/events).`);
