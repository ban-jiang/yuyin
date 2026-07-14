  const discovery=document.querySelector('#discovery');
  const searchView=document.querySelector('#searchView');
  const chooseView=document.querySelector('#chooseView');
  const searchResults=document.querySelector('#searchResults');
  const poetryQuery=document.querySelector('#poetryQuery');
  const searchBtn=document.querySelector('#searchBtn');
  let currentCandidates=[];

  const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sourceBadge=item=>item.sourceStatus==='poetry-api'
    ? `<span class="source-badge verified">诗泉原文 · ${Number(item.sourceLineCount||item.lines?.length||0)} 句</span>`
    : item.sourceStatus==='model-unverified'?'<span class="source-badge unverified">AI 候选 · 原文待核验</span>':'';
  function createCustomCard({quotes,name,meta,ghost,seal,workName}){
    const limited=quotes.map(line=>String(line).trim()).filter(Boolean).slice(0,9);
    if(!limited.length)return;
    currentWorkId=makeWorkId();
    customLayouts={};
    poster.dataset.freeLayout='false';
    delete poster.dataset.freeLayoutPending;
    clearFreeLayoutStyles();
    collections.custom={name,meta,ghost,seal:seal||ghost,quotes:limited};
    customDefaultQuotes=[...limited];
    selectedQuoteIndex=-1;
    quoteNodes().forEach(quote=>{delete quote.dataset.tone;delete quote.dataset.scale;delete quote.dataset.weight});
    poster.dataset.density=limited.length>7?'dense':limited.length>5?'balanced':'loose';
    setCollection('custom');
    collectionSection.hidden=true;
    currentWorkSection.hidden=false;
    quoteEditSection.hidden=false;
    currentWorkSection.querySelector('#currentWorkName').textContent=workName||name;
    editHistory=[];
    document.querySelector('#undoQuoteEdit').disabled=true;
    discovery.hidden=true;
    saveDraft();
  }
  function renderCandidates(candidates,mode,requestedAuthor){
    currentCandidates=candidates;
    if(!candidates.length){searchResults.innerHTML=`${requestedAuthor?`<div class="intent-lock">当前限定作者：${escapeHtml(requestedAuthor)}</div>`:''}<div class="search-state">没有找到可靠候选。系统不会用其他作者的作品代替，请换一种描述或稍后重试。</div>`;return}
    const selected=new Set();
    const updateBar=()=>{
      const count=selected.size;
      const barSpan=searchResults.querySelector('.multi-select-bar span');
      if(barSpan)barSpan.textContent=count?`已选择 ${count} 篇`:'请至少选择一篇诗词';
      searchResults.querySelectorAll('.selection-mode-actions button').forEach(button=>button.disabled=count===0);
    };
    const doCurate=async()=>{
      if(!selected.size)return;
      const works=[...selected].map(i=>currentCandidates[i]);
      chooseView.innerHTML='<div class="search-state">正在从所选诗词中策展句子……</div>';
      searchView.hidden=true;chooseView.hidden=false;
      try{
        const result=await window.YuyinApi.curatePoetry(works.map(w=>({author:w.author,title:w.title,lines:w.lines})));
        showCurateView(result.quotes||[],result.themeChar||'诗',result.mode||'demo',works);
      }catch(error){
        chooseView.innerHTML=`<div class="search-state">${escapeHtml(error.message)}</div>`;
      }
    };
    const verifiedCount=candidates.filter(item=>item.sourceStatus==='poetry-api').length;
    searchResults.innerHTML=`${requestedAuthor?`<div class="intent-lock">当前限定作者：${escapeHtml(requestedAuthor)}，其他作者的候选会被自动过滤。</div>`:''}<div class="result-head"><h3>勾选作品</h3><span>${verifiedCount?`${verifiedCount} 篇已匹配诗泉完整原文 · 其余候选待核验`:mode==='demo'?'演示数据 · 配置 DeepSeek 后启用实时搜索':'AI 候选 · 原文请在发布前核验'}</span></div><div class="candidate-grid">${candidates.map((item,index)=>`<label class="candidate" data-candidate="${index}"><input type="checkbox" class="candidate-check" value="${index}">${sourceBadge(item)}<small>${escapeHtml(item.dynasty)} · ${escapeHtml(item.author)} · ${escapeHtml(item.genre||'诗词')}</small><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.reason)}</p><div class="line-preview">${escapeHtml(item.lines[0]||'')}</div></label>`).join('')}</div><div class="multi-select-bar"><span>请至少选择一篇作品</span><div class="selection-mode-actions"><button class="primary" disabled id="aiSelectBtn">AI 帮选</button><button disabled id="manualSelectBtn">自己选句</button></div></div>`;
    searchResults.querySelectorAll('.candidate input[type="checkbox"]').forEach(cb=>{
      cb.onchange=()=>{
        const index=Number(cb.value);
        cb.checked?selected.add(index):selected.delete(index);
        cb.closest('.candidate').classList.toggle('selected',cb.checked);
        updateBar();
      };
    });
    searchResults.querySelector('#aiSelectBtn').onclick=doCurate;
    searchResults.querySelector('#manualSelectBtn').onclick=()=>showManualSelectView([...selected].map(i=>currentCandidates[i]));
    searchResults.querySelectorAll('.candidate').forEach(label=>{
      label.addEventListener('click',function(e){if(e.target.tagName==='INPUT')return;e.preventDefault();const cb=this.querySelector('input[type="checkbox"]');cb.checked=!cb.checked;cb.dispatchEvent(new Event('change'))});
    });
  }
  function showManualSelectView(works){
    if(!works.length)return;
    const authorNames=[...new Set(works.map(work=>work.author))].join('·');
    const workNames=works.map(work=>`《${work.title}》`).join('、');
    const groups=works.map((work,workIndex)=>{
      const seen=new Set();
      const lines=(work.lines||[]).map(line=>String(line).trim()).filter(line=>line&&!seen.has(line)&&seen.add(line));
      return {work,lines:lines.map((text,lineIndex)=>({id:`${workIndex}-${lineIndex}`,text,source:`${work.author}《${work.title}》`}))};
    });
    const selectedLines=[];
    const verifiedWorks=works.filter(work=>work.sourceStatus==='poetry-api').length;
    chooseView.innerHTML=`<div class="chooser"><aside><button class="example" id="backToResults">← 返回候选</button><h3>${escapeHtml(authorNames)}</h3><div class="chooser-meta">${escapeHtml(workNames)}<br><br>请选择 4–9 句<br>推荐选择 7 句<br><br>${verifiedWorks?`${verifiedWorks} 篇来自诗泉完整原文`:'当前为 AI 候选句，请核验原文'}</div></aside><div><div class="result-head"><h3>全文自选</h3><span id="manualCount">已选择 0 句 · 至少还需 4 句</span></div><div class="curate-rule">已匹配诗泉的作品会展示完整原文；未匹配的古文或作品暂时展示 AI 候选。普通模板展示前 7 句，“字阵残章”最多展示 9 句。</div><div class="manual-filter"><input id="manualLineSearch" type="search" placeholder="在原文中搜索关键词" autocomplete="off"><button type="button" id="manualSelectedOnly">只看已选</button></div><div class="manual-groups">${groups.map(group=>`<details class="manual-work" open><summary><span>${escapeHtml(group.work.author)} · 《${escapeHtml(group.work.title)}》</span><small class="${group.work.sourceStatus==='poetry-api'?'verified':'unverified'}">${group.work.sourceStatus==='poetry-api'?'诗泉完整原文':'AI候选待核验'} · ${group.lines.length} 句</small></summary><div class="manual-lines">${group.lines.map(line=>`<label class="manual-line"><input type="checkbox" data-line-id="${line.id}"><span>${escapeHtml(line.text)}</span></label>`).join('')}</div></details>`).join('')}</div><div class="manual-order" id="manualOrder"></div><div class="curate-actions"><button class="confirm" id="createManualCard" disabled>生成阅读卡</button></div></div></div>`;
    const allLines=groups.flatMap(group=>group.lines);
    const countLabel=chooseView.querySelector('#manualCount');
    const orderTray=chooseView.querySelector('#manualOrder');
    const createButton=chooseView.querySelector('#createManualCard');
    const searchInput=chooseView.querySelector('#manualLineSearch');
    const selectedOnlyButton=chooseView.querySelector('#manualSelectedOnly');
    let selectedOnly=false;
    const applyFilter=()=>{
      const query=searchInput.value.trim().normalize('NFKC').toLowerCase();
      chooseView.querySelectorAll('.manual-work').forEach(group=>{
        let visible=0;
        group.querySelectorAll('.manual-line').forEach(label=>{
          const matchesText=!query||label.textContent.normalize('NFKC').toLowerCase().includes(query);
          const matchesSelected=!selectedOnly||label.querySelector('input').checked;
          label.hidden=!(matchesText&&matchesSelected);
          if(!label.hidden)visible+=1;
        });
        group.hidden=visible===0;
      });
    };
    const refresh=()=>{
      const count=selectedLines.length;
      countLabel.textContent=count<4?`已选择 ${count} 句 · 至少还需 ${4-count} 句`:`已选择 ${count} 句${count===7?' · 推荐数量':count===9?' · 已达上限':''}`;
      createButton.disabled=count<4||count>9;
      chooseView.querySelectorAll('.manual-line input').forEach(input=>{input.disabled=count>=9&&!input.checked});
      orderTray.innerHTML=count?`<div class="result-head"><h3>卡片顺序</h3><span>第 8–9 句仅在“字阵残章”展示</span></div>${selectedLines.map((line,index)=>`<div class="manual-order-item"><span class="manual-order-index">${String(index+1).padStart(2,'0')}</span><span>${escapeHtml(line.text)}<br><small>—— ${escapeHtml(line.source)}</small></span><span class="manual-order-actions"><button type="button" data-move="up" data-index="${index}" ${index===0?'disabled':''} aria-label="上移">↑</button><button type="button" data-move="down" data-index="${index}" ${index===count-1?'disabled':''} aria-label="下移">↓</button></span></div>`).join('')}`:'';
      orderTray.querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>{
        const from=Number(button.dataset.index);
        const to=button.dataset.move==='up'?from-1:from+1;
        [selectedLines[from],selectedLines[to]]=[selectedLines[to],selectedLines[from]];
        refresh();
      });
      applyFilter();
    };
    chooseView.querySelectorAll('.manual-line input').forEach(input=>input.onchange=()=>{
      const line=allLines.find(item=>item.id===input.dataset.lineId);
      if(input.checked)selectedLines.push(line);
      else{
        const index=selectedLines.findIndex(item=>item.id===line.id);
        if(index>=0)selectedLines.splice(index,1);
      }
      refresh();
    });
    searchInput.oninput=applyFilter;
    selectedOnlyButton.onclick=()=>{selectedOnly=!selectedOnly;selectedOnlyButton.classList.toggle('active',selectedOnly);selectedOnlyButton.textContent=selectedOnly?'查看全部':'只看已选';applyFilter()};
    chooseView.querySelector('#backToResults').onclick=()=>{chooseView.hidden=true;searchView.hidden=false};
    createButton.onclick=()=>{
      if(selectedLines.length<4||selectedLines.length>9)return;
      const quotes=selectedLines.map(line=>line.text);
      const themeChar=(quotes.join('').match(/[\u3400-\u9fff]/)||['诗'])[0];
      createCustomCard({quotes,name:`${authorNames} 诗选`,meta:`${quotes.length} 条语录 · 用户自选`,ghost:themeChar,seal:themeChar,workName:`${authorNames} · ${workNames}`});
    };
    searchView.hidden=true;
    chooseView.hidden=false;
    refresh();
  }
  function showCurateView(quotes,themeChar,mode,works){
    const authorNames=[...new Set(works.map(w=>w.author))].join('·');
    const workNames=works.map(w=>`《${w.title}》`).join('、');
    const allVerified=works.every(work=>work.sourceStatus==='poetry-api');
    chooseView.innerHTML=`<div class="chooser"><aside><button class="example" id="backToResults">← 返回候选</button><h3>${escapeHtml(authorNames)}</h3><div class="chooser-meta">${escapeHtml(workNames)}<br><br>${mode==='demo'?'演示策展':allVerified?'AI 策展 · 选自诗泉原文':'AI 策展 · 原文请在发布前核验'}<br>共 ${quotes.length} 句</div></aside><div><div class="result-head"><h3>AI 策展结果</h3><span>可编辑后生成卡片</span></div><div class="curate-rule">普通模板展示前 7 句；“字阵残章”最多展示 9 句。切换模板不会删除句子。</div><div class="curate-list">${quotes.map((item,index)=>`<div class="curate-quote"><textarea data-index="${index}" readOnly>${escapeHtml(item.text)}</textarea><div class="curate-source">—— ${escapeHtml(item.source)}${index>=7?' · 仅字阵残章展示':''}</div></div>`).join('')}</div><div class="curate-actions"><button id="editCurated">编辑原文</button><button class="confirm" id="createCuratedCard">生成阅读卡</button></div></div></div>`;
    chooseView.querySelector('#backToResults').onclick=()=>{chooseView.hidden=true;searchView.hidden=false};
    chooseView.querySelector('#editCurated').onclick=()=>{const tas=chooseView.querySelectorAll('.curate-quote textarea');const toggling=!tas[0]?.readOnly;tas.forEach(t=>t.readOnly=toggling)};
    chooseView.querySelector('#createCuratedCard').onclick=()=>{
      const edited=[...chooseView.querySelectorAll('.curate-quote textarea')].map(t=>t.value.trim()).filter(Boolean);
      if(!edited.length){alert('请至少保留一句');return}
      const limited=edited.slice(0,9);
      createCustomCard({quotes:limited,name:`${authorNames} 诗选`,meta:`${limited.length} 条语录 · AI 策展`,ghost:themeChar,seal:themeChar.slice(0,2).split('').join('<br>'),workName:`${authorNames} · ${workNames}`});
    };
  }
  async function runSearch(query){
    searchBtn.disabled=true;searchResults.innerHTML='<div class="search-state">正在寻找诗词与作品……</div>';
    try{const result=await window.YuyinApi.searchPoetry(query);renderCandidates(result.candidates||[],result.mode,result.requestedAuthor)}catch(error){searchResults.innerHTML=`<div class="search-state">${escapeHtml(error.message)}。请确认使用 Node 服务启动，而不是直接打开 HTML。<br><button class="example" onclick="runSearch(poetryQuery.value.trim())">重新尝试</button></div>`}finally{searchBtn.disabled=false}
  }
  document.querySelector('#poetrySearch').onsubmit=event=>{event.preventDefault();const query=poetryQuery.value.trim();if(query.length>=2)runSearch(query)};
  document.querySelectorAll('.example').forEach(button=>button.onclick=()=>{poetryQuery.value=button.textContent;runSearch(button.textContent)});
  restoreLastButton.onclick=()=>{try{applyDraft(JSON.parse(localStorage.getItem(DRAFT_KEY)||'null'));editHistory=[];document.querySelector('#undoQuoteEdit').disabled=true}catch(error){localStorage.removeItem(DRAFT_KEY);restoreLastButton.hidden=true}};
  try{restoreLastButton.hidden=!localStorage.getItem(DRAFT_KEY)}catch(error){restoreLastButton.hidden=true}
  try{const previous=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(previous?.collection?.quotes?.length&&!readHistory().length){previous.id=previous.id||makeWorkId();previous.updatedAt=previous.updatedAt||Date.now();localStorage.setItem(DRAFT_KEY,JSON.stringify(previous));localStorage.setItem(HISTORY_KEY,JSON.stringify([previous]))}}catch(error){}
  renderHistory();
  const searchPanel=document.querySelector('.search-panel'),lyricEntry=document.querySelector('#lyricEntry'),lyricText=document.querySelector('#lyricText'),lyricConsent=document.querySelector('#lyricConsent'),lyricCandidates=document.querySelector('#lyricCandidates'),extractLyricLines=document.querySelector('#extractLyricLines'),createLyricCard=document.querySelector('#createLyricCard');
  function sourceLyricLines(){const seen=new Set();return lyricText.value.split(/\r?\n/).map(line=>line.trim()).filter(line=>{if(!line||seen.has(line))return false;seen.add(line);return true})}
  function selectedLyricLines(){return [...lyricCandidates.querySelectorAll('input:checked')].map(input=>input.value)}
  function refreshLyricSelection(){const count=selectedLyricLines().length;document.querySelector('#lyricCount').textContent=`已选择 ${count} 句 · 请选择 4-9 句`;createLyricCard.disabled=count<4||count>9;lyricCandidates.querySelectorAll('input:not(:checked)').forEach(input=>input.disabled=count>=9)}
  function resetLyricCandidates(){lyricCandidates.hidden=true;lyricCandidates.innerHTML='';createLyricCard.hidden=true;const count=sourceLyricLines().length;document.querySelector('#lyricCount').textContent=`${count} 行 · ${count<4?'至少需要 4 行':'可以让 AI 提取候选'}`;extractLyricLines.hidden=false;extractLyricLines.disabled=count<4||!lyricConsent.checked}
  document.querySelector('#openLyricEntry').onclick=()=>{searchPanel.hidden=true;searchResults.hidden=true;document.querySelector('#workHistory').hidden=true;lyricEntry.hidden=false;resetLyricCandidates()};
  document.querySelector('#closeLyricEntry').onclick=()=>{lyricEntry.hidden=true;searchPanel.hidden=false;searchResults.hidden=false;renderHistory()};
  lyricText.oninput=resetLyricCandidates;lyricConsent.onchange=resetLyricCandidates;
  extractLyricLines.onclick=async()=>{const source=sourceLyricLines();if(source.length<4||!lyricConsent.checked)return;extractLyricLines.disabled=true;extractLyricLines.textContent='正在提取…';try{const result=await window.YuyinApi.extractLyrics(source.join('\n'));const candidates=result.candidates||[];lyricCandidates.innerHTML=candidates.map((line,index)=>`<label class="lyric-option"><input type="checkbox" value="${escapeHtml(line)}" ${index<Math.min(7,candidates.length)?'checked':''}><span>${escapeHtml(line)}</span></label>`).join('');lyricCandidates.hidden=false;extractLyricLines.hidden=true;createLyricCard.hidden=false;lyricCandidates.querySelectorAll('input').forEach(input=>input.onchange=refreshLyricSelection);refreshLyricSelection()}catch(error){document.querySelector('#lyricCount').textContent=error.message;extractLyricLines.disabled=false}finally{extractLyricLines.textContent='AI提取候选句'}};
  createLyricCard.onclick=()=>{const lines=selectedLyricLines();if(lines.length<4||lines.length>9||!lyricConsent.checked)return;const title=document.querySelector('#lyricTitle').value.trim()||'未命名歌词';const author=document.querySelector('#lyricAuthor').value.trim()||'佚名';const themeChar=(lines.join('').match(/[\u3400-\u9fff]/)||['词'])[0];createCustomCard({quotes:lines,name:`${title} · ${author}`,meta:`${lines.length} 条歌词摘录 · 用户选择`,ghost:themeChar,seal:themeChar,workName:`${title} · ${author}`})};
