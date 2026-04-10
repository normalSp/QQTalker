export function createSelfLearningPageController(options) {
  const {
    state,
    api,
    esc,
    fmt,
    fmtTime,
    downloadUtf8Json,
    toast,
    slCurrentGroup,
    slRequireGroup,
  } = options;

  function renderSimpleEmpty(text) {
    return '<div class="empty-state"><div class="empty-icon">&#129300;</div><div class="empty-text">' + text + '</div></div>';
  }

  function renderSelfLearningList(items, renderItem) {
    if (!items || !items.length) return renderSimpleEmpty('暂无数据');
    return '<div style="display:flex;flex-direction:column;gap:10px;">' + items.map(renderItem).join('') + '</div>';
  }

  function formatUserDisplay(userId, nickname) {
    const idText = String(userId || '');
    const nickText = String(nickname || '').trim();
    if (!nickText) return esc(idText);
    return esc(nickText) + ' <span style="color:var(--text-muted);font-size:12px;">(' + esc(idText) + ')</span>';
  }

  function renderLearningStrategyPanel() {
    const strategy = state.selfLearning.strategy || {};
    const runtime = strategy.runtime || {};
    const settings = strategy.settings || {};
    const autoEnabled = !!runtime.autoLearningEnabled;
    return ''
      + '<div style="display:flex;flex-direction:column;gap:14px;">'
      + '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">'
      + '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">'
      + '<div style="font-size:12px;color:var(--text-muted);">运行态自动学习</div>'
      + '<div style="margin-top:6px;font-size:18px;font-weight:700;color:' + (autoEnabled ? 'var(--success)' : 'var(--warning)') + ';">' + (autoEnabled ? '已开启' : '已暂停') + '</div>'
      + '<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">上次执行：' + esc(fmtTime(runtime.lastLearningAt || 0)) + '</div>'
      + '<div style="margin-top:4px;font-size:12px;color:var(--text-secondary);">预计下次：' + esc(fmtTime(runtime.nextLearningAt || 0)) + '</div>'
      + '</div>'
      + '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">'
      + '<div style="font-size:12px;color:var(--text-muted);">当前选中群</div>'
      + '<div style="margin-top:6px;font-size:18px;font-weight:700;color:var(--accent);">' + esc(slCurrentGroup() || '未选择') + '</div>'
      + '<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">手动学习、清理与重建都将作用于当前群。</div>'
      + '</div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">'
      + '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">学习间隔(小时)<input id="slStrategyInterval" data-testid="sl-strategy-interval" class="config-input" type="number" min="1" value="' + esc(String(settings.learningIntervalHours || 6)) + '"></label>'
      + '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">最少消息数<input id="slStrategyMinMessages" class="config-input" type="number" min="1" value="' + esc(String(settings.minMessagesForLearning || 30)) + '"></label>'
      + '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">批处理上限<input id="slStrategyMaxBatch" class="config-input" type="number" min="1" value="' + esc(String(settings.maxMessagesPerBatch || 200)) + '"></label>'
      + '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">ML 样本上限<input id="slStrategyMlSample" class="config-input" type="number" min="1" value="' + esc(String(settings.maxMlSampleSize || 120)) + '"></label>'
      + '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">总好感度池<input id="slStrategyAffectionCap" class="config-input" type="number" min="1" value="' + esc(String(settings.totalAffectionCap || 250)) + '"></label>'
      + '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">单用户好感上限<input id="slStrategyUserCap" class="config-input" type="number" min="1" value="' + esc(String(settings.maxUserAffection || 100)) + '"></label>'
      + '</div>'
      + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-primary);">'
      + '<input id="slStrategyEnableMl" data-testid="sl-strategy-enable-ml" type="checkbox" ' + (settings.enableMlAnalysis ? 'checked' : '') + '>'
      + '<span>启用高级 ML/聚类分析</span>'
      + '</label>'
      + '<div style="display:flex;flex-wrap:wrap;gap:10px;">'
      + '<button class="analyzer-btn primary" id="slToggleRuntimeBtn" data-testid="sl-toggle-runtime" onclick="toggleLearningRuntime()">' + (autoEnabled ? '暂停自动学习' : '开启自动学习') + '</button>'
      + '<button class="analyzer-btn" id="slSaveStrategyBtn" data-testid="sl-save-strategy" onclick="saveLearningStrategy()">保存策略到 .env</button>'
      + '</div>'
      + '</div>';
  }

  function renderLearningDataOpsPanel() {
    return ''
      + '<div style="display:flex;flex-direction:column;gap:14px;">'
      + '<div style="display:flex;flex-wrap:wrap;gap:10px;">'
      + '<button class="analyzer-btn" id="slExportCurrentBtn" data-testid="sl-export-current" onclick="exportLearningData(true)">导出当前群</button>'
      + '<button class="analyzer-btn" id="slExportAllBtn" data-testid="sl-export-all" onclick="exportLearningData(false)">导出全部</button>'
      + '<button class="analyzer-btn" id="slImportFileBtn" data-testid="sl-import-file" onclick="triggerLearningImportFile()">选择导入文件</button>'
      + '<button class="analyzer-btn" id="slRebuildBtn" data-testid="sl-rebuild-snapshot" onclick="rebuildLearningSnapshots()">重建分析快照</button>'
      + '<button class="analyzer-btn" id="slClearGroupBtn" data-testid="sl-clear-group" style="background:var(--danger);color:#fff;border:none;" onclick="clearLearningGroup()">清理当前群学习记录</button>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:start;">'
      + '<label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">导入模式<select id="slImportMode" data-testid="sl-import-mode" class="config-input" onchange="state.selfLearning.importMode=this.value"><option value="merge"' + (state.selfLearning.importMode === 'merge' ? ' selected' : '') + '>合并导入</option><option value="replace"' + (state.selfLearning.importMode === 'replace' ? ' selected' : '') + '>覆盖导入</option></select></label>'
      + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.7;padding-top:2px;">支持粘贴或选择 UTF-8 JSON 文件；导出文件会附带 UTF-8 BOM，便于在 Windows 下直接查看。</div>'
      + '</div>'
      + '<textarea id="slImportPayload" data-testid="sl-import-payload" class="config-input" placeholder="把导出的学习数据 JSON 粘贴到这里，或点击上方“选择导入文件”" style="min-height:160px;resize:vertical;font-family:JetBrains Mono, monospace;"></textarea>'
      + '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">'
      + '<div style="font-size:12px;color:var(--text-muted);">当前群：' + esc(slCurrentGroup() || '未选择') + '</div>'
      + '<button class="analyzer-btn primary" id="slImportBtn" data-testid="sl-import-btn" onclick="importLearningData()">执行导入</button>'
      + '</div>'
      + '</div>';
  }

  function renderLearningControlPanels() {
    document.getElementById('slStrategyPanel').innerHTML = renderLearningStrategyPanel();
    document.getElementById('slDataOpsPanel').innerHTML = renderLearningDataOpsPanel();
  }

  async function loadSelfLearningPanel(showSuccessToast) {
    const [overviewData, strategyData, status] = await Promise.all([
      api('/api/self-learning/overview'),
      api('/api/self-learning/strategy'),
      api('/api/status'),
    ]);
    state.selfLearning.strategy = strategyData || null;
    if (!overviewData || !overviewData.overview) {
      renderLearningControlPanels();
      ['slStylesPanel', 'slSlangPanel', 'slSocialPanel', 'slAffectionPanel', 'slGoalsPanel', 'slMemoryPanel', 'slClustersPanel', 'slScenesPanel', 'slAdvancedSummaryPanel', 'slReviewsPanel', 'slRunsPanel']
        .forEach(function(id, index) {
          document.getElementById(id).innerHTML = renderSimpleEmpty(index === 0 ? '自学习插件未启用或尚未初始化' : '无可用数据');
        });
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
    select.innerHTML = '<option value="">自动选择</option>' + groups.map(function(g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
    select.value = current;
    renderLearningControlPanels();

    if (!current) {
      document.getElementById('slStylesPanel').innerHTML = renderSimpleEmpty('等待群聊消息后会出现学习数据');
      ['slSlangPanel', 'slSocialPanel', 'slAffectionPanel', 'slGoalsPanel', 'slMemoryPanel', 'slClustersPanel', 'slScenesPanel', 'slAdvancedSummaryPanel', 'slReviewsPanel', 'slRunsPanel']
        .forEach(function(id) {
          document.getElementById(id).innerHTML = renderSimpleEmpty('请先选择或激活一个群');
        });
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

    document.getElementById('slStylesPanel').innerHTML = renderSelfLearningList(state.selfLearning.styles.slice(0, 10), function(item) {
      return '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">'
        + '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;"><strong>' + esc(item.patternType) + '</strong><span style="color:var(--accent);font-size:12px;">权重 ' + Number(item.weight || 0).toFixed(1) + '</span></div>'
        + '<div style="margin-top:6px;color:var(--text-primary);">' + esc(item.patternValue || '') + '</div>'
        + '<div style="margin-top:4px;font-size:12px;color:var(--text-muted);">用户 ' + formatUserDisplay(item.userId, item.nickname) + ' · 证据 ' + esc(String(item.evidenceCount || 0)) + '</div>'
        + '</div>';
    });

    document.getElementById('slSlangPanel').innerHTML = renderSelfLearningList(state.selfLearning.slang.slice(0, 10), function(item) {
      return '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">'
        + '<div style="display:flex;justify-content:space-between;gap:12px;"><strong style="color:var(--accent);">' + esc(item.term || '') + '</strong><span style="font-size:12px;color:var(--text-muted);">' + esc(String(item.usageCount || 0)) + ' 次</span></div>'
        + '<div style="margin-top:6px;color:var(--text-secondary);font-size:13px;line-height:1.6;">' + esc(item.meaning || '') + '</div>'
        + '</div>';
    });

    document.getElementById('slSocialPanel').innerHTML = renderSelfLearningList(state.selfLearning.social.slice(0, 12), function(item) {
      return '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);display:flex;justify-content:space-between;gap:12px;align-items:center;">'
        + '<div><div><strong>' + formatUserDisplay(item.sourceUserId, item.sourceNickname) + '</strong> → <strong>' + formatUserDisplay(item.targetUserId, item.targetNickname) + '</strong></div><div style="margin-top:6px;font-size:12px;color:var(--text-muted);">' + esc(item.relationType || '') + ' · 互动 ' + esc(String(item.interactions || 0)) + '</div></div>'
        + '<div style="font-size:18px;color:var(--accent);font-weight:700;">' + Number(item.score || 0).toFixed(1) + '</div>'
        + '</div>';
    });

    document.getElementById('slAffectionPanel').innerHTML =
      '<div style="margin-bottom:12px;padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">'
      + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">当前情绪</div>'
      + '<div style="font-size:18px;font-weight:700;color:var(--accent);">' + esc(state.selfLearning.mood ? state.selfLearning.mood.mood : 'curious') + '</div>'
      + '<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">' + esc(state.selfLearning.mood ? state.selfLearning.mood.reason : '等待更多聊天样本') + '</div>'
      + '</div>'
      + renderSelfLearningList(state.selfLearning.affection.slice(0, 10), function(item) {
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">'
          + '<div><strong>' + formatUserDisplay(item.userId, item.nickname) + '</strong><div style="margin-top:4px;font-size:12px;color:var(--text-muted);">最近波动 ' + Number(item.lastDelta || 0).toFixed(1) + '</div></div>'
          + '<div style="font-size:20px;color:var(--pink);font-weight:700;">' + Number(item.score || 0).toFixed(1) + '</div>'
          + '</div>';
      });

    document.getElementById('slGoalsPanel').innerHTML = renderSelfLearningList(state.selfLearning.goals.slice(0, 10), function(item) {
      return '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">'
        + '<div style="display:flex;justify-content:space-between;gap:12px;"><strong>' + esc(item.goalType || '') + '</strong><span style="font-size:12px;color:var(--text-muted);">用户 ' + esc(String(item.userId || '')) + '</span></div>'
        + '<div style="margin-top:6px;color:var(--text-secondary);font-size:13px;line-height:1.6;">' + esc(item.summary || '') + '</div>'
        + '</div>';
    });

    document.getElementById('slMemoryPanel').innerHTML = renderSelfLearningList(state.selfLearning.memories.slice(0, 12), function(item) {
      return '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">'
        + '<div style="display:flex;justify-content:space-between;gap:12px;"><strong>' + esc(item.key || '') + '</strong><span style="font-size:12px;color:var(--text-muted);">重要度 ' + Number(item.importance || 0).toFixed(2) + '</span></div>'
        + '<div style="margin-top:6px;color:var(--text-secondary);font-size:13px;line-height:1.6;">' + esc(item.content || '') + '</div>'
        + '<div style="margin-top:8px;font-size:12px;color:var(--accent);">' + (item.tags || []).map(function(tag) { return '#' + esc(tag); }).join(' ') + '</div>'
        + '</div>';
    });

    document.getElementById('slClustersPanel').innerHTML = renderSelfLearningList(state.selfLearning.clusters.slice(0, 8), function(item) {
      return '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">'
        + '<div style="display:flex;justify-content:space-between;gap:12px;"><strong>' + esc(item.label || ('Cluster ' + item.id)) + '</strong><span style="font-size:12px;color:var(--text-muted);">' + esc(String(item.messageCount || 0)) + ' 条</span></div>'
        + '<div style="margin-top:6px;font-size:13px;color:var(--text-secondary);">' + (item.keywords || []).map(function(k) { return '#' + esc(k); }).join(' ') + '</div>'
        + '<div style="margin-top:8px;font-size:12px;color:var(--text-muted);">样例：' + esc((item.sampleMessages || []).join(' / ')) + '</div>'
        + '</div>';
    });

    document.getElementById('slScenesPanel').innerHTML = renderSelfLearningList(state.selfLearning.scenes.slice(0, 10), function(item) {
      return '<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,0.02);">'
        + '<div style="display:flex;justify-content:space-between;gap:12px;"><strong>' + esc(item.scene || '') + '</strong><span style="font-size:12px;color:var(--accent);">' + Math.round(Number(item.confidence || 0) * 100) + '%</span></div>'
        + '<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">类别 ' + esc(item.category || '') + ' · 命中 ' + esc(String(item.matches || 0)) + ' 条</div>'
        + '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">' + esc((item.sampleMessages || []).join(' / ')) + '</div>'
        + '</div>';
    });

    const memoryGraphText = '记忆节点 ' + ((state.selfLearning.memoryGraph.nodes || []).length) + ' 个，连接边 ' + ((state.selfLearning.memoryGraph.edges || []).length) + ' 条';
    const memoryEdgePreview = (state.selfLearning.memoryGraph.edges || []).slice(0, 8).map(function(edge) {
      return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;color:var(--text-secondary);">'
        + '<strong style="color:var(--text-primary);">' + esc(edge.source || '') + '</strong> ↔ <strong style="color:var(--text-primary);">' + esc(edge.target || '') + '</strong>'
        + ' <span style="color:var(--accent);">(' + Number(edge.weight || 0).toFixed(2) + ')</span>'
        + '<div style="margin-top:4px;">' + esc(edge.reason || '') + '</div>'
        + '</div>';
    }).join('');

    document.getElementById('slAdvancedSummaryPanel').innerHTML =
      '<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;">'
      + '<div style="padding:14px;border:1px solid var(--border-color);border-radius:14px;background:rgba(255,255,255,0.02);">'
      + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">高级学习摘要</div>'
      + '<div style="font-size:15px;line-height:1.8;color:var(--text-primary);">' + esc(state.selfLearning.advancedSummary ? state.selfLearning.advancedSummary.summary : '暂无高级学习结果') + '</div>'
      + '<div style="margin-top:10px;font-size:12px;color:var(--text-secondary);">' + memoryGraphText + '</div>'
      + '<pre style="margin-top:12px;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,0.18);padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;line-height:1.6;">' + esc(state.selfLearning.advancedSummary ? state.selfLearning.advancedSummary.personaPrompt : '暂无 persona prompt') + '</pre>'
      + '</div>'
      + '<div style="padding:14px;border:1px solid var(--border-color);border-radius:14px;background:rgba(255,255,255,0.02);">'
      + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">记忆图谱连边预览</div>'
      + (memoryEdgePreview || '<div style="font-size:13px;color:var(--text-muted);">暂无足够的记忆连接</div>')
      + '</div>'
      + '</div>';

    document.getElementById('slReviewsPanel').innerHTML = renderSelfLearningList(state.selfLearning.reviews.slice(0, 10), function(item) {
      return '<div data-testid="sl-review-card" style="padding:14px;border:1px solid var(--border-color);border-radius:14px;background:rgba(255,255,255,0.02);">'
        + '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;"><div><strong>' + esc(item.personaName || '') + '</strong><div style="margin-top:4px;font-size:12px;color:var(--text-muted);">状态：' + esc(item.status || '') + '</div></div>'
        + '<div style="display:flex;gap:8px;align-items:center;">'
        + '<button class="analyzer-btn" data-testid="sl-approve-review-' + Number(item.id || 0) + '" style="padding:6px 12px;border-radius:8px;" onclick="approvePersonaReview(' + Number(item.id || 0) + ')" ' + (item.status !== 'pending' ? 'disabled' : '') + '>批准</button>'
        + '<button class="analyzer-btn" data-testid="sl-reject-review-' + Number(item.id || 0) + '" style="padding:6px 12px;border-radius:8px;background:var(--danger);color:#fff;border:none;" onclick="rejectPersonaReview(' + Number(item.id || 0) + ')" ' + (item.status !== 'pending' ? 'disabled' : '') + '>驳回</button>'
        + '</div></div>'
        + '<div style="margin-top:10px;font-size:13px;color:var(--text-secondary);line-height:1.7;">' + esc(item.summary || '') + '</div>'
        + '<pre style="margin-top:10px;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,0.18);padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;line-height:1.6;">' + esc(item.suggestedPrompt || '') + '</pre>'
        + '</div>';
    });

    document.getElementById('slRunsPanel').innerHTML = renderSelfLearningList(state.selfLearning.runs.slice(0, 10), function(item) {
      return '<div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);">'
        + '<div style="display:flex;justify-content:space-between;gap:12px;"><strong>' + esc(item.status || 'completed') + '</strong><span style="font-size:12px;color:var(--text-muted);">' + new Date(item.createdAt || Date.now()).toLocaleString('zh-CN', { hour12: false }) + '</span></div>'
        + '<div style="margin-top:6px;font-size:13px;color:var(--text-secondary);line-height:1.7;">' + esc(item.summary || '') + '</div>'
        + '</div>';
    });

    if (showSuccessToast) toast('自学习面板已刷新', 'success');
  }

  async function runLearningCycle() {
    const groupId = slRequireGroup('立即学习');
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
    const enabled = !((state.selfLearning.strategy || {}).runtime || {}).autoLearningEnabled;
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
    const payload = {
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
    const groupId = currentOnly ? slRequireGroup('导出当前群数据') : '';
    if (currentOnly && !groupId) return;
    const url = '/api/self-learning/export' + (groupId ? ('?groupId=' + encodeURIComponent(groupId)) : '');
    const data = await api(url);
    if (!data || !data.data || !data.source) {
      toast('导出失败', 'error');
      return;
    }
    const name = currentOnly ? ('self-learning-group-' + groupId + '.json') : 'self-learning-all-groups.json';
    downloadUtf8Json(name, data);
    toast(currentOnly ? '已导出当前群学习数据' : '已导出全部学习数据', 'success');
  }

  function triggerLearningImportFile() {
    document.getElementById('slImportFile').click();
  }

  function handleLearningImportFile(event) {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    const reader = new FileReader();
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
    const payload = document.getElementById('slImportPayload').value.trim();
    if (!payload) {
      toast('请先粘贴或选择学习数据 JSON', 'error');
      return;
    }
    let bundle = null;
    try {
      bundle = JSON.parse(payload);
    } catch {
      toast('导入 JSON 格式不正确', 'error');
      return;
    }
    const mode = document.getElementById('slImportMode').value || 'merge';
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
    const groupId = slRequireGroup('清理当前群学习记录');
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
    const groupId = slRequireGroup('重建分析快照');
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

  return {
    renderSimpleEmpty,
    loadSelfLearningPanel,
    runLearningCycle,
    toggleLearningRuntime,
    saveLearningStrategy,
    exportLearningData,
    triggerLearningImportFile,
    handleLearningImportFile,
    importLearningData,
    clearLearningGroup,
    rebuildLearningSnapshots,
    approvePersonaReview,
    rejectPersonaReview,
  };
}
