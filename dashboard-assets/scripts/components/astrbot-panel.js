export function createAstrbotPanelController(options) {
  const { state, esc } = options;

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

  function updateAstrbotEventFilter() {
    updateAstrbotComplexTaskStatus(state.astrbot ? state.astrbot.snapshot : null);
  }

  return {
    getAstrbotFilteredEvents,
    updateAstrbotComplexTaskStatus,
    updateAstrbotEventFilter,
  };
}
