export function createChatlogViewer(options) {
  const { api, esc } = options;
  const qqFaceFallbackMap = {
    14: '😁',
    16: '😎',
    21: '😭',
    33: '😡',
    39: '😴',
    63: '🥀',
    66: '❤️',
    74: '🌞',
    76: '💪',
    96: '🌹',
    111: '🍉',
    116: '👍',
    124: '🎉',
    144: '😳',
    147: '😤',
    174: '🥳',
  };

  function parseCqData(raw) {
    return String(raw || '').split(',').reduce(function(acc, part) {
      const eqIndex = part.indexOf('=');
      if (eqIndex <= 0) return acc;
      const key = part.slice(0, eqIndex).trim();
      const value = part.slice(eqIndex + 1).trim();
      if (key) acc[key] = value;
      return acc;
    }, {});
  }

  function escapePlainText(text) {
    return esc(text || '').replace(/\r?\n/g, '<br>');
  }

  function codePointToEmoji(id) {
    const value = Number(id);
    if (!Number.isInteger(value) || value <= 0 || value > 0x10ffff) return '';
    try {
      return String.fromCodePoint(value);
    } catch {
      return '';
    }
  }

  function renderMessageHtml(text) {
    const source = String(text || '');
    if (!source) return '';

    let html = '';
    let lastIndex = 0;
    const cqPattern = /\[CQ:([a-zA-Z]+),([^\]]*)\]/g;
    let match;

    while ((match = cqPattern.exec(source))) {
      html += escapePlainText(source.slice(lastIndex, match.index));
      const type = String(match[1] || '').toLowerCase();
      const data = parseCqData(match[2]);

      if (type === 'at') {
        const label = '@' + (data.qq || 'unknown');
        html += '<span class="chatlog-inline-mention">' + esc(label) + '</span>';
      } else if (type === 'emoji') {
        const emoji = codePointToEmoji(data.id) || '🙂';
        html += '<span class="chatlog-inline-emoji" title="Emoji">' + esc(emoji) + '</span>';
      } else if (type === 'face') {
        const emoji = qqFaceFallbackMap[data.id] || '🙂';
        html += '<span class="chatlog-inline-emoji" title="QQ表情 #' + esc(data.id || '?') + '">' + esc(emoji) + '</span>';
      } else if (type === 'image') {
        html += '<span class="chatlog-inline-token">[图片]</span>';
      } else if (type === 'record') {
        html += '<span class="chatlog-inline-token">[语音]</span>';
      } else if (type === 'reply') {
        html += '<span class="chatlog-inline-token">[回复]</span>';
      } else if (type === 'forward') {
        html += '<span class="chatlog-inline-token">[合并转发]</span>';
      } else {
        html += '<span class="chatlog-inline-token">[' + esc(type) + ']</span>';
      }

      lastIndex = match.index + match[0].length;
    }

    html += escapePlainText(source.slice(lastIndex));
    return html;
  }

  function proxyImage(url) {
    if (!url || !url.startsWith('http')) return url || '';
    const cleanUrl = url.replace(/&amp;/g, '&');
    return '/api/image-proxy?url=' + encodeURIComponent(cleanUrl);
  }

  function fixReplyContents(display, filtered) {
    if (!filtered || !filtered.length) return;
    const msgById = new Map();
    for (const m of filtered) {
      if (m.messageId) {
        msgById.set(String(m.messageId), m);
      }
    }
    document.querySelectorAll('.chatlog-reply-preview[data-reply-idx]').forEach(function(previewEl) {
      const dIdx = parseInt(previewEl.getAttribute('data-reply-idx'), 10);
      if (isNaN(dIdx) || dIdx < 0 || dIdx >= display.length) return;
      const m = display[dIdx];
      if (!m || !m.replyId) return;
      const contentEl = previewEl.querySelector('.chatlog-reply-preview-content');
      if (!contentEl) return;
      const replied = msgById.get(String(m.replyId));
      if (replied && replied.content) {
        contentEl.textContent = replied.content.substring(0, 120);
        return;
      }

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
        if (atUserId && candidate.userId === atUserId) {
          bestMatch = candidate;
          break;
        }
        if (candidate.userId === m.userId && m.userId !== 'bot') continue;
        if (diff < bestDiff) {
          bestMatch = candidate;
          bestDiff = diff;
        }
      }
      contentEl.textContent = bestMatch && bestMatch.content ? bestMatch.content.substring(0, 120) : '被引用的消息不在当前记录范围内';
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

  async function loadForwardMsg(forwardId, cardEl) {
    const contentId = 'fwd-content-' + forwardId.substring(0, 12);
    const contentEl = document.getElementById(contentId);
    if (!contentEl) return;
    if (cardEl.classList.contains('expanded') && contentEl.dataset.loaded === 'true') {
      cardEl.classList.remove('expanded');
      return;
    }
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
      data.messages.forEach(function(msg) {
        const timeStr = msg.time ? new Date(msg.time * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        const content = msg.content ? renderMessageHtml(msg.content) : '<span style="color:var(--text-muted);font-style:italic;">[无内容]</span>';
        html += '<div class="chatlog-forward-item">'
          + '<div class="chatlog-forward-item-header">'
          + '<span class="chatlog-forward-item-sender">' + esc(msg.sender) + '</span>'
          + '<span class="chatlog-forward-item-time">' + timeStr + '</span>'
          + '</div>'
          + '<div class="chatlog-forward-item-content">' + content + '</div>'
          + '</div>';
      });
      contentEl.innerHTML = html;
      contentEl.dataset.loaded = 'true';
    } catch (err) {
      contentEl.innerHTML = '<div class="chatlog-forward-hint">加载失败: ' + esc(err.message || '未知错误') + '</div>';
      contentEl.dataset.loaded = 'true';
    }
  }

  function scrollToReplyMsg() {
    document.querySelectorAll('.chatlog-reply-preview').forEach(function(el) {
      el.style.transition = 'border-left-color 0.3s, box-shadow 0.3s';
      el.style.borderLeftColor = 'var(--neon-purple)';
      el.style.boxShadow = '0 0 16px rgba(179,98,255,0.2)';
      setTimeout(function() {
        el.style.borderLeftColor = '';
        el.style.boxShadow = '';
      }, 1200);
    });
  }

  return {
    proxyImage,
    renderMessageHtml,
    fixReplyContents,
    openChatLogLightbox,
    loadForwardMsg,
    scrollToReplyMsg,
  };
}
