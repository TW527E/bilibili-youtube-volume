// Reproduce collection navigation arriving after volume has already mounted.
async function collectionTest(source) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:950px;height:200px;left:-10000px;opacity:0;pointer-events:none';
  document.body.append(frame);
  const w = frame.contentWindow, d = frame.contentDocument;
  const checks = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  const settle = () => new Promise(resolve => setTimeout(resolve, 1100));
  try {
    d.head.innerHTML = `<style>
      .bpx-player-container { width:668px; padding:12px; box-sizing:border-box; }
      .bpx-player-control-bottom { display:flex; justify-content:space-between; }
      .bpx-player-control-bottom-left, .bpx-player-control-bottom-right { display:flex; }
      .bpx-player-ctrl-btn { width:36px; height:22px; position:relative; }
      .bpx-player-ctrl-time { width:90px; margin-right:10px; }
      .bpx-player-control-bottom-right { width:348px; flex-shrink:0; }
      .bili-yt-volume-rail { transition:none!important; }
    </style>`;
    w.eval(source);
    const root = d.createElement('div'); root.className = 'bpx-player-container';
    const controls = `<video></video><div class="bpx-player-control-bottom"><div class="bpx-player-control-bottom-left"><div class="bpx-player-ctrl-btn bpx-player-ctrl-play"></div><div class="bpx-player-ctrl-btn bpx-player-ctrl-time"></div></div><div class="bpx-player-control-bottom-right"><div class="bpx-player-ctrl-btn bpx-player-ctrl-volume"></div></div></div>`;
    root.innerHTML = controls; d.body.append(root); await settle();
    const left = root.querySelector('.bpx-player-control-bottom-left');
    let group = root.querySelector('.bili-yt-volume'), input = group.querySelector('input');
    const time = left.querySelector('.bpx-player-ctrl-time');
    const next = d.createElement('button'); next.className = 'bpx-player-ctrl-btn bpx-player-ctrl-next';
    let nextClicks = 0; next.addEventListener('click', () => nextClicks++);
    left.insertBefore(next, time); await settle();
    check(next.nextElementSibling === group && group.nextElementSibling === time, 'Late next button stays before volume and time');
    input.focus(); await settle();
    const rect = element => element.getBoundingClientRect();
    const close = (a,b) => Math.abs(a-b) < .2;
    check(close(rect(next).width,36), 'Narrow collection preserves next-button width');
    check(close(rect(left.querySelector('.bpx-player-ctrl-play')).width,36), 'Narrow collection preserves play-button width');
    check(rect(next).right <= rect(group).left + .1, 'Expanded volume does not overlap next');
    let rail = group.querySelector('.bili-yt-volume-rail');
    check(rect(rail).width > 24 && rect(rail).width < 132, `Narrow collection shortens the rail to available space (rail=${rect(rail).width}, left=${rect(left).width}, group=${rect(group).width}, focus=${input.matches(':focus')})`);
    check(rect(input).left >= rect(rail).left && rect(input).right <= rect(rail).right, 'Shortened input remains inside the visible rail');
    check(close(parseFloat(w.getComputedStyle(rail,'::before').width),rect(rail).width-24), 'Shortened track uses the full actual input travel');
    const video = root.querySelector('video'); video.volume=.125;
    next.click();
    check(nextClicks===1 && video.volume===.125 && next.parentElement===left, 'Original next node and click listener remain functional');
    input.value='100'; input.dispatchEvent(new w.Event('input'));
    check(video.volume===1, 'Shortened slider still reaches full volume');
    input.value='0'; input.dispatchEvent(new w.Event('input'));
    check(video.volume===0, 'Shortened slider still reaches zero');
    const prev = d.createElement('button'); prev.className='bpx-player-ctrl-btn bpx-player-ctrl-prev';
    left.prepend(prev); await settle(); input.focus(); await settle();
    check(prev.nextElementSibling.classList.contains('bpx-player-ctrl-play') && next.nextElementSibling===group, 'Late previous and next buttons retain native order');
    check(close(rect(prev).width,36) && close(rect(next).width,36), 'Both collection navigation buttons keep full width');
    check(rect(left).right <= rect(root.querySelector('.bpx-player-control-bottom-right')).left + .1, 'Collection controls do not overlap right-side controls');
    root.style.width='900px'; await settle();
    check(close(rect(rail).width,132), 'Wide player restores the full rail');
    next.remove(); prev.remove(); root.style.width='668px'; await settle();
    check(left.firstElementChild.nextElementSibling===group && group.nextElementSibling===time, 'Ordinary video keeps volume after play');
    root.innerHTML=controls;
    const rebuiltLeft=root.querySelector('.bpx-player-control-bottom-left');
    const rebuiltNext=next.cloneNode(true);
    rebuiltLeft.insertBefore(rebuiltNext,rebuiltLeft.querySelector('.bpx-player-ctrl-time'));
    await settle();
    group=root.querySelector('.bili-yt-volume'); input=group.querySelector('input');
    check(root.querySelectorAll('.bili-yt-volume').length===1 && rebuiltNext.nextElementSibling===group, 'Rebuilt collection mounts one volume control after next');
    input.focus(); await settle();
    check(close(rect(rebuiltNext).width,36) && rect(rebuiltNext).right<=rect(group).left+.1, 'Rebuilt collection keeps next unobstructed');
    const chapter = d.createElement('div');
    chapter.className='bpx-player-ctrl-btn bpx-player-ctrl-viewpoint';
    chapter.style.cssText='width:210px;min-width:0';
    rebuiltLeft.append(chapter); await settle();
    check(close(rect(chapter).width,28), 'Narrow chapter control uses a compact icon');
    check(rect(chapter).right<=rect(root.querySelector('.bpx-player-control-bottom-right')).left+.1 && close(rect(rebuiltNext).width,36), 'Chapter and navigation controls fit without overlap');
    return checks;
  } finally { frame.remove(); }
}
