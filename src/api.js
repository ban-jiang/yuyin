(function () {
  async function searchPoetry(query, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '搜索失败');
      if (!Array.isArray(result.candidates)) throw new Error('候选格式无效');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('搜索超时，请稍后重试');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function curatePoetry(works, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);
    try {
      const response = await fetch('/api/curate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ works }),
        signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '策展失败');
      if (!Array.isArray(result.quotes)) throw new Error('策展结果格式无效');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('策展超时，请稍后重试');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  window.YuyinApi = { searchPoetry, curatePoetry };
})();
