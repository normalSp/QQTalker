export function createGroupPickerController(options) {
  const { api, blockState } = options;
  let cachedGroupList = [];

  async function fetchGroupList(forceRefresh) {
    if (!forceRefresh && cachedGroupList.length > 0) return cachedGroupList;
    const s = await api('/api/status');
    const groups = (s && s.activeGroups) ? s.activeGroups : [];
    cachedGroupList = groups.map(Number);
    return cachedGroupList;
  }

  function selectGroup(inputId, dropdownId, groupId) {
    document.getElementById(inputId).value = groupId;
    document.getElementById(dropdownId).style.display = 'none';
    const dropdown = document.getElementById(dropdownId);
    if (dropdown) {
      const parentCard = dropdown.closest('.card');
      if (parentCard) parentCard.classList.remove('has-group-picker');
    }
  }

  function toggleGroupPicker(inputId, dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    if (dropdown.style.display !== 'none') {
      dropdown.style.display = 'none';
      const parentCard = dropdown.closest('.card');
      if (parentCard) parentCard.classList.remove('has-group-picker');
      return;
    }
    document.querySelectorAll('.group-picker-dropdown').forEach(function(el) {
      if (el.id !== dropdownId) el.style.display = 'none';
    });
    document.querySelectorAll('.card.has-group-picker').forEach(function(el) { el.classList.remove('has-group-picker'); });
    fetchGroupList(true).then(function(groups) {
      if (!groups.length) {
        dropdown.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">暂无群组数据（机器人未连接）</div>';
      } else {
        dropdown.innerHTML = groups.map(function(g) {
          return '<div class="group-picker-item" onclick="selectGroup(\'' + inputId + '\',\'' + dropdownId + '\',' + g + ')">'
            + '<span class="group-id">' + g + '</span>'
            + '<span class="group-label">' + (blockState.groups.includes(g) ? '<span style="color:var(--warning);">已屏蔽</span>' : '已加入') + '</span>'
            + '</div>';
        }).join('');
      }
      dropdown.style.display = 'block';
      const parentCard = dropdown.closest('.card');
      if (parentCard) parentCard.classList.add('has-group-picker');
    });
  }

  function bindOutsideClick() {
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.group-picker-dropdown') && !e.target.closest('[onclick*="toggleGroupPicker"]')) {
        document.querySelectorAll('.group-picker-dropdown').forEach(function(el) {
          if (el.style.display !== 'none') el.style.display = 'none';
        });
        document.querySelectorAll('.card.has-group-picker').forEach(function(el) { el.classList.remove('has-group-picker'); });
      }
    });
  }

  return {
    fetchGroupList,
    selectGroup,
    toggleGroupPicker,
    bindOutsideClick,
  };
}
