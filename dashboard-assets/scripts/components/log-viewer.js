function emptyStateHtml(icon, text) {
  return '<div class="empty-state"><div class="empty-icon">' + icon + '</div><div class="empty-text">' + text + '</div></div>';
}

export function renderLogEntry(container, entry, esc) {
  const types = {
    message: { cls: 'msg', label: 'MSG' },
    ai: { cls: 'ai', label: 'AI' },
    tts: { cls: 'tts', label: 'TTS' },
    stt: { cls: 'stt', label: 'STT' },
    error: { cls: 'error', label: 'ERR' },
    system: { cls: 'system', label: 'SYS' },
    status: { cls: 'status', label: 'STS' },
  };
  const typeMeta = types[entry.type] || types.system;
  if (container.querySelector('.empty-state')) {
    container.innerHTML = '';
  }
  const div = document.createElement('div');
  div.className = 'log-entry type-' + (entry.type || 'system');
  div.dataset.type = entry.type;
  div.innerHTML =
    '<span class="log-time">' + new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false }) + '</span>' +
    '<div class="log-body"><span class="log-type ' + typeMeta.cls + '">' + typeMeta.label + '</span>' +
    '<div class="log-msg">' + esc(String(entry.msg)) + '</div></div>';
  container.insertBefore(div, container.firstChild);
}

export function addLogEntry(options) {
  const { state, runtime, type, msg, esc } = options;
  const viewer = document.getElementById('logViewer');
  const viewerFull = document.getElementById('logViewerFull');
  const filter = runtime.logFilterCurrent;

  const entry = { time: Date.now(), type, msg };
  state.history.unshift(entry);
  if (state.history.length > state.maxHistory) state.history.pop();

  const badge = document.getElementById('logCount');
  if (badge) badge.textContent = Math.min(state.history.length, 99);

  if (viewer && (filter === 'all' || filter === type)) {
    renderLogEntry(viewer, entry, esc);
    while (viewer.querySelectorAll('.log-entry').length > 40) {
      viewer.lastChild.remove();
    }
  }

  if (viewerFull) {
    renderLogEntry(viewerFull, entry, esc);
    while (viewerFull.querySelectorAll('.log-entry').length > 200) {
      viewerFull.lastChild.remove();
    }
  }
}

export function clearLogViewer() {
  const viewer = document.getElementById('logViewerFull');
  if (viewer) viewer.innerHTML = emptyStateHtml('&#128196;', '已清空');
}

export function bindLogFilter(options) {
  const { state, runtime, esc } = options;
  document.getElementById('logFilter')?.addEventListener('change', function(event) {
    runtime.logFilterCurrent = event.target.value;
    const viewer = document.getElementById('logViewerFull');
    if (!viewer) return;

    viewer.innerHTML = '';
    const filtered = runtime.logFilterCurrent === 'all'
      ? state.history
      : state.history.filter(function(item) { return item.type === runtime.logFilterCurrent; });

    filtered.slice(0, 100).forEach(function(entry) {
      renderLogEntry(viewer, entry, esc);
    });

    if (!filtered.length) {
      viewer.innerHTML = emptyStateHtml('&#128196;', '无匹配事件');
    }
  });
}
