  const layoutQuoteGrid=poster.querySelector('.quote-grid');
  const freeLayoutButton=document.querySelector('#toggleFreeLayout');
  const resetFreeLayoutButton=document.querySelector('#resetFreeLayout');
  const layoutGuides={
    x:Object.assign(document.createElement('i'),{className:'layout-guide layout-guide-x'}),
    y:Object.assign(document.createElement('i'),{className:'layout-guide layout-guide-y'})
  };
  layoutQuoteGrid.append(layoutGuides.x,layoutGuides.y);
  let activePointerLayout=null,suppressLayoutClick=false,layoutContextVersion=0;

  function freeLayoutKey(){return `${poster.dataset.style||'editorial'}|${poster.dataset.composition||'a'}|${poster.dataset.format||'social'}`}
  function roundLayout(value){return Math.round(value*1000)/1000}
  function clearFreeLayoutStyles(){
    quoteNodes().forEach(quote=>{
      ['position','left','top','width','height','right','bottom','grid-area','touch-action'].forEach(property=>quote.style.removeProperty(property));
      quote.classList.remove('is-dragging','layout-rejected');
    });
    hideLayoutGuides();
  }
  function renderedLayout(){
    const gridRect=layoutQuoteGrid.getBoundingClientRect();
    if(!gridRect.width||!gridRect.height)return [];
    return quoteNodes().map(quote=>{
      if(quote.hidden||quote.offsetParent===null)return null;
      const rect=quote.getBoundingClientRect();
      return {
        x:roundLayout((rect.left-gridRect.left)/gridRect.width*100),
        y:roundLayout((rect.top-gridRect.top)/gridRect.height*100),
        w:roundLayout(rect.width/gridRect.width*100),
        h:roundLayout(rect.height/gridRect.height*100)
      };
    });
  }
  function inlineLayout(){
    return quoteNodes().map(quote=>{
      const x=parseFloat(quote.style.left),y=parseFloat(quote.style.top),w=parseFloat(quote.style.width),h=parseFloat(quote.style.height);
      return [x,y,w,h].every(Number.isFinite)?{x:roundLayout(x),y:roundLayout(y),w:roundLayout(w),h:roundLayout(h)}:null;
    });
  }
  function applyFreeLayout(layout){
    quoteNodes().forEach((quote,index)=>{
      const rect=layout?.[index];
      if(!rect||quote.hidden)return;
      quote.style.setProperty('position','absolute','important');
      quote.style.setProperty('grid-area','auto','important');
      quote.style.setProperty('left',`${rect.x}%`,'important');
      quote.style.setProperty('top',`${rect.y}%`,'important');
      quote.style.setProperty('width',`${rect.w}%`,'important');
      quote.style.setProperty('height',`${rect.h}%`,'important');
      quote.style.setProperty('right','auto','important');
      quote.style.setProperty('bottom','auto','important');
      quote.style.setProperty('touch-action','none','important');
    });
    scheduleFit();
  }
  function storeCurrentFreeLayout(){
    if(poster.dataset.freeLayout!=='true')return;
    const layout=inlineLayout();
    if(layout.some(Boolean))customLayouts[freeLayoutKey()]=layout;
  }
  function refreshFreeLayoutControls(){
    const enabled=poster.dataset.freeLayout==='true';
    freeLayoutButton.classList.toggle('active',enabled);
    freeLayoutButton.textContent=enabled?'关闭自由调整':'开启自由调整';
    resetFreeLayoutButton.disabled=!enabled;
    document.querySelector('#sentenceHelp').textContent=enabled?'拖拽句子移动；拖动右下角放缩。越界或与其他句子重叠时会自动退回。':'默认使用安全网格。开启自由调整后，可拖拽句子；拖动右下角可放缩，系统会阻止越界和明显重叠。';
  }
  function restoreFreeLayoutForCurrentContext(){
    const version=++layoutContextVersion;
    const enabled=poster.dataset.freeLayout==='true';
    poster.dataset.freeLayoutPending=String(enabled);
    poster.dataset.freeLayout='false';
    clearFreeLayoutStyles();
    refreshFreeLayoutControls();
    if(!enabled){delete poster.dataset.freeLayoutPending;return}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(version!==layoutContextVersion)return;
      const key=freeLayoutKey();
      const layout=customLayouts[key]||renderedLayout();
      customLayouts[key]=layout;
      poster.dataset.freeLayout='true';
      delete poster.dataset.freeLayoutPending;
      applyFreeLayout(layout);
      refreshFreeLayoutControls();
    }));
  }
  function switchFreeLayoutContext(){
    if(poster.dataset.freeLayout!=='true')return;
    storeCurrentFreeLayout();
    restoreFreeLayoutForCurrentContext();
  }
  function enableFreeLayout(){
    const version=++layoutContextVersion;
    delete poster.dataset.freeLayoutPending;
    poster.dataset.freeLayout='false';
    clearFreeLayoutStyles();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(version!==layoutContextVersion)return;
      const key=freeLayoutKey();
      const layout=customLayouts[key]||renderedLayout();
      customLayouts[key]=layout;
      poster.dataset.freeLayout='true';
      applyFreeLayout(layout);
      refreshFreeLayoutControls();
      saveDraft();
    }));
  }
  function disableFreeLayout(){
    ++layoutContextVersion;
    delete poster.dataset.freeLayoutPending;
    storeCurrentFreeLayout();
    poster.dataset.freeLayout='false';
    clearFreeLayoutStyles();
    selectedQuoteIndex=-1;
    refreshQuoteEditor();
    refreshFreeLayoutControls();
    scheduleFit();
    saveDraft();
  }
  function resetCurrentFreeLayout(){
    if(poster.dataset.freeLayout!=='true')return;
    pushHistory();
    delete customLayouts[freeLayoutKey()];
    const version=++layoutContextVersion;
    delete poster.dataset.freeLayoutPending;
    poster.dataset.freeLayout='false';
    clearFreeLayoutStyles();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(version!==layoutContextVersion)return;
      const layout=renderedLayout();
      customLayouts[freeLayoutKey()]=layout;
      poster.dataset.freeLayout='true';
      applyFreeLayout(layout);
      refreshFreeLayoutControls();
      saveDraft();
    }));
  }
  function hideLayoutGuides(){
    layoutGuides.x.hidden=true;
    layoutGuides.y.hidden=true;
  }
  function snapPosition(rect,index){
    const result={...rect,guideX:null,guideY:null};
    const centers=inlineLayout().map((item,itemIndex)=>item&&itemIndex!==index?{x:item.x+item.w/2,y:item.y+item.h/2}:null).filter(Boolean);
    const xTargets=[50,...centers.map(item=>item.x)];
    const yTargets=[50,...centers.map(item=>item.y)];
    const centerX=result.x+result.w/2,centerY=result.y+result.h/2;
    const nearX=xTargets.find(target=>Math.abs(target-centerX)<=1.15);
    const nearY=yTargets.find(target=>Math.abs(target-centerY)<=1.15);
    if(nearX!==undefined){result.x=nearX-result.w/2;result.guideX=nearX}
    if(nearY!==undefined){result.y=nearY-result.h/2;result.guideY=nearY}
    return result;
  }
  function showLayoutGuides(rect){
    layoutGuides.x.hidden=rect.guideX===null;
    layoutGuides.y.hidden=rect.guideY===null;
    if(rect.guideX!==null)layoutGuides.x.style.left=`${rect.guideX}%`;
    if(rect.guideY!==null)layoutGuides.y.style.top=`${rect.guideY}%`;
  }
  function setQuoteRect(quote,rect){
    quote.style.setProperty('left',`${roundLayout(rect.x)}%`,'important');
    quote.style.setProperty('top',`${roundLayout(rect.y)}%`,'important');
    quote.style.setProperty('width',`${roundLayout(rect.w)}%`,'important');
    quote.style.setProperty('height',`${roundLayout(rect.h)}%`,'important');
  }
  function overlapsAnother(index,rect){
    return inlineLayout().some((other,otherIndex)=>{
      if(!other||otherIndex===index||quoteNodes()[otherIndex].hidden)return false;
      const width=Math.max(0,Math.min(rect.x+rect.w,other.x+other.w)-Math.max(rect.x,other.x));
      const height=Math.max(0,Math.min(rect.y+rect.h,other.y+other.h)-Math.max(rect.y,other.y));
      const intersection=width*height;
      return intersection>Math.min(rect.w*rect.h,other.w*other.h)*0.01;
    });
  }
  function beginPointerLayout(event,quote){
    if(activeCollection!=='custom'||poster.dataset.freeLayout!=='true'||event.button>0)return;
    const index=quoteNodes().indexOf(quote);
    if(index<0||index>=visibleQuoteLimit())return;
    event.preventDefault();
    selectQuote(index);
    const quoteRect=quote.getBoundingClientRect();
    const start=inlineLayout()[index];
    if(!start)return;
    const resize=event.clientX>=quoteRect.right-26&&event.clientY>=quoteRect.bottom-26;
    activePointerLayout={pointerId:event.pointerId,index,quote,start,startScale:Number(quote.dataset.scale||1),startX:event.clientX,startY:event.clientY,mode:resize?'resize':'move',moved:false,historySaved:false};
    quote.classList.add('is-dragging');
    quote.setPointerCapture?.(event.pointerId);
  }
  function movePointerLayout(event){
    const state=activePointerLayout;
    if(!state||event.pointerId!==state.pointerId)return;
    event.preventDefault();
    const gridRect=layoutQuoteGrid.getBoundingClientRect();
    const dx=(event.clientX-state.startX)/gridRect.width*100;
    const dy=(event.clientY-state.startY)/gridRect.height*100;
    if(!state.moved&&Math.hypot(event.clientX-state.startX,event.clientY-state.startY)<3)return;
    if(!state.historySaved){pushHistory();state.historySaved=true}
    state.moved=true;
    let rect={...state.start};
    if(state.mode==='move'){
      rect.x=Math.max(0,Math.min(100-rect.w,rect.x+dx));
      rect.y=Math.max(0,Math.min(100-rect.h,rect.y+dy));
      rect=snapPosition(rect,state.index);
      rect.x=Math.max(0,Math.min(100-rect.w,rect.x));
      rect.y=Math.max(0,Math.min(100-rect.h,rect.y));
      showLayoutGuides(rect);
    }else{
      rect.w=Math.max(12,Math.min(100-rect.x,rect.w+dx));
      rect.h=Math.max(8,Math.min(100-rect.y,rect.h+dy));
      const sizeFactor=Math.sqrt((rect.w/state.start.w)*(rect.h/state.start.h));
      state.quote.dataset.scale=String(roundLayout(Math.max(.65,Math.min(1.6,state.startScale*sizeFactor))));
      hideLayoutGuides();
    }
    setQuoteRect(state.quote,rect);
    scheduleFit();
  }
  function finishPointerLayout(event){
    const state=activePointerLayout;
    if(!state||event.pointerId!==state.pointerId)return;
    state.quote.releasePointerCapture?.(event.pointerId);
    state.quote.classList.remove('is-dragging');
    hideLayoutGuides();
    if(state.moved){
      const rect=inlineLayout()[state.index];
      if(rect&&overlapsAnother(state.index,rect)){
        setQuoteRect(state.quote,state.start);
        if(state.mode==='resize')state.quote.dataset.scale=String(state.startScale);
        state.quote.classList.add('layout-rejected');
        setTimeout(()=>state.quote.classList.remove('layout-rejected'),420);
        scheduleFit();
      }
      storeCurrentFreeLayout();
      refreshQuoteEditor();
      saveDraft();
      suppressLayoutClick=true;
      setTimeout(()=>{suppressLayoutClick=false},0);
    }
    activePointerLayout=null;
  }

  freeLayoutButton.onclick=()=>{
    if(activeCollection!=='custom')return;
    pushHistory();
    poster.dataset.freeLayout==='true'?disableFreeLayout():enableFreeLayout();
  };
  resetFreeLayoutButton.onclick=resetCurrentFreeLayout;
  poster.addEventListener('pointerdown',event=>{const quote=event.target.closest('.quote');if(quote)beginPointerLayout(event,quote)});
  poster.addEventListener('pointermove',movePointerLayout);
  poster.addEventListener('pointerup',finishPointerLayout);
  poster.addEventListener('pointercancel',finishPointerLayout);
  poster.addEventListener('click',event=>{if(suppressLayoutClick){event.preventDefault();event.stopImmediatePropagation()}},true);
  refreshFreeLayoutControls();
