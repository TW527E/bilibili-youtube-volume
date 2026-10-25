// Run selfTest(userscriptSource) in a browser; tests use an isolated iframe.
async function selfTest(source) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.append(frame);
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  const passed = [];
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    passed.push(name);
  };
  const settle = () => new Promise(resolve => setTimeout(resolve, 1100));
  const controls = `<div class="bpx-player-control-bottom-left"><button>Play</button><div class="bpx-player-ctrl-time">0:00</div></div><div class="bpx-player-control-bottom-right"><div class="bpx-player-ctrl-volume" tabindex="0"><span>Mute</span><div class="bpx-player-ctrl-volume-box">Native slider</div></div></div>`;
  try {
    win.eval(source);
    win.eval(source);
    check(doc.querySelectorAll('#bili-yt-volume-style').length === 1, 'Repeated injection is harmless');
    const root = doc.createElement('div');
    root.className = 'bpx-player-container';
    root.innerHTML = '<video></video>' + controls;
    let video = root.querySelector('video');
    video.volume = 0.125;
    const originalButton = root.querySelector('.bpx-player-ctrl-volume');
    let nativeWheels = 0, playerWheels = 0;
    originalButton.addEventListener('wheel', () => nativeWheels++);
    root.addEventListener('wheel', () => playerWheels++);
    originalButton.addEventListener('click', () => {
      video.volume = video.muted || Math.round(video.volume * 100) === 0 ? 0.6 : 0;
      video.muted = false;
    });
    doc.body.append(root);
    await settle();
    let group = root.querySelector('.bili-yt-volume');
    let input = group?.querySelector('input');
    check(!!group, 'Late player mounts automatically');
    check(group.nextElementSibling.className === 'bpx-player-ctrl-time', 'Volume is before time');
    check(group.firstElementChild === originalButton, 'Original mute button is preserved');
    check(input.value === '50' && video.volume === 0.125, 'Initial gain maps to perceptual position without changing audio');
    check(win.getComputedStyle(originalButton.querySelector('.bpx-player-ctrl-volume-box')).display === 'none', 'Vertical popup is hidden');
    input.value = '50';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    check(video.volume === 0.125, 'Midpoint gives 12.5% gain');
    let previous = -1;
    const wheel = (target, deltaY, extra = {}) => {
      const event = new win.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, ...extra });
      target.dispatchEvent(event);
      return event;
    };
    let event = wheel(originalButton, -100);
    check(input.value === '55' && Math.abs(video.volume - .55 ** 3) < 1e-12, 'Wheel up on speaker uses five perceptual points');
    check(event.defaultPrevented && nativeWheels === 0 && playerWheels === 0, 'Volume wheel prevents page scroll and native double adjustment');
    wheel(input, 100);
    check(input.value === '50' && video.volume === .125, 'Wheel down on slider uses the same curve');
    wheel(originalButton.querySelector('span'), -3, { deltaMode: 1 });
    check(input.value === '55', 'Line-mode wheel on nested speaker content works');
    wheel(input, 1, { deltaMode: 2 });
    check(input.value === '50', 'Page-mode wheel has the same bounded step');
    for (const extra of [{ctrlKey:true}, {shiftKey:true}, {deltaX:200}]) {
      event = wheel(input, 100, extra);
      check(!event.defaultPrevented && input.value === '50', 'Zoom or horizontal wheel remains available: ' + JSON.stringify(extra));
    }
    event = wheel(input, 0);
    check(!event.defaultPrevented && input.value === '50', 'Zero vertical delta does nothing');
    event = wheel(root.querySelector('.bpx-player-ctrl-time'), 100);
    check(!event.defaultPrevented && input.value === '50', 'Wheel outside volume controls remains untouched');
    input.value = '98'; input.dispatchEvent(new win.Event('input'));
    wheel(input, -100); event = wheel(input, -100);
    check(video.volume === 1 && input.value === '100' && event.defaultPrevented, 'Maximum clamps and still blocks page scroll');
    input.value = '2'; input.dispatchEvent(new win.Event('input'));
    wheel(originalButton, 100); event = wheel(originalButton, 100);
    check(video.volume === 0 && input.value === '0' && event.defaultPrevented, 'Minimum clamps without scrolling the page');
    input.value = '30'; input.dispatchEvent(new win.Event('input'));
    video.muted = true;
    wheel(input, 100);
    check(video.muted && input.value === '0', 'Downward wheel does not unmute');
    originalButton.click();
    check(!video.muted && Math.abs(video.volume - .027) < 1e-12, 'Muted downward wheel preserves the volume restored by the speaker');
    video.muted = true;
    wheel(originalButton, -100);
    check(!video.muted && input.value === '5' && Math.abs(video.volume - .05 ** 3) < 1e-12, 'Upward wheel from mute starts at five perceptual points');
    input.value = '0'; input.dispatchEvent(new win.Event('input'));
    for (let i = 0; i < 10; i++) wheel(originalButton, -100);
    check(input.value === '50' && video.volume === .125, 'Rapid wheel events accumulate exactly once each');
    video.remove();
    event = wheel(input, -100);
    check(!event.defaultPrevented && input.disabled, 'Missing media does not trap wheel scrolling');
    root.prepend(video);
    for (let position = 0; position <= 100; position++) {
      input.value = String(position);
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
      const gain = video.volume;
      check(gain >= 0 && gain <= 1 && gain > previous && Number(input.value) === position,
        `Curve is bounded, increasing and reversible at ${position}%`);
      previous = gain;
    }
    check(video.volume === 1, 'Maximum remains full volume');
    input.value = '10';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    check(Math.abs(video.volume - 0.001) < 1e-12 && input.value === '10', 'Low gain does not round to mute');
    originalButton.click();
    await settle();
    check(video.muted && group.dataset.muted === 'true', 'Very low gain can be muted');
    originalButton.click();
    await settle();
    check(!video.muted && Math.abs(video.volume - 0.001) < 1e-12 && input.value === '10' && group.dataset.muted === 'false',
      'Unmuting restores exact low gain rather than native rounded memory');
    input.value = '0';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    originalButton.click();
    await settle();
    check(!video.muted && Math.abs(video.volume - 0.001) < 1e-12 && input.value === '10',
      'Unmuting after dragging to zero also restores fine gain');
    originalButton.click();
    await settle();
    check(input.value === '0', 'Native mute updates the slider');
    input.value = '75';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    check(!video.muted && video.volume === 0.421875, 'Raising the slider unmutes with the curve');
    video.volume = 0.008;
    await settle();
    check(input.value === '20', 'External low volume uses the inverse curve');
    const replacement = doc.createElement('video');
    replacement.volume = 0.064;
    video.replaceWith(replacement);
    video = replacement;
    await settle();
    check(input.value === '40', 'Media replacement synchronizes');
    wheel(input, -100);
    check(input.value === '45' && Math.abs(video.volume - .45 ** 3) < 1e-12, 'Wheel follows replacement media');
    root.innerHTML = '<video></video>' + controls;
    await settle();
    group = root.querySelector('.bili-yt-volume');
    check(root.querySelectorAll('.bili-yt-volume').length === 1, 'Control rebuild produces one slider');
    input = group.querySelector('input');
    input.value = '0';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    check(root.querySelector('video').volume === 0, 'Rebuilt slider controls new media');
    wheel(group.firstElementChild, -100);
    check(input.value === '5' && Math.abs(root.querySelector('video').volume - .05 ** 3) < 1e-12, 'Rebuilt controls receive one wheel handler');
    input.value = '0'; input.dispatchEvent(new win.Event('input'));
    const second = doc.createElement('div');
    second.className = 'bpx-player-container';
    second.innerHTML = '<video></video>' + controls;
    doc.body.append(second);
    await settle();
    second.querySelector('video').volume = 0.027;
    await settle();
    check(second.querySelector('input').value === '30' && input.value === '0', 'Multiple players stay independent');
    wheel(second.querySelector('.bili-yt-volume-input'), -100);
    check(second.querySelector('input').value === '35' && input.value === '0', 'Wheel only changes its own player');
    return passed;
  } finally {
    frame.remove();
  }
}
