function esc(value) {
  const el = document.createElement('div');
  el.textContent = value == null ? '' : String(value);
  return el.innerHTML;
}

function formatValue(field, value) {
  if (field.type === 'boolean') return value ? 'true' : 'false';
  if (field.type === 'array') return Array.isArray(value) ? value.join('\n') : '';
  if (field.type === 'map') return value && typeof value === 'object'
    ? Object.entries(value).map(function(entry) { return entry[0] + '=' + entry[1]; }).join('\n')
    : '';
  return value == null ? '' : String(value);
}

function parseFieldValue(field, rawValue) {
  if (field.type === 'boolean') return rawValue === 'true';
  if (field.type === 'number') return rawValue === '' ? null : Number(rawValue);
  if (field.type === 'array') {
    return String(rawValue || '')
      .split(/\r?\n/)
      .map(function(item) { return item.trim(); })
      .filter(Boolean);
  }
  if (field.type === 'map') {
    return String(rawValue || '')
      .split(/\r?\n/)
      .map(function(item) { return item.trim(); })
      .filter(Boolean)
      .reduce(function(acc, line) {
        var index = line.indexOf('=');
        if (index <= 0) return acc;
        acc[line.slice(0, index).trim()] = line.slice(index + 1).trim();
        return acc;
      }, {});
  }
  return rawValue;
}

function fileToBase64(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() {
      var result = String(reader.result || '');
      var commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function createPluginCenterPageController(options) {
  var state = options.state;
  var dashboardApi = options.dashboardApi;
  var toast = options.toast;

  function isMemeBridgePlugin(detail) {
    return Boolean(
      detail
      && detail.manifest
      && detail.manifest.adapter
      && detail.manifest.adapter.type === 'astrbot-bridge'
      && detail.manifest.adapter.target === 'meme_manager'
    );
  }

  function getSelectedPlugin() {
    return (state.plugins.items || []).find(function(item) { return item.id === state.plugins.selectedId; }) || null;
  }

  async function hydratePluginSelection(pluginId) {
    if (!pluginId) return null;
    var detailRes = await dashboardApi.getPluginStatus(pluginId);
    var schemaRes = await dashboardApi.getPluginConfigSchema(pluginId);
    var configRes = await dashboardApi.getPluginConfig(pluginId);
    var logsRes = await dashboardApi.getPluginLogs(pluginId);
    state.plugins.selectedDetail = detailRes && detailRes.detail ? detailRes.detail : null;
    state.plugins.selectedSchema = schemaRes && schemaRes.schema ? schemaRes.schema : null;
    state.plugins.selectedConfig = configRes && configRes.config ? configRes.config : {};
    state.plugins.selectedLogs = logsRes && logsRes.logs ? logsRes.logs : [];
    state.plugins.selectedBridgeOverview = null;
    state.plugins.selectedBridgeCategories = [];
    return state.plugins.selectedDetail;
  }

  async function loadPlugins(selectId) {
    var response = await dashboardApi.getPlugins();
    state.plugins.items = response && response.plugins ? response.plugins : [];
    state.plugins.pages = response && response.pages ? response.pages : [];
    if (selectId) {
      state.plugins.selectedId = selectId;
    } else if (!state.plugins.selectedId && state.plugins.items.length > 0) {
      state.plugins.selectedId = state.plugins.items[0].id;
    } else if (state.plugins.items.every(function(item) { return item.id !== state.plugins.selectedId; })) {
      state.plugins.selectedId = state.plugins.items.length ? state.plugins.items[0].id : '';
    }
    renderPluginList();
    if (state.plugins.selectedId) {
      await selectPlugin(state.plugins.selectedId);
    } else {
      renderPluginDetail();
    }
  }

  async function selectPlugin(pluginId) {
    state.plugins.selectedId = pluginId;
    renderPluginList();
    if (!pluginId) {
      renderPluginDetail();
      return;
    }
    await hydratePluginSelection(pluginId);
    renderPluginDetail();
  }

  function renderPluginList() {
    var container = document.getElementById('pluginList');
    if (!container) return;
    if (!state.plugins.items.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">+</div><div class="empty-text">还没有已注册插件</div></div>';
      var emptyBadge = document.getElementById('pluginCountBadge');
      if (emptyBadge) emptyBadge.textContent = '0';
      return;
    }
    var badge = document.getElementById('pluginCountBadge');
    if (badge) badge.textContent = String(state.plugins.items.length);
    container.className = 'plugin-list';
    container.innerHTML = state.plugins.items.map(function(item) {
      var active = item.id === state.plugins.selectedId ? ' active' : '';
      return '<button class="plugin-list-button' + active + '" data-plugin-item="' + esc(item.id) + '">'
        + '<div class="plugin-list-head">'
        + '<div><div class="plugin-list-name">' + esc(item.name) + '</div><div class="plugin-list-meta">'
        + esc(item.id) + ' · ' + esc(item.sourceType) + ' · v' + esc(item.version)
        + '</div></div>'
        + '<span class="voice-status-pill">' + esc(item.status) + '</span>'
        + '</div>'
        + (item.description ? '<div class="plugin-list-desc">' + esc(item.description) + '</div>' : '')
        + '<div class="plugin-list-badges">'
        + '<span class="plugin-chip">' + esc(item.sourceType) + '</span>'
        + '<span class="plugin-chip">' + (item.configurable ? '可配置' : '无配置') + '</span>'
        + '<span class="plugin-chip">' + (item.dashboardPages || 0) + ' 页面</span>'
        + '</div>'
        + '</button>';
    }).join('');
    container.querySelectorAll('[data-plugin-item]').forEach(function(button) {
      button.addEventListener('click', function() {
        selectPlugin(button.dataset.pluginItem);
      });
    });
  }

  function renderSchemaForm() {
    var schema = state.plugins.selectedSchema;
    var config = state.plugins.selectedConfig || {};
    var container = document.getElementById('pluginConfigForm');
    if (!container) return;
    if (!schema || !schema.fields || !schema.fields.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">i</div><div class="empty-text">当前插件没有声明可编辑配置</div></div>';
      return;
    }
    container.innerHTML = schema.fields.map(function(field) {
      var inputId = 'plugin-config-' + field.key;
      var type = field.secret ? 'password' : 'text';
      var value = formatValue(field, config[field.key] !== undefined ? config[field.key] : field.defaultValue);
      var control = '';
      if (field.type === 'boolean') {
        control = '<select id="' + esc(inputId) + '" class="config-input plugin-field-control" data-plugin-config-field="' + esc(field.key) + '"><option value="true"' + (value === 'true' ? ' selected' : '') + '>true</option><option value="false"' + (value === 'false' ? ' selected' : '') + '>false</option></select>';
      } else if (field.type === 'textarea' || field.type === 'array' || field.type === 'map') {
        control = '<textarea id="' + esc(inputId) + '" class="config-input plugin-field-control" data-plugin-config-field="' + esc(field.key) + '" rows="4" placeholder="' + esc(field.placeholder || '') + '">' + esc(value) + '</textarea>';
      } else if (field.type === 'enum' && field.enumOptions && field.enumOptions.length) {
        control = '<select id="' + esc(inputId) + '" class="config-input plugin-field-control" data-plugin-config-field="' + esc(field.key) + '">'
          + field.enumOptions.map(function(option) {
            return '<option value="' + esc(option.value) + '"' + (String(value) === String(option.value) ? ' selected' : '') + '>' + esc(option.label) + '</option>';
          }).join('')
          + '</select>';
      } else {
        control = '<input id="' + esc(inputId) + '" class="config-input plugin-field-control" data-plugin-config-field="' + esc(field.key) + '" type="' + esc(type) + '" value="' + esc(value) + '" placeholder="' + esc(field.placeholder || '') + '">';
      }
      return '<div class="config-group">'
        + '<div class="config-label">' + esc(field.title) + '</div>'
        + (field.description ? '<div class="plugin-form-help">' + esc(field.description) + '</div>' : '')
        + control
        + '</div>';
    }).join('');
  }

  function renderPluginDetail() {
    var container = document.getElementById('pluginDetail');
    if (!container) return;
    var plugin = getSelectedPlugin();
    var detail = state.plugins.selectedDetail;
    if (!plugin || !detail) {
      container.innerHTML = '<div class="card full-card"><div class="card-body" style="padding:60px 20px;"><div class="empty-state"><div class="empty-icon">Q</div><div class="empty-text">选择左侧插件查看详情</div></div></div></div>';
      return;
    }
    var pages = detail.pages && detail.pages.pages ? detail.pages.pages : [];
    container.innerHTML = '<div class="plugin-detail-stack">'
      + '<div class="card full-card"><div class="card-header-bar"><span class="card-title">插件详情</span></div><div class="card-body">'
      + '<div class="plugin-detail-header">'
      + '<div><div class="plugin-detail-title">' + esc(plugin.name) + '</div><div class="plugin-detail-meta">'
      + esc(plugin.id) + ' · ' + esc(plugin.sourceType) + ' · v' + esc(plugin.version)
      + '</div></div>'
      + '<div class="plugin-detail-actions">'
      + '<button class="save-config-btn" id="pluginEnableBtn">' + (plugin.enabled ? '停用' : '启用') + '</button>'
      + '<button class="save-config-btn" id="pluginUpdateBtn">更新</button>'
      + '<button class="save-config-btn" id="pluginUninstallBtn" style="background:var(--danger-soft);color:var(--danger);">卸载</button>'
      + '</div></div>'
      + (plugin.description ? '<p class="plugin-detail-description">' + esc(plugin.description) + '</p>' : '')
      + '<div class="plugin-detail-grid">'
      + '<div class="config-group plugin-stat-card"><div class="config-label">运行状态</div><div class="plugin-stat-value">' + esc(detail.health && detail.health.status ? detail.health.status : plugin.status) + '</div></div>'
      + '<div class="config-group plugin-stat-card"><div class="config-label">权限</div><div class="plugin-stat-value">' + esc(String(((detail.manifest && detail.manifest.permissions) || []).length || 0)) + '</div><div class="plugin-muted-note">' + esc(((detail.manifest && detail.manifest.permissions) || []).join(', ') || '无') + '</div></div>'
      + '<div class="config-group plugin-stat-card"><div class="config-label">能力</div><div class="plugin-stat-value">' + esc(String(((detail.manifest && detail.manifest.capabilities) || []).length || 0)) + '</div><div class="plugin-muted-note">' + esc(((detail.manifest && detail.manifest.capabilities) || []).join(', ') || '无') + '</div></div>'
      + '<div class="config-group plugin-stat-card"><div class="config-label">Dashboard 页面</div><div class="plugin-stat-value">' + esc(String(pages.length)) + '</div></div>'
      + '</div>'
      + '</div></div>'
      + '<div class="card full-card" style="margin-top:18px;"><div class="card-header-bar"><span class="card-title">插件配置</span><button class="save-config-btn" id="pluginSaveConfigBtn">保存插件配置</button></div><div class="card-body"><div id="pluginConfigForm"></div></div></div>'
      + '<div class="card full-card" style="margin-top:18px;"><div class="card-header-bar"><span class="card-title">插件日志</span></div><div class="card-body"><div id="pluginLogList" class="plugin-log-list"></div></div></div>'
      + '<div class="card full-card" style="margin-top:18px;"><div class="card-header-bar"><span class="card-title">插件页面</span></div><div class="card-body"><div id="pluginPageList" class="plugin-page-list">' + (pages.length ? pages.map(function(page) {
        return '<button type="button" class="plugin-page-link" data-plugin-page-id="' + esc(page.id || '') + '" data-plugin-page-route="' + esc(page.routePath || '') + '"><div class="plugin-page-link-head"><div class="config-label">' + esc(page.title) + '</div><span class="plugin-chip">点击进入</span></div><div class="plugin-form-help">' + esc(page.routePath || '') + '</div>' + (page.description ? '<div class="plugin-page-link-desc">' + esc(page.description) + '</div>' : '') + '</button>';
      }).join('') : '<div class="empty-state"><div class="empty-icon">-</div><div class="empty-text">当前插件没有注册 Dashboard 页面</div></div>') + '</div></div></div>'
      + '</div>';
    renderSchemaForm();
    renderPluginLogs();
    bindDetailActions(plugin);
    bindPluginPageActions();
  }

  function jumpToPluginPage(pageId, routePath) {
    var normalizedRoute = String(routePath || '').trim();
    if (!normalizedRoute) {
      toast('当前插件没有可进入的页面路由', 'error');
      return;
    }
    window.location.href = normalizedRoute;
  }

  function bindPluginPageActions() {
    document.querySelectorAll('[data-plugin-page-route]').forEach(function(button) {
      button.addEventListener('click', function() {
        jumpToPluginPage(button.dataset.pluginPageId, button.dataset.pluginPageRoute);
      });
    });
  }

  function parsePluginPagePath(pathname) {
    var match = String(pathname || '').match(/^\/plugins\/([^/]+)\/page\/([^/]+)$/);
    if (!match) return null;
    return {
      pluginId: decodeURIComponent(match[1]),
      pageId: decodeURIComponent(match[2]),
      routePath: String(pathname || ''),
    };
  }

  function renderStandalonePluginPage(pageId, routePath) {
    var container = document.getElementById('pluginStandaloneView');
    if (!container) return;
    var detail = state.plugins.selectedDetail;
    var plugin = getSelectedPlugin();
    var pages = detail && detail.pages && detail.pages.pages ? detail.pages.pages : [];
    var page = pages.find(function(item) {
      return item.id === pageId || item.routePath === routePath;
    }) || {
      id: pageId,
      title: pageId,
      routePath: routePath,
      description: '',
    };
    var titleEl = document.getElementById('pageTitle');
    var breadcrumbEl = document.getElementById('pageBreadcrumb');
    if (titleEl) titleEl.textContent = page.title || '插件页面';
    if (breadcrumbEl) breadcrumbEl.textContent = '控制台 / 插件 / ' + (plugin && plugin.name ? plugin.name : '插件页面');
    if (isMemeBridgePlugin(detail) && (pageId === 'meme-library' || /\/meme-library$/.test(routePath))) {
      container.innerHTML = '<div class="plugin-standalone-shell">'
        + '<div class="plugin-standalone-head"><div><div class="plugin-hero-title">' + esc(page.title || '表情桥接资源') + '</div><div class="plugin-hero-desc">' + esc(page.description || '管理该插件桥接后的表情分类、图片资源与默认资源恢复。') + '</div></div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="save-config-btn secondary" id="pluginStandaloneBackBtn">返回插件中心</button></div></div>'
        + '<div class="card full-card"><div class="card-body"><div id="memeBridgePanel"></div></div></div>'
        + '</div>';
      renderMemeBridgePanel();
      var backBtn = document.getElementById('pluginStandaloneBackBtn');
      if (backBtn) {
        backBtn.addEventListener('click', function() {
          window.location.href = '/#plugins';
        });
      }
      return;
    }
    container.innerHTML = '<div class="plugin-standalone-shell">'
      + '<div class="plugin-standalone-head"><div><div class="plugin-hero-title">' + esc(page.title || '插件页面') + '</div><div class="plugin-hero-desc">' + esc(page.description || '该插件已声明独立页面入口。') + '</div></div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="save-config-btn secondary" id="pluginStandaloneBackBtn">返回插件中心</button></div></div>'
      + '<div class="card full-card"><div class="card-body"><div class="empty-state"><div class="empty-icon">i</div><div class="empty-text">该插件页面已跳转到独立路由，但当前插件尚未接入专属前端内容。</div><div class="plugin-form-help" style="margin-top:10px;">' + esc(page.routePath || routePath || '') + '</div></div></div></div>'
      + '</div>';
    var fallbackBackBtn = document.getElementById('pluginStandaloneBackBtn');
    if (fallbackBackBtn) {
      fallbackBackBtn.addEventListener('click', function() {
        window.location.href = '/#plugins';
      });
    }
  }

  async function openPluginPageByPath(pathname) {
    var parsed = parsePluginPagePath(pathname);
    if (!parsed) return false;
    await loadPlugins(parsed.pluginId);
    state.plugins.selectedId = parsed.pluginId;
    await hydratePluginSelection(parsed.pluginId);
    if (isMemeBridgePlugin(state.plugins.selectedDetail)) {
      var overviewRes = await dashboardApi.getMemeBridgeOverview(parsed.pluginId);
      var categoriesRes = await dashboardApi.getMemeBridgeCategories(parsed.pluginId);
      state.plugins.selectedBridgeOverview = overviewRes && overviewRes.success ? overviewRes : null;
      state.plugins.selectedBridgeCategories = categoriesRes && categoriesRes.items ? categoriesRes.items : [];
    }
    renderStandalonePluginPage(parsed.pageId, parsed.routePath);
    return true;
  }

  function renderMemeBridgePanel() {
    var container = document.getElementById('memeBridgePanel');
    if (!container) return;
    if (!isMemeBridgePlugin(state.plugins.selectedDetail)) {
      container.innerHTML = '';
      return;
    }
    var overview = state.plugins.selectedBridgeOverview;
    var categories = state.plugins.selectedBridgeCategories || [];
    if (!overview) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">!</div><div class="empty-text">正在加载桥接资源...</div></div>';
      return;
    }
    container.innerHTML = '<div class="plugin-library-toolbar">'
      + '<div class="plugin-library-meta">'
      + '<span class="plugin-chip">分类 ' + esc(String(categories.length)) + '</span>'
      + '<span class="plugin-chip">运行目录 ' + esc(overview.runtimeDir || '-') + '</span>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><button class="save-config-btn secondary" id="memeBridgeRefreshBtn">刷新分类</button><button class="save-config-btn" id="memeBridgeRestoreBtn">恢复全部默认资源</button></div>'
      + '</div>'
      + '<div class="config-group" style="margin-bottom:16px;">'
      + '<div class="plugin-install-label">新增分类</div>'
      + '<div class="plugin-install-grid" style="grid-template-columns:minmax(180px,220px) 1fr 120px;">'
      + '<input id="memeBridgeNewCategory" class="config-input" type="text" placeholder="例如 happy-extra">'
      + '<input id="memeBridgeNewCategoryDesc" class="config-input" type="text" placeholder="填写该分类在提示词中的使用说明">'
      + '<button class="save-config-btn" id="memeBridgeCreateCategoryBtn">新增分类</button>'
      + '</div>'
      + '<div class="plugin-muted-note" style="margin-top:12px;">这里管理的是 QQTalker 已桥接的表情资源，不依赖原始 AstrBot WebUI。可直接在这里维护分类说明、图片资源和默认补齐。</div>'
      + '</div>'
      + (categories.length ? '<div class="plugin-library-toolbar">'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
        + '<label class="plugin-chip" style="cursor:pointer;"><input type="checkbox" id="memeBridgeSelectAll" style="margin-right:6px;accent-color:var(--accent);">全选分类</label>'
        + '<label class="plugin-chip" style="cursor:pointer;"><input type="checkbox" id="memeBridgeSelectAllFiles" style="margin-right:6px;accent-color:var(--accent);">全选图片</label>'
        + '</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
        + '<button class="save-config-btn secondary" id="memeBridgeBatchRestoreBtn">批量恢复默认资源</button>'
        + '<button class="save-config-btn secondary" id="memeBridgeBatchDeleteFilesBtn" style="background:var(--danger-soft);color:var(--danger);">批量删除图片</button>'
        + '<button class="save-config-btn secondary" id="memeBridgeBatchDeleteCategoriesBtn" style="background:var(--danger-soft);color:var(--danger);">批量删除分类</button>'
        + '</div>'
        + '</div>' : '')
      + (categories.length ? '<div class="plugin-library-grid">' + categories.map(function(item, index) {
        return '<div class="plugin-meme-card">'
          + '<div class="plugin-meme-preview">' + (item.previewUrl ? '<img src="' + esc(item.previewUrl) + '" alt="' + esc(item.category) + '">' : '<div class="plugin-meme-empty">暂无预览图</div>') + '</div>'
          + '<div class="plugin-meme-body">'
          + '<div class="plugin-meme-head"><div style="display:flex;gap:10px;align-items:flex-start;"><label class="plugin-chip" style="cursor:pointer;margin-top:2px;"><input type="checkbox" data-meme-category-check="' + esc(item.category) + '" style="margin-right:6px;accent-color:var(--accent);">选择</label><div class="plugin-meme-title">' + esc(item.category) + '</div></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><button class="save-config-btn secondary" data-meme-category-move="up" data-meme-category-order="' + esc(item.category) + '"' + (index === 0 ? ' disabled' : '') + '>上移</button><button class="save-config-btn secondary" data-meme-category-move="down" data-meme-category-order="' + esc(item.category) + '"' + (index === categories.length - 1 ? ' disabled' : '') + '>下移</button><div class="plugin-meme-count">' + esc(String(item.count || 0)) + ' 张</div></div></div>'
          + '<textarea class="config-input plugin-field-control" rows="4" data-meme-category-desc="' + esc(item.category) + '" placeholder="填写该分类在提示词中的使用说明">' + esc(item.description || '') + '</textarea>'
          + '<div class="plugin-meme-actions"><div class="plugin-muted-note">' + (item.previewFile ? ('预览: ' + esc(item.previewFile)) : '该分类暂无图片资源') + '</div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="save-config-btn secondary" data-meme-category-save="' + esc(item.category) + '">保存描述</button><button class="save-config-btn secondary" data-meme-category-restore="' + esc(item.category) + '">恢复默认</button><button class="save-config-btn secondary" data-meme-category-delete="' + esc(item.category) + '" style="background:var(--danger-soft);color:var(--danger);">删除分类</button></div></div>'
          + '<div class="config-group" style="padding:14px 16px;"><div class="plugin-install-label">上传图片</div><div class="plugin-dropzone" data-meme-dropzone="' + esc(item.category) + '">拖拽图片到这里，或点击下方选择文件上传</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;"><input class="config-input" type="file" accept=".png,.jpg,.jpeg,.gif,.webp" multiple data-meme-category-upload="' + esc(item.category) + '"><button class="save-config-btn" data-meme-category-upload-btn="' + esc(item.category) + '">上传图片</button></div></div>'
          + '<div class="plugin-page-list">' + ((item.files || []).length ? item.files.map(function(file) {
            return '<div class="config-group" style="padding:12px 14px;"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;"><div style="display:flex;gap:10px;align-items:flex-start;min-width:0;flex:1;"><label class="plugin-chip" style="cursor:pointer;margin-top:10px;"><input type="checkbox" data-meme-file-check-category="' + esc(item.category) + '" data-meme-file-check-name="' + esc(file.name) + '" style="margin-right:6px;accent-color:var(--accent);">选择</label><img src="' + esc(file.url) + '" alt="' + esc(file.name) + '" style="width:44px;height:44px;border-radius:10px;object-fit:cover;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);"><div style="min-width:0;flex:1;"><div class="config-label" style="min-width:0;">' + esc(file.name) + '</div><div class="plugin-form-help">' + esc(file.url) + '</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;"><input class="config-input" type="text" value="' + esc(file.name) + '" data-meme-file-rename="' + esc(item.category) + '" data-meme-file-rename-source="' + esc(file.name) + '" placeholder="新的文件名"><button class="save-config-btn secondary" data-meme-file-rename-btn="' + esc(item.category) + '" data-meme-file-rename-source="' + esc(file.name) + '">重命名</button></div></div></div><button class="save-config-btn secondary" data-meme-file-delete="' + esc(item.category) + '" data-meme-file-name="' + esc(file.name) + '" style="background:var(--danger-soft);color:var(--danger);">删除图片</button></div></div>';
          }).join('') : '<div class="plugin-muted-note">当前分类还没有图片资源。</div>') + '</div>'
          + '</div></div>';
      }).join('') + '</div>' : '<div class="empty-state"><div class="empty-icon">Q</div><div class="empty-text">当前桥接目录还没有可用表情分类</div></div>');
    bindMemeBridgeActions();
  }

  function renderPluginLogs() {
    var container = document.getElementById('pluginLogList');
    if (!container) return;
    if (!state.plugins.selectedLogs.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">!</div><div class="empty-text">当前没有插件日志</div></div>';
      return;
    }
    container.innerHTML = state.plugins.selectedLogs.map(function(item) {
      return '<div class="plugin-log-entry">'
        + '<div class="plugin-log-head"><strong>' + esc(item.level || 'info') + '</strong><span class="plugin-log-time">' + esc(item.timestamp || '') + '</span></div>'
        + '<div class="plugin-log-message">' + esc(item.message || '') + '</div></div>';
    }).join('');
  }

  function collectConfigFormValues() {
    var schema = state.plugins.selectedSchema;
    var next = {};
    if (!schema || !schema.fields) return next;
    schema.fields.forEach(function(field) {
      var el = document.querySelector('[data-plugin-config-field="' + field.key + '"]');
      if (!el) return;
      next[field.key] = parseFieldValue(field, el.value);
    });
    return next;
  }

  async function savePluginConfig() {
    if (!state.plugins.selectedId) return;
    var result = await dashboardApi.updatePluginConfig(state.plugins.selectedId, collectConfigFormValues());
    if (result && result.success) {
      toast('插件配置已保存', 'success');
      await selectPlugin(state.plugins.selectedId);
    } else {
      toast('保存插件配置失败', 'error');
    }
  }

  async function togglePlugin(plugin) {
    var result = plugin.enabled
      ? await dashboardApi.disablePlugin(plugin.id)
      : await dashboardApi.enablePlugin(plugin.id);
    if (result && result.success) {
      toast(plugin.enabled ? '插件已停用' : '插件已启用', 'success');
      await loadPlugins(plugin.id);
    } else {
      toast((result && result.error) || '操作失败', 'error');
    }
  }

  async function updatePlugin(plugin) {
    var result = await dashboardApi.updatePlugin(plugin.id);
    if (result && result.success) {
      toast('插件已更新', 'success');
      await loadPlugins(plugin.id);
    } else {
      toast((result && result.error) || '更新失败，请检查插件来源是否仍可访问', 'error');
    }
  }

  async function uninstallPlugin(plugin) {
    if (!window.confirm('确定要卸载插件 `' + plugin.name + '` 吗？')) return;
    var result = await dashboardApi.uninstallPlugin(plugin.id);
    if (result && result.success) {
      toast('插件已卸载', 'success');
      state.plugins.selectedId = '';
      await loadPlugins();
    } else {
      toast((result && result.error) || '卸载失败', 'error');
    }
  }

  function bindDetailActions(plugin) {
    var saveBtn = document.getElementById('pluginSaveConfigBtn');
    var enableBtn = document.getElementById('pluginEnableBtn');
    var updateBtn = document.getElementById('pluginUpdateBtn');
    var uninstallBtn = document.getElementById('pluginUninstallBtn');
    if (saveBtn) saveBtn.addEventListener('click', savePluginConfig);
    if (enableBtn) enableBtn.addEventListener('click', function() { togglePlugin(plugin); });
    if (updateBtn) updateBtn.addEventListener('click', function() { updatePlugin(plugin); });
    if (uninstallBtn) uninstallBtn.addEventListener('click', function() { uninstallPlugin(plugin); });
  }

  async function refreshMemeBridgePanel() {
    if (!state.plugins.selectedId) return;
    var overviewRes = await dashboardApi.getMemeBridgeOverview(state.plugins.selectedId);
    var categoriesRes = await dashboardApi.getMemeBridgeCategories(state.plugins.selectedId);
    state.plugins.selectedBridgeOverview = overviewRes && overviewRes.success ? overviewRes : null;
    state.plugins.selectedBridgeCategories = categoriesRes && categoriesRes.items ? categoriesRes.items : [];
    renderMemeBridgePanel();
  }

  async function saveMemeCategory(category) {
    var field = document.querySelector('[data-meme-category-desc="' + category + '"]');
    if (!field || !state.plugins.selectedId) return;
    var result = await dashboardApi.updateMemeBridgeCategory(state.plugins.selectedId, {
      category: category,
      description: field.value || '',
    });
    if (result && result.success) {
      toast('分类描述已保存', 'success');
      await refreshMemeBridgePanel();
    } else {
      toast((result && result.error) || '保存分类描述失败', 'error');
    }
  }

  async function restoreMemeBridgeDefaults() {
    if (!state.plugins.selectedId) return;
    if (!window.confirm('确定要恢复默认表情资源吗？当前已有资源不会被强制覆盖，但会补齐默认目录和描述。')) return;
    var result = await dashboardApi.restoreMemeBridgeDefaults(state.plugins.selectedId);
    if (result && result.success) {
      toast('默认资源已恢复', 'success');
      await refreshMemeBridgePanel();
    } else {
      toast((result && result.error) || '恢复默认资源失败', 'error');
    }
  }

  async function createMemeCategory() {
    if (!state.plugins.selectedId) return;
    var categoryEl = document.getElementById('memeBridgeNewCategory');
    var descEl = document.getElementById('memeBridgeNewCategoryDesc');
    var category = categoryEl ? categoryEl.value.trim() : '';
    var description = descEl ? descEl.value.trim() : '';
    if (!category) {
      toast('请先填写分类名称', 'error');
      return;
    }
    var result = await dashboardApi.updateMemeBridgeCategory(state.plugins.selectedId, {
      category: category,
      description: description,
    });
    if (result && result.success) {
      if (categoryEl) categoryEl.value = '';
      if (descEl) descEl.value = '';
      toast('分类已新增', 'success');
      await refreshMemeBridgePanel();
    } else {
      toast((result && result.error) || '新增分类失败', 'error');
    }
  }

  async function deleteMemeCategory(category) {
    if (!state.plugins.selectedId) return;
    if (!window.confirm('确定要删除分类 `' + category + '` 及其图片资源吗？')) return;
    var result = await dashboardApi.deleteMemeBridgeCategory(state.plugins.selectedId, { category: category });
    if (result && result.success) {
      toast('分类已删除', 'success');
      await refreshMemeBridgePanel();
    } else {
      toast((result && result.error) || '删除分类失败', 'error');
    }
  }

  async function deleteMemeFile(category, fileName) {
    if (!state.plugins.selectedId) return;
    if (!window.confirm('确定要删除图片 `' + fileName + '` 吗？')) return;
    var result = await dashboardApi.deleteMemeBridgeFile(state.plugins.selectedId, {
      category: category,
      file: fileName,
    });
    if (result && result.success) {
      toast('图片已删除', 'success');
      await refreshMemeBridgePanel();
    } else {
      toast((result && result.error) || '删除图片失败', 'error');
    }
  }

  async function uploadMemeFiles(category, fileList) {
    if (!state.plugins.selectedId) return;
    var input = document.querySelector('[data-meme-category-upload="' + category + '"]');
    var files = fileList || (input ? input.files : null);
    if (!files || !files.length) {
      toast('请先选择要上传的图片', 'error');
      return;
    }
    var payloadFiles = [];
    for (var i = 0; i < files.length; i += 1) {
      var file = files[i];
      payloadFiles.push({
        name: file.name,
        contentBase64: await fileToBase64(file),
      });
    }
    var result = await dashboardApi.uploadMemeBridgeFiles(state.plugins.selectedId, {
      category: category,
      files: payloadFiles,
    });
    if (result && result.success) {
      if (input) input.value = '';
      toast('图片上传成功', 'success');
      await refreshMemeBridgePanel();
    } else {
      toast((result && result.error) || '上传图片失败', 'error');
    }
  }

  async function renameMemeFile(category, fileName) {
    if (!state.plugins.selectedId) return;
    var field = document.querySelector('[data-meme-file-rename="' + category + '"][data-meme-file-rename-source="' + fileName + '"]');
    var nextName = field ? field.value.trim() : '';
    if (!nextName) {
      toast('请先填写新的文件名', 'error');
      return;
    }
    var result = await dashboardApi.renameMemeBridgeFile(state.plugins.selectedId, {
      category: category,
      file: fileName,
      nextName: nextName,
    });
    if (result && result.success) {
      toast('图片已重命名', 'success');
      await refreshMemeBridgePanel();
    } else {
      toast((result && result.error) || '重命名失败', 'error');
    }
  }

  async function restoreSelectedMemeCategories(categoryList) {
    if (!state.plugins.selectedId) return;
    if (!categoryList.length) {
      toast('请至少选择一个分类', 'error');
      return;
    }
    var result = await dashboardApi.restoreMemeBridgeCategories(state.plugins.selectedId, {
      categories: categoryList,
    });
    if (result && result.success) {
      toast('已恢复所选分类的默认资源', 'success');
      await refreshMemeBridgePanel();
    } else {
      toast((result && result.error) || '批量恢复失败', 'error');
    }
  }

  function getSelectedMemeCategories() {
    return [].slice.call(document.querySelectorAll('[data-meme-category-check]:checked')).map(function(item) {
      return item.getAttribute('data-meme-category-check');
    }).filter(Boolean);
  }

  function getSelectedMemeFiles() {
    return [].slice.call(document.querySelectorAll('[data-meme-file-check-name]:checked')).map(function(item) {
      return {
        category: item.getAttribute('data-meme-file-check-category'),
        file: item.getAttribute('data-meme-file-check-name'),
      };
    }).filter(function(item) {
      return item.category && item.file;
    });
  }

  async function deleteSelectedMemeCategories() {
    if (!state.plugins.selectedId) return;
    var categories = getSelectedMemeCategories();
    if (!categories.length) {
      toast('请至少选择一个分类', 'error');
      return;
    }
    if (!window.confirm('确定要批量删除选中的分类吗？这会同时删除分类中的图片。')) return;
    var result = await dashboardApi.deleteMemeBridgeCategories(state.plugins.selectedId, { categories: categories });
    if (result && result.success) {
      toast('已批量删除分类', 'success');
      await refreshMemeBridgePanel();
    } else {
      toast((result && result.error) || '批量删除分类失败', 'error');
    }
  }

  async function deleteSelectedMemeFiles() {
    if (!state.plugins.selectedId) return;
    var items = getSelectedMemeFiles();
    if (!items.length) {
      toast('请至少选择一张图片', 'error');
      return;
    }
    if (!window.confirm('确定要批量删除选中的图片吗？')) return;
    var result = await dashboardApi.deleteMemeBridgeFiles(state.plugins.selectedId, { items: items });
    if (result && result.success) {
      toast('已批量删除图片', 'success');
      await refreshMemeBridgePanel();
    } else {
      toast((result && result.error) || '批量删除图片失败', 'error');
    }
  }

  async function moveMemeCategory(category, direction) {
    if (!state.plugins.selectedId) return;
    var categories = (state.plugins.selectedBridgeCategories || []).map(function(item) { return item.category; });
    var index = categories.indexOf(category);
    if (index < 0) return;
    var targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    var next = categories.slice();
    var current = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = current;
    var result = await dashboardApi.reorderMemeBridgeCategories(state.plugins.selectedId, { categories: next });
    if (result && result.success) {
      await refreshMemeBridgePanel();
    } else {
      toast((result && result.error) || '分类排序失败', 'error');
    }
  }

  function bindMemeBridgeActions() {
    var refreshBtn = document.getElementById('memeBridgeRefreshBtn');
    var restoreBtn = document.getElementById('memeBridgeRestoreBtn');
    var createBtn = document.getElementById('memeBridgeCreateCategoryBtn');
    var batchRestoreBtn = document.getElementById('memeBridgeBatchRestoreBtn');
    var batchDeleteFilesBtn = document.getElementById('memeBridgeBatchDeleteFilesBtn');
    var batchDeleteCategoriesBtn = document.getElementById('memeBridgeBatchDeleteCategoriesBtn');
    var selectAll = document.getElementById('memeBridgeSelectAll');
    var selectAllFiles = document.getElementById('memeBridgeSelectAllFiles');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshMemeBridgePanel);
    if (restoreBtn) restoreBtn.addEventListener('click', restoreMemeBridgeDefaults);
    if (createBtn) createBtn.addEventListener('click', createMemeCategory);
    if (batchRestoreBtn) batchRestoreBtn.addEventListener('click', function() { restoreSelectedMemeCategories(getSelectedMemeCategories()); });
    if (batchDeleteFilesBtn) batchDeleteFilesBtn.addEventListener('click', deleteSelectedMemeFiles);
    if (batchDeleteCategoriesBtn) batchDeleteCategoriesBtn.addEventListener('click', deleteSelectedMemeCategories);
    if (selectAll) {
      selectAll.addEventListener('change', function() {
        document.querySelectorAll('[data-meme-category-check]').forEach(function(item) {
          item.checked = Boolean(selectAll.checked);
        });
      });
    }
    if (selectAllFiles) {
      selectAllFiles.addEventListener('change', function() {
        document.querySelectorAll('[data-meme-file-check-name]').forEach(function(item) {
          item.checked = Boolean(selectAllFiles.checked);
        });
      });
    }
    document.querySelectorAll('[data-meme-category-save]').forEach(function(button) {
      button.addEventListener('click', function() {
        saveMemeCategory(button.dataset.memeCategorySave);
      });
    });
    document.querySelectorAll('[data-meme-category-restore]').forEach(function(button) {
      button.addEventListener('click', function() {
        restoreSelectedMemeCategories([button.dataset.memeCategoryRestore]);
      });
    });
    document.querySelectorAll('[data-meme-category-delete]').forEach(function(button) {
      button.addEventListener('click', function() {
        deleteMemeCategory(button.dataset.memeCategoryDelete);
      });
    });
    document.querySelectorAll('[data-meme-category-upload-btn]').forEach(function(button) {
      button.addEventListener('click', function() {
        uploadMemeFiles(button.dataset.memeCategoryUploadBtn);
      });
    });
    document.querySelectorAll('[data-meme-file-rename-btn]').forEach(function(button) {
      button.addEventListener('click', function() {
        renameMemeFile(button.dataset.memeFileRenameBtn, button.dataset.memeFileRenameSource);
      });
    });
    document.querySelectorAll('[data-meme-file-delete]').forEach(function(button) {
      button.addEventListener('click', function() {
        deleteMemeFile(button.dataset.memeFileDelete, button.dataset.memeFileName);
      });
    });
    document.querySelectorAll('[data-meme-category-move]').forEach(function(button) {
      button.addEventListener('click', function() {
        moveMemeCategory(button.dataset.memeCategoryOrder, button.dataset.memeCategoryMove);
      });
    });
    document.querySelectorAll('[data-meme-dropzone]').forEach(function(zone) {
      zone.addEventListener('dragover', function(event) {
        event.preventDefault();
        zone.classList.add('dragover');
      });
      zone.addEventListener('dragleave', function() {
        zone.classList.remove('dragover');
      });
      zone.addEventListener('drop', function(event) {
        event.preventDefault();
        zone.classList.remove('dragover');
        if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
          uploadMemeFiles(zone.dataset.memeDropzone, event.dataTransfer.files);
        }
      });
    });
  }

  async function installPluginFromForm() {
    var sourceEl = document.getElementById('pluginInstallSource');
    var locatorEl = document.getElementById('pluginInstallLocator');
    var refEl = document.getElementById('pluginInstallRef');
    var source = sourceEl ? sourceEl.value : '';
    var locator = locatorEl ? locatorEl.value.trim() : '';
    var ref = refEl ? refEl.value.trim() : '';
    if (!source || !locator) {
      toast('请填写插件来源和定位信息', 'error');
      return;
    }
    var result = await dashboardApi.installPlugin({
      source: source,
      locator: locator,
      ref: ref || undefined,
      enable: true,
    });
    if (result && result.success) {
      toast('插件安装成功', 'success');
      await loadPlugins(result.plugin && result.plugin.id ? result.plugin.id : '');
    } else {
      toast((result && result.error) || '插件安装失败', 'error');
    }
  }

  function bindInstallForm() {
    var button = document.getElementById('pluginInstallBtn');
    if (button) {
      button.addEventListener('click', installPluginFromForm);
    }
  }

  return {
    loadPlugins: loadPlugins,
    selectPlugin: selectPlugin,
    bindInstallForm: bindInstallForm,
    openPluginPageByPath: openPluginPageByPath,
  };
}
