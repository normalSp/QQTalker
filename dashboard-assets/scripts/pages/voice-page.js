export function createVoicePageController(options) {
  const {
    state,
    api,
    dashboardApi,
    toast,
    renderVoiceStatus,
    renderVoiceBackends,
    renderVoiceModels,
    getSelectedVoiceBackend,
    currentVoicePayload,
    loadVoiceTrainingPanel,
  } = options;

  async function loadVoicePanel() {
    const statusRes = await dashboardApi.getVoiceStatus();
    state.voice.status = statusRes;
    if (statusRes && statusRes.defaults && statusRes.defaults.backend && !getSelectedVoiceBackend()) {
      document.getElementById('cfg-ttsBackend').value = statusRes.defaults.backend;
    }
    renderVoiceStatus(statusRes);

    const backendsRes = await dashboardApi.getVoiceBackends();
    state.voice.backends = backendsRes.backends || [];
    renderVoiceBackends(state.voice.backends);

    const modelsRes = await dashboardApi.getVoiceModels();
    state.voice.models = modelsRes.models || [];
    renderVoiceModels(state.voice.models);
    await loadVoiceTrainingPanel();
  }

  async function rescanVoiceModels() {
    const res = await api('/api/voice/models/rescan', { method: 'POST' });
    state.voice.models = res.models || [];
    renderVoiceModels(state.voice.models);
    toast(res.success === false ? '模型目录重扫完成，但语音服务当前不可用' : '模型目录已重扫', res.success === false ? 'error' : 'success');
  }

  async function previewVoice(forceModelId, forceText) {
    const payload = currentVoicePayload();
    if (forceModelId) payload.modelId = forceModelId;
    if (forceText) payload.text = forceText;
    if (!payload.text) {
      toast('请先填写试听文本', 'error');
      return;
    }
    const result = await api('/api/voice/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!result || !result.success) {
      toast('试听生成失败：' + ((result && result.error) || '语音服务未返回结果'), 'error');
      return;
    }
    const player = document.getElementById('voicePreviewPlayer');
    const meta = document.getElementById('voicePreviewMeta');
    player.src = 'data:' + (result.mimeType || 'audio/mpeg') + ';base64,' + result.audioBase64;
    player.style.display = 'block';
    if (meta) {
      meta.textContent = '试听成功：' + (result.modelName || result.modelId || '默认模型') + ' / ' + (result.backend || 'unknown')
        + ((result.warnings && result.warnings.length) ? (' / ' + result.warnings.join(', ')) : '');
    }
    toast('试听音频已生成', 'success');
  }

  return {
    loadVoicePanel,
    rescanVoiceModels,
    previewVoice,
  };
}
