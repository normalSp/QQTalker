import { state, runtime } from './core/state.js';
import { api, dashboardApi } from './services/dashboard-api.js';
import { bindDashboardNavigation, switchDashboardPage } from './core/router.js';
import { connectSseStream } from './core/sse.js';
import { chartOpts, initCharts as initDashboardCharts, initAnalyticsCharts as initDashboardAnalyticsCharts, updateAnalyticsCharts as updateDashboardAnalyticsCharts } from './core/charts.js';
import { addLogEntry as appendLogEntry, bindLogFilter, clearLogViewer as clearLogViewerComponent } from './components/log-viewer.js';
import { createDashboardPageController } from './pages/dashboard-page.js';
import { createProcessPageController } from './pages/process-page.js';
import { createConfigPageController } from './pages/config-page.js';

// ========== 3D Tilt Effect for Stat Cards ==========
(function init3DTilt() {
  document.addEventListener('mousemove', function(e) {
    document.querySelectorAll('.stat-card').forEach(function(card) {
      var rect = card.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      card.style.setProperty('--glow-x', x + 'px');
      card.style.setProperty('--glow-y', y + 'px');
    });
  });
})();

// ========== Magnetic Button Effect ==========
(function initMagneticBtn() {
  var btns = document.querySelectorAll('.refresh-btn, .analyzer-btn, .save-config-btn');
  btns.forEach(function(btn) {
    btn.addEventListener('mousemove', function(e) {
      var rect = btn.getBoundingClientRect();
      var x = e.clientX - rect.left - rect.width / 2;
      var y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = 'translate(' + (x * 0.2) + 'px, ' + (y * 0.2 - 1) + 'px)';
    });
    btn.addEventListener('mouseleave', function() {
      btn.style.transform = '';
    });
  });
})();

// ========== Scroll Reveal ==========
(function initScrollReveal() {
  var content = document.querySelector('.content');
  if (!content) return;
  content.addEventListener('scroll', function() {
    document.querySelectorAll('.card:not(.visible)').forEach(function(el) {
      var rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.9) {
        el.classList.add('visible');
      }
    });
  });
})();

// ========== Sidebar Mouse Tracking ==========
(function initSidebarGlow() {
  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('mousemove', function(e) {
      var rect = item.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width * 100).toFixed(0);
      var y = ((e.clientY - rect.top) / rect.height * 100).toFixed(0);
      item.style.setProperty('--mx', x + '%');
      item.style.setProperty('--my', y + '%');
    });
  });
})();
// ========== Particle Background ==========
(function initParticles() {
  const c = document.getElementById('particlesBg');
  if (!c) return;
  const ctx = c.getContext('2d');
  let w, h, particles = [];
  const PARTICLE_COUNT = 80;
  const MAX_DIST = 120;

  function resize() { w = c.width = window.innerWidth; h = c.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5,
      a: Math.random() * 0.5 + 0.2,
    });
  }

  let mouseX = -999, mouseY = -999;
  document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
  document.addEventListener('mouseleave', () => { mouseX = -999; mouseY = -999; });

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;

      // Mouse repulsion
      const dx = p.x - mouseX, dy = p.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        const force = (150 - dist) / 150 * 0.02;
        p.vx += dx * force * 0.1;
        p.vy += dy * force * 0.1;
      }
      // Dampen
      p.vx *= 0.99; p.vy *= 0.99;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(108,142,255,' + p.a + ')';
      ctx.fill();

      // Connect nearby particles
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const ddx = p.x - q.x, ddy = p.y - q.y;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d < MAX_DIST) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = 'rgba(108,142,255,' + ((1 - d / MAX_DIST) * 0.12) + ')';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

// ========== GSAP Entrance Animations ==========
window.addEventListener('load', function() {
  const app = document.getElementById('appLayout');
  if (!app) return;

  // First do initial data load, then animate
  refreshAll().then(function() {
    // Main app fade in
    gsap.to(app, { opacity: 1, duration: 0.6, ease: 'power2.out' });

    // Sidebar entrance
    gsap.from('.sidebar', { x: -60, opacity: 0, duration: 0.7, ease: 'power3.out', delay: 0.2 });

    // Topbar entrance
    gsap.from('.topbar', { y: -30, opacity: 0, duration: 0.5, ease: 'power2.out', delay: 0.3 });

    // Stat cards stagger
    gsap.from('.stat-card', {
      y: 40, opacity: 0, duration: 0.6,
      stagger: { amount: 0.5, grid: 'auto', from: 'start' },
      ease: 'power3.out', delay: 0.5,
      onComplete: function() {
        document.querySelectorAll('.stat-card').forEach(function(el) { el.style.opacity = ''; el.style.transform = ''; });
      }
    });

    // Cards stagger
    gsap.from('.card', {
      y: 30, opacity: 0, scale: 0.97, duration: 0.5,
      stagger: { amount: 0.4, grid: 'auto', from: 'start' },
      ease: 'power2.out', delay: 0.8,
      onComplete: function() {
        document.querySelectorAll('.card').forEach(function(el) { el.style.opacity = ''; el.style.transform = ''; el.style.transform = ''; });
      }
    });
  });
});

// ========== Utils ==========

function fmt(n) { return Number(n || 0).toLocaleString(); }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtTime(ts) {
  if (!ts) return '未执行';
  try { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); }
  catch (e) { return '未执行'; }
}
function slCurrentGroup() {
  return document.getElementById('slGroupSelect').value || state.selfLearning.groupId || '';
}
function slRequireGroup(actionText) {
  var groupId = slCurrentGroup();
  if (!groupId) {
    toast((actionText || '该操作') + '需要先选择群号', 'error');
    return '';
  }
  return groupId;
}
function downloadUtf8Json(filename, data) {
  var text = '\uFEFF' + JSON.stringify(data, null, 2);
  var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 500);
}
function toast(msg, type) {
  type = type || 'info';
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(function() { t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; t.style.transition = 'all 0.3s'; setTimeout(function() { t.remove(); }, 300); }, 3000);
}

// ========== Navigation with animated transitions ==========
function switchPage(page) {
  return switchDashboardPage(page, {
    onSelfLearning: function() { loadSelfLearningPanel(false); },
    onConfig: function() { applyConfigFieldMeta(); loadConfig(); setConfigSection(configPage.getActiveSection()); },
    onProcess: renderProcess,
    onAnalytics: initAnalyticsCharts,
    onChatlog: function() { if (chatLogState.messages.length === 0) loadChatLogs(); },
    onBlocklist: loadBlockList,
  });
}

bindDashboardNavigation(switchPage);

// ========== SSE Connection ==========
function connectSSE() {
  runtime.es = connectSseStream({
    state: state,
    runtime: runtime,
    onEvent: handleSseEvent,
    onConnectionChange: updateConnection,
  });
}

function handleSseEvent(type, e) {
  const d = JSON.parse(e.data);
  addLogEntry(type, d.data.message || d.data);
  if (type === 'message') refreshStats();
  if (type === 'ai') refreshStats();
}

// ========== Connection ==========
function updateConnection(connected) {
  state.connected = connected;
  const dot = document.getElementById('connDot');
  const txt = document.getElementById('connText');
  if (connected) {
    dot.className = 'conn-dot online';
    txt.textContent = '已连接';
    txt.style.color = 'var(--success)';
  } else {
    dot.className = 'conn-dot offline';
    txt.textContent = '未连接';
    txt.style.color = 'var(--danger)';
  }
}

// ========== Charts Init ==========
function initCharts() {
  return initDashboardCharts(runtime);
}

function initAnalyticsCharts() {
  return initDashboardAnalyticsCharts(state, runtime);
}

function updateAnalyticsCharts() {
  return updateDashboardAnalyticsCharts(state, runtime);
}

// ========== Log Management ==========
function addLogEntry(type, msg) {
  appendLogEntry({ state, runtime, type, msg, esc });
}

function clearLogViewer() {
  clearLogViewerComponent();
}

bindLogFilter({ state, runtime, esc });

// ========== Config Management ==========
let voiceTrainingTaskPoller = null;
const configPage = createConfigPageController({
  state,
  dashboardApi,
  renderVoiceBackends,
  renderVoiceModels,
  updateAstrbotComplexTaskStatus,
  loadVoicePanel,
  startVoiceTrainingTaskPolling,
  stopVoiceTrainingTaskPolling,
  formatVoiceRouteMap,
  toast,
});

const applyConfigFieldMeta = configPage.applyConfigFieldMeta;
const setConfigSection = configPage.setConfigSection;
const loadConfig = configPage.loadConfig;
const saveConfig = configPage.saveConfig;
configPage.bindTabs();

function getAstrbotFilteredEvents(snapshot) {
  const statusFilter = (document.getElementById('astrbotEventFilterStatus') || {}).value || 'all';
  const routeFilter = (document.getElementById('astrbotEventFilterRoute') || {}).value || 'all';
  const keywordFilter = (((document.getElementById('astrbotEventFilterKeyword') || {}).value) || '').trim().toLowerCase();
  return (snapshot && snapshot.recentEvents ? snapshot.recentEvents : []).filter(function(item) {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (routeFilter === 'none' && item.route) return false;
    if (routeFilter !== 'all' && routeFilter !== 'none' && item.route !== routeFilter) return false;
    if (keywordFilter) {
      const haystack = ((item.reason || '') + ' ' + (item.preview || '')).toLowerCase();
      if (!haystack.includes(keywordFilter)) return false;
    }
    return true;
  });
}

function updateAstrbotEventFilter() {
  updateAstrbotComplexTaskStatus(state.astrbot ? state.astrbot.snapshot : null);
}

function updateAstrbotComplexTaskStatus(snapshot) {
  const pill = document.getElementById('astrbotComplexTaskStatus');
  const meta = document.getElementById('astrbotComplexTaskMeta');
  const detail = document.getElementById('astrbotComplexTaskDetail');
  if (state.astrbot) state.astrbot.snapshot = snapshot || null;
  if (!pill || !meta) return;
  if (!snapshot || !snapshot.configured) {
    pill.textContent = '复杂任务委托：未配置';
    pill.className = 'voice-status-pill error';
    meta.textContent = '尚未配置 AstrBot QQ 号，复杂任务自动委托不会启用。';
    if (detail) {
      detail.innerHTML = '<div class="voice-model-panel-title">AstrBot 联动详情</div><div class="voice-muted">尚未配置 AstrBot QQ 号。</div>';
    }
    return;
  }
  const enabled = document.getElementById('cfg-astrbotEnabledComplexTasks')?.classList.contains('on');
  pill.textContent = enabled ? '复杂任务委托：已启用' : '复杂任务委托：待开启';
  pill.className = 'voice-status-pill ' + (enabled ? 'ok' : 'error');
  meta.textContent =
    '自动委托 ' + (snapshot.complexTaskRequests || 0) +
    ' 次，显式委托 ' + (snapshot.explicitRequests || 0) +
    ' 次，回退本地 ' + (snapshot.fallbackToLocalCount || 0) +
    ' 次，待回包 ' + (snapshot.pendingReplyCount || 0) + ' 条。';
  if (detail) {
    const events = getAstrbotFilteredEvents(snapshot);
    const decisionCounts = snapshot.decisionCounts || {};
    const lastEvent = snapshot.lastEvent || null;
    const topReasons = Object.entries(decisionCounts).slice(0, 6).map(function(entry) {
      return entry[0] + ':' + entry[1];
    }).join(' / ');
    detail.innerHTML = '<div class="voice-model-panel-title">AstrBot 联动详情</div>'
      + '<div class="voice-model-list">'
      + '<div><strong>激活转发群</strong>：' + esc((snapshot.activeGroups || []).join(', ') || '无') + '</div>'
      + '<div><strong>最近匹配关键词</strong>：' + esc((snapshot.lastMatchedKeywords || []).join(', ') || '无') + '</div>'
      + '<div><strong>最近决策</strong>：' + esc(lastEvent ? ((lastEvent.status || '-') + ' / ' + (lastEvent.reason || '-') + ' / 群' + (lastEvent.groupId || '-')) : '暂无') + '</div>'
      + '<div><strong>决策计数</strong>：' + esc(topReasons || '暂无') + '</div>'
      + '<div><strong>筛选结果</strong>：' + esc(String(events.length)) + ' / ' + esc(String((snapshot.recentEvents || []).length)) + '</div>'
      + '<div><strong>最近事件</strong>：' + (events.length
        ? events.slice(0, 5).map(function(item) {
            return '<div>' + esc(item.status + ' / ' + (item.route || '-') + ' / ' + (item.reason || '-') + ' / 群' + (item.groupId || '-') + (item.preview ? (' / ' + item.preview) : '')) + '</div>';
          }).join('')
        : '<div>暂无</div>') + '</div>'
      + '</div>';
  }
}

// ========== Voice Broadcast Plugin ==========
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

function setVoiceModel(modelId, backend) {
  const modelEl = document.getElementById('cfg-ttsModel');
  if (modelEl) modelEl.value = modelId || '';
  if (backend) setVoiceBackend(backend, { silent: true });
  renderVoiceModels(state.voice.models || []);
  toast('已选中默认语音模型，记得保存到 .env', 'success');
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

function renderVoiceTrainingCharacters(characters) {
  const wrap = document.getElementById('voiceTrainingCharacters');
  if (!wrap) return;
  if (!characters || !characters.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:20px 0;"><div class="empty-text">训练工作区还没有角色目录</div></div>';
    return;
  }
  wrap.innerHTML = characters.map(function(item) {
    const qualityText = '来源 ' + (item.sourceCount || 0) + ' / 版本 ' + (item.versionCount || 0)
      + ' / 切片 ' + (item.totalSegments || 0) + ' / 可用 ' + (item.usableSegments || 0);
    const assetText = 'raw ' + (item.rawFileCount || 0)
      + ' / cleaned ' + (item.cleanedFileCount || 0)
      + ' / segments ' + (item.segmentFileCount || 0);
    const flags = [
      item.summaryReady ? 'summary-ready' : 'summary-missing',
      item.manifestReady ? 'manifest-ready' : 'manifest-missing',
      item.versionsReady ? 'versions-ready' : 'versions-missing',
    ].join(' | ');
    return '<div class="voice-model-card">'
      + '<div class="voice-card-head"><div><div class="voice-card-title">' + esc(item.name || item.id) + '</div>'
      + '<div class="voice-card-sub">' + esc(item.strategy || '暂无训练策略说明') + '</div></div>'
      + '<span class="voice-card-status ' + ((item.usableSegments || 0) > 0 ? 'active' : 'experimental') + '">'
      + (((item.usableSegments || 0) > 0) ? '可继续训练' : '待整理') + '</span></div>'
      + '<div class="voice-model-meta"><span>' + esc(qualityText) + '</span><span>' + esc(assetText) + '</span></div>'
      + '<div class="voice-muted" style="margin-top:10px;">' + esc(flags)
      + (item.lastGeneratedAt ? (' / manifest ' + esc(item.lastGeneratedAt)) : '') + '</div>'
      + '<div class="voice-model-actions wrap">'
      + '<button class="voice-card-btn primary" onclick="loadVoiceTrainingDetail(\'' + esc(item.id) + '\')">查看详情</button>'
      + '<button class="voice-card-btn" onclick="runVoiceTrainingAction(\'clips-suggest\', \'' + esc(item.id) + '\')">建议切片</button>'
      + '<button class="voice-card-btn" onclick="runVoiceTrainingAction(\'transcribe\', \'' + esc(item.id) + '\')">批量转写</button>'
      + '<button class="voice-card-btn success" onclick="runVoiceTrainingAction(\'manifest\', \'' + esc(item.id) + '\')">生成清单</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function renderVoiceTrainingScripts(scripts) {
  const wrap = document.getElementById('voiceTrainingScripts');
  if (!wrap) return;
  if (!scripts || !scripts.length) {
    wrap.innerHTML = '<div class="voice-muted">暂无训练脚本说明</div>';
    return;
  }
  wrap.innerHTML = scripts.map(function(item) {
    return '<div><strong>' + esc(item.label) + '</strong>：'
      + esc(item.description) + ' <code>' + esc(item.command) + '</code></div>';
  }).join('');
}

function renderVoiceTrainingQueue(taskState) {
  const wrap = document.getElementById('voiceTrainingQueue');
  if (!wrap) return;
  const runningTask = taskState && taskState.runningTask ? taskState.runningTask : null;
  const queuedTasks = taskState && taskState.queuedTasks ? taskState.queuedTasks : [];
  if (!runningTask && !queuedTasks.length) {
    wrap.innerHTML = '<div class="voice-muted">当前没有排队中的训练任务。</div>';
    return;
  }
  wrap.innerHTML = ''
    + (runningTask
      ? ('<div><strong>运行中</strong> / ' + esc(runningTask.action)
        + (runningTask.characterId ? (' / ' + esc(runningTask.characterId)) : '')
        + (runningTask.startedAt ? (' / started ' + esc(runningTask.startedAt)) : '')
        + '</div>')
      : '')
    + (queuedTasks.length
      ? queuedTasks.map(function(task, index) {
          return '<div><strong>排队 #' + esc(String(index + 1)) + '</strong> / ' + esc(task.action)
            + (task.characterId ? (' / ' + esc(task.characterId)) : '')
            + (task.queuedAt ? (' / queued ' + esc(task.queuedAt)) : '')
            + '</div>';
        }).join('')
      : '');
}

function renderVoiceTrainingTasks(tasks) {
  const wrap = document.getElementById('voiceTrainingTasks');
  if (!wrap) return;
  if (!tasks || !tasks.length) {
    wrap.innerHTML = '<div class="voice-muted">最近还没有训练任务记录。</div>';
    return;
  }
  wrap.innerHTML = tasks.map(function(task) {
    return '<div><strong>' + esc(task.action) + '</strong>'
      + (task.characterId ? (' / ' + esc(task.characterId)) : '')
      + ' / ' + esc(task.status)
      + (task.queuedAt ? (' / queued ' + esc(task.queuedAt)) : '')
      + (task.startedAt ? (' / started ' + esc(task.startedAt)) : '')
      + (task.finishedAt ? (' / ' + esc(task.finishedAt)) : '')
      + (task.error ? (' / error: ' + esc(task.error)) : '')
      + '</div>';
  }).join('');
}

function updateVoiceTrainingStatus(overview, syncOutput) {
  const pill = document.getElementById('voiceTrainingStatus');
  const meta = document.getElementById('voiceTrainingMeta');
  if (!pill || !meta) return;
  if (!overview) {
    pill.textContent = '训练工作区：不可用';
    pill.className = 'voice-status-pill error';
    meta.textContent = '未读取到训练工作区。';
    return;
  }
  const characters = overview.characters || [];
  const readyCount = characters.filter(function(item) { return (item.usableSegments || 0) > 0; }).length;
  const recentTask = overview.recentTasks && overview.recentTasks.length ? overview.recentTasks[0] : null;
  const taskState = overview.taskState || {};
  const queuedCount = (taskState.queuedTasks || []).length;
  const runningTask = taskState.runningTask || null;
  pill.textContent = '训练工作区：已连接';
  pill.className = 'voice-status-pill ok';
  meta.textContent = '角色 ' + characters.length + ' 个，可继续训练 ' + readyCount
    + ' 个，根目录 ' + (overview.trainingRoot || '-')
    + (runningTask ? ('，运行中：' + runningTask.action + (runningTask.characterId ? ('/' + runningTask.characterId) : '')) : '')
    + (queuedCount ? ('，排队中：' + queuedCount + ' 个') : '')
    + (recentTask ? ('，最近任务：' + recentTask.action + ' / ' + recentTask.status) : '')
    + (syncOutput ? ('，最近同步输出：' + syncOutput) : '');
}

function applyVoiceTrainingSnapshot(overview, detail, syncOutput) {
  state.voiceTraining.overview = overview || state.voiceTraining.overview;
  if (detail !== undefined) {
    state.voiceTraining.detail = detail;
  }
  renderVoiceTrainingScripts(state.voiceTraining.overview ? state.voiceTraining.overview.scripts : []);
  renderVoiceTrainingQueue(state.voiceTraining.overview ? state.voiceTraining.overview.taskState : null);
  renderVoiceTrainingTasks(state.voiceTraining.overview ? state.voiceTraining.overview.recentTasks : []);
  renderVoiceTrainingCharacters(state.voiceTraining.overview ? state.voiceTraining.overview.characters : []);
  renderVoiceTrainingDetail(state.voiceTraining.detail);
  updateVoiceTrainingStatus(state.voiceTraining.overview, syncOutput || '');
}

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

async function loadVoiceTrainingPanel() {
  const res = await dashboardApi.getVoiceTrainingOverview();
  state.voiceTraining.overview = (res && res.overview) ? res.overview : null;
  applyVoiceTrainingSnapshot(state.voiceTraining.overview, state.voiceTraining.detail, '');
}

async function loadVoiceTrainingDetail(characterId) {
  state.voiceTraining.selectedCharacterId = characterId || '';
  const res = await dashboardApi.getVoiceTrainingDetail(characterId);
  if (!res || res.success === false) {
    toast('加载训练详情失败：' + ((res && res.error) || 'unknown'), 'error');
    return;
  }
  state.voiceTraining.detail = res.detail;
  renderVoiceTrainingDetail(res.detail);
}

async function refreshVoiceTrainingTaskState() {
  if (configPage.getActiveSection() !== 'voice') return;
  const res = await dashboardApi.getVoiceTrainingTaskState(state.voiceTraining.selectedCharacterId);
  if (!res || res.success === false) return;
  applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, '');
}

function startVoiceTrainingTaskPolling() {
  stopVoiceTrainingTaskPolling();
  voiceTrainingTaskPoller = setInterval(function() {
    refreshVoiceTrainingTaskState().catch(function() {});
  }, 4000);
}

function stopVoiceTrainingTaskPolling() {
  if (voiceTrainingTaskPoller) {
    clearInterval(voiceTrainingTaskPoller);
    voiceTrainingTaskPoller = null;
  }
}

function renderVoiceTrainingDetail(detail) {
  const wrap = document.getElementById('voiceTrainingDetail');
  if (!wrap) return;
  if (!detail) {
    wrap.innerHTML = '<div class="voice-model-panel-title">角色训练详情</div><div class="voice-muted">点击上方角色卡片可查看来源、版本和 manifest 条目。</div>';
    return;
  }
  const sources = detail.sourceItems || [];
  const versions = detail.versionItems || [];
  const entries = detail.manifestEntries || [];
  const releases = detail.releaseHistory || [];
  const reviewEntries = detail.reviewEntries || [];
  const versionRows = versions.slice(0, 8).map(function(item) {
    const versionId = item.id || 'unknown';
    const backend = item.backend || '-';
    const stage = item.stage || '-';
    const active = item.publish && item.publish.active;
    return '<div><strong>' + esc(versionId) + '</strong> / ' + esc(backend) + ' / ' + esc(stage)
      + (active ? ' / 当前发布' : '')
      + ' <button class="voice-card-btn success" style="margin-left:8px;" onclick="publishVoiceTrainingModel(\'' + esc(detail.id).replace(/'/g, '&#39;') + '\', \'' + esc(versionId).replace(/'/g, '&#39;') + '\')">入库模型</button></div>';
  }).join('');
  const releaseRows = releases.slice(0, 8).map(function(item) {
    return '<div><strong>' + esc(item.versionId || 'unknown') + '</strong>'
      + ' / ' + esc(item.modelId || '-')
      + ' / ' + esc(item.publishedAt || '-')
      + (item.rolledBackAt ? (' / rolled-back ' + esc(item.rolledBackAt)) : '')
      + (!item.rolledBackAt
        ? (' <button class="voice-card-btn" style="margin-left:8px;" onclick="rollbackVoiceTrainingRelease(\'' + esc(detail.id).replace(/'/g, '&#39;') + '\', \'' + esc(item.releaseId).replace(/'/g, '&#39;') + '\')">回滚到发布前</button>')
        : '')
      + '</div>';
  }).join('');
  const reviewRows = reviewEntries.slice(0, 8).map(function(item) {
    const entryId = item.id || 'unknown';
    return '<div class="voice-model-panel" style="margin-top:8px;">'
      + '<div class="voice-card-sub"><strong>' + esc(entryId) + '</strong> / ' + esc(item.reviewStatus || '-') + ' / usable=' + esc(String(Boolean(item.usableForTrain))) + '</div>'
      + '<textarea class="config-input" id="review-transcript-' + esc(entryId) + '" style="margin-top:8px;min-height:68px;">' + esc(item.transcript || '') + '</textarea>'
      + '<input class="config-input" id="review-notes-' + esc(entryId) + '" style="margin-top:8px;" value="' + esc(item.notes || '') + '" placeholder="备注">'
      + '<div class="voice-inline-actions" style="margin-top:8px;">'
      + '<select class="config-input" id="review-status-' + esc(entryId) + '" style="max-width:180px;">'
      + '<option value="pending-review"' + ((item.reviewStatus === 'pending-review') ? ' selected' : '') + '>pending-review</option>'
      + '<option value="needs-manual-review"' + ((item.reviewStatus === 'needs-manual-review') ? ' selected' : '') + '>needs-manual-review</option>'
      + '<option value="needs-recut"' + ((item.reviewStatus === 'needs-recut') ? ' selected' : '') + '>needs-recut</option>'
      + '<option value="approved"' + ((item.reviewStatus === 'approved') ? ' selected' : '') + '>approved</option>'
      + '</select>'
      + '<select class="config-input" id="review-transcription-' + esc(entryId) + '" style="max-width:180px;">'
      + '<option value="draft"' + ((item.transcriptionStatus === 'draft') ? ' selected' : '') + '>draft</option>'
      + '<option value="cleaned"' + ((item.transcriptionStatus === 'cleaned') ? ' selected' : '') + '>cleaned</option>'
      + '<option value="empty"' + ((item.transcriptionStatus === 'empty') ? ' selected' : '') + '>empty</option>'
      + '</select>'
      + '<label class="voice-card-sub"><input type="checkbox" id="review-usable-' + esc(entryId) + '"' + (item.usableForTrain ? ' checked' : '') + '> usableForTrain</label>'
      + '<button class="voice-card-btn success" onclick="saveVoiceTrainingReview(\'' + esc(detail.id).replace(/'/g, '&#39;') + '\', \'' + esc(entryId).replace(/'/g, '&#39;') + '\')">保存修订</button>'
      + '</div></div>';
  }).join('');
  wrap.innerHTML = '<div class="voice-model-panel-title">' + esc(detail.name || detail.id) + ' 训练详情</div>'
    + '<div class="voice-muted">space: ' + esc(detail.spaceUrl || '-') + ' / live: ' + esc(detail.liveRoomUrl || '-') + '</div>'
    + '<div class="voice-inline-actions" style="margin-top:10px;">'
    + '<button class="voice-card-btn" onclick="runVoiceTrainingAction(\'clips-suggest\', \'' + esc(detail.id) + '\')">建议切片</button>'
    + '<button class="voice-card-btn" onclick="runVoiceTrainingAction(\'transcribe\', \'' + esc(detail.id) + '\')">批量转写</button>'
    + '<button class="voice-card-btn success" onclick="runVoiceTrainingAction(\'manifest\', \'' + esc(detail.id) + '\')">生成清单</button>'
    + '</div>'
    + '<div class="voice-model-list" style="margin-top:10px;">'
    + '<div><strong>来源候选</strong>：' + sources.slice(0, 5).map(function(item) { return esc(item.title || item.id || 'unknown'); }).join(' / ') + '</div>'
    + '<div><strong>训练版本</strong>：</div>' + (versionRows || '<div>暂无</div>')
    + '<div><strong>发布历史</strong>：</div>' + (releaseRows || '<div>暂无</div>')
    + '<div><strong>最近 manifest 条目</strong>：' + entries.slice(0, 5).map(function(item) { return esc(item.id || 'unknown'); }).join(' / ') + '</div>'
    + '<div><strong>浏览器质检与转写修订</strong>：</div>' + (reviewRows || '<div>暂无</div>')
    + '</div>';
}

async function syncVoiceTrainingWorkspace() {
  const res = await api('/api/voice-training/sync', { method: 'POST' });
  if (!res || res.success === false) {
    toast('训练工作区同步失败：' + ((res && res.error) || 'unknown'), 'error');
    return;
  }
  applyVoiceTrainingSnapshot(res.overview || null, state.voiceTraining.detail, res.output || '');
  toast('训练工作区摘要已同步', 'success');
}

async function runVoiceTrainingAction(action, characterId) {
  const res = await api('/api/voice-training/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: action, characterId: characterId || '' })
  });
  if (!res || res.success === false) {
    toast('训练任务执行失败：' + ((res && res.error) || 'unknown'), 'error');
    return;
  }
  applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, '');
  if (res.task && res.task.status === 'queued') {
    toast('训练任务已入队：' + action, 'success');
    refreshVoiceTrainingTaskState().catch(function() {});
    return;
  }
  if (action === 'publish-model') {
    await loadVoicePanel();
    toast('训练版本已入库并刷新模型目录', 'success');
    return;
  }
  toast('训练任务完成：' + action, 'success');
}

async function publishVoiceTrainingModel(characterId, versionId) {
  const res = await api('/api/voice-training/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'publish-model', characterId: characterId, versionId: versionId })
  });
  if (!res || res.success === false) {
    toast('训练版本入库失败：' + ((res && res.error) || 'unknown'), 'error');
    return;
  }
  applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, res.task && res.task.output ? res.task.output : '');
  await loadVoicePanel();
  toast('训练版本已入库：' + versionId, 'success');
}

async function rollbackVoiceTrainingRelease(characterId, releaseId) {
  const res = await api('/api/voice-training/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'rollback-model', characterId: characterId, releaseId: releaseId })
  });
  if (!res || res.success === false) {
    toast('训练版本回滚失败：' + ((res && res.error) || 'unknown'), 'error');
    return;
  }
  applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, res.task && res.task.output ? res.task.output : '');
  await loadVoicePanel();
  toast('训练版本已回滚', 'success');
}

async function importVoiceTrainingRaw() {
  const characterId = (document.getElementById('voiceTrainingImportCharacter').value || '').trim();
  const sourcePath = (document.getElementById('voiceTrainingImportPath').value || '').trim();
  if (!characterId || !sourcePath) {
    toast('请先填写导入角色和本地素材路径', 'error');
    return;
  }
  const res = await api('/api/voice-training/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'import-raw', characterId: characterId, sourcePath: sourcePath })
  });
  if (!res || res.success === false) {
    toast('导入素材失败：' + ((res && res.error) || 'unknown'), 'error');
    return;
  }
  applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, res.task && res.task.output ? res.task.output : '');
  toast('原始素材导入完成', 'success');
}

async function handleVoiceTrainingUpload(event) {
  const input = event && event.target;
  const file = input && input.files && input.files[0];
  const characterId = (document.getElementById('voiceTrainingImportCharacter').value || '').trim();
  if (!characterId) {
    toast('请先填写导入角色，再选择上传文件', 'error');
    if (input) input.value = '';
    return;
  }
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    const uploadId = 'upload-' + Date.now();
    const chunkSize = 1024 * 1024;
    let offset = 0;
    while (offset < file.size) {
      const chunk = file.slice(offset, offset + chunkSize);
      const base64 = await new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function() {
          const result = String(reader.result || '');
          resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(chunk);
      });
      const res = await api('/api/voice-training/upload-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: characterId,
          uploadId: uploadId,
          fileName: file.name,
          fileBase64Chunk: base64,
          finalize: offset + chunk.size >= file.size,
        })
      });
      if (!res || res.success === false) {
        toast('分片上传失败：' + ((res && res.error) || 'unknown'), 'error');
        if (input) input.value = '';
        return;
      }
      applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, res.output || '');
      offset += chunk.size;
    }
    toast('大文件分片上传完成：' + file.name, 'success');
    if (input) input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = async function() {
    const result = String(reader.result || '');
    const base64 = result.includes(',') ? result.split(',')[1] : result;
    const res = await api('/api/voice-training/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload-raw',
        characterId: characterId,
        fileName: file.name,
        fileBase64: base64,
      })
    });
    if (!res || res.success === false) {
      toast('上传素材失败：' + ((res && res.error) || 'unknown'), 'error');
      if (input) input.value = '';
      return;
    }
    applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, res.task && res.task.output ? res.task.output : '');
    toast('上传素材完成：' + file.name, 'success');
    if (input) input.value = '';
  };
  reader.onerror = function() {
    toast('读取上传文件失败', 'error');
    if (input) input.value = '';
  };
  reader.readAsDataURL(file);
}

async function saveVoiceTrainingReview(characterId, entryId) {
  const transcript = (document.getElementById('review-transcript-' + entryId).value || '').trim();
  const notes = (document.getElementById('review-notes-' + entryId).value || '').trim();
  const reviewStatus = (document.getElementById('review-status-' + entryId).value || '').trim();
  const transcriptionStatus = (document.getElementById('review-transcription-' + entryId).value || '').trim();
  const usableForTrain = document.getElementById('review-usable-' + entryId).checked;
  const res = await api('/api/voice-training/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      characterId: characterId,
      entryId: entryId,
      transcript: transcript,
      notes: notes,
      reviewStatus: reviewStatus,
      transcriptionStatus: transcriptionStatus,
      usableForTrain: usableForTrain,
    })
  });
  if (!res || res.success === false) {
    toast('保存训练修订失败：' + ((res && res.error) || 'unknown'), 'error');
    return;
  }
  applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, '');
  toast('训练修订已保存', 'success');
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

// ========== Process Page ==========
const processPage = createProcessPageController({ dashboardApi });
const renderProcess = processPage.renderProcess;

// ========== Refresh ==========
const dashboardPage = createDashboardPageController({
  state,
  runtime,
  dashboardApi,
  fmt,
  updateConnection,
  updateAnalyticsCharts,
  loadSelfLearningPanel,
});

const refreshStats = dashboardPage.refreshStats;
const refreshAll = dashboardPage.refreshAll;
const manualRefresh = dashboardPage.manualRefresh;

// ========== Self Learning ==========
function renderSimpleEmpty(text) {
  return '<div class="empty-state"><div class="empty-icon">&#129300;</div><div class="empty-text">' + text + '</div></div>';
}

function renderSelfLearningList(items, renderItem) {
  if (!items || !items.length) return renderSimpleEmpty('暂无数据');
  return '<div style="display:flex;flex-direction:column;gap:10px;">' + items.map(renderItem).join('') + '</div>';
}

function formatUserDisplay(userId, nickname) {
  var idText = String(userId || '');
  var nickText = String(nickname || '').trim();
  if (!nickText) return esc(idText);
  return esc(nickText) + ' <span style="color:var(--text-muted);font-size:12px;">(' + esc(idText) + ')</span>';
}

function renderLearningStrategyPanel() {
  var strategy = state.selfLearning.strategy || {};
  var runtime = strategy.runtime || {};
  var settings = strategy.settings || {};
  var autoEnabled = !!runtime.autoLearningEnabled;
  return '' +
    '<div style="display:flex;flex-direction:column;gap:14px;">' +
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">' +
        '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">' +
          '<div style="font-size:12px;color:var(--text-muted);">运行态自动学习</div>' +
          '<div style="margin-top:6px;font-size:18px;font-weight:700;color:' + (autoEnabled ? 'var(--success)' : 'var(--warning)') + ';">' + (autoEnabled ? '已开启' : '已暂停') + '</div>' +
          '<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">上次执行：' + esc(fmtTime(runtime.lastLearningAt || 0)) + '</div>' +
          '<div style="margin-top:4px;font-size:12px;color:var(--text-secondary);">预计下次：' + esc(fmtTime(runtime.nextLearningAt || 0)) + '</div>' +
        '</div>' +
        '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">' +
          '<div style="font-size:12px;color:var(--text-muted);">当前选中群</div>' +
          '<div style="margin-top:6px;font-size:18px;font-weight:700;color:var(--accent);">' + esc(slCurrentGroup() || '未选择') + '</div>' +
          '<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">手动学习、清理与重建都将作用于当前群。</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">' +
        '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">学习间隔(小时)<input id="slStrategyInterval" data-testid="sl-strategy-interval" class="config-input" type="number" min="1" value="' + esc(String(settings.learningIntervalHours || 6)) + '"></label>' +
        '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">最少消息数<input id="slStrategyMinMessages" class="config-input" type="number" min="1" value="' + esc(String(settings.minMessagesForLearning || 30)) + '"></label>' +
        '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">批处理上限<input id="slStrategyMaxBatch" class="config-input" type="number" min="1" value="' + esc(String(settings.maxMessagesPerBatch || 200)) + '"></label>' +
        '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">ML 样本上限<input id="slStrategyMlSample" class="config-input" type="number" min="1" value="' + esc(String(settings.maxMlSampleSize || 120)) + '"></label>' +
        '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">总好感度池<input id="slStrategyAffectionCap" class="config-input" type="number" min="1" value="' + esc(String(settings.totalAffectionCap || 250)) + '"></label>' +
        '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">单用户好感上限<input id="slStrategyUserCap" class="config-input" type="number" min="1" value="' + esc(String(settings.maxUserAffection || 100)) + '"></label>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-primary);">' +
        '<input id="slStrategyEnableMl" data-testid="sl-strategy-enable-ml" type="checkbox" ' + (settings.enableMlAnalysis ? 'checked' : '') + '>' +
        '<span>启用高级 ML/聚类分析</span>' +
      '</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
        '<button class="analyzer-btn primary" id="slToggleRuntimeBtn" data-testid="sl-toggle-runtime" onclick="toggleLearningRuntime()">' + (autoEnabled ? '暂停自动学习' : '开启自动学习') + '</button>' +
        '<button class="analyzer-btn" id="slSaveStrategyBtn" data-testid="sl-save-strategy" onclick="saveLearningStrategy()">保存策略到 .env</button>' +
      '</div>' +
    '</div>';
}

function renderLearningDataOpsPanel() {
  return '' +
    '<div style="display:flex;flex-direction:column;gap:14px;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
        '<button class="analyzer-btn" id="slExportCurrentBtn" data-testid="sl-export-current" onclick="exportLearningData(true)">导出当前群</button>' +
        '<button class="analyzer-btn" id="slExportAllBtn" data-testid="sl-export-all" onclick="exportLearningData(false)">导出全部</button>' +
        '<button class="analyzer-btn" id="slImportFileBtn" data-testid="sl-import-file" onclick="triggerLearningImportFile()">选择导入文件</button>' +
        '<button class="analyzer-btn" id="slRebuildBtn" data-testid="sl-rebuild-snapshot" onclick="rebuildLearningSnapshots()">重建分析快照</button>' +
        '<button class="analyzer-btn" id="slClearGroupBtn" data-testid="sl-clear-group" style="background:var(--danger);color:#fff;border:none;" onclick="clearLearningGroup()">清理当前群学习记录</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:start;">' +
        '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">导入模式<select id="slImportMode" data-testid="sl-import-mode" class="config-input" onchange="state.selfLearning.importMode=this.value"><option value="merge"' + (state.selfLearning.importMode === 'merge' ? ' selected' : '') + '>合并导入</option><option value="replace"' + (state.selfLearning.importMode === 'replace' ? ' selected' : '') + '>覆盖导入</option></select></label>' +
        '<div style="font-size:12px;color:var(--text-secondary);line-height:1.7;padding-top:2px;">支持粘贴或选择 UTF-8 JSON 文件；导出文件会附带 UTF-8 BOM，便于在 Windows 下直接查看。</div>' +
      '</div>' +
      '<textarea id="slImportPayload" data-testid="sl-import-payload" class="config-input" placeholder="把导出的学习数据 JSON 粘贴到这里，或点击上方“选择导入文件”" style="min-height:160px;resize:vertical;font-family:JetBrains Mono, monospace;"></textarea>' +
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">' +
        '<div style="font-size:12px;color:var(--text-muted);">当前群：' + esc(slCurrentGroup() || '未选择') + '</div>' +
        '<button class="analyzer-btn primary" id="slImportBtn" data-testid="sl-import-btn" onclick="importLearningData()">执行导入</button>' +
      '</div>' +
    '</div>';
}

function renderLearningControlPanels() {
  document.getElementById('slStrategyPanel').innerHTML = renderLearningStrategyPanel();
  document.getElementById('slDataOpsPanel').innerHTML = renderLearningDataOpsPanel();
}

async function loadSelfLearningPanel(showToast) {
  const [overviewData, strategyData, status] = await Promise.all([
    api('/api/self-learning/overview'),
    api('/api/self-learning/strategy'),
    api('/api/status'),
  ]);
  state.selfLearning.strategy = strategyData || null;
  if (!overviewData || !overviewData.overview) {
    renderLearningControlPanels();
    document.getElementById('slStylesPanel').innerHTML = renderSimpleEmpty('自学习插件未启用或尚未初始化');
    document.getElementById('slSlangPanel').innerHTML = renderSimpleEmpty('无可用数据');
    document.getElementById('slSocialPanel').innerHTML = renderSimpleEmpty('无可用数据');
    document.getElementById('slAffectionPanel').innerHTML = renderSimpleEmpty('无可用数据');
    document.getElementById('slGoalsPanel').innerHTML = renderSimpleEmpty('无可用数据');
    document.getElementById('slMemoryPanel').innerHTML = renderSimpleEmpty('无可用数据');
    document.getElementById('slClustersPanel').innerHTML = renderSimpleEmpty('无可用数据');
    document.getElementById('slScenesPanel').innerHTML = renderSimpleEmpty('无可用数据');
    document.getElementById('slAdvancedSummaryPanel').innerHTML = renderSimpleEmpty('无可用数据');
    document.getElementById('slReviewsPanel').innerHTML = renderSimpleEmpty('无可用数据');
    document.getElementById('slRunsPanel').innerHTML = renderSimpleEmpty('无可用数据');
    return;
  }

  state.selfLearning.overview = overviewData.overview;
  document.getElementById('slStatMessages').textContent = fmt(overviewData.overview.messages);
  document.getElementById('slStatPatterns').textContent = fmt(overviewData.overview.patterns);
  document.getElementById('slStatSlang').textContent = fmt(overviewData.overview.slang);
  document.getElementById('slStatMemories').textContent = fmt(overviewData.overview.memories);
  document.getElementById('slStatReviews').textContent = fmt(overviewData.overview.pendingReviews);

  const groups = Array.from(new Set([].concat((overviewData.groups || []).map(String), (status.activeGroups || []).map(String))));
  state.selfLearning.groups = groups;
  const select = document.getElementById('slGroupSelect');
  const current = select.value || state.selfLearning.groupId || groups[0] || '';
  state.selfLearning.groupId = current;
  select.innerHTML = '<option value="">自动选择</option>' + groups.map(g => '<option value="' + g + '">' + g + '</option>').join('');
  select.value = current;
  renderLearningControlPanels();

  if (!current) {
    document.getElementById('slStylesPanel').innerHTML = renderSimpleEmpty('等待群聊消息后会出现学习数据');
    document.getElementById('slSlangPanel').innerHTML = renderSimpleEmpty('请先选择或激活一个群');
    document.getElementById('slSocialPanel').innerHTML = renderSimpleEmpty('请先选择或激活一个群');
    document.getElementById('slAffectionPanel').innerHTML = renderSimpleEmpty('请先选择或激活一个群');
    document.getElementById('slGoalsPanel').innerHTML = renderSimpleEmpty('请先选择或激活一个群');
    document.getElementById('slMemoryPanel').innerHTML = renderSimpleEmpty('请先选择或激活一个群');
    document.getElementById('slClustersPanel').innerHTML = renderSimpleEmpty('请先选择或激活一个群');
    document.getElementById('slScenesPanel').innerHTML = renderSimpleEmpty('请先选择或激活一个群');
    document.getElementById('slAdvancedSummaryPanel').innerHTML = renderSimpleEmpty('请先选择或激活一个群');
    document.getElementById('slReviewsPanel').innerHTML = renderSimpleEmpty('请先选择或激活一个群');
    document.getElementById('slRunsPanel').innerHTML = renderSimpleEmpty('请先选择或激活一个群');
    return;
  }

  const query = '?groupId=' + encodeURIComponent(current);
  const [styles, slang, social, affection, mood, goals, memories, reviews, advancedSummary, clusters, scenes, memoryGraph, runs] = await Promise.all([
    api('/api/self-learning/styles' + query),
    api('/api/self-learning/slang' + query),
    api('/api/self-learning/social' + query),
    api('/api/self-learning/affection' + query),
    api('/api/self-learning/mood' + query),
    api('/api/self-learning/goals' + query),
    api('/api/self-learning/memories' + query),
    api('/api/self-learning/persona-reviews' + query),
    api('/api/self-learning/advanced-summary' + query),
    api('/api/self-learning/ml-clusters' + query),
    api('/api/self-learning/scene-map' + query),
    api('/api/self-learning/memory-graph' + query),
    api('/api/self-learning/learning-runs' + query),
  ]);

  state.selfLearning.styles = styles.items || [];
  state.selfLearning.slang = slang.items || [];
  state.selfLearning.social = social.items || [];
  state.selfLearning.affection = affection.items || [];
  state.selfLearning.mood = mood.item || null;
  state.selfLearning.goals = goals.items || [];
  state.selfLearning.memories = memories.items || [];
  state.selfLearning.reviews = reviews.items || [];
  state.selfLearning.advancedSummary = advancedSummary.item || null;
  state.selfLearning.clusters = clusters.items || [];
  state.selfLearning.scenes = scenes.items || [];
  state.selfLearning.memoryGraph = memoryGraph.item || { nodes: [], edges: [] };
  state.selfLearning.runs = runs.items || [];

  document.getElementById('slStylesPanel').innerHTML = renderSelfLearningList(state.selfLearning.styles.slice(0, 10), item =>
    '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;"><strong>' + esc(item.patternType) + '</strong><span style="color:var(--accent);font-size:12px;">权重 ' + Number(item.weight || 0).toFixed(1) + '</span></div>' +
      '<div style="margin-top:6px;color:var(--text-primary);">' + esc(item.patternValue || '') + '</div>' +
      '<div style="margin-top:4px;font-size:12px;color:var(--text-muted);">用户 ' + formatUserDisplay(item.userId, item.nickname) + ' · 证据 ' + esc(String(item.evidenceCount || 0)) + '</div>' +
    '</div>'
  );

  document.getElementById('slSlangPanel').innerHTML = renderSelfLearningList(state.selfLearning.slang.slice(0, 10), item =>
    '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;"><strong style="color:var(--accent);">' + esc(item.term || '') + '</strong><span style="font-size:12px;color:var(--text-muted);">' + esc(String(item.usageCount || 0)) + ' 次</span></div>' +
      '<div style="margin-top:6px;color:var(--text-secondary);font-size:13px;line-height:1.6;">' + esc(item.meaning || '') + '</div>' +
    '</div>'
  );

  document.getElementById('slSocialPanel').innerHTML = renderSelfLearningList(state.selfLearning.social.slice(0, 12), item =>
    '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);display:flex;justify-content:space-between;gap:12px;align-items:center;">' +
      '<div><div><strong>' + formatUserDisplay(item.sourceUserId, item.sourceNickname) + '</strong> → <strong>' + formatUserDisplay(item.targetUserId, item.targetNickname) + '</strong></div><div style="margin-top:6px;font-size:12px;color:var(--text-muted);">' + esc(item.relationType || '') + ' · 互动 ' + esc(String(item.interactions || 0)) + '</div></div>' +
      '<div style="font-size:18px;color:var(--accent);font-weight:700;">' + Number(item.score || 0).toFixed(1) + '</div>' +
    '</div>'
  );

  document.getElementById('slAffectionPanel').innerHTML =
    '<div style="margin-bottom:12px;padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">当前情绪</div>' +
      '<div style="font-size:18px;font-weight:700;color:var(--accent);">' + esc(state.selfLearning.mood ? state.selfLearning.mood.mood : 'curious') + '</div>' +
      '<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">' + esc(state.selfLearning.mood ? state.selfLearning.mood.reason : '等待更多聊天样本') + '</div>' +
    '</div>' +
    renderSelfLearningList(state.selfLearning.affection.slice(0, 10), item =>
      '<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
        '<div><strong>' + formatUserDisplay(item.userId, item.nickname) + '</strong><div style="margin-top:4px;font-size:12px;color:var(--text-muted);">最近波动 ' + Number(item.lastDelta || 0).toFixed(1) + '</div></div>' +
        '<div style="font-size:20px;color:var(--pink);font-weight:700;">' + Number(item.score || 0).toFixed(1) + '</div>' +
      '</div>'
    );

  document.getElementById('slGoalsPanel').innerHTML = renderSelfLearningList(state.selfLearning.goals.slice(0, 10), item =>
    '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;"><strong>' + esc(item.goalType || '') + '</strong><span style="font-size:12px;color:var(--text-muted);">用户 ' + esc(String(item.userId || '')) + '</span></div>' +
      '<div style="margin-top:6px;color:var(--text-secondary);font-size:13px;line-height:1.6;">' + esc(item.summary || '') + '</div>' +
    '</div>'
  );

  document.getElementById('slMemoryPanel').innerHTML = renderSelfLearningList(state.selfLearning.memories.slice(0, 12), item =>
    '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;"><strong>' + esc(item.key || '') + '</strong><span style="font-size:12px;color:var(--text-muted);">重要度 ' + Number(item.importance || 0).toFixed(2) + '</span></div>' +
      '<div style="margin-top:6px;color:var(--text-secondary);font-size:13px;line-height:1.6;">' + esc(item.content || '') + '</div>' +
      '<div style="margin-top:8px;font-size:12px;color:var(--accent);">' + (item.tags || []).map(tag => '#' + esc(tag)).join(' ') + '</div>' +
    '</div>'
  );

  document.getElementById('slClustersPanel').innerHTML = renderSelfLearningList(state.selfLearning.clusters.slice(0, 8), item =>
    '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;"><strong>' + esc(item.label || ('Cluster ' + item.id)) + '</strong><span style="font-size:12px;color:var(--text-muted);">' + esc(String(item.messageCount || 0)) + ' 条</span></div>' +
      '<div style="margin-top:6px;font-size:13px;color:var(--text-secondary);">' + (item.keywords || []).map(k => '#' + esc(k)).join(' ') + '</div>' +
      '<div style="margin-top:8px;font-size:12px;color:var(--text-muted);">样例：' + esc((item.sampleMessages || []).join(' / ')) + '</div>' +
    '</div>'
  );

  document.getElementById('slScenesPanel').innerHTML = renderSelfLearningList(state.selfLearning.scenes.slice(0, 10), item =>
    '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;"><strong>' + esc(item.scene || '') + '</strong><span style="font-size:12px;color:var(--accent);">' + Math.round(Number(item.confidence || 0) * 100) + '%</span></div>' +
      '<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">类别 ' + esc(item.category || '') + ' · 命中 ' + esc(String(item.matches || 0)) + ' 条</div>' +
      '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">' + esc((item.sampleMessages || []).join(' / ')) + '</div>' +
    '</div>'
  );

  var memoryGraphText = '记忆节点 ' + ((state.selfLearning.memoryGraph.nodes || []).length) + ' 个，连接边 ' + ((state.selfLearning.memoryGraph.edges || []).length) + ' 条';
  var memoryEdgePreview = (state.selfLearning.memoryGraph.edges || []).slice(0, 8).map(edge =>
    '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;color:var(--text-secondary);">' +
      '<strong style="color:var(--text-primary);">' + esc(edge.source || '') + '</strong> ↔ <strong style="color:var(--text-primary);">' + esc(edge.target || '') + '</strong>' +
      ' <span style="color:var(--accent);">(' + Number(edge.weight || 0).toFixed(2) + ')</span>' +
      '<div style="margin-top:4px;">' + esc(edge.reason || '') + '</div>' +
    '</div>'
  ).join('');

  document.getElementById('slAdvancedSummaryPanel').innerHTML =
    '<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;">' +
      '<div style="padding:14px;border:1px solid var(--border-color);border-radius:14px;background:rgba(255,255,255,0.02);">' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">高级学习摘要</div>' +
        '<div style="font-size:15px;line-height:1.8;color:var(--text-primary);">' + esc(state.selfLearning.advancedSummary ? state.selfLearning.advancedSummary.summary : '暂无高级学习结果') + '</div>' +
        '<div style="margin-top:10px;font-size:12px;color:var(--text-secondary);">' + memoryGraphText + '</div>' +
        '<pre style="margin-top:12px;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,0.18);padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;line-height:1.6;">' + esc(state.selfLearning.advancedSummary ? state.selfLearning.advancedSummary.personaPrompt : '暂无 persona prompt') + '</pre>' +
      '</div>' +
      '<div style="padding:14px;border:1px solid var(--border-color);border-radius:14px;background:rgba(255,255,255,0.02);">' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">记忆图谱连边预览</div>' +
        (memoryEdgePreview || '<div style="font-size:13px;color:var(--text-muted);">暂无足够的记忆连接</div>') +
      '</div>' +
    '</div>';

  document.getElementById('slReviewsPanel').innerHTML = renderSelfLearningList(state.selfLearning.reviews.slice(0, 10), item =>
    '<div data-testid="sl-review-card" style="padding:14px;border:1px solid var(--border-color);border-radius:14px;background:rgba(255,255,255,0.02);">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;"><div><strong>' + esc(item.personaName || '') + '</strong><div style="margin-top:4px;font-size:12px;color:var(--text-muted);">状态：' + esc(item.status || '') + '</div></div>' +
      '<div style="display:flex;gap:8px;align-items:center;">' +
        '<button class="analyzer-btn" data-testid="sl-approve-review-' + Number(item.id || 0) + '" style="padding:6px 12px;border-radius:8px;" onclick="approvePersonaReview(' + Number(item.id || 0) + ')" ' + (item.status !== 'pending' ? 'disabled' : '') + '>批准</button>' +
        '<button class="analyzer-btn" data-testid="sl-reject-review-' + Number(item.id || 0) + '" style="padding:6px 12px;border-radius:8px;background:var(--danger);color:#fff;border:none;" onclick="rejectPersonaReview(' + Number(item.id || 0) + ')" ' + (item.status !== 'pending' ? 'disabled' : '') + '>驳回</button>' +
      '</div></div>' +
      '<div style="margin-top:10px;font-size:13px;color:var(--text-secondary);line-height:1.7;">' + esc(item.summary || '') + '</div>' +
      '<pre style="margin-top:10px;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,0.18);padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;line-height:1.6;">' + esc(item.suggestedPrompt || '') + '</pre>' +
    '</div>'
  );

  document.getElementById('slRunsPanel').innerHTML = renderSelfLearningList(state.selfLearning.runs.slice(0, 10), item =>
    '<div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;"><strong>' + esc(item.status || 'completed') + '</strong><span style="font-size:12px;color:var(--text-muted);">' + new Date(item.createdAt || Date.now()).toLocaleString('zh-CN', { hour12: false }) + '</span></div>' +
      '<div style="margin-top:6px;font-size:13px;color:var(--text-secondary);line-height:1.7;">' + esc(item.summary || '') + '</div>' +
    '</div>'
  );

  if (showToast) toast('自学习面板已刷新', 'success');
}

async function runLearningCycle() {
  var groupId = slRequireGroup('立即学习');
  if (!groupId) return;
  const res = await fetch('/api/self-learning/learning/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId: Number(groupId) })
  });
  if (res.ok) {
    toast('已触发一次完整学习周期', 'success');
    await loadSelfLearningPanel(false);
  } else {
    toast('触发学习失败', 'error');
  }
}

async function toggleLearningRuntime() {
  var enabled = !((state.selfLearning.strategy || {}).runtime || {}).autoLearningEnabled;
  const res = await fetch('/api/self-learning/strategy/runtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoLearningEnabled: enabled })
  });
  if (res.ok) {
    toast(enabled ? '已开启自动学习' : '已暂停自动学习', 'success');
    await loadSelfLearningPanel(false);
  } else {
    toast('更新运行态策略失败', 'error');
  }
}

async function saveLearningStrategy() {
  var payload = {
    SELF_LEARNING_INTERVAL_HOURS: document.getElementById('slStrategyInterval').value || '6',
    SELF_LEARNING_MIN_MESSAGES: document.getElementById('slStrategyMinMessages').value || '30',
    SELF_LEARNING_MAX_BATCH: document.getElementById('slStrategyMaxBatch').value || '200',
    SELF_LEARNING_ENABLE_ML: document.getElementById('slStrategyEnableMl').checked ? 'true' : 'false',
    SELF_LEARNING_MAX_ML_SAMPLE: document.getElementById('slStrategyMlSample').value || '120',
    SELF_LEARNING_TOTAL_AFFECTION_CAP: document.getElementById('slStrategyAffectionCap').value || '250',
    SELF_LEARNING_MAX_USER_AFFECTION: document.getElementById('slStrategyUserCap').value || '100'
  };
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    toast('策略已写入 .env，重启后永久生效', 'success');
  } else {
    toast('保存策略失败', 'error');
  }
}

async function exportLearningData(currentOnly) {
  var groupId = currentOnly ? slRequireGroup('导出当前群数据') : '';
  if (currentOnly && !groupId) return;
  var url = '/api/self-learning/export' + (groupId ? ('?groupId=' + encodeURIComponent(groupId)) : '');
  var data = await api(url);
  if (!data || !data.data || !data.source) {
    toast('导出失败', 'error');
    return;
  }
  var name = currentOnly ? ('self-learning-group-' + groupId + '.json') : 'self-learning-all-groups.json';
  downloadUtf8Json(name, data);
  toast(currentOnly ? '已导出当前群学习数据' : '已导出全部学习数据', 'success');
}

function triggerLearningImportFile() {
  document.getElementById('slImportFile').click();
}

function handleLearningImportFile(event) {
  var file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    document.getElementById('slImportPayload').value = ev.target.result || '';
    toast('已载入导入文件：' + file.name, 'success');
  };
  reader.onerror = function() {
    toast('读取导入文件失败', 'error');
  };
  reader.readAsText(file, 'utf-8');
}

async function importLearningData() {
  var payload = document.getElementById('slImportPayload').value.trim();
  if (!payload) {
    toast('请先粘贴或选择学习数据 JSON', 'error');
    return;
  }
  var bundle = null;
  try {
    bundle = JSON.parse(payload);
  } catch (e) {
    toast('导入 JSON 格式不正确', 'error');
    return;
  }
  var mode = document.getElementById('slImportMode').value || 'merge';
  const res = await fetch('/api/self-learning/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bundle: bundle, mode: mode })
  });
  if (res.ok) {
    toast(mode === 'replace' ? '已覆盖导入学习数据' : '已合并导入学习数据', 'success');
    await loadSelfLearningPanel(false);
  } else {
    toast('导入失败', 'error');
  }
}

async function clearLearningGroup() {
  var groupId = slRequireGroup('清理当前群学习记录');
  if (!groupId) return;
  if (!window.confirm('确认清理群 ' + groupId + ' 的全部自学习数据吗？此操作不可撤销。')) return;
  const res = await fetch('/api/self-learning/group/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId: Number(groupId) })
  });
  if (res.ok) {
    toast('已清理当前群学习记录', 'success');
    await loadSelfLearningPanel(false);
  } else {
    toast('清理失败', 'error');
  }
}

async function rebuildLearningSnapshots() {
  var groupId = slRequireGroup('重建分析快照');
  if (!groupId) return;
  const res = await fetch('/api/self-learning/analysis/rebuild', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId: Number(groupId) })
  });
  if (res.ok) {
    toast('已重建当前群分析快照', 'success');
    await loadSelfLearningPanel(false);
  } else {
    toast('重建失败', 'error');
  }
}

async function approvePersonaReview(reviewId) {
  const res = await fetch('/api/self-learning/persona-review/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewId })
  });
  if (res.ok) {
    toast('已批准人格建议并应用到 Prompt 上下文', 'success');
    await loadSelfLearningPanel(false);
  } else {
    toast('批准失败', 'error');
  }
}

async function rejectPersonaReview(reviewId) {
  const res = await fetch('/api/self-learning/persona-review/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewId })
  });
  if (res.ok) {
    toast('已驳回该人格建议', 'success');
    await loadSelfLearningPanel(false);
  } else {
    toast('驳回失败', 'error');
  }
}

// ========== Log Analyzer ==========
function analyzerUploadFile() {
  document.getElementById('analyzerFileInput').click();
}

function analyzerHandleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => analyzerParseLog(ev.target.result, file.name);
  reader.readAsText(file);
}

async function analyzerLoadServerLog() {
  toast('正在加载服务器日志...', 'info');
  try {
    const res = await fetch('/api/log-file');
    if (!res.ok) {
      // Fallback: try SSE logs
      const sseData = await api('/api/logs');
      if (sseData.logs && sseData.logs.length > 0) {
        const lines = sseData.logs.map(l => {
          const time = new Date(l.timestamp).toISOString();
          const level = l.type === 'error' ? 50 : l.type === 'system' ? 30 : 20;
          return JSON.stringify({ level, time, msg: l.data?.message || '' });
        }).join('\n');
        analyzerParseLog(lines, 'SSE实时日志');
        toast('已加载 ' + sseData.logs.length + ' 条实时日志', 'success');
      } else {
        toast('无可用的日志数据', 'error');
      }
      return;
    }
    const text = await res.text();
    const logFile = res.headers.get('X-Log-File') || '日志文件';
    const logMtime = res.headers.get('X-Log-Mtime') || '';
    analyzerParseLog(text, logFile);
    const mtimeStr = logMtime ? ' (' + new Date(logMtime).toLocaleString('zh-CN', { hour12: false }) + ')' : '';
    toast('已加载 ' + logFile + mtimeStr, 'success');
  } catch (err) {
    toast('加载日志失败: ' + err.message, 'error');
  }
}

function azTextLevelToNum(levelStr) {
  const s = (levelStr || '').toUpperCase().trim();
  if (s === 'ERROR' || s === 'FATAL' || s === 'ERR') return 50;
  if (s === 'WARN' || s === 'WARNING') return 40;
  if (s === 'INFO') return 30;
  if (s === 'DEBUG' || s === 'TRACE') return 20;
  return 30;
}

function analyzerParseLog(text, name) {
  state.analyzerLogs = [];
  const lines = text.split('\n').filter(l => l.trim());
  // 正则: [2026-04-07 17:29:27] INFO: message
  const bracketTsRe = /^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]\s+(DEBUG|INFO|WARN|ERROR|FATAL|TRACE)\s*:\s*(.*)/i;
  for (const line of lines) {
    try {
      let obj;
      if (line.startsWith('{')) {
        obj = JSON.parse(line);
      } else {
        const m = line.match(bracketTsRe);
        if (m) {
          obj = { time: m[1].replace(' ', 'T'), level: azTextLevelToNum(m[2]), msg: m[3] };
        } else {
          obj = { level: 20, time: '', msg: line };
        }
      }
      state.analyzerLogs.push({
        time: obj.time || obj.timestamp || '',
        level: obj.level || 20,
        msg: obj.msg || obj.message || JSON.stringify(obj).substring(0, 500),
      });
    } catch {
      state.analyzerLogs.push({ time: '', level: 20, msg: line.substring(0, 500) });
    }
  }
  state.analyzerLogs.sort((a, b) => {
    const ta = a.time || '', tb = b.time || '';
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return String(ta).localeCompare(String(tb));
  });
  analyzerShowAnalysis();
}

function azLevelName(level) {
  if (level >= 50) return 'error';
  if (level >= 40) return 'warn';
  if (level >= 30) return 'info';
  return 'debug';
}

function analyzerShowAnalysis() {
  document.getElementById('analyzerEmptyState').style.display = 'none';
  document.getElementById('analyzerContent').style.display = 'block';

  const errors = state.analyzerLogs.filter(l => l.level >= 50).length;
  const warns = state.analyzerLogs.filter(l => l.level >= 40 && l.level < 50).length;
  document.getElementById('azTotal').textContent = state.analyzerLogs.length.toLocaleString();
  document.getElementById('azErrors').textContent = errors;
  document.getElementById('azWarns').textContent = warns;

  if (state.analyzerLogs.length > 1 && state.analyzerLogs[0].time && state.analyzerLogs[state.analyzerLogs.length - 1].time) {
    const t0 = new Date(state.analyzerLogs[0].time).getTime();
    const t1 = new Date(state.analyzerLogs[state.analyzerLogs.length - 1].time).getTime();
    const mins = Math.round((t1 - t0) / 60000);
    document.getElementById('azDuration').textContent = mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm';
  }

  // Level chart
  const levelCounts = { error: 0, warn: 0, info: 0, debug: 0 };
  state.analyzerLogs.forEach(l => { levelCounts[azLevelName(l.level)]++; });

  if (state.azLevelChart) state.azLevelChart.destroy();
  state.azLevelChart = new Chart(document.getElementById('azLevelChart'), {
    type: 'doughnut',
    data: {
      labels: ['Error', 'Warn', 'Info', 'Debug'],
      datasets: [{ data: [levelCounts.error, levelCounts.warn, levelCounts.info, levelCounts.debug], backgroundColor: ['#f87171', '#fbbf24', '#00d4ff', '#5c5f73'], borderWidth: 0, hoverOffset: 6 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { color: '#8b8fa3', font: { size: 11 }, padding: 12 } } } }
  });

  // Frequency chart
  const minuteMap = {};
  state.analyzerLogs.forEach(l => {
    if (!l.time) return;
    const d = new Date(l.time);
    const key = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    minuteMap[key] = (minuteMap[key] || 0) + 1;
  });
  const timeKeys = Object.keys(minuteMap).slice(-60);
  const freqData = timeKeys.map(k => minuteMap[k]);

  if (state.azFreqChart) state.azFreqChart.destroy();
  state.azFreqChart = new Chart(document.getElementById('azFreqChart'), {
    type: 'bar',
    data: {
      labels: timeKeys,
      datasets: [{ label: '日志/分钟', data: freqData, backgroundColor: 'rgba(0,212,255,0.4)', borderRadius: 3, hoverBackgroundColor: 'rgba(0,212,255,0.6)' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { color: '#5c5f73', font: { size: 9 }, maxTicksLimit: 15 } }, y: { beginAtZero: true, grid: { color: 'rgba(42,45,56,0.6)' }, ticks: { color: '#5c5f73' } } }
    }
  });

  analyzerRenderLogs();
}

function analyzerRenderLogs() {
  const filter = document.getElementById('azLevelFilter').value;
  const search = document.getElementById('azSearch').value.toLowerCase();
  let filtered = state.analyzerLogs;
  if (filter !== 'all') filtered = filtered.filter(l => azLevelName(l.level) === filter);
  if (search) filtered = filtered.filter(l => l.msg.toLowerCase().includes(search));

  document.getElementById('azLogHint').textContent = filtered.length + ' / ' + state.analyzerLogs.length + ' 条';

  const viewer = document.getElementById('azLogViewer');
  if (!filtered.length) {
    viewer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">无匹配日志</div>';
    return;
  }

  const display = filtered.slice(-500).reverse();
  viewer.innerHTML = display.map(l => {
    const ln = azLevelName(l.level);
    const t = l.time ? new Date(l.time).toLocaleTimeString('zh-CN', { hour12: false }) : '--:--:--';
    const fullTime = l.time ? new Date(l.time).toLocaleString('zh-CN', { hour12: false }) : '';
    return '<div class="analyzer-log-entry level-' + ln + '">' +
      '<div><span class="analyzer-log-time">' + fullTime + '</span></div>' +
      '<span class="analyzer-log-level ' + ln + '">' + ln.toUpperCase() + '</span>' +
      '<div class="analyzer-log-msg">' + esc(l.msg) + '</div>' +
    '</div>';
  }).join('');
}

// ========== Chat Log Page ==========
const chatLogState = {
  messages: [],
  users: new Set(),
  groups: [],
  filtered: [],
};

// 图片代理：将 QQ 图片 URL 通过服务端代理加载，绕过防盗链
function proxyImage(url) {
  if (!url || !url.startsWith('http')) return url || '';
  // 修复 URL 中可能存在的 HTML 实体编码（&amp; -> &）
  let cleanUrl = url.replace(/&amp;/g, '&');
  return '/api/image-proxy?url=' + encodeURIComponent(cleanUrl);
}

async function loadChatLogs() {
  const container = document.getElementById('chatlogContent');
  container.innerHTML = '<div class="card full-card"><div class="card-body"><div class="chatlog-loading"><div class="chatlog-loading-spinner"></div>正在解析日志...</div></div></div>';

  try {
    const data = await api('/api/chat-logs');
    if (!data || !data.messages || data.messages.length === 0) {
      container.innerHTML = '<div class="card full-card"><div class="card-body"><div class="chatlog-empty"><div class="chatlog-empty-icon"><i class="fas fa-inbox"></i></div><div style="font-size:16px;margin-bottom:8px;">未找到聊天记录</div><div style="font-size:12px;color:var(--text-muted);">暂无可解析的消息数据</div></div></div></div>';
      return;
    }

    chatLogState.messages = data.messages;
    chatLogState.groups = data.groups || [];

    // 统计
    const imgCount = data.messages.filter(m => m.messageType === 'image' || (m.messageType === 'mixed' && m.imageUrl)).length;
    const voiceCount = data.messages.filter(m => m.messageType === 'voice').length;
    const userSet = new Set();
    data.messages.forEach(m => {
      if (m.userId && m.userId !== 'bot') userSet.add(m.userId);
      if (m.nickname && m.userId !== 'bot') userSet.add(m.nickname);
    });

    document.getElementById('chatlogStats').style.display = 'flex';
    document.getElementById('chatlogFilters').style.display = 'flex';
    document.getElementById('clTotalMsg').textContent = data.messages.length;
    document.getElementById('clImgCount').textContent = imgCount;
    document.getElementById('clVoiceCount').textContent = voiceCount;
    document.getElementById('clUserCount').textContent = userSet.size;

    // 填充群组筛选
    const groupSelect = document.getElementById('clGroupFilter');
    groupSelect.innerHTML = '<option value="all">全部群组</option>';
    (data.groups || []).forEach(g => {
      groupSelect.innerHTML += '<option value="' + g + '">群 ' + g + '</option>';
    });

    renderChatLogs();
    toast('已加载 ' + data.messages.length + ' 条聊天记录', 'success');
  } catch (err) {
    container.innerHTML = '<div class="card full-card"><div class="card-body"><div class="chatlog-empty"><div class="chatlog-empty-icon"><i class="fas fa-exclamation-triangle"></i></div><div style="font-size:16px;margin-bottom:8px;">加载失败</div><div style="font-size:12px;color:var(--text-muted);">' + (err.message || '未知错误') + '</div></div></div></div>';
    toast('加载聊天记录失败', 'error');
  }
}

function renderChatLogs() {
  const groupFilter = document.getElementById('clGroupFilter').value;
  const typeFilter = document.getElementById('clTypeFilter').value;
  const searchText = document.getElementById('clSearchInput').value.toLowerCase();
  const showBot = document.getElementById('clBotToggle').checked;

  let filtered = chatLogState.messages;

  if (groupFilter !== 'all') {
    filtered = filtered.filter(m => m.groupId === groupFilter);
  }
  if (typeFilter !== 'all') {
    filtered = filtered.filter(m => m.messageType === typeFilter);
  }
  if (searchText) {
    filtered = filtered.filter(m =>
      (m.content || '').toLowerCase().includes(searchText) ||
      (m.userId || '').includes(searchText) ||
      (m.nickname || '').toLowerCase().includes(searchText)
    );
  }
  if (!showBot) {
    filtered = filtered.filter(m => m.userId !== 'bot');
  }

  chatLogState.filtered = filtered;

  const container = document.getElementById('chatlogContent');
  if (!filtered.length) {
    container.innerHTML = '<div class="card full-card"><div class="card-body"><div class="chatlog-empty"><div class="chatlog-empty-icon"><i class="fas fa-filter"></i></div><div style="font-size:16px;margin-bottom:8px;">无匹配结果</div><div style="font-size:12px;color:var(--text-muted);">尝试调整筛选条件</div></div></div></div>';
    return;
  }

  // 颜色池（根据userId生成一致的头像颜色）
  const colorPool = ['#f87171','#fb923c','#fbbf24','#34d399','#2dd4bf','#38bdf8','#6c8eff','#a78bfa','#f472b6','#e879f9'];
  function getUserColor(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
    return colorPool[Math.abs(hash) % colorPool.length];
  }

  const display = filtered.slice(-300).reverse();
  let html = '<div class="chatlog-container"><div class="chatlog-list">';
  display.forEach((m, idx) => {
    const isBot = m.userId === 'bot';
    const timeStr = m.time ? new Date(m.time).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--';
    const displayName = m.nickname || m.userId || '未知';
    const avatarChar = m.nickname ? m.nickname.charAt(0) : (m.userId ? m.userId.charAt(0) : '?');
    const avatarColor = isBot ? '' : 'background:' + getUserColor(m.userId || m.nickname || idx);

    let typeTag = '';
    let contentHtml = esc(m.content || '');
    let extraHtml = '';

    if (m.messageType === 'image') {
      typeTag = '';
      contentHtml = '';
      // 尝试从 rawMessage 重新提取完整 imageUrl（日志可能截断 m.imageUrl）
      let imgUrl = m.imageUrl || '';
      if (!imgUrl || !imgUrl.startsWith('http') || imgUrl.length < 20) {
        if (m.rawMessage) {
          const rawUrlMatch = m.rawMessage.match(/url=([^\],]+)/);
          if (rawUrlMatch && rawUrlMatch[1].startsWith('http')) imgUrl = rawUrlMatch[1];
        }
      }
      if (imgUrl && imgUrl.startsWith('http')) {
        extraHtml = '<div class="chatlog-image-wrap"><img class="chatlog-image" src="' + esc(proxyImage(imgUrl)) + '" onclick="openChatLogLightbox(\'' + esc(imgUrl).replace(/'/g, "\\'") + '\')" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=chatlog-image-error><i class=fas fa-image></i><span>图片加载失败</span></div>\'"></div>';
      } else {
        contentHtml = '<span style="color:var(--text-muted);font-size:12px;"><i class="fas fa-image" style="margin-right:4px;"></i>图片URL不可用</span>';
      }
    } else if (m.messageType === 'voice') {
      typeTag = '<span class="chatlog-type-tag voice"><i class="fas fa-microphone"></i> 语音</span>';
      const voiceWaveHtml = '<span class="voice-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>';
      if (m.voiceText && m.voiceText !== '[语音消息]') {
        contentHtml = '<div class="chatlog-voice-badge">' + voiceWaveHtml + '<span class="voice-text">' + esc(m.voiceText) + '</span></div>';
      } else {
        contentHtml = '<div class="chatlog-voice-badge">' + voiceWaveHtml + '<span class="voice-text">语音消息（未转文字）</span></div>';
      }
      extraHtml = '';
    } else if (m.messageType === 'reply') {
      typeTag = '<span class="chatlog-type-tag reply"><i class="fas fa-reply"></i> 回复</span>';
      // 构建引用预览块（内容由 fixReplyContents 通过 messageId 精确匹配填充）
      if (m.replyId) {
        contentHtml = '<div class="chatlog-reply-preview" data-reply-idx="' + idx + '" onclick="scrollToReplyMsg(\'' + esc(m.replyId) + '\')">' +
          '<div class="chatlog-reply-preview-label"><i class="fas fa-quote-left"></i> 引用消息 #' + esc(m.replyId.substring(0, 10)) + '</div>' +
          '<div class="chatlog-reply-preview-content">匹配中...</div>' +
        '</div>' + contentHtml;
      }
    } else if (m.messageType === 'forward') {
      typeTag = '<span class="chatlog-type-tag forward"><i class="fas fa-layer-group"></i> 合并转发</span>';
      contentHtml = '';
      const fwdId = m.forwardId || 'unknown';
      extraHtml = '<div class="chatlog-forward-card" id="fwd-' + esc(fwdId.substring(0, 12)) + '" onclick="loadForwardMsg(\'' + esc(fwdId) + '\', this)">' +
        '<div class="chatlog-forward-header">' +
          '<div class="chatlog-forward-icon"><i class="fas fa-share-alt"></i></div>' +
          '<div class="chatlog-forward-info">' +
            '<div class="chatlog-forward-title">合并转发消息</div>' +
            '<div class="chatlog-forward-meta">ID: ' + esc(fwdId.substring(0, 18)) + '...</div>' +
          '</div>' +
          '<div class="chatlog-forward-arrow"><i class="fas fa-chevron-right"></i></div>' +
        '</div>' +
        '<div class="chatlog-forward-body">' +
          '<div class="chatlog-forward-body-content" id="fwd-content-' + esc(fwdId.substring(0, 12)) + '">点击卡片加载转发内容...</div>' +
          '<div class="chatlog-forward-hint">点击卡片可展开/收起详情</div>' +
        '</div>' +
      '</div>';
    } else if (m.messageType === 'mixed') {
      typeTag = '<span class="chatlog-type-tag mixed"><i class="fas fa-layer-group"></i> 混合</span>';
      // mixed 类型也可能包含回复引用（内容由 fixReplyContents 精确匹配填充）
      if (m.replyId) {
        contentHtml = '<div class="chatlog-reply-preview" data-reply-idx="' + idx + '" onclick="scrollToReplyMsg(\'' + esc(m.replyId) + '\')">' +
          '<div class="chatlog-reply-preview-label"><i class="fas fa-quote-left"></i> 引用消息 #' + esc(m.replyId.substring(0, 10)) + '</div>' +
          '<div class="chatlog-reply-preview-content">匹配中...</div>' +
        '</div>' + contentHtml;
      }
      if (m.imageUrl) {
        extraHtml = '<div class="chatlog-image-wrap"><img class="chatlog-image" src="' + esc(proxyImage(m.imageUrl)) + '" onclick="openChatLogLightbox(\'' + esc(m.imageUrl).replace(/'/g, "\\'") + '\')" loading="lazy" onerror="this.parentElement.innerHTML=\'<span style=&quot;color:var(--text-muted);font-size:12px;&quot;>图片加载失败</span>\'"></div>';
      }
    }

    html += '<div class="chatlog-item' + (isBot ? ' is-bot' : '') + '">' +
      '<div class="chatlog-avatar" style="' + avatarColor + '">' + esc(avatarChar) + '</div>' +
      '<div class="chatlog-content">' +
        '<div class="chatlog-meta">' +
          '<span class="chatlog-nickname">' + esc(displayName) + '</span>' +
          (m.userId && m.userId !== 'bot' ? '<span class="chatlog-qq">' + esc(m.userId) + '</span>' : '') +
          '<span class="chatlog-group">群 ' + esc(m.groupId) + '</span>' +
          '<span class="chatlog-time-label">' + timeStr + '</span>' +
        '</div>' +
        '<div class="chatlog-bubble">' + typeTag + contentHtml + extraHtml + '</div>' +
      '</div>' +
    '</div>';
  });
  html += '</div></div>';
  container.innerHTML = html;

  // 修正引用消息内容：通过 messageId 精确匹配被引用消息
  fixReplyContents(display, filtered);
}

/** 修正引用消息内容 - 用消息列表中的实际数据替换后端基于时间戳的不准确猜测 */
function fixReplyContents(display, filtered) {
  if (!filtered || !filtered.length) return;

  // 构建 messageId -> 消息 的索引（messageId 就是原始 QQ 消息的 message_id）
  const msgById = new Map();
  for (const m of filtered) {
    if (m.messageId) {
      msgById.set(String(m.messageId), m);
    }
  }

  // 通过 data-reply-idx 属性精确定位每个引用预览块
  document.querySelectorAll('.chatlog-reply-preview[data-reply-idx]').forEach(previewEl => {
    const dIdx = parseInt(previewEl.getAttribute('data-reply-idx'), 10);
    if (isNaN(dIdx) || dIdx < 0 || dIdx >= display.length) return;

    const m = display[dIdx];
    if (!m || !m.replyId) return;

    const contentEl = previewEl.querySelector('.chatlog-reply-preview-content');
    if (!contentEl) return;

    // 精确匹配：replyId 就是被引用消息的 message_id
    // QQ 的 [CQ:reply,id=xxx] 中的 xxx 就是被引用消息的 message_id
    const replied = msgById.get(String(m.replyId));
    if (replied && replied.content) {
      contentEl.textContent = replied.content.substring(0, 120);
    } else {
      // 精确匹配失败时：退化为时间+用户启发式匹配
      // 获取被@的用户（如果有）
      const atMatch = (m.rawMessage || '').match(/\[CQ:at,qq=(\d+)\]/);
      const atUserId = atMatch ? atMatch[1] : null;

      let bestMatch = null;
      let bestDiff = Infinity;

      for (let fIdx = filtered.length - 1; fIdx >= 0; fIdx--) {
        const candidate = filtered[fIdx];
        if (!candidate.time || !m.time) continue;
        if (candidate.time >= m.time) continue;
        if (candidate.groupId !== m.groupId) continue;

        const diff = m.time - candidate.time;
        if (diff > 300000) break;

        // 如果有@某人，优先匹配被@的人说的消息
        if (atUserId && candidate.userId === atUserId) {
          bestMatch = candidate;
          break;
        }

        // 跳过自己发的消息（避免匹配到自己的被动插话行）
        if (candidate.userId === m.userId && m.userId !== 'bot') continue;

        if (diff < bestDiff) {
          bestMatch = candidate;
          bestDiff = diff;
        }
      }

      if (bestMatch && bestMatch.content) {
        contentEl.textContent = bestMatch.content.substring(0, 120);
      } else {
        contentEl.textContent = '被引用的消息不在当前记录范围内';
      }
    }
  });
}

function openChatLogLightbox(src) {
  const existing = document.querySelector('.chatlog-lightbox');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'chatlog-lightbox';
  div.onclick = function() { div.remove(); };
  div.innerHTML = '<img src="' + esc(proxyImage(src)) + '">';
  document.body.appendChild(div);
}

/** 加载合并转发消息内容 */
async function loadForwardMsg(forwardId, cardEl) {
  const contentId = 'fwd-content-' + forwardId.substring(0, 12);
  const contentEl = document.getElementById(contentId);
  if (!contentEl) return;

  // 如果已展开且有内容 -> 切换折叠
  if (cardEl.classList.contains('expanded') && contentEl.dataset.loaded === 'true') {
    cardEl.classList.remove('expanded');
    return;
  }

  // 展开
  cardEl.classList.add('expanded');
  contentEl.innerHTML = '<div style="text-align:center;padding:16px;"><div class="chatlog-loading-spinner" style="margin:0 auto 8px;width:24px;height:24px;border-width:2px;"></div>正在加载转发内容...</div>';

  try {
    const data = await api('/api/forward-msg?id=' + encodeURIComponent(forwardId));
    if (!data || !data.messages || data.messages.length === 0) {
      contentEl.innerHTML = '<div class="chatlog-forward-hint">无法获取转发内容（可能已被撤回或过期）</div>';
      contentEl.dataset.loaded = 'true';
      return;
    }

    let html = '';
    data.messages.forEach(msg => {
      const timeStr = msg.time ? new Date(msg.time * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      const content = msg.content ? esc(msg.content) : '<span style="color:var(--text-muted);font-style:italic;">[无内容]</span>';
      html += '<div class="chatlog-forward-item">' +
        '<div class="chatlog-forward-item-header">' +
          '<span class="chatlog-forward-item-sender">' + esc(msg.sender) + '</span>' +
          '<span class="chatlog-forward-item-time">' + timeStr + '</span>' +
        '</div>' +
        '<div class="chatlog-forward-item-content">' + content + '</div>' +
      '</div>';
    });
    contentEl.innerHTML = html;
    contentEl.dataset.loaded = 'true';
  } catch (err) {
    contentEl.innerHTML = '<div class="chatlog-forward-hint">加载失败: ' + esc(err.message || '未知错误') + '</div>';
    contentEl.dataset.loaded = 'true';
  }
}

/** 点击引用预览时高亮闪烁当前引用块 */
function scrollToReplyMsg(replyId) {
  // 为当前点击的引用预览块添加高亮动画
  document.querySelectorAll('.chatlog-reply-preview').forEach(el => {
    el.style.transition = 'border-left-color 0.3s, box-shadow 0.3s';
    el.style.borderLeftColor = 'var(--neon-purple)';
    el.style.boxShadow = '0 0 16px rgba(179,98,255,0.2)';
    setTimeout(() => {
      el.style.borderLeftColor = '';
      el.style.boxShadow = '';
    }, 1200);
  });
}

// ========== Block Management ==========
let blockState = { users: [], groups: [], stats: { blockedUserCount: 0, blockedGroupCount: 0, involvedGroupCount: 0 } };
let cachedGroupList = [];

async function fetchGroupList(forceRefresh = false) {
  if (!forceRefresh && cachedGroupList.length > 0) return cachedGroupList;
  const s = await api('/api/status');
  const groups = (s && s.activeGroups) ? s.activeGroups : [];
  cachedGroupList = groups.map(Number);
  return cachedGroupList;
}

function toggleGroupPicker(inputId, dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  if (dropdown.style.display !== 'none') {
    dropdown.style.display = 'none';
    const parentCard = dropdown.closest('.card');
    if (parentCard) parentCard.classList.remove('has-group-picker');
    return;
  }
  // 关闭其他下拉框
  document.querySelectorAll('.group-picker-dropdown').forEach(el => {
    if (el.id !== dropdownId) el.style.display = 'none';
  });
  document.querySelectorAll('.card.has-group-picker').forEach(el => el.classList.remove('has-group-picker'));

  fetchGroupList(true).then(groups => {
    if (!groups.length) {
      dropdown.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">暂无群组数据（机器人未连接）</div>';
    } else {
      dropdown.innerHTML = groups.map(g =>
        '<div class="group-picker-item" onclick="selectGroup(\'' + inputId + '\',\'' + dropdownId + '\',' + g + ')">' +
        '<span class="group-id">' + g + '</span>' +
        '<span class="group-label">' + (blockState.groups.includes(g) ? '<span style="color:var(--warning);">已屏蔽</span>' : '已加入') + '</span>' +
        '</div>'
      ).join('');
    }
    dropdown.style.display = 'block';
    const parentCard = dropdown.closest('.card');
    if (parentCard) parentCard.classList.add('has-group-picker');
  });
}

function selectGroup(inputId, dropdownId, groupId) {
  document.getElementById(inputId).value = groupId;
  document.getElementById(dropdownId).style.display = 'none';
  // 移除父 card 的 has-group-picker 类
  const dropdown = document.getElementById(dropdownId);
  if (dropdown) {
    const parentCard = dropdown.closest('.card');
    if (parentCard) parentCard.classList.remove('has-group-picker');
  }
}

// 点击页面其他区域关闭下拉框
document.addEventListener('click', function(e) {
  if (!e.target.closest('.group-picker-dropdown') && !e.target.closest('[onclick*="toggleGroupPicker"]')) {
    document.querySelectorAll('.group-picker-dropdown').forEach(el => {
      if (el.style.display !== 'none') el.style.display = 'none';
    });
    // 移除所有 card 的 has-group-picker 类
    document.querySelectorAll('.card.has-group-picker').forEach(el => el.classList.remove('has-group-picker'));
  }
});

async function loadBlockList() {
  try {
    const [userData, groupData] = await Promise.all([
      api('/api/block/users'),
      api('/api/block/groups')
    ]);
    blockState.users = userData.users || [];
    blockState.groups = groupData.groups || [];
    blockState.stats = userData.stats || groupData.stats || { blockedUserCount: 0, blockedGroupCount: 0, involvedGroupCount: 0 };
    renderBlockList();
    updateBlockStats();
    updateBlockBadge();
  } catch (e) {
    console.error('加载屏蔽列表失败:', e);
    showToast('加载屏蔽列表失败: ' + (e.message || '未知错误'), 'error');
  }
}

function updateBlockStats() {
  document.getElementById('blockStatUsers').textContent = blockState.stats.blockedUserCount;
  document.getElementById('blockStatGroups').textContent = blockState.stats.blockedGroupCount;
  document.getElementById('blockStatInvolved').textContent = blockState.stats.involvedGroupCount;
}

function updateBlockBadge() {
  const total = blockState.stats.blockedUserCount + blockState.stats.blockedGroupCount;
  const badge = document.getElementById('blockCount');
  if (total > 0) {
    badge.textContent = total;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function renderBlockList() {
  const searchTerm = (document.getElementById('blockSearchInput')?.value || '').toLowerCase();
  const filteredUsers = blockState.users.filter(u =>
    !searchTerm ||
    String(u.userId).includes(searchTerm) ||
    String(u.groupId).includes(searchTerm) ||
    (u.nickname || '').toLowerCase().includes(searchTerm)
  );

  const userContainer = document.getElementById('blockUserList');
  if (filteredUsers.length === 0) {
    userContainer.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-muted);"><i class="fas fa-check-circle" style="font-size:24px;margin-bottom:8px;display:block;color:var(--success);"></i><div>' + (searchTerm ? '未找到匹配的屏蔽记录' : '暂无被屏蔽用户') + '</div></div>';
  } else {
    let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:var(--card-header);text-align:left;">' +
      '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">QQ号</th>' +
      '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">昵称</th>' +
      '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">群号</th>' +
      '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">屏蔽时间</th>' +
      '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">原因</th>' +
      '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">操作</th>' +
      '</tr></thead><tbody>';
    filteredUsers.forEach(u => {
      const time = u.blockedAt ? new Date(u.blockedAt).toLocaleString('zh-CN') : '-';
      html += '<tr style="border-top:1px solid var(--border-color);">' +
        '<td style="padding:10px 16px;font-family:\'JetBrains Mono\',monospace;color:var(--accent);">' + u.userId + '</td>' +
        '<td style="padding:10px 16px;">' + (u.nickname || '-') + '</td>' +
        '<td style="padding:10px 16px;font-family:\'JetBrains Mono\',monospace;">' + u.groupId + '</td>' +
        '<td style="padding:10px 16px;color:var(--text-muted);font-size:12px;">' + time + '</td>' +
        '<td style="padding:10px 16px;color:var(--text-muted);font-size:12px;">' + (u.reason || '-') + '</td>' +
        '<td style="padding:10px 16px;"><button onclick="unblockUser(' + u.userId + ',' + u.groupId + ')" style="background:var(--success-soft);color:var(--success);border:none;padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">取消屏蔽</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    userContainer.innerHTML = html;
  }

  const groupContainer = document.getElementById('blockGroupList');
  if (blockState.groups.length === 0) {
    groupContainer.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-muted);"><i class="fas fa-check-circle" style="font-size:24px;margin-bottom:8px;display:block;color:var(--success);"></i><div>暂无被屏蔽群</div></div>';
  } else {
    let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:var(--card-header);text-align:left;">' +
      '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">群号</th>' +
      '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">状态</th>' +
      '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">操作</th>' +
      '</tr></thead><tbody>';
    blockState.groups.forEach(g => {
      html += '<tr style="border-top:1px solid var(--border-color);">' +
        '<td style="padding:10px 16px;font-family:\'JetBrains Mono\',monospace;">' + g + '</td>' +
        '<td style="padding:10px 16px;"><span style="background:var(--danger-soft);color:var(--danger);padding:2px 10px;border-radius:12px;font-size:11px;">已屏蔽</span></td>' +
        '<td style="padding:10px 16px;"><button onclick="unblockGroup(' + g + ')" style="background:var(--success-soft);color:var(--success);border:none;padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">取消屏蔽</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    groupContainer.innerHTML = html;
  }
}

function filterBlockList() { renderBlockList(); }

async function addBlockUser() {
  const userId = document.getElementById('blockInputUserId').value.trim();
  const groupId = document.getElementById('blockInputGroupId').value.trim();
  const nickname = document.getElementById('blockInputNickname').value.trim();
  const reason = document.getElementById('blockInputReason').value.trim();
  if (!userId || !groupId) { showToast('请输入QQ号和群号', 'error'); return; }
  try {
    const res = await fetch('/api/block/user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, groupId, nickname, reason })
    });
    const data = await res.json();
    if (data.success) { showToast('已屏蔽用户 ' + userId, 'success'); loadBlockList(); }
    else { showToast('屏蔽失败: ' + (data.error || '未知错误'), 'error'); }
  } catch (e) { showToast('屏蔽失败: ' + e.message, 'error'); }
}

async function unblockUser(userId, groupId) {
  if (!confirm('确定取消屏蔽用户 ' + userId + ' 吗？')) return;
  try {
    const res = await fetch('/api/block/user/remove', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, groupId })
    });
    const data = await res.json();
    if (data.success) { showToast('已取消屏蔽用户 ' + userId, 'success'); loadBlockList(); }
    else { showToast('取消屏蔽失败', 'error'); }
  } catch (e) { showToast('取消屏蔽失败: ' + e.message, 'error'); }
}

async function addBlockGroup() {
  const groupId = document.getElementById('blockInputGroupOnly').value.trim();
  if (!groupId) { showToast('请输入群号', 'error'); return; }
  if (!confirm('确定屏蔽群 ' + groupId + ' 吗？屏蔽后机器人将不再响应此群的任何消息。')) return;
  try {
    const res = await fetch('/api/block/group', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId })
    });
    const data = await res.json();
    if (data.success) { showToast('已屏蔽群 ' + groupId, 'success'); loadBlockList(); }
    else { showToast('屏蔽失败: ' + (data.error || '未知错误'), 'error'); }
  } catch (e) { showToast('屏蔽失败: ' + e.message, 'error'); }
}

async function unblockGroup(groupId) {
  if (!confirm('确定取消屏蔽群 ' + groupId + ' 吗？')) return;
  try {
    const res = await fetch('/api/block/group/remove', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId })
    });
    const data = await res.json();
    if (data.success) { showToast('已取消屏蔽群 ' + groupId, 'success'); loadBlockList(); }
    else { showToast('取消屏蔽失败', 'error'); }
  } catch (e) { showToast('取消屏蔽失败: ' + e.message, 'error'); }
}

// ========== Modern boot experience ==========
class BootAnimation {
  constructor() {
    this.loader = document.createElement('div');
    this.loader.className = 'boot-loader';
    this.progress = 0;
    this.progressTimer = null;
    this.dotsTimer = null;
    this.frameId = null;
    this.statusSteps = [
      '初始化控制台界面',
      '装载运行时模块',
      '同步实时状态流',
      '准备监控与分析视图',
    ];
    this.init();
  }

  init() {
    this.loader.innerHTML = `
      <div class="boot-vignette"></div>
      <div class="boot-noise"></div>
      <canvas class="boot-particles"></canvas>
      <div class="boot-grid"></div>
      <div class="boot-orb"></div>
      <div class="boot-orb secondary"></div>
      <div class="boot-orb tertiary"></div>

      <div class="boot-shell">
        <div class="boot-header">
          <div class="boot-brand">
            <div class="boot-brand-glow"></div>
            <div class="boot-brand-icon">Q</div>
          </div>
          <div class="boot-copy">
            <div class="boot-kicker">QQTalker Console</div>
            <div class="boot-title">Control Surface</div>
            <div class="boot-subtitle">现代化控制台正在完成启动校准，准备实时监控、配置管理与分析视图。</div>
          </div>
        </div>

        <div class="boot-status-row">
          <div class="boot-status-text">
            <span id="bootStatusText">初始化控制台界面</span><span class="boot-dots"></span>
          </div>
          <div class="boot-progress-value" id="bootProgressValue">00%</div>
        </div>

        <div class="boot-progress">
          <div class="boot-progress-track">
            <div class="boot-progress-bar" id="bootProgressBar"></div>
          </div>
        </div>

        <div class="boot-footer">Loading workspace telemetry, page controllers and live event stream.</div>
      </div>
    `;

    document.body.appendChild(this.loader);

    this.startParticleSystem();
    this.startProgress();
    this.animateDots();

    setTimeout(() => this.fadeOut(), 3500);
  }

  startParticleSystem() {
    const canvas = this.loader.querySelector('.boot-particles');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setCanvasSize();

    const particles = [];
    const particleCount = window.innerWidth < 768 ? 36 : 72;

    class Particle {
      constructor() {
        this.reset(true);
      }

      reset(initial) {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.32;
        this.vy = (Math.random() - 0.5) * 0.32;
        this.size = Math.random() * 2 + 0.8;
        this.opacity = Math.random() * 0.35 + 0.08;
        this.pulse = Math.random() * Math.PI * 2;
        if (!initial) {
          this.x = Math.random() * canvas.width;
          this.y = Math.random() * canvas.height;
        }
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.pulse += 0.02;
        if (this.x < -40 || this.x > canvas.width + 40 || this.y < -40 || this.y > canvas.height + 40) {
          this.reset(false);
        }
      }

      draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity + Math.sin(this.pulse) * 0.04;
        ctx.fillStyle = '#91a9ff';
        ctx.shadowBlur = 16;
        ctx.shadowColor = 'rgba(108,142,255,0.45)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    this.onBootResize = setCanvasSize;
    window.addEventListener('resize', this.onBootResize);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });

      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 140) {
            ctx.save();
            ctx.globalAlpha = (1 - distance / 140) * 0.12;
            ctx.strokeStyle = 'rgba(108,142,255,0.9)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
          }
        });
      });

      this.frameId = requestAnimationFrame(animate);
    };

    animate();
  }

  startProgress() {
    const bar = this.loader.querySelector('#bootProgressBar');
    const value = this.loader.querySelector('#bootProgressValue');
    const statusText = this.loader.querySelector('#bootStatusText');
    if (!bar || !value || !statusText) return;

    const stepCount = this.statusSteps.length;
    let tick = 0;

    const render = () => {
      const displayValue = Math.max(0, Math.min(100, Math.round(this.progress)));
      bar.style.width = displayValue + '%';
      value.textContent = String(displayValue).padStart(2, '0') + '%';
      const stepIndex = Math.min(stepCount - 1, Math.floor((displayValue / 100) * stepCount));
      statusText.textContent = this.statusSteps[stepIndex];
    };

    render();
    this.progressTimer = setInterval(() => {
      tick += 1;
      const increment = tick < 4 ? 16 : tick < 8 ? 10 : tick < 12 ? 6 : 2.2;
      this.progress = Math.min(96, this.progress + increment);
      render();
    }, 220);
  }

  animateDots() {
    const dots = this.loader.querySelector('.boot-dots');
    if (!dots) return;
    let count = 0;

    this.dotsTimer = setInterval(() => {
      count = (count + 1) % 4;
      dots.textContent = '.'.repeat(count);
    }, 380);
  }

  fadeOut() {
    const bar = this.loader.querySelector('#bootProgressBar');
    const value = this.loader.querySelector('#bootProgressValue');
    const statusText = this.loader.querySelector('#bootStatusText');
    if (bar) bar.style.width = '100%';
    if (value) value.textContent = '100%';
    if (statusText) statusText.textContent = '启动完成';
    if (this.progressTimer) clearInterval(this.progressTimer);
    if (this.dotsTimer) clearInterval(this.dotsTimer);
    this.loader.classList.add('fade-out');

    setTimeout(() => {
      if (this.frameId) cancelAnimationFrame(this.frameId);
      if (this.onBootResize) window.removeEventListener('resize', this.onBootResize);
      if (this.loader.parentNode) {
        this.loader.parentNode.removeChild(this.loader);
      }
    }, 800);
  }
}

// 页面加载完成后启动动画
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new BootAnimation();
  });
} else {
  new BootAnimation();
}

Object.assign(window, {
  manualRefresh,
  clearLogViewer,
  loadChatLogs,
  renderChatLogs,
  analyzerUploadFile,
  analyzerLoadServerLog,
  analyzerHandleFile,
  analyzerRenderLogs,
  loadSelfLearningPanel,
  runLearningCycle,
  handleLearningImportFile,
  loadVoicePanel,
  rescanVoiceModels,
  previewVoice,
  loadVoiceTrainingPanel,
  syncVoiceTrainingWorkspace,
  runVoiceTrainingAction,
  importVoiceTrainingRaw,
  handleVoiceTrainingUpload,
  updateAstrbotEventFilter,
  saveConfig,
  loadConfig,
  loadBlockList,
  toggleGroupPicker,
  addBlockUser,
  addBlockGroup,
  filterBlockList,
  setVoiceBackend,
  setVoiceModel,
  previewVoiceBackend,
  loadVoiceTrainingDetail,
  publishVoiceTrainingModel,
  rollbackVoiceTrainingRelease,
  saveVoiceTrainingReview,
  toggleLearningRuntime,
  saveLearningStrategy,
  exportLearningData,
  triggerLearningImportFile,
  rebuildLearningSnapshots,
  clearLearningGroup,
  importLearningData,
  approvePersonaReview,
  rejectPersonaReview,
  openChatLogLightbox,
  scrollToReplyMsg,
  loadForwardMsg,
  selectGroup,
  unblockUser,
  unblockGroup,
  state,
  dashboardApi,
});

// ========== Init ==========
initCharts();
connectSSE();
setInterval(refreshAll, 5000);
