const demoCandidates = [
  { id: 'su-shi-ding-feng-bo', author: '苏轼', dynasty: '宋', title: '定风波·莫听穿林打叶声', reason: '在风雨中保持旷达与自持', sourceStatus: 'demo', lines: ['莫听穿林打叶声，何妨吟啸且徐行。', '竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。', '料峭春风吹酒醒，微冷，山头斜照却相迎。', '回首向来萧瑟处，归去，也无风雨也无晴。', '何妨吟啸且徐行。', '一蓑烟雨任平生。', '山头斜照却相迎。'] },
  { id: 'xin-qi-ji-qing-yu-an', author: '辛弃疾', dynasty: '宋', title: '青玉案·元夕', reason: '灯火繁盛与孤独凝望相互映照', sourceStatus: 'demo', lines: ['东风夜放花千树，更吹落，星如雨。', '宝马雕车香满路。', '凤箫声动，玉壶光转，一夜鱼龙舞。', '蛾儿雪柳黄金缕，笑语盈盈暗香去。', '众里寻他千百度。', '蓦然回首，那人却在，灯火阑珊处。', '一夜鱼龙舞。'] },
  { id: 'li-bai-jiang-jin-jiu', author: '李白', dynasty: '唐', title: '将进酒', reason: '以奔涌节奏书写时间、生命与豪情', sourceStatus: 'demo', lines: ['君不见黄河之水天上来，奔流到海不复回。', '君不见高堂明镜悲白发，朝如青丝暮成雪。', '人生得意须尽欢，莫使金樽空对月。', '天生我材必有用，千金散尽还复来。', '烹羊宰牛且为乐，会须一饮三百杯。', '古来圣贤皆寂寞，惟有饮者留其名。', '与尔同销万古愁。'] }
];

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
    title: String(item.title || '无题'),
    reason: String(item.reason || ''),
    sourceStatus: String(item.sourceStatus || 'model-unverified'),
    lines: Array.isArray(item.lines) ? item.lines.slice(0, 9).map(String) : []
  })).filter(item => item.lines.length > 0);
}

async function searchWithDeepSeek(query) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { candidates: demoCandidates, mode: 'demo' };

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      response_format: { type: 'json_object' },
      temperature: 0.35,
      messages: [
        { role: 'system', content: '你是古典诗词检索助手。严格根据用户意图给出3-6个候选作品。重要规则:1) 严格保证作者归属准确,绝不混淆作者;如用户问"杜甫的诗",候选必须全部为杜甫本人作品,不得混入其他朝代或近现代作者(如毛泽东、辛弃疾、苏轼等)。2) 严格使用作品真实原句,不得改写、拼接或伪造;绝不引用近现代革命诗词。3) 不确定的作者/作品请直接放弃,宁可少给候选。4) 每篇优先给5-7条连续或相关原句。只输出JSON对象,格式为{"candidates":[{"id":"slug","author":"作者","dynasty":"朝代","title":"篇名","reason":"推荐理由","sourceStatus":"model-unverified","lines":["准确原句"]}]}。' },
        { role: 'user', content: query }
      ]
    })
  });
  if (!response.ok) throw new Error(`DeepSeek returned ${response.status}`);
  const payload = await response.json();
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
  return { candidates: validateCandidates(parsed), mode: 'deepseek' };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const raw = typeof req.body === 'string' ? req.body : '';
    const body = raw ? JSON.parse(raw) : (req.body || {});
    const query = String(body.query || '').trim();
    if (query.length < 2 || query.length > 200) return send(res, 400, { error: '请输入 2-200 个字符' });
    const result = await searchWithDeepSeek(query);
    send(res, 200, result);
  } catch (error) {
    send(res, 502, { error: '候选生成失败，请稍后重试', detail: error.message });
  }
};
