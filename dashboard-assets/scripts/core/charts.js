// ========== Charts Init ==========
export function initCharts(runtime) {
  const ctx1 = document.getElementById('throughputChart');
  if (ctx1) {
    runtime.tpChart = new Chart(ctx1, {
      type: 'line',
      data: { labels: [], datasets: [
        { label: '消息/分钟', data: [], borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.06)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'AI 调用/分钟', data: [], borderColor: '#b362ff', backgroundColor: 'rgba(179,98,255,0.06)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
      ]},
      options: chartOpts()
    });
  }

  const ctx2 = document.getElementById('donutChart');
  if (ctx2) {
    runtime.donutChart = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['消息', 'AI', 'TTS', 'STT'],
        datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#00d4ff', '#b362ff', '#ff6ec7', '#fb923c'], borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: '65%',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(13,14,20,0.9)', titleColor: '#e8eaf0', bodyColor: '#8b8fa3', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, cornerRadius: 10, padding: 12 } }
      }
    });
  }
}

export function chartOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'top', labels: { color: '#8b8fa3', usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 11, family: 'Inter' } } },
      tooltip: { backgroundColor: 'rgba(13,14,20,0.9)', titleColor: '#e8eaf0', bodyColor: '#8b8fa3', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, cornerRadius: 10, padding: 12, backdropFilter: 'blur(8px)' }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#5c5f73', font: { size: 10 }, maxRotation: 0, maxTicksLimit: 15 } },
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5c5f73', font: { size: 10 } } }
    }
  };
}

export function initAnalyticsCharts(state, runtime) {
  if (!runtime.cumulChart) {
    const ctx = document.getElementById('cumulChart');
    if (ctx) {
      runtime.cumulChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [
          { label: '累计消息', data: [], borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.04)', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        ]},
        options: chartOpts()
      });
    }
  }
  if (!runtime.memChart) {
    const ctx = document.getElementById('memChart');
    if (ctx) {
      runtime.memChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [
          { label: '堆内存 (MB)', data: [], borderColor: '#ff6ec7', backgroundColor: 'rgba(255,110,199,0.06)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        ]},
        options: chartOpts()
      });
    }
  }
  if (!runtime.apiCallsChart) {
    const ctx = document.getElementById('apiCallsChart');
    if (ctx) {
      runtime.apiCallsChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [
          { label: 'AI 调用', data: [], backgroundColor: 'rgba(179,98,255,0.6)', borderRadius: 4 },
          { label: 'TTS 合成', data: [], backgroundColor: 'rgba(255,110,199,0.6)', borderRadius: 4 },
          { label: 'STT 识别', data: [], backgroundColor: 'rgba(251,146,60,0.6)', borderRadius: 4 },
        ]},
        options: { ...chartOpts(), scales: { ...chartOpts().scales, x: { ...chartOpts().scales.x, stacked: true }, y: { ...chartOpts().scales.y, stacked: true } } }
      });
    }
  }
  updateAnalyticsCharts(state, runtime);
}

export function updateAnalyticsCharts(state, runtime) {
  const h = state.statsHistory;
  if (!h.length) return;
  const labels = h.map(p => p.time);
  if (runtime.cumulChart) {
    runtime.cumulChart.data.labels = labels;
    runtime.cumulChart.data.datasets[0].data = h.map(p => p.totalMessages);
    runtime.cumulChart.update('none');
  }
  if (runtime.memChart) {
    runtime.memChart.data.labels = labels;
    runtime.memChart.data.datasets[0].data = h.map(p => p.memoryMB);
    runtime.memChart.update('none');
  }
  if (runtime.apiCallsChart) {
    runtime.apiCallsChart.data.labels = labels;
    runtime.apiCallsChart.data.datasets[0].data = h.map(p => p.totalAiCalls);
    runtime.apiCallsChart.data.datasets[1].data = h.map(p => p.totalTtsCalls);
    runtime.apiCallsChart.data.datasets[2].data = h.map(p => p.totalSttCalls);
    runtime.apiCallsChart.update('none');
  }
}

