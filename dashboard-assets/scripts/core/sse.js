export function connectSseStream(options) {
  const state = options.state;
  const runtime = options.runtime;
  const onEvent = options.onEvent;
  const onConnectionChange = options.onConnectionChange;

  if (runtime.es) {
    runtime.es.close();
  }

  const stream = new EventSource('/api/events');
  runtime.es = stream;

  stream.addEventListener('connected', function() {
    state.sseConnected = true;
    const el = document.getElementById('sseStatus');
    if (el) {
      el.textContent = '实时推送: 已连接';
      el.className = 'sse-status connected';
    }
  });

  ['message', 'ai', 'tts', 'stt', 'error', 'system'].forEach(function(type) {
    stream.addEventListener(type, function(event) {
      onEvent(type, event);
    });
  });

  stream.addEventListener('status', function(event) {
    const payload = JSON.parse(event.data);
    onConnectionChange(payload.data.connected);
  });

  stream.onerror = function() {
    state.sseConnected = false;
    const el = document.getElementById('sseStatus');
    if (el) {
      el.textContent = '实时推送: 重连中...';
      el.className = 'sse-status disconnected';
    }
  };

  return stream;
}
