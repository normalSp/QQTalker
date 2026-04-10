export function createChatlogPageController(options) {
  const { api, toast, esc, viewer } = options;
  const chatLogState = {
    messages: [],
    users: new Set(),
    groups: [],
    filtered: [],
  };

  async function loadChatLogs() {
    const container = document.getElementById('chatlogContent');
    container.innerHTML = '<div class="card full-card"><div class="card-body"><div class="chatlog-loading"><div class="chatlog-loading-spinner"></div>正在解析日志...</div></div></div>';
    try {
      const data = await api('/api/chat-logs');
      if (!data || !data.messages || data.messages.length === 0) {
        container.innerHTML = '<div class="card full-card"><div class="card-body"><div class="chatlog-empty"><div class="chatlog-empty-icon"><i class="fas fa-inbox"></i></div><div style="font-size:16px;margin-bottom:8px;">未找到聊天记录</div><div style="font-size:12px;color:var(--text-muted);">暂无可解析的消息数据</div></div></div></div>';
        return;
      }
      chatLogState.messages = data.messages;
      chatLogState.groups = data.groups || [];
      const imgCount = data.messages.filter(function(m) { return m.messageType === 'image' || (m.messageType === 'mixed' && m.imageUrl); }).length;
      const voiceCount = data.messages.filter(function(m) { return m.messageType === 'voice'; }).length;
      const userSet = new Set();
      data.messages.forEach(function(m) {
        if (m.userId && m.userId !== 'bot') userSet.add(m.userId);
        if (m.nickname && m.userId !== 'bot') userSet.add(m.nickname);
      });
      document.getElementById('chatlogStats').style.display = 'flex';
      document.getElementById('chatlogFilters').style.display = 'flex';
      document.getElementById('clTotalMsg').textContent = data.messages.length;
      document.getElementById('clImgCount').textContent = imgCount;
      document.getElementById('clVoiceCount').textContent = voiceCount;
      document.getElementById('clUserCount').textContent = userSet.size;
      const groupSelect = document.getElementById('clGroupFilter');
      groupSelect.innerHTML = '<option value="all">全部群组</option>';
      (data.groups || []).forEach(function(g) {
        groupSelect.innerHTML += '<option value="' + g + '">群 ' + g + '</option>';
      });
      renderChatLogs();
      toast('已加载 ' + data.messages.length + ' 条聊天记录', 'success');
    } catch (err) {
      container.innerHTML = '<div class="card full-card"><div class="card-body"><div class="chatlog-empty"><div class="chatlog-empty-icon"><i class="fas fa-exclamation-triangle"></i></div><div style="font-size:16px;margin-bottom:8px;">加载失败</div><div style="font-size:12px;color:var(--text-muted);">' + (err.message || '未知错误') + '</div></div></div></div>';
      toast('加载聊天记录失败', 'error');
    }
  }

  function renderChatLogs() {
    const groupFilter = document.getElementById('clGroupFilter').value;
    const typeFilter = document.getElementById('clTypeFilter').value;
    const searchText = document.getElementById('clSearchInput').value.toLowerCase();
    const showBot = document.getElementById('clBotToggle').checked;
    let filtered = chatLogState.messages;
    if (groupFilter !== 'all') filtered = filtered.filter(function(m) { return m.groupId === groupFilter; });
    if (typeFilter !== 'all') filtered = filtered.filter(function(m) { return m.messageType === typeFilter; });
    if (searchText) {
      filtered = filtered.filter(function(m) {
        return (m.content || '').toLowerCase().includes(searchText)
          || (m.userId || '').includes(searchText)
          || (m.nickname || '').toLowerCase().includes(searchText);
      });
    }
    if (!showBot) filtered = filtered.filter(function(m) { return m.userId !== 'bot'; });
    chatLogState.filtered = filtered;

    const container = document.getElementById('chatlogContent');
    if (!filtered.length) {
      container.innerHTML = '<div class="card full-card"><div class="card-body"><div class="chatlog-empty"><div class="chatlog-empty-icon"><i class="fas fa-filter"></i></div><div style="font-size:16px;margin-bottom:8px;">无匹配结果</div><div style="font-size:12px;color:var(--text-muted);">尝试调整筛选条件</div></div></div></div>';
      return;
    }

    const colorPool = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', '#38bdf8', '#6c8eff', '#a78bfa', '#f472b6', '#e879f9'];
    function getUserColor(id) {
      let hash = 0;
      for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
      return colorPool[Math.abs(hash) % colorPool.length];
    }

    const display = filtered.slice(-300).reverse();
    let html = '<div class="chatlog-container"><div class="chatlog-list">';
    display.forEach(function(m, idx) {
      const isBot = m.userId === 'bot';
      const timeStr = m.time ? new Date(m.time).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--';
      const displayName = m.nickname || m.userId || '未知';
      const avatarChar = m.nickname ? m.nickname.charAt(0) : (m.userId ? m.userId.charAt(0) : '?');
      const avatarColor = isBot ? '' : 'background:' + getUserColor(m.userId || m.nickname || idx);
      let typeTag = '';
      let contentHtml = viewer.renderMessageHtml(m.content || '');
      let extraHtml = '';

      if (m.messageType === 'image') {
        contentHtml = '';
        let imgUrl = m.imageUrl || '';
        if ((!imgUrl || !imgUrl.startsWith('http') || imgUrl.length < 20) && m.rawMessage) {
          const rawUrlMatch = m.rawMessage.match(/url=([^\],]+)/);
          if (rawUrlMatch && rawUrlMatch[1].startsWith('http')) imgUrl = rawUrlMatch[1];
        }
        if (imgUrl && imgUrl.startsWith('http')) {
          const proxiedImgUrl = viewer.proxyImage(imgUrl);
          extraHtml = '<div class="chatlog-image-wrap"><img class="chatlog-image" src="' + esc(proxiedImgUrl) + '" data-proxy-src="' + esc(proxiedImgUrl) + '" data-direct-src="' + esc(imgUrl) + '" onclick="openChatLogLightbox(\'' + esc(imgUrl).replace(/'/g, "\\'") + '\')" loading="lazy" onerror="if(!this.dataset.directTried){this.dataset.directTried=\'1\';this.src=this.dataset.directSrc;return;} this.parentElement.innerHTML=\'<div class=chatlog-image-error><i class=fas fa-image></i><span>图片加载失败</span></div>\'"></div>';
        } else {
          contentHtml = '<span style="color:var(--text-muted);font-size:12px;"><i class="fas fa-image" style="margin-right:4px;"></i>图片URL不可用</span>';
        }
      } else if (m.messageType === 'voice') {
        typeTag = '<span class="chatlog-type-tag voice"><i class="fas fa-microphone"></i> 语音</span>';
        const voiceWaveHtml = '<span class="voice-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>';
        contentHtml = '<div class="chatlog-voice-badge">' + voiceWaveHtml + '<span class="voice-text">' + esc(m.voiceText && m.voiceText !== '[语音消息]' ? m.voiceText : '语音消息（未转文字）') + '</span></div>';
      } else if (m.messageType === 'reply') {
        typeTag = '<span class="chatlog-type-tag reply"><i class="fas fa-reply"></i> 回复</span>';
        if (m.replyId) {
          contentHtml = '<div class="chatlog-reply-preview" data-reply-idx="' + idx + '" onclick="scrollToReplyMsg(\'' + esc(m.replyId) + '\')">'
            + '<div class="chatlog-reply-preview-label"><i class="fas fa-quote-left"></i> 引用消息 #' + esc(m.replyId.substring(0, 10)) + '</div>'
            + '<div class="chatlog-reply-preview-content">匹配中...</div>'
            + '</div>' + contentHtml;
        }
      } else if (m.messageType === 'forward') {
        typeTag = '<span class="chatlog-type-tag forward"><i class="fas fa-layer-group"></i> 合并转发</span>';
        contentHtml = '';
        const fwdId = m.forwardId || 'unknown';
        extraHtml = '<div class="chatlog-forward-card" id="fwd-' + esc(fwdId.substring(0, 12)) + '" onclick="loadForwardMsg(\'' + esc(fwdId) + '\', this)">'
          + '<div class="chatlog-forward-header"><div class="chatlog-forward-icon"><i class="fas fa-share-alt"></i></div><div class="chatlog-forward-info"><div class="chatlog-forward-title">合并转发消息</div><div class="chatlog-forward-meta">ID: ' + esc(fwdId.substring(0, 18)) + '...</div></div><div class="chatlog-forward-arrow"><i class="fas fa-chevron-right"></i></div></div>'
          + '<div class="chatlog-forward-body"><div class="chatlog-forward-body-content" id="fwd-content-' + esc(fwdId.substring(0, 12)) + '">点击卡片加载转发内容...</div><div class="chatlog-forward-hint">点击卡片可展开/收起详情</div></div>'
          + '</div>';
      } else if (m.messageType === 'mixed') {
        typeTag = '<span class="chatlog-type-tag mixed"><i class="fas fa-layer-group"></i> 混合</span>';
        if (m.replyId) {
          contentHtml = '<div class="chatlog-reply-preview" data-reply-idx="' + idx + '" onclick="scrollToReplyMsg(\'' + esc(m.replyId) + '\')">'
            + '<div class="chatlog-reply-preview-label"><i class="fas fa-quote-left"></i> 引用消息 #' + esc(m.replyId.substring(0, 10)) + '</div>'
            + '<div class="chatlog-reply-preview-content">匹配中...</div>'
            + '</div>' + contentHtml;
        }
        if (m.imageUrl) {
          const proxiedMixedImgUrl = viewer.proxyImage(m.imageUrl);
          extraHtml = '<div class="chatlog-image-wrap"><img class="chatlog-image" src="' + esc(proxiedMixedImgUrl) + '" data-proxy-src="' + esc(proxiedMixedImgUrl) + '" data-direct-src="' + esc(m.imageUrl) + '" onclick="openChatLogLightbox(\'' + esc(m.imageUrl).replace(/'/g, "\\'") + '\')" loading="lazy" onerror="if(!this.dataset.directTried){this.dataset.directTried=\'1\';this.src=this.dataset.directSrc;return;} this.parentElement.innerHTML=\'<span style=&quot;color:var(--text-muted);font-size:12px;&quot;>图片加载失败</span>\'"></div>';
        }
      }

      html += '<div class="chatlog-item' + (isBot ? ' is-bot' : '') + '">'
        + '<div class="chatlog-avatar" style="' + avatarColor + '">' + esc(avatarChar) + '</div>'
        + '<div class="chatlog-content"><div class="chatlog-meta"><span class="chatlog-nickname">' + esc(displayName) + '</span>'
        + (m.userId && m.userId !== 'bot' ? '<span class="chatlog-qq">' + esc(m.userId) + '</span>' : '')
        + '<span class="chatlog-group">群 ' + esc(m.groupId) + '</span><span class="chatlog-time-label">' + timeStr + '</span></div>'
        + '<div class="chatlog-bubble">' + typeTag + contentHtml + extraHtml + '</div></div></div>';
    });
    html += '</div></div>';
    container.innerHTML = html;
    viewer.fixReplyContents(display, filtered);
  }

  return {
    chatLogState,
    loadChatLogs,
    renderChatLogs,
  };
}
