const { checkRateLimit, fetchWithTimeout } = require('./_security.js');

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
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
  const response = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      response_format: { type: 'json_object' },
      temperature: 0.25,
      messages: [
        { role: 'system', content: '你是中国古代文学卡片内容策展人。用户已经选择诗、词、曲或古文作品。请从每篇作品给出的原句中均衡选择，总计7-9句；用户混选诗词与古文时，两类都必须有句子入选。不得改写、拼接或新增原文。只输出JSON：{"quotes":[{"text":"原句","source":"作者《篇名》"}],"themeChar":"一个主题汉字"}。至少照顾到每篇被选作品。' },
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
  const quotes = ensureQuoteCount(verified.length ? verified : rawQuotes, works);
  return { quotes, themeChar: String(parsed.themeChar || '诗').slice(0, 1), mode: 'deepseek' };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const retryAfter = checkRateLimit(req);
    if (retryAfter) return send(res, 429, { error: `请求过于频繁，请在 ${retryAfter} 秒后重试` });
    const raw = typeof req.body === 'string' ? req.body : '';
    const body = raw ? JSON.parse(raw) : (req.body || {});
    const works = Array.isArray(body.works) ? body.works.slice(0, 6).map(work => ({
      author: String(work.author || '佚名'), title: String(work.title || '无题'),
      lines: Array.isArray(work.lines) ? work.lines.slice(0, 9).map(String) : []
    })).filter(work => work.lines.length) : [];
    if (!works.length) return send(res, 400, { error: '请至少选择一篇作品' });
    send(res, 200, await curateWithDeepSeek(works));
  } catch (error) {
    send(res, 502, { error: '选句生成失败，请稍后重试', detail: error.message });
  }
};
