export function createBlocklistPageController(options) {
  const { toast, showToast, blockState } = options;

  function updateBlockStats() {
    document.getElementById('blockStatUsers').textContent = blockState.stats.blockedUserCount;
    document.getElementById('blockStatGroups').textContent = blockState.stats.blockedGroupCount;
    document.getElementById('blockStatInvolved').textContent = blockState.stats.involvedGroupCount;
  }

  function updateBlockBadge() {
    const total = blockState.stats.blockedUserCount + blockState.stats.blockedGroupCount;
    const badge = document.getElementById('blockCount');
    if (total > 0) {
      badge.textContent = total;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  function renderBlockList() {
    const searchTerm = (document.getElementById('blockSearchInput')?.value || '').toLowerCase();
    const filteredUsers = blockState.users.filter(function(u) {
      return !searchTerm
        || String(u.userId).includes(searchTerm)
        || String(u.groupId).includes(searchTerm)
        || (u.nickname || '').toLowerCase().includes(searchTerm);
    });

    const userContainer = document.getElementById('blockUserList');
    if (filteredUsers.length === 0) {
      userContainer.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-muted);"><i class="fas fa-check-circle" style="font-size:24px;margin-bottom:8px;display:block;color:var(--success);"></i><div>' + (searchTerm ? '未找到匹配的屏蔽记录' : '暂无被屏蔽用户') + '</div></div>';
    } else {
      let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:var(--card-header);text-align:left;">'
        + '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">QQ号</th>'
        + '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">昵称</th>'
        + '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">群号</th>'
        + '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">屏蔽时间</th>'
        + '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">原因</th>'
        + '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">操作</th>'
        + '</tr></thead><tbody>';
      filteredUsers.forEach(function(u) {
        const time = u.blockedAt ? new Date(u.blockedAt).toLocaleString('zh-CN') : '-';
        html += '<tr style="border-top:1px solid var(--border-color);">'
          + '<td style="padding:10px 16px;font-family:\'JetBrains Mono\',monospace;color:var(--accent);">' + u.userId + '</td>'
          + '<td style="padding:10px 16px;">' + (u.nickname || '-') + '</td>'
          + '<td style="padding:10px 16px;font-family:\'JetBrains Mono\',monospace;">' + u.groupId + '</td>'
          + '<td style="padding:10px 16px;color:var(--text-muted);font-size:12px;">' + time + '</td>'
          + '<td style="padding:10px 16px;color:var(--text-muted);font-size:12px;">' + (u.reason || '-') + '</td>'
          + '<td style="padding:10px 16px;"><button onclick="unblockUser(' + u.userId + ',' + u.groupId + ')" style="background:var(--success-soft);color:var(--success);border:none;padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">取消屏蔽</button></td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
      userContainer.innerHTML = html;
    }

    const groupContainer = document.getElementById('blockGroupList');
    if (blockState.groups.length === 0) {
      groupContainer.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-muted);"><i class="fas fa-check-circle" style="font-size:24px;margin-bottom:8px;display:block;color:var(--success);"></i><div>暂无被屏蔽群</div></div>';
    } else {
      let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:var(--card-header);text-align:left;">'
        + '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">群号</th>'
        + '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">状态</th>'
        + '<th style="padding:10px 16px;color:var(--text-secondary);font-weight:500;">操作</th>'
        + '</tr></thead><tbody>';
      blockState.groups.forEach(function(g) {
        html += '<tr style="border-top:1px solid var(--border-color);">'
          + '<td style="padding:10px 16px;font-family:\'JetBrains Mono\',monospace;">' + g + '</td>'
          + '<td style="padding:10px 16px;"><span style="background:var(--danger-soft);color:var(--danger);padding:2px 10px;border-radius:12px;font-size:11px;">已屏蔽</span></td>'
          + '<td style="padding:10px 16px;"><button onclick="unblockGroup(' + g + ')" style="background:var(--success-soft);color:var(--success);border:none;padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">取消屏蔽</button></td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
      groupContainer.innerHTML = html;
    }
  }

  async function loadBlockList() {
    try {
      const [userData, groupData] = await Promise.all([
        fetch('/api/block/users').then(function(res) { return res.json(); }),
        fetch('/api/block/groups').then(function(res) { return res.json(); }),
      ]);
      blockState.users = userData.users || [];
      blockState.groups = groupData.groups || [];
      blockState.stats = userData.stats || groupData.stats || { blockedUserCount: 0, blockedGroupCount: 0, involvedGroupCount: 0 };
      renderBlockList();
      updateBlockStats();
      updateBlockBadge();
    } catch (e) {
      console.error('加载屏蔽列表失败:', e);
      showToast('加载屏蔽列表失败: ' + (e.message || '未知错误'), 'error');
    }
  }

  function filterBlockList() {
    renderBlockList();
  }

  async function addBlockUser() {
    const userId = document.getElementById('blockInputUserId').value.trim();
    const groupId = document.getElementById('blockInputGroupId').value.trim();
    const nickname = document.getElementById('blockInputNickname').value.trim();
    const reason = document.getElementById('blockInputReason').value.trim();
    if (!userId || !groupId) { showToast('请输入QQ号和群号', 'error'); return; }
    try {
      const res = await fetch('/api/block/user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, groupId, nickname, reason })
      });
      const data = await res.json();
      if (data.success) { showToast('已屏蔽用户 ' + userId, 'success'); loadBlockList(); }
      else { showToast('屏蔽失败: ' + (data.error || '未知错误'), 'error'); }
    } catch (e) { showToast('屏蔽失败: ' + e.message, 'error'); }
  }

  async function unblockUser(userId, groupId) {
    if (!confirm('确定取消屏蔽用户 ' + userId + ' 吗？')) return;
    try {
      const res = await fetch('/api/block/user/remove', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, groupId })
      });
      const data = await res.json();
      if (data.success) { showToast('已取消屏蔽用户 ' + userId, 'success'); loadBlockList(); }
      else { showToast('取消屏蔽失败', 'error'); }
    } catch (e) { showToast('取消屏蔽失败: ' + e.message, 'error'); }
  }

  async function addBlockGroup() {
    const groupId = document.getElementById('blockInputGroupOnly').value.trim();
    if (!groupId) { showToast('请输入群号', 'error'); return; }
    if (!confirm('确定屏蔽群 ' + groupId + ' 吗？屏蔽后机器人将不再响应此群的任何消息。')) return;
    try {
      const res = await fetch('/api/block/group', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId })
      });
      const data = await res.json();
      if (data.success) { showToast('已屏蔽群 ' + groupId, 'success'); loadBlockList(); }
      else { showToast('屏蔽失败: ' + (data.error || '未知错误'), 'error'); }
    } catch (e) { showToast('屏蔽失败: ' + e.message, 'error'); }
  }

  async function unblockGroup(groupId) {
    if (!confirm('确定取消屏蔽群 ' + groupId + ' 吗？')) return;
    try {
      const res = await fetch('/api/block/group/remove', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId })
      });
      const data = await res.json();
      if (data.success) { showToast('已取消屏蔽群 ' + groupId, 'success'); loadBlockList(); }
      else { showToast('取消屏蔽失败', 'error'); }
    } catch (e) { showToast('取消屏蔽失败: ' + e.message, 'error'); }
  }

  return {
    loadBlockList,
    filterBlockList,
    addBlockUser,
    unblockUser,
    addBlockGroup,
    unblockGroup,
  };
}
