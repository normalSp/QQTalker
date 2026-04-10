export function createVoiceModelsController(options) {
  const { state, fmt, esc, toast, previewVoice } = options;

  function currentVoicePayload() {
    return {
      text: (document.getElementById('cfg-ttsPreviewText').value || '').trim(),
      backend: (document.getElementById('cfg-ttsBackend').value || '').trim(),
      modelId: (document.getElementById('cfg-ttsModel').value || '').trim(),
      voice: (document.getElementById('cfg-ttsVoice').value || '').trim(),
      style: (document.getElementById('cfg-ttsStyle').value || '').trim(),
      speed: Number(document.getElementById('cfg-ttsSpeed').value || 1),
    };
  }

  function getSelectedVoiceBackend() {
    return (document.getElementById('cfg-ttsBackend').value || '').trim();
  }

  function getSelectedVoiceModelId() {
    return (document.getElementById('cfg-ttsModel').value || '').trim();
  }

  function getVoiceModelEntry(modelId) {
    return (state.voice.models || []).find(function(item) { return item.id === modelId; }) || null;
  }

  function getVoiceBackendEntry(backendId) {
    return (state.voice.backends || []).find(function(item) { return item.id === backendId; }) || null;
  }

  function isVoiceBackendAvailable(backendId) {
    const entry = getVoiceBackendEntry(backendId);
    return !!(entry && entry.available);
  }

  function getPairedVoiceModel(modelEntry, backendId) {
    if (!modelEntry || !backendId) return null;
    const candidates = (state.voice.models || []).filter(function(item) {
      if (!item || item.id === modelEntry.id) return false;
      if ((item.backend || '') !== backendId) return false;
      return (item.character || '') === (modelEntry.character || '');
    });
    candidates.sort(function(a, b) {
      const aInstalled = a.installed ? 0 : 1;
      const bInstalled = b.installed ? 0 : 1;
      if (aInstalled !== bInstalled) return aInstalled - bInstalled;
      const aV2 = /-v2\b/i.test(a.id || '') ? 0 : 1;
      const bV2 = /-v2\b/i.test(b.id || '') ? 0 : 1;
      if (aV2 !== bV2) return aV2 - bV2;
      return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), 'zh-CN');
    });
    return candidates[0] || null;
  }

  function formatVoiceRisk(risk) {
    const map = { low: '低', medium: '中', high: '高' };
    return map[risk] || risk || '-';
  }

  function formatVoiceRouteMap(input) {
    if (!input) return '';
    if (typeof input === 'string') return input;
    if (typeof input !== 'object') return String(input);
    return Object.keys(input).map(function(key) {
      return key + ':' + input[key];
    }).join(',');
  }

  function setVoiceBackend(backendId, options) {
    const nextBackend = (backendId || '').trim();
    const backendEl = document.getElementById('cfg-ttsBackend');
    if (!backendEl || !nextBackend) return;
    backendEl.value = nextBackend;
    renderVoiceBackends(state.voice.backends || []);
    renderVoiceModels(state.voice.models || []);
    if (!(options && options.silent)) {
      toast('已切换默认语音后端，记得保存到 .env', 'success');
    }
  }

  function setVoiceModel(modelId, backend) {
    const modelEl = document.getElementById('cfg-ttsModel');
    if (modelEl) modelEl.value = modelId || '';
    if (backend) setVoiceBackend(backend, { silent: true });
    renderVoiceModels(state.voice.models || []);
    toast('已选中默认语音模型，记得保存到 .env', 'success');
  }

  function previewVoiceBackend(modelId, backendId, targetModelId, forceText) {
    if (backendId) {
      setVoiceBackend(backendId, { silent: true });
    }
    previewVoice(targetModelId || modelId, forceText);
  }

  function renderVoiceStatus(data) {
    const statusEl = document.getElementById('voiceServiceStatus');
    const metaEl = document.getElementById('voiceServiceMeta');
    const telemetryEl = document.getElementById('voiceTelemetryMeta');
    if (!statusEl || !metaEl || !telemetryEl) return;
    const status = (data && data.status) || {};
    const telemetry = (data && data.telemetry) || {};
    const runtimePolicy = ((data && data.defaults) || {}).runtimePolicy || {};
    const backendHealth = status.backends || {};
    const fallbackChain = Array.isArray(runtimePolicy.fallbackChain) ? runtimePolicy.fallbackChain : [];
    const roleMap = formatVoiceRouteMap(runtimePolicy.characterModelMap);
    const groupRoleMap = formatVoiceRouteMap(runtimePolicy.groupVoiceRoleMap);
    statusEl.className = 'voice-status-pill ' + (status.ok ? 'ok' : 'error');
    statusEl.textContent = status.ok ? '语音服务状态：在线' : '语音服务状态：离线';
    metaEl.textContent = status.ok
      ? ('默认后端：' + (status.defaultBackend || 'unknown')
        + ' | 运行策略：' + (runtimePolicy.mode || 'config-only')
        + ' | 默认角色：' + (runtimePolicy.defaultCharacter || '未设置')
        + ' | 长句首选：' + (runtimePolicy.longTextPreferredBackend || '未设置')
        + ' | 回退链：' + (fallbackChain.length ? fallbackChain.join(' -> ') : '无')
        + ' | RVC服务：' + (backendHealth.rvcAvailable ? '已连接' : (backendHealth.rvcAvailabilityReason || '未接入'))
        + (roleMap ? (' | 角色映射：' + roleMap) : '')
        + (groupRoleMap ? (' | 群角色：' + groupRoleMap) : '')
        + ' | 模型目录：' + (status.modelDir || 'unknown'))
      : ('错误：' + (status.error || '未连接到本机 Python 语音服务'));
    telemetryEl.textContent =
      'TTS统计：请求 ' + fmt(telemetry.totalRequests) +
      ' / 命中 ' + fmt(telemetry.cacheHits) +
      ' / 本地成功 ' + fmt(telemetry.localSuccesses) +
      ' / 回退成功 ' + fmt(telemetry.fallbackSuccesses) +
      ' / 回退链触发 ' + fmt(telemetry.fallbackAttempts || 0) +
      ' / 长句 ' + fmt(telemetry.longTextRequests || 0) +
      ' / RVC首选 ' + fmt(telemetry.rvcRequests || 0) +
      ' / 失败 ' + fmt(telemetry.failures) +
      ' / 平均耗时 ' + fmt(telemetry.averageDurationMs) + 'ms' +
      (telemetry.lastRequest
        ? (' / 最近：' + (telemetry.lastRequest.backend || 'unknown') +
          ' via ' + (telemetry.lastRequest.source || 'unknown') +
          ' @x' + String(telemetry.lastRequest.finalSpeed || 1) +
          (telemetry.lastRequest.character ? (' / ' + telemetry.lastRequest.character) : '') +
          (telemetry.lastRequest.runtimePolicy ? (' / ' + telemetry.lastRequest.runtimePolicy) : '') +
          (telemetry.lastRequest.cacheHit ? ' / cache-hit' : ''))
        : '') +
      (telemetry.lastError ? (' / 最近错误：' + telemetry.lastError) : '');
  }

  function renderVoiceBackends(backends) {
    const wrap = document.getElementById('voiceBackends');
    if (!wrap) return;
    if (!backends || !backends.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:20px 0;"><div class="empty-text">暂无可用语音后端</div></div>';
      return;
    }
    const currentBackend = getSelectedVoiceBackend();
    wrap.innerHTML = backends.map(function(item) {
      const tags = [];
      if (item.requiresGpu) tags.push('GPU');
      if (item.supportsModels) tags.push('模型切换');
      if (item.supportsStyle) tags.push('风格控制');
      tags.push(item.available ? '可连接' : '待配置');
      const isActive = currentBackend === item.id;
      return '<div class="voice-backend-card' + (isActive ? ' active' : '') + (item.available ? '' : ' unavailable') + '">'
        + '<div class="voice-card-head"><div class="voice-card-title">' + esc(item.name || item.id) + '</div>'
        + '<span class="voice-card-status' + (isActive ? ' active' : '') + '">' + (isActive ? '当前默认' : (item.available ? '可切换' : '待接入')) + '</span></div>'
        + '<div class="voice-card-sub">' + esc(item.description || '') + '</div>'
        + (item.available ? '' : ('<div class="voice-card-sub" style="margin-top:8px;">原因：' + esc(item.availabilityReason || '未接入') + '</div>'))
        + (item.setupHint ? ('<div class="voice-card-sub" style="margin-top:6px;">提示：' + esc(item.setupHint) + '</div>') : '')
        + '<div class="voice-tags">' + tags.map(function(tag) { return '<span class="voice-tag">' + esc(tag) + '</span>'; }).join('') + '</div>'
        + '<div class="voice-model-actions" style="margin-top:10px;">'
        + '<button class="voice-card-btn ' + (isActive ? 'success' : 'primary') + '" ' + (item.available ? '' : 'disabled') + ' onclick="setVoiceBackend(\'' + esc(item.id || '').replace(/'/g, '&#39;') + '\')">' + (isActive ? '已启用' : '设为默认') + '</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  function renderVoiceModels(models) {
    const wrap = document.getElementById('voiceModels');
    if (!wrap) return;
    if (!models || !models.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:20px 0;"><div class="empty-text">暂未发现模型，请先导入 catalog.json 或 voice-model.json</div></div>';
      return;
    }
    const currentModelId = getSelectedVoiceModelId();
    const currentBackend = getSelectedVoiceBackend();
    wrap.innerHTML = models.map(function(item) {
      const tags = item.tags || [];
      const installedText = item.installed ? '已安装' : '待导入';
      const sample = item.sampleText || '你好呀，欢迎使用 QQTalker 语音播报插件。';
      const recommendedBackend = item.recommendedBackend || item.backend;
      const alternateBackends = item.alternateBackends || [];
      const isActive = currentModelId === item.id;
      const diag = item.diagnostics || {};
      const diagSummary = (diag.summary || []).slice(0, 3);
      const diagRiskText = diag.risk ? ('诊断风险：' + formatVoiceRisk(diag.risk)) : '';
      const previewHint = item.previewHint || '';
      const compareBackend = recommendedBackend && recommendedBackend !== currentBackend ? recommendedBackend : ((alternateBackends || []).find(function(entry) { return entry !== currentBackend; }) || '');
      const compareModel = compareBackend ? getPairedVoiceModel(item, compareBackend) : null;
      const compareModelId = compareModel ? compareModel.id : '';
      const canUseModel = (item.installed || item.backend === 'edge-tts') && isVoiceBackendAvailable(item.backend);
      const canCompare = compareBackend && compareModel && isVoiceBackendAvailable(compareBackend) && (compareModel.installed || compareBackend === 'edge-tts');
      const compareBackendEntry = compareBackend ? getVoiceBackendEntry(compareBackend) : null;
      return '<div class="voice-model-card' + (isActive ? ' active' : '') + (item.installed ? '' : ' unavailable') + '">'
        + '<div class="voice-card-head"><div class="voice-card-title">' + esc(item.name || item.id) + '</div>'
        + '<span class="voice-card-status' + (item.experimental ? ' experimental' : (isActive ? ' active' : '')) + '">' + esc(item.qualityTier || (item.experimental ? 'experimental' : 'standard')) + '</span></div>'
        + '<div class="voice-card-sub">' + esc((item.character || item.backend || '') + (item.notes ? ' · ' + item.notes : '')) + '</div>'
        + '<div class="voice-tags">' + tags.map(function(tag) { return '<span class="voice-tag">' + esc(tag) + '</span>'; }).join('') + '</div>'
        + '<div class="voice-model-meta"><span>推荐后端：' + esc(recommendedBackend || '-') + '</span><span>' + esc(installedText) + '</span></div>'
        + '<div class="voice-card-sub" style="margin-top:8px;">训练状态：' + esc(item.trainingStatus || '未标注') + (alternateBackends.length ? (' / 备用：' + esc(alternateBackends.join('、'))) : '') + '</div>'
        + '<div class="voice-card-sub" style="margin-top:10px;">试听文案：' + esc(sample) + '</div>'
        + (!isVoiceBackendAvailable(item.backend) ? ('<div class="voice-card-sub" style="margin-top:8px;">当前后端未接入：' + esc(((getVoiceBackendEntry(item.backend) || {}).availabilityReason) || item.backend) + '</div>') : '')
        + '<div class="voice-model-actions wrap">'
        + '<button class="voice-card-btn primary" ' + (canUseModel ? '' : 'disabled') + ' onclick="setVoiceModel(\'' + esc(item.id).replace(/'/g, '&#39;') + '\', \'' + esc(recommendedBackend || item.backend || '').replace(/'/g, '&#39;') + '\')">设为默认</button>'
        + '<button class="voice-card-btn" ' + (canUseModel ? '' : 'disabled') + ' onclick="previewVoice(\'' + esc(item.id).replace(/'/g, '&#39;') + '\', \'' + esc(sample).replace(/'/g, '&#39;') + '\')">试听当前</button>'
        + (compareBackend ? ('<button class="voice-card-btn" ' + (canCompare ? '' : 'disabled') + ' onclick="previewVoiceBackend(\'' + esc(item.id).replace(/'/g, '&#39;') + '\', \'' + esc(compareBackend).replace(/'/g, '&#39;') + '\', \'' + esc(compareModelId).replace(/'/g, '&#39;') + '\', \'' + esc(sample).replace(/'/g, '&#39;') + '\')">试听推荐</button>') : '')
        + '</div>'
        + (previewHint || diagSummary.length || diagRiskText
          ? ('<div class="voice-model-panel">'
            + '<div class="voice-model-panel-title">角色建议</div>'
            + '<div class="voice-model-list">'
            + (previewHint ? ('<div>' + esc(previewHint) + '</div>') : '')
            + (diagRiskText ? ('<div>' + esc(diagRiskText) + '</div>') : '')
            + (compareBackend && !compareModel ? ('<div>缺少同角色的推荐模型条目：' + esc(compareBackend) + '</div>') : '')
            + (compareBackend && compareModel && !compareModel.installed ? ('<div>推荐模型待导入：' + esc(compareModel.name || compareModel.id) + '</div>') : '')
            + (compareBackend && !canCompare && compareBackendEntry ? ('<div>推荐后端未接入：' + esc(compareBackendEntry.availabilityReason || compareBackend) + '</div>') : '')
            + diagSummary.map(function(line) { return '<div>' + esc(line) + '</div>'; }).join('')
            + '</div></div>')
          : '')
        + '</div>';
    }).join('');
  }

  return {
    currentVoicePayload,
    getSelectedVoiceBackend,
    getSelectedVoiceModelId,
    formatVoiceRouteMap,
    setVoiceBackend,
    setVoiceModel,
    previewVoiceBackend,
    renderVoiceStatus,
    renderVoiceBackends,
    renderVoiceModels,
  };
}
