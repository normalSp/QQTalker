export function createProcessPageController(options) {
  const { dashboardApi } = options;

  async function renderProcess() {
    const [stats, status] = await Promise.all([
      dashboardApi.getStats(),
      dashboardApi.getStatus(),
    ]);

    if (stats && stats.process) {
      const processInfo = stats.process;
      const info = document.getElementById('processInfo');
      if (info) {
        info.innerHTML = [
          ['进程ID', processInfo.pid],
          ['系统平台', processInfo.platform],
          ['Node.js 版本', processInfo.nodeVersion],
          ['内存占用', processInfo.memory],
          ['消息/分钟', stats.messagesPerMinute],
          ['AI调用/分钟', stats.aiCallsPerMinute],
          ['运行时间', stats.uptime],
        ].map(function(pair) {
          return '<div class="proc-row"><span class="proc-key">' + pair[0] + '</span><span class="proc-val">' + pair[1] + '</span></div>';
        }).join('');
      }
    }

    if (status && status.memoryUsage) {
      const memory = status.memoryUsage;
      const rss = Math.round(memory.rss / 1024 / 1024);
      const heap = Math.round(memory.heapUsed / 1024 / 1024);
      const total = Math.round(memory.heapTotal / 1024 / 1024);
      const ext = Math.round(memory.external / 1024 / 1024);
      const bars = document.getElementById('memBars');
      if (bars) {
        bars.innerHTML = [
          { label: 'RSS (总计)', value: rss, max: 512, color: 'var(--info)' },
          { label: '堆已用', value: heap, max: total || 512, color: 'var(--purple)' },
          { label: '堆总量', value: total, max: 1024, color: 'var(--accent)' },
          { label: '外部内存', value: ext, max: 256, color: 'var(--orange)' },
        ].map(function(item) {
          const pct = Math.min(100, Math.round(item.value / item.max * 100));
          return '<div class="mem-bar-wrap"><div class="mem-bar-label"><span>' + item.label + '</span><span>' + item.value + ' MB</span></div><div class="mem-bar"><div class="mem-bar-fill" style="width:' + pct + '%;background:' + item.color + '"></div></div></div>';
        }).join('');
      }
    }

    const tags = document.getElementById('groupTags');
    const groups = (status && status.activeGroups) ? status.activeGroups : [];
    if (!tags) return;
    if (!groups.length) {
      tags.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128101;</div><div class="empty-text">暂无活跃群组</div></div>';
      return;
    }
    tags.innerHTML = groups.map(function(groupId) {
      return '<div class="group-tag"><span style="color:var(--accent);font-weight:700;">#</span>' + groupId + '</div>';
    }).join('');
  }

  return {
    renderProcess,
  };
}
