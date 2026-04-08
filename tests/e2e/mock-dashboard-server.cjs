const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 43180;
const htmlPath = path.resolve(__dirname, '..', '..', 'dashboard-preview.html');

const chartStub = `
<script>
window.Chart = function Chart(ctx, config) {
  this.ctx = ctx;
  this.data = (config && config.data) || { labels: [], datasets: [] };
  this.options = (config && config.options) || {};
  this.update = function() {};
  this.destroy = function() {};
};
window.gsap = {
  to: function(target, opts) { if (opts && typeof opts.onComplete === 'function') setTimeout(opts.onComplete, 0); return { kill: function() {} }; },
  from: function(target, opts) { if (opts && typeof opts.onComplete === 'function') setTimeout(opts.onComplete, 0); return { kill: function() {} }; }
};
</script>`;

function now() {
  return Date.now();
}

const state = {
  strategy: {
    runtime: {
      autoLearningEnabled: true,
      lastLearningAt: now() - 10 * 60 * 1000,
      nextLearningAt: now() + 50 * 60 * 1000,
    },
    settings: {
      learningIntervalHours: 1,
      minMessagesForLearning: 12,
      maxMessagesPerBatch: 80,
      enableMlAnalysis: true,
      maxMlSampleSize: 60,
      totalAffectionCap: 220,
      maxUserAffection: 100,
    },
  },
  groups: {
    1001: {
      styles: [{ patternType: '语气词', patternValue: '喵', weight: 3.2, evidenceCount: 8, userId: 101 }],
      slang: [{ term: '猫塑', meaning: '把角色说成猫系风格的群内梗', usageCount: 5 }],
      social: [{ sourceUserId: 101, targetUserId: 102, relationType: 'supportive', interactions: 4, score: 3.6 }],
      affection: [{ userId: 101, score: 88.5, lastDelta: 2.5 }],
      mood: { mood: 'happy', reason: '最近聊天偏轻松积极' },
      goals: [{ userId: 101, goalType: 'planning', summary: '在讨论周末探店安排' }],
      memories: [{ key: 'like:抹茶', content: '我喜欢抹茶', importance: 0.93, tags: ['抹茶', '喜欢'] }],
      reviews: [{ id: 9001, personaName: 'group-1001', status: 'pending', summary: '建议增强软萌陪聊感', suggestedPrompt: '保持温柔、带一点喵系尾音。' }],
      advancedSummary: { summary: '分析 18 条消息后，发现 1001 群偏轻松计划型对话。', personaPrompt: '对 1001 群保持温柔、轻快、适度卖萌的风格。' },
      clusters: [{ id: 1, label: '探店 / 抹茶', messageCount: 8, keywords: ['探店', '抹茶'], sampleMessages: ['周末去喝抹茶'], avgSentiment: 0.6 }],
      scenes: [{ scene: 'planning', category: 'info', confidence: 0.76, matches: 6, sampleMessages: ['周末去哪里', '明天探店'] }],
      memoryGraph: { nodes: [{ key: 'like:抹茶', label: '喜欢抹茶', importance: 0.93 }], edges: [] },
      runs: [{ id: 7001, groupId: 1001, summary: '初始学习完成 1001', status: 'completed', createdAt: now() - 5 * 60 * 1000 }],
    },
    2002: {
      styles: [{ patternType: '口头禅', patternValue: '稳了', weight: 2.8, evidenceCount: 6, userId: 201 }],
      slang: [{ term: '上强度', meaning: '指把进度和节奏拉满', usageCount: 4 }],
      social: [{ sourceUserId: 201, targetUserId: 202, relationType: 'frequent_interaction', interactions: 7, score: 4.2 }],
      affection: [{ userId: 201, score: 72.1, lastDelta: 1.4 }],
      mood: { mood: 'calm', reason: '消息节奏稳定，偏讨论执行' },
      goals: [{ userId: 201, goalType: 'decision_making', summary: '在讨论发布方案和排期' }],
      memories: [{ key: 'recent:项目上线', content: '我最近在准备项目上线', importance: 0.84, tags: ['项目', '上线'] }],
      reviews: [{ id: 9002, personaName: 'group-2002', status: 'approved', summary: '建议保持执行导向', suggestedPrompt: '偏简洁务实，适合做方案推进。' }],
      advancedSummary: { summary: '分析 14 条消息后，发现 2002 群偏执行推进与决策对话。', personaPrompt: '对 2002 群保持简洁、稳重、推进型回复。' },
      clusters: [{ id: 2, label: '上线 / 排期', messageCount: 7, keywords: ['上线', '排期'], sampleMessages: ['这周上线稳了'], avgSentiment: 0.3 }],
      scenes: [{ scene: 'decision_making', category: 'info', confidence: 0.68, matches: 5, sampleMessages: ['怎么排期', '是否今晚发版'] }],
      memoryGraph: { nodes: [{ key: 'recent:项目上线', label: '最近准备项目上线', importance: 0.84 }], edges: [] },
      runs: [{ id: 7002, groupId: 2002, summary: '初始学习完成 2002', status: 'completed', createdAt: now() - 8 * 60 * 1000 }],
    },
  },
};

function json(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function overview() {
  const groupIds = Object.keys(state.groups).map(Number);
  const counts = {
    messages: 0,
    groups: groupIds.length,
    patterns: 0,
    slang: 0,
    memories: 0,
    pendingReviews: 0,
    runs: 0,
  };
  for (const id of groupIds) {
    const group = state.groups[id];
    counts.messages += 12 + group.runs.length;
    counts.patterns += group.styles.length;
    counts.slang += group.slang.length;
    counts.memories += group.memories.length;
    counts.pendingReviews += group.reviews.filter((item) => item.status === 'pending').length;
    counts.runs += group.runs.length;
  }
  return { overview: counts, runtime: state.strategy.runtime, groups: groupIds };
}

function groupPayload(groupId, key, emptyValue) {
  const group = state.groups[groupId];
  if (!group) return emptyValue;
  return group[key];
}

function serveHtml(res) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@[^"]+"><\/script>/, chartStub)
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^"]+"><\/script>/, '');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  const pathname = url.pathname;

  if (pathname === '/' || pathname === '/index.html') {
    serveHtml(res);
    return;
  }

  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
    return;
  }

  if (pathname === '/api/status') {
    json(res, {
      connected: true,
      wsUrl: 'ws://127.0.0.1:3001',
      reconnectCount: 0,
      totalMessages: 42,
      totalAiCalls: 8,
      totalTtsCalls: 0,
      totalSttCalls: 0,
      startTime: new Date(now() - 60 * 60 * 1000).toISOString(),
      activeGroups: Object.keys(state.groups).map(Number),
      sessionsCount: 2,
      sendQueueLength: 0,
      uptime: '1小时 0分0秒',
      memoryUsage: { heapUsed: 64 * 1024 * 1024 },
    });
    return;
  }

  if (pathname === '/api/stats/history') {
    json(res, {
      history: [
        { time: '10:00:00', totalMessages: 10, totalAiCalls: 2, totalTtsCalls: 0, totalSttCalls: 0, memoryMB: 55 },
        { time: '10:05:00', totalMessages: 20, totalAiCalls: 4, totalTtsCalls: 0, totalSttCalls: 0, memoryMB: 58 },
        { time: '10:10:00', totalMessages: 32, totalAiCalls: 6, totalTtsCalls: 0, totalSttCalls: 0, memoryMB: 61 },
      ],
    });
    return;
  }

  if (pathname === '/api/config' && req.method === 'GET') {
    json(res, {
      selfLearningIntervalHours: state.strategy.settings.learningIntervalHours,
      selfLearningMinMessages: state.strategy.settings.minMessagesForLearning,
      selfLearningMaxBatch: state.strategy.settings.maxMessagesPerBatch,
      selfLearningEnableMl: state.strategy.settings.enableMlAnalysis,
      selfLearningMaxMlSample: state.strategy.settings.maxMlSampleSize,
      selfLearningTotalAffectionCap: state.strategy.settings.totalAffectionCap,
      selfLearningMaxUserAffection: state.strategy.settings.maxUserAffection,
    });
    return;
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    const body = await readBody(req);
    state.strategy.settings.learningIntervalHours = Number(body.SELF_LEARNING_INTERVAL_HOURS || state.strategy.settings.learningIntervalHours);
    state.strategy.settings.minMessagesForLearning = Number(body.SELF_LEARNING_MIN_MESSAGES || state.strategy.settings.minMessagesForLearning);
    state.strategy.settings.maxMessagesPerBatch = Number(body.SELF_LEARNING_MAX_BATCH || state.strategy.settings.maxMessagesPerBatch);
    state.strategy.settings.enableMlAnalysis = body.SELF_LEARNING_ENABLE_ML !== 'false';
    state.strategy.settings.maxMlSampleSize = Number(body.SELF_LEARNING_MAX_ML_SAMPLE || state.strategy.settings.maxMlSampleSize);
    state.strategy.settings.totalAffectionCap = Number(body.SELF_LEARNING_TOTAL_AFFECTION_CAP || state.strategy.settings.totalAffectionCap);
    state.strategy.settings.maxUserAffection = Number(body.SELF_LEARNING_MAX_USER_AFFECTION || state.strategy.settings.maxUserAffection);
    json(res, { success: true });
    return;
  }

  if (pathname === '/api/self-learning/strategy') {
    json(res, state.strategy);
    return;
  }

  if (pathname === '/api/self-learning/overview') {
    json(res, overview());
    return;
  }

  const groupId = Number(url.searchParams.get('groupId') || 0);

  if (pathname === '/api/self-learning/styles') return json(res, { items: groupPayload(groupId, 'styles', []) || [] });
  if (pathname === '/api/self-learning/slang') return json(res, { items: groupPayload(groupId, 'slang', []) || [] });
  if (pathname === '/api/self-learning/social') return json(res, { items: groupPayload(groupId, 'social', []) || [] });
  if (pathname === '/api/self-learning/affection') return json(res, { items: groupPayload(groupId, 'affection', []) || [] });
  if (pathname === '/api/self-learning/mood') return json(res, { item: groupPayload(groupId, 'mood', null) || null });
  if (pathname === '/api/self-learning/goals') return json(res, { items: groupPayload(groupId, 'goals', []) || [] });
  if (pathname === '/api/self-learning/memories') return json(res, { items: groupPayload(groupId, 'memories', []) || [] });
  if (pathname === '/api/self-learning/persona-reviews') return json(res, { items: groupPayload(groupId, 'reviews', []) || [] });
  if (pathname === '/api/self-learning/advanced-summary') return json(res, { item: groupPayload(groupId, 'advancedSummary', null) || null });
  if (pathname === '/api/self-learning/ml-clusters') return json(res, { items: groupPayload(groupId, 'clusters', []) || [] });
  if (pathname === '/api/self-learning/scene-map') return json(res, { items: groupPayload(groupId, 'scenes', []) || [] });
  if (pathname === '/api/self-learning/memory-graph') return json(res, { item: groupPayload(groupId, 'memoryGraph', { nodes: [], edges: [] }) || { nodes: [], edges: [] } });
  if (pathname === '/api/self-learning/learning-runs') return json(res, { items: groupPayload(groupId, 'runs', []) || [] });

  if (pathname === '/api/self-learning/learning/run' && req.method === 'POST') {
    const body = await readBody(req);
    const targetGroupId = Number(body.groupId || groupId || 1001);
    const group = state.groups[targetGroupId];
    group.runs.unshift({
      id: now(),
      groupId: targetGroupId,
      summary: `手动学习完成 ${targetGroupId}`,
      status: 'completed',
      createdAt: now(),
    });
    group.advancedSummary.summary = `分析更新完成：${targetGroupId} 群已执行一次手动学习。`;
    state.strategy.runtime.lastLearningAt = now();
    state.strategy.runtime.nextLearningAt = now() + state.strategy.settings.learningIntervalHours * 60 * 60 * 1000;
    json(res, { success: true, runtime: state.strategy.runtime, groupId: targetGroupId, summary: group.advancedSummary.summary });
    return;
  }

  if (pathname === '/api/self-learning/persona-review/approve' && req.method === 'POST') {
    const body = await readBody(req);
    for (const group of Object.values(state.groups)) {
      const review = group.reviews.find((item) => item.id === Number(body.reviewId));
      if (review) review.status = 'approved';
    }
    json(res, { success: true });
    return;
  }

  if (pathname === '/api/self-learning/persona-review/reject' && req.method === 'POST') {
    const body = await readBody(req);
    for (const group of Object.values(state.groups)) {
      const review = group.reviews.find((item) => item.id === Number(body.reviewId));
      if (review) review.status = 'rejected';
    }
    json(res, { success: true });
    return;
  }

  if (pathname === '/api/self-learning/strategy/runtime' && req.method === 'POST') {
    const body = await readBody(req);
    state.strategy.runtime.autoLearningEnabled = !!body.autoLearningEnabled;
    json(res, { success: true, runtime: state.strategy.runtime });
    return;
  }

  if (pathname === '/api/self-learning/export') {
    json(res, {
      version: 1,
      source: 'qqtalker-self-learning',
      exportedAt: now(),
      scope: { groupId: groupId || undefined, groups: groupId ? [groupId] : Object.keys(state.groups).map(Number) },
      counts: { capturedMessages: 3 },
      data: { capturedMessages: [], stylePatterns: [], slangTerms: [], socialEdges: [], affectionScores: [], moodStates: [], goalSessions: [], memoryNodes: [], personaReviews: [], personaSnapshots: [], analysisSnapshots: [], learningRuns: [] },
    });
    return;
  }

  if (pathname === '/api/self-learning/import' && req.method === 'POST') {
    json(res, { success: true, result: { importedGroups: [1001], mode: 'merge', counts: { capturedMessages: 0 } } });
    return;
  }

  if (pathname === '/api/self-learning/group/clear' && req.method === 'POST') {
    json(res, { success: true, counts: { capturedMessages: 0 } });
    return;
  }

  if (pathname === '/api/self-learning/analysis/rebuild' && req.method === 'POST') {
    const body = await readBody(req);
    const targetGroupId = Number(body.groupId || groupId || 1001);
    json(res, { success: true, groupId: targetGroupId, snapshotCount: 4, summary: `已重建 ${targetGroupId} 的分析快照` });
    return;
  }

  json(res, { error: 'Not Found' }, 404);
}).listen(port, '127.0.0.1', () => {
  console.log(`Mock dashboard server listening on http://127.0.0.1:${port}`);
});
