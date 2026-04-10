export function fmt(n) {
  return Number(n || 0).toLocaleString();
}

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function fmtTime(ts) {
  if (!ts) return '未执行';
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return '未执行';
  }
}

export function downloadUtf8Json(filename, data) {
  const text = '\uFEFF' + JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function() {
    URL.revokeObjectURL(url);
  }, 500);
}

export function toast(msg, type) {
  const level = type || 'info';
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const item = document.createElement('div');
  item.className = 'toast ' + level;
  item.textContent = msg;
  container.appendChild(item);
  setTimeout(function() {
    item.style.opacity = '0';
    item.style.transform = 'translateX(40px)';
    item.style.transition = 'all 0.3s';
    setTimeout(function() {
      item.remove();
    }, 300);
  }, 3000);
}

export const showToast = toast;
