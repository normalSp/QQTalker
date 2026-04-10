export function createDashboardPageController(options) {
  const {
    state,
    runtime,
    dashboardApi,
    fmt,
    updateConnection,
    updateAnalyticsCharts,
    loadSelfLearningPanel,
  } = options;

  async function refreshStats() {
    const status = await dashboardApi.getStatus();
    if (!status || (status.connected === undefined && status.connected !== false)) return;

    updateConnection(status.connected);

    const statMap = {
      statMsg: status.totalMessages,
      statAi: status.totalAiCalls,
      statTts: status.totalTtsCalls,
      statStt: status.totalSttCalls,
      statGroups: (status.activeGroups || []).length,
      statSessions: status.sessionsCount || 0,
    };

    for (const id in statMap) {
      const el = document.getElementById(id);
      if (!el) continue;
      const newVal = fmt(statMap[id]);
      if (el.textContent !== newVal) {
        el.textContent = newVal;
        el.classList.add('bumped');
        setTimeout(function() { el.classList.remove('bumped'); }, 300);
      }
    }

    const uptimeDisplay = document.getElementById('uptimeDisplay');
    if (uptimeDisplay) uptimeDisplay.textContent = status.uptime || '--';

    if (status.memoryUsage) {
      const memDisplay = document.getElementById('memDisplay');
      if (memDisplay) {
        memDisplay.textContent = Math.round((status.memoryUsage.heapUsed || 0) / 1024 / 1024) + ' MB';
      }
    }

    if (runtime.donutChart) {
      const values = [status.totalMessages, status.totalAiCalls, status.totalTtsCalls, status.totalSttCalls];
      runtime.donutChart.data.datasets[0].data = values;
      runtime.donutChart.update('none');

      const colors = ['#00d4ff', '#b362ff', '#ff6ec7', '#fb923c'];
      const labels = ['消息', 'AI', 'TTS', 'STT'];
      const legend = document.getElementById('donutLegend');
      if (legend) {
        legend.innerHTML = labels.map(function(label, index) {
          return '<div class="legend-item"><span class="legend-dot" style="background:' + colors[index] + '"></span><span class="legend-label">' + label + '</span><span class="legend-value">' + fmt(values[index]) + '</span></div>';
        }).join('');
      }
    }
  }

  async function refreshAll() {
    await refreshStats();
    const history = await dashboardApi.getStatsHistory();
    if (history && history.history) {
      state.statsHistory = history.history;
      if (runtime.tpChart && history.history.length > 1) {
        const labels = history.history.map(function(point) { return point.time; });
        const msgsPerInterval = [];
        const aiPerInterval = [];
        for (let i = 0; i < history.history.length; i++) {
          if (i === 0) {
            msgsPerInterval.push(0);
            aiPerInterval.push(0);
            continue;
          }
          msgsPerInterval.push(history.history[i].totalMessages - history.history[i - 1].totalMessages);
          aiPerInterval.push(history.history[i].totalAiCalls - history.history[i - 1].totalAiCalls);
        }
        runtime.tpChart.data.labels = labels;
        runtime.tpChart.data.datasets[0].data = msgsPerInterval;
        runtime.tpChart.data.datasets[1].data = aiPerInterval;
        runtime.tpChart.update('none');
      }
      if (document.getElementById('page-analytics')?.classList.contains('active')) {
        updateAnalyticsCharts();
      }
    }
  }

  async function manualRefresh() {
    const btn = document.getElementById('refreshBtn');
    const icon = document.getElementById('refreshIcon');
    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('refresh-spinning');
    await refreshAll();
    if (document.getElementById('page-selflearning')?.classList.contains('active')) {
      await loadSelfLearningPanel(false);
    }
    setTimeout(function() {
      if (btn) btn.disabled = false;
      if (icon) icon.classList.remove('refresh-spinning');
    }, 600);
  }

  return {
    refreshStats,
    refreshAll,
    manualRefresh,
  };
}
