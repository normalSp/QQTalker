export function createAnalyzerPageController(options) {
  const { state, api, toast, esc } = options;

  function analyzerUploadFile() {
    document.getElementById('analyzerFileInput').click();
  }

  function analyzerHandleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      analyzerParseLog(ev.target.result, file.name);
    };
    reader.readAsText(file);
  }

  async function analyzerLoadServerLog() {
    toast('正在加载服务器日志...', 'info');
    try {
      const res = await fetch('/api/log-file');
      if (!res.ok) {
        const sseData = await api('/api/logs');
        if (sseData.logs && sseData.logs.length > 0) {
          const lines = sseData.logs.map(function(l) {
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

  function azLevelName(level) {
    if (level >= 50) return 'error';
    if (level >= 40) return 'warn';
    if (level >= 30) return 'info';
    return 'debug';
  }

  function analyzerParseLog(text, name) {
    state.analyzerLogs = [];
    const lines = text.split('\n').filter(function(l) { return l.trim(); });
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
    state.analyzerLogs.sort(function(a, b) {
      const ta = a.time || '';
      const tb = b.time || '';
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return String(ta).localeCompare(String(tb));
    });
    analyzerShowAnalysis(name);
  }

  function analyzerShowAnalysis() {
    document.getElementById('analyzerEmptyState').style.display = 'none';
    document.getElementById('analyzerContent').style.display = 'block';

    const errors = state.analyzerLogs.filter(function(l) { return l.level >= 50; }).length;
    const warns = state.analyzerLogs.filter(function(l) { return l.level >= 40 && l.level < 50; }).length;
    document.getElementById('azTotal').textContent = state.analyzerLogs.length.toLocaleString();
    document.getElementById('azErrors').textContent = errors;
    document.getElementById('azWarns').textContent = warns;

    if (state.analyzerLogs.length > 1 && state.analyzerLogs[0].time && state.analyzerLogs[state.analyzerLogs.length - 1].time) {
      const t0 = new Date(state.analyzerLogs[0].time).getTime();
      const t1 = new Date(state.analyzerLogs[state.analyzerLogs.length - 1].time).getTime();
      const mins = Math.round((t1 - t0) / 60000);
      document.getElementById('azDuration').textContent = mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm';
    }

    const levelCounts = { error: 0, warn: 0, info: 0, debug: 0 };
    state.analyzerLogs.forEach(function(l) { levelCounts[azLevelName(l.level)]++; });

    if (state.azLevelChart) state.azLevelChart.destroy();
    state.azLevelChart = new Chart(document.getElementById('azLevelChart'), {
      type: 'doughnut',
      data: {
        labels: ['Error', 'Warn', 'Info', 'Debug'],
        datasets: [{ data: [levelCounts.error, levelCounts.warn, levelCounts.info, levelCounts.debug], backgroundColor: ['#f87171', '#fbbf24', '#00d4ff', '#5c5f73'], borderWidth: 0, hoverOffset: 6 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { color: '#8b8fa3', font: { size: 11 }, padding: 12 } } } }
    });

    const minuteMap = {};
    state.analyzerLogs.forEach(function(l) {
      if (!l.time) return;
      const d = new Date(l.time);
      const key = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
      minuteMap[key] = (minuteMap[key] || 0) + 1;
    });
    const timeKeys = Object.keys(minuteMap).slice(-60);
    const freqData = timeKeys.map(function(k) { return minuteMap[k]; });

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
    if (filter !== 'all') filtered = filtered.filter(function(l) { return azLevelName(l.level) === filter; });
    if (search) filtered = filtered.filter(function(l) { return l.msg.toLowerCase().includes(search); });

    document.getElementById('azLogHint').textContent = filtered.length + ' / ' + state.analyzerLogs.length + ' 条';

    const viewer = document.getElementById('azLogViewer');
    if (!filtered.length) {
      viewer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">无匹配日志</div>';
      return;
    }

    const display = filtered.slice(-500).reverse();
    viewer.innerHTML = display.map(function(l) {
      const ln = azLevelName(l.level);
      const fullTime = l.time ? new Date(l.time).toLocaleString('zh-CN', { hour12: false }) : '';
      return '<div class="analyzer-log-entry level-' + ln + '">'
        + '<div><span class="analyzer-log-time">' + fullTime + '</span></div>'
        + '<span class="analyzer-log-level ' + ln + '">' + ln.toUpperCase() + '</span>'
        + '<div class="analyzer-log-msg">' + esc(l.msg) + '</div>'
        + '</div>';
    }).join('');
  }

  return {
    analyzerUploadFile,
    analyzerHandleFile,
    analyzerLoadServerLog,
    analyzerRenderLogs,
  };
}
