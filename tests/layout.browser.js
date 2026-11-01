// Match the native bar plus Bewly screenshot/widescreen and theater buttons.
async function layoutTest(source) {
  const frame = document.createElement('iframe');
  frame.style.cssText='position:fixed;width:1600px;height:500px;left:-10000px;opacity:0;pointer-events:none';
  document.body.append(frame);
  const w=frame.contentWindow, d=frame.contentDocument, checks=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,300));
  const rect=e=>e.getBoundingClientRect();
  const close=(a,b)=>Math.abs(a-b)<.2;
  try {
    d.head.innerHTML=`<style>
      .bpx-player-container{width:668px;height:400px;position:relative;}
      .bpx-player-control-wrap{position:absolute;bottom:0;width:100%;height:55px;}
      .bpx-player-control-entity{height:35px;}
      .bpx-player-control-top{position:absolute;bottom:44px;height:10px;width:100%;}
      .bpx-player-control-bottom{display:flex;height:35px;margin-top:20px;padding:0 12px;box-sizing:border-box;}
      .bpx-player-control-bottom-left{display:flex;flex:1 1 0%;}
      .bpx-player-control-bottom-right{display:flex;justify-content:flex-end;}
      .bpx-player-ctrl-btn{width:36px;height:22px;position:relative;padding:0;border:0;box-sizing:border-box;}
      .bpx-player-ctrl-play{flex-shrink:0;}
      .bpx-player-ctrl-time{width:90px;min-width:90px;margin-right:10px;}
      .bpx-player-ctrl-viewpoint{width:0;min-width:45px;max-width:240px;flex:1 0 auto;margin:0 10px;}
      .bpx-player-ctrl-quality{width:72px;flex-shrink:0;margin-right:10px;}
      .bpx-player-ctrl-playbackrate{width:50px;}
      .bpx-player-ctrl-subtitle{width:28px;margin:0 5px;}
      .bili-yt-volume-rail{transition:none!important;}
    </style>`;
    const button=(name,extra='')=>`<button class="bpx-player-ctrl-btn ${name}" ${extra}>${name==='bpx-player-ctrl-quality'?'<span style="display:block;width:72px">1080P 高清</span>':''}</button>`;
    const root=d.createElement('div');root.className='bpx-player-container';
    root.innerHTML=`<video></video><div class="bpx-player-control-wrap"><div class="bpx-player-control-entity"><div class="bpx-player-control-top"></div><div class="bpx-player-control-bottom"><div class="bpx-player-control-bottom-left">${button('bpx-player-ctrl-play')}${button('bpx-player-ctrl-time')}<div class="bpx-player-ctrl-btn bpx-player-ctrl-viewpoint"><span class="bpx-player-ctrl-viewpoint-text">章節 · 分P的功能介紹</span><span>›</span></div></div><div class="bpx-player-control-bottom-right">${button('bpx-player-ctrl-quality')}${button('bpx-player-ctrl-playbackrate')}${button('bpx-player-ctrl-subtitle')}${button('bewly-video-screenshot-control')}${button('bpx-player-ctrl-setting')}${button('bpx-player-ctrl-pip')}${button('','style="display:flex;flex:0 0 36px"')}${button('bpx-player-ctrl-wide')}${button('bewly-widescreen-control')}${button('bpx-player-ctrl-web')}${button('bpx-player-ctrl-full')}${button('bpx-player-ctrl-volume')}</div></div></div></div>`;
    d.body.append(root);w.eval(source);
    await new Promise(resolve=>setTimeout(resolve,1100));
    const left=root.querySelector('.bpx-player-control-bottom-left');
    const right=root.querySelector('.bpx-player-control-bottom-right');
    const input=root.querySelector('.bili-yt-volume-input');
    const rail=root.querySelector('.bili-yt-volume-rail');
    const chapter=root.querySelector('.bpx-player-ctrl-viewpoint');
    const nodes=[...right.children];let clicks=0;
    nodes.forEach(node=>node.addEventListener('click',()=>clicks++));
    const fits=()=>{
      const children=[...left.children,...right.children];
      return children.every(e=>rect(e).left>=rect(root).left+11.9 && rect(e).right<=rect(root).right-11.9)
        && children.slice(1).every((e,i)=>rect(children[i]).right<=rect(e).left+.1);
    };
    input.focus();await settle();
    check(fits(),'668px themed bar keeps all controls inside without overlap');
    check(close(rect(left).y,rect(right).y),'668px themed bar stays on one row');
    check(rect(rail).width>=80,`668px expanded rail retains at least 80px (actual ${rect(rail).width})`);
    check(nodes.every(e=>rect(e).width>=28),'Compact buttons retain 28px hit widths');
    check(close(rect(chapter).width,28),'Chapter uses one icon instead of a long label');
    const label=chapter.querySelector('.bpx-player-ctrl-viewpoint-text');
    check(label.textContent.includes('分P') && w.getComputedStyle(label).display!=='none','Compact chapter preserves accessible text');
    check(close(rect(root.querySelector('.bpx-player-control-wrap')).height,55),'Control and progress heights remain native');
    input.blur();await settle();
    check(fits() && close(rect(left).y,rect(right).y),'Collapsed volume keeps the same single-row layout');
    input.focus();await settle();
    check(fits(),'Reopening volume does not push settings out');
    for(const width of [720,800,801,906,1440]){
      root.style.width=width+'px';await settle();
      check(fits() && close(rect(left).y,rect(right).y),`${width}px keeps all controls on one row without overlap`);
    }
    check(close(rect(rail).width,132),'Wide player restores the full 132px rail');
    check(nodes.every(e=>e.parentElement===right),'All original control nodes survive resizing');
    check(nodes.slice(3).every(e=>close(rect(e).width,36)),'Wide player restores native button widths');
    check(w.getComputedStyle(label).position==='static','Wide player restores the chapter label');
    nodes.forEach(e=>e.click());
    check(clicks===nodes.length,'All existing themed control click handlers remain attached');
    return checks;
  } finally { frame.remove(); }
}
