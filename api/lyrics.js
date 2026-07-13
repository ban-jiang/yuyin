function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sourceLines(text) {
  const seen = new Set();
  return String(text).split(/\r?\n/).map(line => line.trim()).filter(line => {
    if (!line || seen.has(line)) return false;
    seen.add(line);
    return true;
  }).slice(0, 120);
}

async function extractLyrics(lyrics) {
  const lines = sourceLines(lyrics);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { candidates: lines.slice(0, 15), mode: 'demo' };
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      response_format: { type: 'json_object' },
      temperature: 0.15,
      messages: [
        { role: 'system', content: '你是歌词摘句编辑。只能从用户提供的逐行歌词中原样选择8-15句，不得改写、拼接、补充或重复。优先选择意象完整、脱离上下文仍可理解、适合视觉卡片的句子。只输出JSON：{"candidates":["原句"]}。' },
        { role: 'user', content: lines.join('\n') }
      ]
    })
  });
  if (!response.ok) throw new Error(`DeepSeek returned ${response.status}`);
  const payload = await response.json();
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
  const allowed = new Set(lines);
  const candidates = Array.isArray(parsed.candidates)
    ? [...new Set(parsed.candidates.map(String).map(line => line.trim()).filter(line => allowed.has(line)))].slice(0, 15)
    : [];
  return { candidates: candidates.length >= 4 ? candidates : lines.slice(0, 15), mode: 'deepseek' };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const raw = typeof req.body === 'string' ? req.body : '';
    const body = raw ? JSON.parse(raw) : (req.body || {});
    const lyrics = String(body.lyrics || '').trim();
    const lines = sourceLines(lyrics);
    if (lyrics.length > 5000 || lines.length < 4) return send(res, 400, { error: '请按每行一句粘贴至少 4 句歌词，且总长度不超过 5000 字' });
    send(res, 200, await extractLyrics(lyrics));
  } catch (error) {
    send(res, 502, { error: '歌词摘句失败，请稍后重试', detail: error.message });
  }
};
