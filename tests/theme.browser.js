async function themeTest(source) {
  const factory = source.slice(source.indexOf('  function makeSwitch('), source.indexOf('  function mountFeatures('));
  const makeSwitch = new Function(factory + '; return makeSwitch;')();
  const css = source.split('  style.textContent = `')[1].split('`;')[0];
  const root = document.querySelector('.bpx-player-container');
  const reference = root.querySelector('.bpx-player-ctrl-setting-autoplay').cloneNode(true);
  const fixture = document.createElement('div');
  fixture.className = 'bili-yt-theme-test';
  fixture.style.cssText = 'position:fixed;left:-10000px;top:0;width:200px;pointer-events:none';
  const style = document.createElement('style');
  style.textContent = '.bili-yt-theme-test * { transition: none !important; }';
  const currentStyle = document.getElementById('bili-yt-volume-style');
  const previousCss = currentStyle.textContent;
  let changes = 0;
  const own = makeSwitch('音量平衡', () => changes++);
  const nativeInput = reference.querySelector('input');
  fixture.append(reference, own.row);
  const checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const appearance = element => {
    const c = getComputedStyle(element);
    return { background: c.backgroundColor, width: c.width, height: c.height, radius: c.borderRadius };
  };
  try {
    currentStyle.textContent = css;
    document.head.append(style); root.append(fixture);
    for (const color of ['#f43f5e', '#22c55e', '#00a1d6']) {
      fixture.style.setProperty('--bpx-fn-color', color);
      for (const checked of [true, false]) {
        own.input.checked = nativeInput.checked = checked;
        const actual = appearance(own.row.querySelector('.bui-switch-body'));
        const expected = appearance(reference.querySelector('.bui-switch-body'));
        check(JSON.stringify(actual) === JSON.stringify(expected), `Native switch appearance matches ${color}, checked=${checked}`);
      }
    }
    fixture.style.color = 'rgb(30, 40, 50)';
    check(getComputedStyle(own.row).color === getComputedStyle(reference).color, 'Switch inherits text color instead of forcing white');
    check(getComputedStyle(own.row).height === getComputedStyle(reference).height, 'Setting row matches native 32px height');
    own.input.click();
    check(own.input.checked && changes === 1, 'Input click changes once');
    own.row.querySelector('.bui-switch-name').click();
    check(!own.input.checked && changes === 2, 'Label text toggles once');
    own.row.querySelector('.bui-switch-body').click();
    check(own.input.checked && changes === 3, 'Switch track toggles once');
    own.input.disabled = true;
    own.row.click();
    check(own.input.checked && changes === 3, 'Disabled label cannot change state');
    own.row.dataset.status = 'pending';
    check(getComputedStyle(own.row.querySelector('.bui-switch-name'), '::after').content.includes('待播放'), 'Pending status remains visible');
    own.row.dataset.status = 'error';
    check(getComputedStyle(own.row.querySelector('.bui-switch-name'), '::after').content.includes('無法啟用'), 'Error status remains visible');
    return checks;
  } finally {
    fixture.remove(); style.remove();
    currentStyle.textContent = previousCss;
  }
}
