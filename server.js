const http = require('http');
const fs = require('fs');
const path = require('path');
const lyricsApiHandler = require('./api/lyrics.js');

const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

const demoCandidates = {
  default: [
    { id: 'su-shi-ding-feng-bo', author: '苏轼', dynasty: '宋', title: '定风波·莫听穿林打叶声', reason: '在风雨中保持旷达与自持', sourceStatus: 'demo', lines: ['莫听穿林打叶声，何妨吟啸且徐行。', '竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。', '料峭春风吹酒醒，微冷，山头斜照却相迎。', '回首向来萧瑟处，归去，也无风雨也无晴。', '何妨吟啸且徐行。', '一蓑烟雨任平生。', '山头斜照却相迎。'] },
    { id: 'xin-qi-ji-qing-yu-an', author: '辛弃疾', dynasty: '宋', title: '青玉案·元夕', reason: '灯火繁盛与孤独凝望相互映照', sourceStatus: 'demo', lines: ['东风夜放花千树，更吹落，星如雨。', '宝马雕车香满路。', '凤箫声动，玉壶光转，一夜鱼龙舞。', '蛾儿雪柳黄金缕，笑语盈盈暗香去。', '众里寻他千百度。', '蓦然回首，那人却在，灯火阑珊处。', '一夜鱼龙舞。'] },
    { id: 'li-bai-jiang-jin-jiu', author: '李白', dynasty: '唐', title: '将进酒', reason: '以奔涌节奏书写时间、生命与豪情', sourceStatus: 'demo', lines: ['君不见黄河之水天上来，奔流到海不复回。', '君不见高堂明镜悲白发，朝如青丝暮成雪。', '人生得意须尽欢，莫使金樽空对月。', '天生我材必有用，千金散尽还复来。', '烹羊宰牛且为乐，会须一饮三百杯。', '古来圣贤皆寂寞，惟有饮者留其名。', '与尔同销万古愁。'] }
  ]
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 20000) reject(new Error('Request too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function validateCandidates(value) {
  if (!value || !Array.isArray(value.candidates)) throw new Error('Invalid candidate response');
  return value.candidates.slice(0, 8).map((item, index) => ({
    id: String(item.id || `candidate-${index}`),
    author: String(item.author || '佚名'),
    dynasty: String(item.dynasty || ''),
    title: String(item.title || '无题'),
    reason: String(item.reason || ''),
    sourceStatus: String(item.sourceStatus || 'model-unverified'),
    lines: Array.isArray(item.lines) ? item.lines.slice(0, 9).map(String) : []
  })).filter(item => item.lines.length > 0);
}

function requestedAuthor(query) {
  const known = ['杜甫','李白','苏轼','辛弃疾','毛泽东','王安石','白居易','李清照','陆游','陶渊明','曹操','纳兰性德'];
  return known.find(name => query.includes(name)) || '';
}

async function searchWithDeepSeek(query) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const author = requestedAuthor(query);
  if (!apiKey) return { candidates: author ? [] : demoCandidates.default, mode: 'demo', requestedAuthor: author || undefined };

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      response_format: { type: 'json_object' },
      temperature: 0.35,
      messages: [
        { role: 'system', content: '你是古典诗词检索助手。严格根据用户意图给出3-6个候选作品。重要规则:1) 严格保证作者归属准确,绝不混淆作者;如用户问"王安石的诗",候选必须全部为王安石本人作品,不得混入其他朝代作者(如毛泽东、辛弃疾等)。2) 严格使用作品真实原句,不得改写、拼接或伪造。3) 不确定的作者/作品请直接放弃,宁可少给候选。4) 每篇优先给5-7条连续或相关原句。只输出JSON对象,格式为{"candidates":[{"id":"slug","author":"作者","dynasty":"朝代","title":"篇名","reason":"推荐理由","sourceStatus":"model-unverified","lines":["准确原句"]}]}。' },
        { role: 'user', content: query }
      ]
    })
  });
  if (!response.ok) throw new Error(`DeepSeek returned ${response.status}`);
  const payload = await response.json();
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
  const candidates = validateCandidates(parsed);
  const filtered = author ? candidates.filter(item => item.author.normalize('NFC') === author) : candidates;
  return { candidates: filtered, mode: 'deepseek', requestedAuthor: author || undefined };
}

function demoCurate(works) {
  const quotes = [];
  let cursor = 0;
  while (quotes.length < 7 && works.some(work => cursor < work.lines.length)) {
    works.forEach(work => {
      if (quotes.length < 7 && work.lines[cursor]) quotes.push({ text: work.lines[cursor], source: `${work.author}《${work.title}》` });
    });
    cursor += 1;
  }
  const joined = quotes.map(item => item.text).join('');
  const themeChar = (joined.match(/[月江山风雨云花雪酒剑舟灯]/) || ['诗'])[0];
  return { quotes, themeChar, mode: 'demo' };
}

function ensureQuoteCount(quotes, works) {
  const result = quotes.slice(0, 9);
  const seen = new Set(result.map(item => String(item.text).normalize('NFC').replace(/\s+/g, '')));
  for (const work of works) {
    for (const line of work.lines) {
      const key = String(line).normalize('NFC').replace(/\s+/g, '');
      if (result.length >= 7) return result;
      if (!key || seen.has(key)) continue;
      result.push({ text: String(line), source: `${work.author}《${work.title}》` });
      seen.add(key);
    }
  }
  return result;
}

async function curateWithDeepSeek(works) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return demoCurate(works);
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      response_format: { type: 'json_object' },
      temperature: 0.25,
      messages: [
        { role: 'system', content: '你是诗词卡片内容策展人。用户已经选择多篇作品。请从每篇作品给出的原句中均衡选择，总计7-9句；不得改写、拼接或新增原文。只输出JSON：{"quotes":[{"text":"原句","source":"作者《篇名》"}],"themeChar":"一个主题汉字"}。至少照顾到每篇被选作品。' },
        { role: 'user', content: JSON.stringify(works) }
      ]
    })
  });
  if (!response.ok) throw new Error(`DeepSeek returned ${response.status}`);
  const payload = await response.json();
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
  if (!Array.isArray(parsed.quotes)) throw new Error('Invalid curate response');
  const normalize = s => String(s).normalize('NFC').replace(/\s+/g, '').replace(/[，。！？、；：""''《》（）·\u3000]/g, '');
  const allowed = new Set(works.flatMap(work => work.lines.map(normalize)));
  const rawQuotes = parsed.quotes
    .slice(0, 9)
    .map(item => ({ text: String(item.text || '').trim(), source: String(item.source || '') }));
  const verified = rawQuotes.filter(item => allowed.has(normalize(item.text)));
  // If strict match fails, fall back to returning all AI quotes (AI was instructed to use only given lines)
  const quotes = ensureQuoteCount(verified.length ? verified : rawQuotes, works);
  if (!verified.length) console.warn('Curate: no exact line matches, using AI output as-is. Quotes:', quotes.length);
  return { quotes, themeChar: String(parsed.themeChar || '诗').slice(0, 1), mode: 'deepseek' };
}

async function handleApi(req, res) {
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || '{}');
    const query = String(body.query || '').trim();
    if (query.length < 2 || query.length > 200) return send(res, 400, { error: '请输入 2-200 个字符' });
    const result = await searchWithDeepSeek(query);
    send(res, 200, result);
  } catch (error) {
    send(res, 502, { error: '候选生成失败，请稍后重试', detail: error.message });
  }
}

async function handleCurate(req, res) {
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || '{}');
    const works = Array.isArray(body.works) ? body.works.slice(0, 6).map(work => ({
      author: String(work.author || '佚名'), title: String(work.title || '无题'),
      lines: Array.isArray(work.lines) ? work.lines.slice(0, 9).map(String) : []
    })).filter(work => work.lines.length) : [];
    if (!works.length) return send(res, 400, { error: '请至少选择一篇作品' });
    send(res, 200, await curateWithDeepSeek(works));
  } catch (error) {
    send(res, 502, { error: '选句生成失败，请稍后重试', detail: error.message });
  }
}

async function handleLyrics(req, res) {
  try {
    req.body = await readBody(req);
    await lyricsApiHandler(req, res);
  } catch (error) {
    send(res, 502, { error: '歌词摘句失败，请稍后重试', detail: error.message });
  }
}

function serveStatic(req, res) {
  const requestPath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.resolve(ROOT, `.${requestPath}`);
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  fs.readFile(filePath, (error, data) => {
    if (error) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const ext = path.extname(filePath);
    const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : 'application/octet-stream';
    send(res, 200, data, type);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/search') return handleApi(req, res);
  if (req.method === 'POST' && req.url === '/api/curate') return handleCurate(req, res);
  if (req.method === 'POST' && req.url === '/api/lyrics') return handleLyrics(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  send(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, HOST, () => {
  console.log(`余音运行于 http://127.0.0.1:${PORT}`);
  console.log(process.env.DEEPSEEK_API_KEY ? 'DeepSeek 已启用' : '未配置 DEEPSEEK_API_KEY，当前为演示模式');
});
