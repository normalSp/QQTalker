export async function api(url, opts) {
  try {
    const response = await fetch(url, opts);
    if (response.ok) {
      return await response.json();
    }
    var contentType = String(response.headers.get('content-type') || '');
    var errorPayload = {};
    if (contentType.indexOf('application/json') >= 0) {
      try {
        errorPayload = await response.json();
      } catch (error) {
        errorPayload = {};
      }
    } else {
      try {
        var text = await response.text();
        errorPayload = text ? { error: text } : {};
      } catch (error) {
        errorPayload = {};
      }
    }
    return Object.assign({
      success: false,
      error: response.status + ' ' + response.statusText,
      status: response.status,
    }, errorPayload || {});
  } catch (error) {
    console.warn('API error', error);
    return {
      success: false,
      error: error && error.message ? error.message : 'Network request failed',
    };
  }
}

export async function postJson(url, body) {
  return api(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

export async function putJson(url, body) {
  return api(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

export async function deleteJson(url, body) {
  return api(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

export const dashboardApi = {
  getStatus: () => api('/api/status'),
  getStats: () => api('/api/stats'),
  getConfig: () => api('/api/config'),
  getPlugins: () => api('/api/plugins'),
  installPlugin: (body) => postJson('/api/plugins/install', body),
  enablePlugin: (id) => postJson('/api/plugins/' + encodeURIComponent(id) + '/enable', {}),
  disablePlugin: (id) => postJson('/api/plugins/' + encodeURIComponent(id) + '/disable', {}),
  uninstallPlugin: (id) => postJson('/api/plugins/' + encodeURIComponent(id) + '/uninstall', {}),
  updatePlugin: (id) => postJson('/api/plugins/' + encodeURIComponent(id) + '/update', {}),
  getPluginConfigSchema: (id) => api('/api/plugins/' + encodeURIComponent(id) + '/config-schema'),
  getPluginConfig: (id) => api('/api/plugins/' + encodeURIComponent(id) + '/config'),
  updatePluginConfig: (id, body) => putJson('/api/plugins/' + encodeURIComponent(id) + '/config', body),
  getPluginStatus: (id) => api('/api/plugins/' + encodeURIComponent(id) + '/status'),
  getPluginLogs: (id) => api('/api/plugins/' + encodeURIComponent(id) + '/logs'),
  getAstrBotBridgeOverview: (id) => api('/api/plugins/' + encodeURIComponent(id) + '/astrbot-bridge/overview'),
  getMemeBridgeOverview: (id) => api('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/overview'),
  getMemeBridgeCategories: (id) => api('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/categories'),
  updateMemeBridgeCategory: (id, body) => postJson('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/categories', body),
  reorderMemeBridgeCategories: (id, body) => putJson('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/categories/order', body),
  deleteMemeBridgeCategory: (id, body) => deleteJson('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/categories', body),
  deleteMemeBridgeCategories: (id, body) => deleteJson('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/categories/batch', body),
  uploadMemeBridgeFiles: (id, body) => postJson('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/files', body),
  renameMemeBridgeFile: (id, body) => putJson('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/files', body),
  deleteMemeBridgeFile: (id, body) => deleteJson('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/files', body),
  deleteMemeBridgeFiles: (id, body) => deleteJson('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/files/batch', body),
  restoreMemeBridgeDefaults: (id) => postJson('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/restore-defaults', {}),
  restoreMemeBridgeCategories: (id, body) => postJson('/api/plugins/' + encodeURIComponent(id) + '/meme-manager/restore-defaults', body),
  getPersonas: () => api('/api/personas'),
  resolvePersona: (groupId) => api('/api/personas/resolve?groupId=' + encodeURIComponent(groupId || '')),
  createPersonaProfile: (body) => postJson('/api/personas/profile/create', body),
  updatePersonaProfile: (body) => postJson('/api/personas/profile/update', body),
  deletePersonaProfile: (id) => postJson('/api/personas/profile/delete', { id: id }),
  setDefaultPersona: (id) => postJson('/api/personas/default', { id: id }),
  bindGroupPersona: (groupId, personaId) => postJson('/api/personas/bind-group', { groupId: groupId, personaId: personaId }),
  unbindGroupPersona: (groupId) => postJson('/api/personas/unbind-group', { groupId: groupId }),
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
