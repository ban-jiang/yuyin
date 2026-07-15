const { checkRateLimit, fetchWithTimeout, getCache, setCache } = require('./_security.js');

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function normalize(value) {
  return String(value || '').normalize('NFKC').replace(/[\s，。！？、；：,.!?;:'"“”‘’《》〈〉（）()【】\[\]]/g, '');
}

function segmentText(value) {
  const text = String(value || '').replace(/\r/g, '').trim();
  const segments = text.split(/\n+/).flatMap(paragraph => paragraph.match(/[^。！？；]+[。！？；]?/g) || []);
  return segments.map(line => line.trim()).filter(line => normalize(line).length >= 2).slice(0, 240);
}

function parseModelWorks(payload, expectedLength) {
  const content = payload?.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed.works) || parsed.works.length !== expectedLength) throw new Error('Invalid prose response');
  return parsed.works.map(item => String(item.text || '').trim());
}

async function generateProseVersion(works, model, variant) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('未配置 DeepSeek API Key');
  const system = variant === 'independent-review'
    ? '你是中国古代文学原文校勘助手。请根据作者与篇名，独立默写每篇作品的完整古文原文。不要参考其他答案，不要解释、翻译、赏析、节选或改写；使用简体中文与通行标点。不确定时仍保持篇章完整，但绝不能混入其他作品。只输出JSON：{"works":[{"index":0,"author":"作者","title":"篇名","text":"完整原文"}]}，顺序与输入完全一致。'
    : '你是中国古代文学原文整理助手。请根据作者与篇名返回每篇作品的完整古文原文，不得只给名句或节选。不要解释、翻译、赏析或改写；使用简体中文与通行标点，保持段落完整，绝不能混入其他作品。只输出JSON：{"works":[{"index":0,"author":"作者","title":"篇名","text":"完整原文"}]}，顺序与输入完全一致。';
  const response = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 10000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(works.map((work, index) => ({ index, author: work.author, title: work.title, knownExcerpt: work.lines.slice(0, 3) }))) }
      ]
    })
  }, 40_000);
  if (!response.ok) throw new Error(`${model} returned ${response.status}`);
  return parseModelWorks(await response.json(), works.length);
}

function compareVersions(work, primaryText, reviewText) {
  const lines = segmentText(primaryText);
  if (lines.length < 4) throw new Error(`${work.title} 未生成足够的完整原文`);
  const reviewNormalized = normalize(reviewText);
  const lineConfidence = lines.map(line => reviewNormalized.includes(normalize(line)) ? 'matched' : 'different');
  const total = lines.reduce((sum, line) => sum + normalize(line).length, 0) || 1;
  const matched = lines.reduce((sum, line, index) => sum + (lineConfidence[index] === 'matched' ? normalize(line).length : 0), 0);
  const verificationRatio = Math.round(matched / total * 1000) / 1000;
  const verification = verificationRatio >= .92 ? 'high' : verificationRatio >= .7 ? 'medium' : 'low';
  return {
    ...work,
    lines,
    lineConfidence,
    sourceStatus: 'ai-prose-reviewed',
    sourceName: 'AI双重校验',
    sourceLineCount: lines.length,
    verification,
    verificationRatio
  };
}

async function expandProseWorks(works) {
  const primaryModel = process.env.DEEPSEEK_PROSE_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const reviewModel = process.env.DEEPSEEK_REVIEW_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const cacheKey = `prose:${primaryModel}:${reviewModel}:${works.map(work => `${work.author}|${work.title}`).join('||')}`;
  const cached = getCache(cacheKey);
  if (cached) return { ...cached, cached: true };
  const [primary, review] = await Promise.all([
    generateProseVersion(works, primaryModel, 'primary'),
    generateProseVersion(works, reviewModel, 'independent-review')
  ]);
  const expanded = works.map((work, index) => compareVersions(work, primary[index], review[index]));
  const result = { works: expanded, mode: 'dual-model', models: { primary: primaryModel, review: reviewModel } };
  setCache(cacheKey, result, 24 * 60 * 60_000);
  return result;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const retryAfter = checkRateLimit(req, 6);
    if (retryAfter) return send(res, 429, { error: `古文全文生成较耗资源，请在 ${retryAfter} 秒后重试` });
    const raw = typeof req.body === 'string' ? req.body : '';
    const body = raw ? JSON.parse(raw) : (req.body || {});
    const works = Array.isArray(body.works) ? body.works.slice(0, 3).map((work, index) => ({
      id: String(work.id || `prose-${index}`),
      author: String(work.author || '佚名').slice(0, 40),
      title: String(work.title || '无题').slice(0, 80),
      genre: String(work.genre || '古文').slice(0, 20),
      lines: Array.isArray(work.lines) ? work.lines.slice(0, 9).map(String) : []
    })) : [];
    if (!works.length) return send(res, 400, { error: '请至少选择一篇古文' });
    send(res, 200, await expandProseWorks(works));
  } catch (error) {
    send(res, 502, { error: '古文全文生成或校验失败，请稍后重试', detail: error.message });
  }
};
