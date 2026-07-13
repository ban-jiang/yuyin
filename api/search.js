const demoCandidates = [
  { id: 'su-shi-ding-feng-bo', author: '苏轼', dynasty: '宋', title: '定风波·莫听穿林打叶声', reason: '在风雨中保持旷达与自持', sourceStatus: 'demo', lines: ['莫听穿林打叶声，何妨吟啸且徐行。', '竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。', '料峭春风吹酒醒，微冷，山头斜照却相迎。', '回首向来萧瑟处，归去，也无风雨也无晴。', '何妨吟啸且徐行。', '一蓑烟雨任平生。', '山头斜照却相迎。'] },
  { id: 'xin-qi-ji-qing-yu-an', author: '辛弃疾', dynasty: '宋', title: '青玉案·元夕', reason: '灯火繁盛与孤独凝望相互映照', sourceStatus: 'demo', lines: ['东风夜放花千树，更吹落，星如雨。', '宝马雕车香满路。', '凤箫声动，玉壶光转，一夜鱼龙舞。', '蛾儿雪柳黄金缕，笑语盈盈暗香去。', '众里寻他千百度。', '蓦然回首，那人却在，灯火阑珊处。', '一夜鱼龙舞。'] },
  { id: 'li-bai-jiang-jin-jiu', author: '李白', dynasty: '唐', title: '将进酒', reason: '以奔涌节奏书写时间、生命与豪情', sourceStatus: 'demo', lines: ['君不见黄河之水天上来，奔流到海不复回。', '君不见高堂明镜悲白发，朝如青丝暮成雪。', '人生得意须尽欢，莫使金樽空对月。', '天生我材必有用，千金散尽还复来。', '烹羊宰牛且为乐，会须一饮三百杯。', '古来圣贤皆寂寞，惟有饮者留其名。', '与尔同销万古愁。'] }
];
const { checkRateLimit, fetchWithTimeout, getCache, setCache } = require('./_security.js');

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function validateCandidates(value) {
  if (!value || !Array.isArray(value.candidates)) throw new Error('Invalid candidate response');
  return value.candidates.slice(0, 8).map((item, index) => ({
    id: String(item.id || `candidate-${index}`),
    author: String(item.author || '佚名'),
    dynasty: String(item.dynasty || ''),
    genre: String(item.genre || '诗词'),
    title: String(item.title || '无题'),
    reason: String(item.reason || ''),
    sourceStatus: String(item.sourceStatus || 'model-unverified'),
    lines: Array.isArray(item.lines) ? item.lines.slice(0, 9).map(String) : []
  })).filter(item => item.lines.length > 0);
}

function requestedAuthor(query) {
  const known = ['屈原','司马迁','曹操','陶渊明','王勃','李白','杜甫','白居易','韩愈','柳宗元','刘禹锡','杜牧','李商隐','范仲淹','欧阳修','王安石','苏轼','苏辙','曾巩','周敦颐','司马光','辛弃疾','李清照','陆游','文天祥','关汉卿','马致远','归有光','张岱','纳兰性德','龚自珍','毛泽东'];
  return known.find(name => query.includes(name)) || '';
}

function requestedGenres(query) {
  const wantsProse = /古文|散文|文章|辞赋|赋/.test(query);
  const wantsVerse = /诗词|诗歌|诗和词|诗、词|诗与词/.test(query);
  return { wantsProse, wantsVerse, wantsBoth: wantsProse && wantsVerse };
}

async function searchWithDeepSeek(query) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const author = requestedAuthor(query);
  const genres = requestedGenres(query);
  if (!apiKey) return { candidates: author ? [] : demoCandidates, mode: 'demo', requestedAuthor: author || undefined };

  const response = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      response_format: { type: 'json_object' },
      temperature: 0.35,
      messages: [
        { role: 'system', content: '你是中国古代文学检索助手，范围包括诗、词、曲、赋、散文、序、记等古文。严格根据用户意图给出3-8个候选作品。重要规则:1) 严格保证作者归属准确，用户指定作者时全部候选必须是该作者本人作品。2) 用户明确同时要求诗词和古文时，两类都必须返回，至少各1篇；例如“苏轼的诗词和古文”应同时包含苏轼诗词与《赤壁赋》等可靠古文，不得只返回诗词。3) 严格使用真实原句，不得改写、拼接或伪造。4) 不确定时直接放弃，宁可少给。5) 每篇给5-9条连续或相关原句。只输出JSON对象，格式为{"candidates":[{"id":"slug","author":"作者","dynasty":"朝代","genre":"诗/词/曲/赋/古文/序/记","title":"篇名","reason":"推荐理由","sourceStatus":"model-unverified","lines":["准确原句"]}]}。' },
        { role: 'user', content: query }
      ]
    })
  });
  if (!response.ok) throw new Error(`DeepSeek returned ${response.status}`);
  const payload = await response.json();
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
  const candidates = validateCandidates(parsed);
  const filtered = author ? candidates.filter(item => item.author.normalize('NFC') === author) : candidates;
  if (genres.wantsBoth) {
    const hasProse = filtered.some(item => /古文|散文|赋|序|记/.test(item.genre));
    const hasVerse = filtered.some(item => /诗|词|曲/.test(item.genre));
    if (!hasProse || !hasVerse) throw new Error('模型未能同时返回诗词和古文，请重试');
  }
  return { candidates: filtered, mode: 'deepseek', requestedAuthor: author || undefined, requestedGenres: genres };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const retryAfter = checkRateLimit(req);
    if (retryAfter) return send(res, 429, { error: `请求过于频繁，请在 ${retryAfter} 秒后重试` });
    const raw = typeof req.body === 'string' ? req.body : '';
    const body = raw ? JSON.parse(raw) : (req.body || {});
    const query = String(body.query || '').trim();
    if (query.length < 2 || query.length > 200) return send(res, 400, { error: '请输入 2-200 个字符' });
    const cacheKey = `search:${query.normalize('NFC').toLowerCase()}`;
    const cached = getCache(cacheKey);
    if (cached) return send(res, 200, { ...cached, cached: true });
    const result = await searchWithDeepSeek(query);
    setCache(cacheKey, result);
    send(res, 200, result);
  } catch (error) {
    send(res, 502, { error: '候选生成失败，请稍后重试', detail: error.message });
  }
};
