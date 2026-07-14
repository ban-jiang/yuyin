const { fetchWithTimeout, getCache, setCache } = require('./_security.js');

const DEFAULT_BASE_URL = 'https://poetry.palemoky.com';
const MAX_SOURCE_LINES = 240;
const VERSE_GENRE = /诗|词|曲|乐府|绝句|律诗|诗经|楚辞/;

function compact(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s，。！？、；：,.!?;:'"“”‘’《》〈〉（）()【】\[\]·・—–-]/g, '');
}

function titleCore(value) {
  return compact(String(value || '').split(/[·・]/)[0]);
}

function sourceAuthor(item) {
  return String(item?.author?.name || item?.author || '');
}

function sourceTitle(item) {
  return String(item?.title || '');
}

function sourceLines(item) {
  return Array.isArray(item?.content)
    ? item.content.slice(0, MAX_SOURCE_LINES).map(String).map(line => line.trim()).filter(Boolean)
    : [];
}

function anchorQueries(candidate) {
  const lines = Array.isArray(candidate.lines) ? candidate.lines : [];
  const anchors = lines
    .flatMap(line => String(line).split(/[，。！？、；：,.!?;:]/))
    .map(compact)
    .filter(line => line.length >= 6)
    .map(line => line.slice(0, 18));
  const title = String(candidate.title || '').trim();
  return [...new Set([...anchors.slice(0, 1), title].filter(Boolean))];
}

function matchScore(candidate, item) {
  if (compact(sourceAuthor(item)) !== compact(candidate.author)) return -1;
  const lines = sourceLines(item);
  if (!lines.length) return -1;
  const candidateTitle = compact(candidate.title);
  const candidateCore = titleCore(candidate.title);
  const itemTitle = compact(sourceTitle(item));
  const itemCore = titleCore(sourceTitle(item));
  const sourceText = compact(lines.join(''));
  const anchors = (candidate.lines || []).map(compact).filter(line => line.length >= 6);
  const overlap = anchors.some(line => sourceText.includes(line) || line.includes(sourceText));
  let score = 100;
  if (candidateTitle && candidateTitle === itemTitle) score += 45;
  else if (candidateCore && candidateCore === itemCore) score += 36;
  else if (candidateCore && (itemTitle.includes(candidateCore) || candidateTitle.includes(itemCore))) score += 24;
  if (overlap) score += 55;
  return score >= 124 ? score : -1;
}

async function searchPoetryApi(query) {
  const normalized = String(query || '').trim();
  if (!normalized) return [];
  const cacheKey = `poetry-source:${normalized.normalize('NFKC').toLowerCase()}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;
  const baseUrl = String(process.env.POETRY_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const url = `${baseUrl}/api/search?q=${encodeURIComponent(normalized)}&lang=zh-Hans`;
  const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 9_000);
  if (!response.ok) throw new Error(`Poetry API returned ${response.status}`);
  const payload = await response.json();
  const items = Array.isArray(payload?.data) ? payload.data : [];
  setCache(cacheKey, items, 24 * 60 * 60_000);
  return items;
}

async function resolvePoetryCandidate(candidate) {
  if (candidate.genre && !VERSE_GENRE.test(String(candidate.genre))) return candidate;
  let best = null;
  let bestScore = -1;
  for (const query of anchorQueries(candidate)) {
    try {
      const items = await searchPoetryApi(query);
      for (const item of items) {
        const score = matchScore(candidate, item);
        if (score > bestScore) {
          best = item;
          bestScore = score;
        }
      }
      if (bestScore >= 180) break;
    } catch (error) {
      // The AI candidate remains available and visibly unverified when the source is unavailable.
    }
  }
  if (!best) return { ...candidate, sourceLookup: 'miss' };
  const lines = sourceLines(best);
  const baseUrl = String(process.env.POETRY_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  return {
    ...candidate,
    lines,
    sourceStatus: 'poetry-api',
    sourceName: '诗泉',
    sourceId: String(best.id || ''),
    sourceTitle: sourceTitle(best),
    sourceUrl: `${baseUrl}/api/search?q=${encodeURIComponent(anchorQueries(candidate)[0] || candidate.title)}`,
    sourceLineCount: lines.length
  };
}

async function enrichCandidatesWithPoetrySource(candidates) {
  return Promise.all(candidates.map(resolvePoetryCandidate));
}

module.exports = { enrichCandidatesWithPoetrySource, MAX_SOURCE_LINES };
