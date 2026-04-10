export async function api(url, opts) {
  try {
    const response = await fetch(url, opts);
    return response.ok ? await response.json() : {};
  } catch (error) {
    console.warn('API error', error);
    return {};
  }
}

export async function postJson(url, body) {
  return api(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

export const dashboardApi = {
  getStatus: () => api('/api/status'),
  getStats: () => api('/api/stats'),
  getConfig: () => api('/api/config'),
  getStatsHistory: () => api('/api/stats/history'),
  getChatLogs: () => api('/api/chat-logs'),
  getBlockUsers: () => api('/api/block/users'),
  getBlockGroups: () => api('/api/block/groups'),
  getVoiceStatus: () => api('/api/voice/status'),
  getVoiceBackends: () => api('/api/voice/backends'),
  getVoiceModels: () => api('/api/voice/models'),
  getVoiceTrainingOverview: () => api('/api/voice-training/overview'),
  getVoiceTrainingDetail: (characterId) => api('/api/voice-training/detail?character=' + encodeURIComponent(characterId)),
  getVoiceTrainingTaskState: (characterId) => api('/api/voice-training/task-state' + (characterId ? ('?character=' + encodeURIComponent(characterId)) : '')),
  getSelfLearningOverview: () => api('/api/self-learning/overview'),
  getSelfLearningStrategy: () => api('/api/self-learning/strategy'),
  getSelfLearningStyles: (groupId) => api('/api/self-learning/styles?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningSlang: (groupId) => api('/api/self-learning/slang?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningSocial: (groupId) => api('/api/self-learning/social?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningAffection: (groupId) => api('/api/self-learning/affection?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningMood: (groupId) => api('/api/self-learning/mood?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningGoals: (groupId) => api('/api/self-learning/goals?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningMemories: (groupId) => api('/api/self-learning/memories?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningReviews: (groupId) => api('/api/self-learning/persona-reviews?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningAdvancedSummary: (groupId) => api('/api/self-learning/advanced-summary?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningClusters: (groupId) => api('/api/self-learning/ml-clusters?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningScenes: (groupId) => api('/api/self-learning/scene-map?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningMemoryGraph: (groupId) => api('/api/self-learning/memory-graph?groupId=' + encodeURIComponent(groupId || '')),
  getSelfLearningRuns: (groupId) => api('/api/self-learning/learning-runs?groupId=' + encodeURIComponent(groupId || '')),
};
