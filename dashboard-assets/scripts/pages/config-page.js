export function createConfigPageController(options) {
  const {
    state,
    dashboardApi,
    renderVoiceBackends,
    renderVoiceModels,
    updateAstrbotComplexTaskStatus,
    loadVoicePanel,
    startVoiceTrainingTaskPolling,
    stopVoiceTrainingTaskPolling,
    formatVoiceRouteMap,
    toast,
  } = options;

  const CONFIG_FIELD_META = {
    WS_URL: 'OneBot WebSocket 地址，通常填写 NapCat / go-cqhttp 提供的 ws 接口地址。',
    ACCESS_TOKEN: 'OneBot 鉴权 token。若上游未开启鉴权可留空，需与机器人侧配置保持一致。',
    AI_API_KEY: '大模型接口密钥。出于安全考虑，页面重新加载后不会回显，需要时可直接重新填写。',
    AI_BASE_URL: 'OpenAI 兼容接口基础地址，例如 DeepSeek、OpenRouter 或自建网关地址。',
    AI_MODEL: '默认对话模型名称，决定回复质量、速度和成本。',
    BOT_QQ: '机器人自己的 QQ 号，用于识别 @、过滤自发消息和部分插件逻辑。',
    BOT_NICKNAME: '机器人在群内显示或识别用昵称，可为空。',
    AT_TRIGGER: '开启后只响应 @ 机器人的消息；关闭后也可结合其他策略主动参与对话。',
    GROUP_WHITELIST: '允许机器人响应的群号列表，逗号分隔；留空表示不限制群范围。',
    MAX_HISTORY: '单个会话保留的上下文条数。越大越连贯，但也更占 token 和内存。',
    TTS_ENABLED: '是否启用“先发文字、再追加语音”的播报链路。',
    TTS_VOICE: 'Edge TTS 等无模型后端使用的默认音色名；本地角色模型通常可忽略此项。',
    TTS_SPEED: '基础语速，推荐 0.95~1.08。系统会再按句型做轻微自适应，不建议填太大。',
    TTS_REPLY_MODE: '控制语音追加的触发范围：仅在被 @ 时追加语音，或所有机器人回复都追加语音。',
    TTS_PROVIDER: 'TTS 服务提供方。当前本项目推荐使用 local-http 连接本地 voice-service。',
    TTS_SERVICE_URL: '本地语音服务地址，默认是 voice-service 的 8765 端口。',
    TTS_BACKEND: '语音后端类型。角色播报建议 gpt-sovits，系统兜底可用 edge-tts。',
    TTS_MODEL: '默认角色模型 ID，例如 preset-yongchutafi。需与模型目录中的 id 一致。',
    TTS_MODEL_DIR: '角色模型目录，通常保持 ./data/voice-models 即可。',
    TTS_STYLE: '播报风格标签。当前主要用于节奏策略与兼容后端，建议 natural、lively、sweet。',
    TTS_SANITIZE_WHITELIST: '需要在播报前强制保留的字符，如 ～、啊、呀 等口癖符号。',
    TTS_SANITIZE_BLACKLIST: '需要在播报前强制移除的字符，适合处理总会读坏的特殊符号。',
    TTS_PREVIEW_TEXT: '点击“生成试听”时使用的默认测试文本，建议填日常常说的话。',
    TTS_TIMEOUT_MS: '单次本地合成超时毫秒数。模型较慢或长文本较多时可适当调高。',
    TTS_FALLBACK_TO_BAIDU: '本地合成失败时是否自动回退到旧百度 TTS，保证至少有声音输出。',
    STT_ENABLED: '是否启用语音识别，把收到的语音消息转成文字再参与对话。',
    STT_MODEL: '语音识别模型名，默认是 SenseVoiceSmall，中文识别效果较稳。',
    SCHEDULE_GROUPS: '定时问候/运势等任务投放的群号列表，逗号分隔；留空可按项目逻辑处理活跃群。',
    ASTRBOT_QQ: '需要转发或联动的 AstrBot 目标 QQ 号，不用该功能可留空。',
    ASTRBOT_ENABLED_COMPLEX_TASKS: '开启后，仅在复杂任务场景自动委托 AstrBot；日常聊天和语音链路仍由 QQTalker 主导。',
    ASTRBOT_COMPLEX_TASK_KEYWORDS: '复杂任务关键词，逗号分隔。命中后会优先考虑委托 AstrBot。',
    ASTRBOT_COMPLEX_TASK_GROUP_ALLOWLIST: '允许自动委托复杂任务的群号列表。留空表示所有群都可命中自动委托规则。',
    ASTRBOT_COMPLEX_TASK_GROUP_DENYLIST: '明确禁止自动委托复杂任务的群号列表。命中后即使在 allowlist 中也不会自动委托。',
    ASTRBOT_COMPLEX_TASK_GROUP_ROUTE_OVERRIDES: '按群指定更细粒度路由策略，格式如 123456:local-only,234567:force-delegate。',
    ASTRBOT_COMPLEX_TASK_MIN_LENGTH: '复杂任务最小文本长度阈值。第一版会和关键词、结构词一起参与判定。',
    ASTRBOT_COMPLEX_TASK_MESSAGE_MAX_CHARS: '转发给 AstrBot 的 complex-task 最大消息长度。超出后会自动裁剪上下文和正文，避免 AstrBot 把整段内容当搜索词。',
    ASTRBOT_TIMEOUT_MS: '等待 AstrBot 私聊链路返回的超时时间，超时后可按配置回退到本地处理。',
    ASTRBOT_FALLBACK_TO_LOCAL: '当 AstrBot 转发失败或超时时，是否由 QQTalker 自动接管当前请求。',
    SELF_LEARNING_ENABLED: '是否启用自学习插件，开启后会记录和分析互动数据。',
    SELF_LEARNING_DATA_DIR: '自学习数据目录，包含数据库和分析中间结果。',
    SELF_LEARNING_TARGETS: '允许参与学习的对象列表，可填 QQ 号或 group_群号，逗号分隔。',
    SELF_LEARNING_BLACKLIST: '明确排除的对象列表，命中后不会进入学习样本。',
    SELF_LEARNING_INTERVAL_HOURS: '自动学习与聚合的周期小时数，越短越实时但负载更高。',
    SELF_LEARNING_MIN_MESSAGES: '触发一次学习前，单个对象至少需要累计的消息条数。',
    SELF_LEARNING_MAX_BATCH: '每轮学习最多处理的消息数，避免单次任务过重。',
    SELF_LEARNING_DB_TYPE: '自学习数据库类型，默认 sqlite；切到 mysql/postgres 时需同时配置连接串。',
    SELF_LEARNING_DB_FILE: 'sqlite 模式下的数据库文件路径。',
    SELF_LEARNING_MYSQL_URL: 'MySQL 连接串，仅在 SELF_LEARNING_DB_TYPE=mysql 时使用。',
    SELF_LEARNING_POSTGRES_URL: 'PostgreSQL 连接串，仅在 SELF_LEARNING_DB_TYPE=postgres 时使用。',
    SELF_LEARNING_ENABLE_ML: '是否启用轻量聚类、风格归纳和场景分析。',
    SELF_LEARNING_MAX_ML_SAMPLE: '每轮机器学习分析抽样上限，过大时耗时会明显增加。',
    SELF_LEARNING_TOTAL_AFFECTION_CAP: '所有用户累计好感度总上限，用于限制整体数值膨胀。',
    SELF_LEARNING_MAX_USER_AFFECTION: '单个用户可达到的最大好感度上限。',
  };

  const CONFIG_SECTION_META = {
    access: {
      title: '接入与身份',
      desc: '集中管理 QQ 接入、接口地址和机器人基础行为。适合首次部署、迁移环境或排查连接问题时查看。'
    },
    persona: {
      title: '人格',
      desc: '维护 QQTalker 的基础人格档案，并按群切换。自学习增强层会叠加在基础人格之上，不直接覆盖这里的设定。'
    },
    voice: {
      title: '语音链路',
      desc: '配置本地语音服务、角色模型、试听和识别能力。与 GPT-SoVITS、voice-service 的联调主要在这里完成。'
    },
    automation: {
      title: '自动化与联动',
      desc: '包含定时任务和 AstrBot 联动等扩展能力，适合在基础对话稳定后按需启用。'
    },
    learning: {
      title: '自学习',
      desc: '聚合自学习样本、周期和数据库配置。建议在明确数据边界和隐私策略后再逐步开启。'
    }
  };

  let activeConfigSection = 'access';
  let selectedPersonaId = '';

  function getSelectedBindingGroupId() {
    return (document.getElementById('personaBindGroupId').value || '').trim();
  }

  function getActiveSection() {
    return activeConfigSection;
  }

  function applyConfigFieldMeta() {
    document.querySelectorAll('#configEditor .config-label').forEach(function(label) {
      const key = (label.textContent || '').trim();
      const helpText = CONFIG_FIELD_META[key];
      if (!helpText) return;
      label.title = helpText;
    });
  }

  function setConfigSection(section) {
    const nextSection = CONFIG_SECTION_META[section] ? section : 'access';
    activeConfigSection = nextSection;
    document.querySelectorAll('.config-tab').forEach(function(button) {
      button.classList.toggle('active', button.dataset.configSection === nextSection);
    });
    document.querySelectorAll('#configEditor .config-group[data-config-section]').forEach(function(group) {
      group.classList.toggle('section-hidden', group.dataset.configSection !== nextSection);
    });
    const meta = CONFIG_SECTION_META[nextSection];
    const titleEl = document.getElementById('configHeroTitle');
    const descEl = document.getElementById('configHeroDesc');
    if (titleEl) titleEl.textContent = meta.title;
    if (descEl) descEl.textContent = meta.desc;
    if (nextSection === 'voice') {
      loadVoicePanel();
      startVoiceTrainingTaskPolling();
    } else if (nextSection === 'persona') {
      stopVoiceTrainingTaskPolling();
      loadPersonas(selectedPersonaId);
    } else {
      stopVoiceTrainingTaskPolling();
    }
  }

  function splitLines(value) {
    return String(value || '')
      .split(/\r?\n/)
      .map(function(item) { return item.trim(); })
      .filter(Boolean);
  }

  function joinLines(value) {
    return Array.isArray(value) ? value.join('\n') : '';
  }

  function formatTimeLabel(value) {
    if (!value) return '暂无';
    try {
      return new Date(value).toLocaleString('zh-CN', { hour12: false });
    } catch (err) {
      return '暂无';
    }
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function quoteJsArg(value) {
    return JSON.stringify(String(value == null ? '' : value)).replace(/"/g, '&quot;');
  }

  function renderPill(text, tone) {
    var bg = 'rgba(255,255,255,0.08)';
    var color = 'var(--text-secondary)';
    var border = 'rgba(255,255,255,0.08)';
    if (tone === 'success') {
      bg = 'var(--success-soft)';
      color = 'var(--success)';
      border = 'rgba(81, 207, 102, 0.18)';
    } else if (tone === 'warning') {
      bg = 'rgba(255, 212, 59, 0.14)';
      color = 'var(--warning)';
      border = 'rgba(255, 212, 59, 0.22)';
    } else if (tone === 'danger') {
      bg = 'var(--danger-soft)';
      color = 'var(--danger)';
      border = 'rgba(255, 107, 107, 0.22)';
    } else if (tone === 'accent') {
      bg = 'rgba(116, 192, 252, 0.14)';
      color = 'var(--accent)';
      border = 'rgba(116, 192, 252, 0.22)';
    }
    return '<span class="voice-status-pill" style="background:' + bg + ';color:' + color + ';border:1px solid ' + border + ';">' + escapeHtml(text) + '</span>';
  }

  function updatePersonaSummary(personaState) {
    const statusEl = document.getElementById('personaSummaryStatus');
    const metaEl = document.getElementById('personaSummaryMeta');
    if (!statusEl || !metaEl) return;
    const profileCount = (personaState && personaState.profiles ? personaState.profiles.length : 0);
    const bindingCount = Object.keys((personaState && personaState.groupBindings) || {}).length;
    statusEl.textContent = '人格状态：已加载 ' + profileCount + ' 个基础人格';
    metaEl.textContent = '默认人格：' + ((personaState && personaState.defaultPersonaId) || '未设置') + '，当前群绑定：' + bindingCount + ' 个。切换群人格后，自学习增强层会按当前基础人格重新匹配。';
  }

  function renderPersonaUsage(personaState) {
    const panel = document.getElementById('personaUsagePanel');
    if (!panel) return;
    const profiles = (personaState && personaState.profiles) || [];
    const usage = (personaState && personaState.usage) || {};
    if (!profiles.length) {
      panel.innerHTML = '<div class="voice-model-panel-title">人格使用情况</div><div class="voice-muted">当前还没有人格配置。</div>';
      return;
    }
    panel.innerHTML = '<div class="voice-model-panel-title">人格使用情况</div>' +
      profiles.map(function(profile) {
        var badge = profile.id === personaState.defaultPersonaId ? '<span class="voice-status-pill" style="margin-left:8px;">默认</span>' : '';
        return '<div class="voice-model-item">' +
          '<div class="voice-model-item-head"><strong>' + profile.name + '</strong>' + badge + '</div>' +
          '<div class="voice-muted">ID: ' + profile.id + ' | 绑定群数: ' + (usage[profile.id] || 0) + ' | ' + (profile.enabled ? '启用中' : '已停用') + '</div>' +
          '<div class="voice-muted" style="margin-top:4px;">' + (profile.summary || '暂无摘要') + '</div>' +
        '</div>';
      }).join('');
  }

  function renderPersonaBindings(personaState) {
    const panel = document.getElementById('personaBindingsPanel');
    if (!panel) return;
    const bindings = (personaState && personaState.groupBindings) || {};
    const profiles = ((personaState && personaState.profiles) || []).reduce(function(acc, item) {
      acc[item.id] = item;
      return acc;
    }, {});
    var rows = Object.entries(bindings);
    if (!rows.length) {
      panel.innerHTML = '<div class="voice-model-panel-title">当前群绑定</div><div class="voice-muted">暂无群绑定，未绑定的群会回退到默认人格。</div>';
      return;
    }
    panel.innerHTML = '<div class="voice-model-panel-title">当前群绑定</div>' +
      rows.map(function(entry) {
        var groupId = entry[0];
        var personaId = entry[1];
        var profile = profiles[personaId];
        var isFocusedGroup = String((state.navigationFocus && state.navigationFocus.personaGroupId) || '') === String(groupId);
        return '<div class="voice-model-item">' +
          '<div class="voice-model-item-head"><strong>群 ' + groupId + '</strong>' + (isFocusedGroup ? renderPill('当前定位群', 'accent') : '') + '</div>' +
          '<div class="voice-muted">基础人格：' + (profile ? profile.name : personaId) + ' (' + personaId + ')</div>' +
        '</div>';
      }).join('');
  }

  function renderPersonaBindingStatus(result, reviews) {
    const panel = document.getElementById('personaBindingStatusPanel');
    if (!panel) return;
    const persona = result && result.persona ? result.persona : null;
    if (!persona) {
      panel.innerHTML = '<div class="voice-model-panel-title">当前群人格运行态</div><div class="voice-muted">选择有效群号后，会在这里显示当前基础人格、自学习增强层和待审批建议状态。</div>';
      return;
    }
    var currentBasePersonaId = persona.basePersonaId || '';
    var focus = state.navigationFocus || {};
    var isFocusedGroup = String(focus.personaGroupId || '') === String(persona.groupId || '');
    var currentReviews = (reviews || []).filter(function(item) { return item.basePersonaId === currentBasePersonaId; });
    var pendingCurrent = currentReviews.filter(function(item) { return item.status === 'pending'; });
    var approvedCurrent = currentReviews.filter(function(item) { return item.status === 'approved'; });
    var staleHistory = (reviews || []).filter(function(item) { return item.basePersonaId !== currentBasePersonaId; });
    var latestPending = pendingCurrent[0] || null;
    var latestApproved = approvedCurrent[0] || null;
    var overlayStatus = persona.overlayStatus === 'active'
      ? renderPill('增强层：已生效', 'success')
      : persona.overlayStatus === 'stale'
        ? renderPill('增强层：已过期', 'danger')
        : renderPill('增强层：未生效', 'warning');
    var overlayMeta = persona.overlay
      ? '当前增强层：' + (persona.overlay.personaName || '已批准建议') + '，绑定基础人格 ' + currentBasePersonaId
      : '当前没有生效中的学习增强层，回复将仅使用基础人格和实时学习信号。';
    var overlayTime = persona.overlay && persona.overlay.createdAt
      ? '最近生效时间：' + formatTimeLabel(persona.overlay.createdAt)
      : latestApproved
        ? '最近批准时间：' + formatTimeLabel(latestApproved.approvedAt || latestApproved.createdAt)
        : '最近生效时间：暂无';
    var pendingTime = latestPending
      ? '最新待审批：' + formatTimeLabel(latestPending.createdAt)
      : '最新待审批：暂无';
    panel.innerHTML =
      '<div class="voice-model-panel-title">当前群人格运行态</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
        (isFocusedGroup ? renderPill('当前定位群：' + persona.groupId, 'accent') : '') +
        renderPill('基础人格：' + (persona.profile && persona.profile.name ? persona.profile.name : currentBasePersonaId), 'accent') +
        overlayStatus +
        renderPill('待审批建议：' + pendingCurrent.length, pendingCurrent.length ? 'warning' : 'success') +
        renderPill('历史旧人格建议：' + staleHistory.length, staleHistory.length ? 'danger' : 'accent') +
      '</div>' +
      '<div class="voice-muted" style="margin-bottom:8px;">' + overlayMeta + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:10px;">' +
        '<div class="voice-model-item" style="margin:0;"><div class="voice-muted">增强层时间轴</div><div style="margin-top:6px;color:var(--text-primary);">' + overlayTime + '</div></div>' +
        '<div class="voice-model-item" style="margin:0;"><div class="voice-muted">审批队列</div><div style="margin-top:6px;color:var(--text-primary);">' + pendingTime + '</div></div>' +
      '</div>' +
      '<div class="voice-muted" style="margin-bottom:8px;">已审批并匹配当前人格的建议：' + approvedCurrent.length + ' 条；切换基础人格后，旧人格下的建议不会直接生效。</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
        '<button class="analyzer-btn" style="padding:6px 12px;border-radius:8px;" onclick="openSelfLearningForGroup(' + Number(persona.groupId || 0) + ', ' + (latestPending ? Number(latestPending.id || 0) : (persona.overlay && persona.overlay.reviewId != null ? Number(persona.overlay.reviewId) : 'null')) + ', ' + quoteJsArg(currentBasePersonaId) + ')">去自学习页查看建议</button>' +
      '</div>' +
      (
        currentReviews.length
          ? currentReviews.slice(0, 5).map(function(item) {
              var itemTone = item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning';
              var isFocusedReview = Number(focus.personaReviewId || 0) > 0 && Number(item.id || 0) === Number(focus.personaReviewId || 0);
              return '<div class="voice-model-item">' +
                '<div class="voice-model-item-head"><strong>' + (item.personaName || ('review-' + item.id)) + '</strong></div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
                  renderPill('状态：' + item.status, itemTone) +
                  renderPill('基础人格：' + item.basePersonaId, 'accent') +
                  (isFocusedReview ? renderPill('当前定位 review', 'accent') : '') +
                '</div>' +
                '<div class="voice-muted" style="margin-top:6px;">生成时间：' + formatTimeLabel(item.createdAt) + (item.approvedAt ? ' | 批准时间：' + formatTimeLabel(item.approvedAt) : '') + '</div>' +
                '<div class="voice-muted" style="margin-top:4px;">' + (item.summary || '无摘要') + '</div>' +
              '</div>';
            }).join('')
          : '<div class="voice-muted">当前基础人格下还没有学习建议记录。</div>'
      );
  }

  async function refreshPersonaBindingStatus() {
    var groupId = getSelectedBindingGroupId();
    if (!groupId) {
      renderPersonaBindingStatus(null, []);
      return;
    }
    const resolved = await dashboardApi.resolvePersona(groupId);
    const reviewRes = await dashboardApi.getSelfLearningReviews(groupId);
    renderPersonaBindingStatus(resolved, reviewRes && reviewRes.items ? reviewRes.items : []);
  }

  function fillPersonaSelects(personaState) {
    const profiles = (personaState && personaState.profiles) || [];
    const select = document.getElementById('personaSelect');
    const bindSelect = document.getElementById('personaBindSelect');
    var options = profiles.map(function(profile) {
      return '<option value="' + profile.id + '">' + profile.name + ' (' + profile.id + ')</option>';
    }).join('');
    if (select) {
      select.innerHTML = options || '<option value="">暂无人格</option>';
      select.onchange = function() {
        selectPersona(select.value);
      };
    }
    if (bindSelect) {
      bindSelect.innerHTML = options || '<option value="">暂无人格</option>';
    }
  }

  function fillPersonaForm(profile, personaState) {
    const idEl = document.getElementById('personaIdInput');
    const nameEl = document.getElementById('personaNameInput');
    const enabledEl = document.getElementById('personaEnabledToggle');
    const summaryEl = document.getElementById('personaSummaryInput');
    const ttsEl = document.getElementById('personaTtsCharacterInput');
    const rulesEl = document.getElementById('personaReplyRulesInput');
    const catchEl = document.getElementById('personaCatchphrasesInput');
    const systemEl = document.getElementById('personaSystemPromptInput');
    const relayEl = document.getElementById('personaRelayPromptInput');
    if (!idEl || !nameEl || !enabledEl || !summaryEl || !ttsEl || !rulesEl || !catchEl || !systemEl || !relayEl) return;
    if (!profile) {
      idEl.value = '';
      idEl.readOnly = false;
      nameEl.value = '';
      enabledEl.className = 'config-toggle on';
      summaryEl.value = '';
      ttsEl.value = '';
      rulesEl.value = '';
      catchEl.value = '';
      systemEl.value = '';
      relayEl.value = '';
      return;
    }
    selectedPersonaId = profile.id;
    if (document.getElementById('personaSelect')) {
      document.getElementById('personaSelect').value = profile.id;
    }
    if (document.getElementById('personaBindSelect')) {
      document.getElementById('personaBindSelect').value = profile.id;
    }
    idEl.value = profile.id;
    idEl.readOnly = !!(personaState && personaState.profiles && personaState.profiles.some(function(item) { return item.id === profile.id; }));
    nameEl.value = profile.name || '';
    enabledEl.className = 'config-toggle' + (profile.enabled ? ' on' : '');
    summaryEl.value = profile.summary || '';
    ttsEl.value = profile.ttsCharacter || '';
    rulesEl.value = joinLines(profile.replyRules);
    catchEl.value = joinLines(profile.catchphrases);
    systemEl.value = profile.systemPrompt || '';
    relayEl.value = profile.relayPrompt || '';
  }

  function prepareNewPersona() {
    selectedPersonaId = '';
    fillPersonaForm(null, null);
    toast('已切换到新建人格表单', 'info');
  }

  function selectPersona(personaId) {
    const personaState = state.personas || {};
    const profiles = personaState.profiles || [];
    const profile = profiles.find(function(item) { return item.id === personaId; }) || null;
    if (!profile) {
      prepareNewPersona();
      return;
    }
    fillPersonaForm(profile, personaState);
  }

  function collectPersonaForm() {
    return {
      id: (document.getElementById('personaIdInput').value || '').trim(),
      name: (document.getElementById('personaNameInput').value || '').trim(),
      enabled: document.getElementById('personaEnabledToggle').classList.contains('on'),
      summary: (document.getElementById('personaSummaryInput').value || '').trim(),
      ttsCharacter: (document.getElementById('personaTtsCharacterInput').value || '').trim(),
      replyRules: splitLines(document.getElementById('personaReplyRulesInput').value),
      catchphrases: splitLines(document.getElementById('personaCatchphrasesInput').value),
      systemPrompt: (document.getElementById('personaSystemPromptInput').value || '').trim(),
      relayPrompt: (document.getElementById('personaRelayPromptInput').value || '').trim(),
    };
  }

  async function loadPersonas(preferredPersonaId) {
    const personaState = await dashboardApi.getPersonas();
    state.personas = personaState || { profiles: [], groupBindings: {}, usage: {}, defaultPersonaId: '' };
    fillPersonaSelects(state.personas);
    renderPersonaUsage(state.personas);
    renderPersonaBindings(state.personas);
    updatePersonaSummary(state.personas);
    var nextPersonaId = preferredPersonaId || selectedPersonaId || state.personas.defaultPersonaId || ((state.personas.profiles || [])[0] || {}).id || '';
    if (nextPersonaId) {
      selectPersona(nextPersonaId);
    } else {
      prepareNewPersona();
    }
    await refreshPersonaBindingStatus();
  }

  async function savePersonaProfile() {
    const payload = collectPersonaForm();
    if (!payload.name || !payload.systemPrompt) {
      toast('人格名称和基础提示词不能为空', 'error');
      return;
    }
    const exists = ((state.personas && state.personas.profiles) || []).some(function(item) {
      return item.id === payload.id;
    });
    const result = exists
      ? await dashboardApi.updatePersonaProfile(payload)
      : await dashboardApi.createPersonaProfile(payload);
    if (!result || result.error) {
      toast((result && result.error) || '保存人格失败', 'error');
      return;
    }
    state.personas = result.state || state.personas;
    await loadPersonas((result.profile && result.profile.id) || payload.id);
    toast('人格已保存', 'success');
  }

  async function setDefaultPersonaProfile() {
    const personaId = (document.getElementById('personaIdInput').value || '').trim();
    if (!personaId) {
      toast('请先选择一个人格', 'error');
      return;
    }
    const result = await dashboardApi.setDefaultPersona(personaId);
    if (!result || result.error) {
      toast((result && result.error) || '设置默认人格失败', 'error');
      return;
    }
    state.personas = result.state || state.personas;
    await loadPersonas(personaId);
    toast('默认人格已更新', 'success');
  }

  async function deletePersonaProfile() {
    const personaId = (document.getElementById('personaIdInput').value || '').trim();
    if (!personaId) {
      toast('请先选择一个人格', 'error');
      return;
    }
    if (!window.confirm('确认删除人格 ' + personaId + ' 吗？')) return;
    const result = await dashboardApi.deletePersonaProfile(personaId);
    if (!result || result.error) {
      toast((result && result.error) || '删除人格失败', 'error');
      return;
    }
    state.personas = result.state || state.personas;
    await loadPersonas();
    toast('人格已删除', 'success');
  }

  async function bindGroupPersona() {
    const groupId = (document.getElementById('personaBindGroupId').value || '').trim();
    const personaId = (document.getElementById('personaBindSelect').value || '').trim();
    if (!groupId || !personaId) {
      toast('请先选择群号和人格', 'error');
      return;
    }
    const result = await dashboardApi.bindGroupPersona(groupId, personaId);
    if (!result || result.error) {
      toast((result && result.error) || '群人格绑定失败', 'error');
      return;
    }
    state.personas = result.state || state.personas;
    renderPersonaBindings(state.personas);
    renderPersonaUsage(state.personas);
    updatePersonaSummary(state.personas);
    await refreshPersonaBindingStatus();
    toast('群人格绑定已生效', 'success');
  }

  async function unbindGroupPersona() {
    const groupId = (document.getElementById('personaBindGroupId').value || '').trim();
    if (!groupId) {
      toast('请先输入群号', 'error');
      return;
    }
    const result = await dashboardApi.unbindGroupPersona(groupId);
    if (!result || result.error) {
      toast((result && result.error) || '解除群人格绑定失败', 'error');
      return;
    }
    state.personas = result.state || state.personas;
    renderPersonaBindings(state.personas);
    renderPersonaUsage(state.personas);
    updatePersonaSummary(state.personas);
    await refreshPersonaBindingStatus();
    toast('群人格绑定已解除', 'success');
  }

  async function loadConfig() {
    applyConfigFieldMeta();
    const cfg = await dashboardApi.getConfig();
    const status = await dashboardApi.getStatus();
    if (!cfg || (cfg.botQq === undefined && cfg.botQq !== '')) return;
    state.config = cfg;
    const map = {
      wsUrl: 'cfg-wsUrl', aiApiKey: 'cfg-aiApiKey', aiBaseUrl: 'cfg-aiBaseUrl',
      aiModel: 'cfg-aiModel', botQq: 'cfg-botQq', botNickname: 'cfg-botNickname',
      groupWhitelist: 'cfg-groupWhitelist', maxHistory: 'cfg-maxHistory',
      ttsProvider: 'cfg-ttsProvider', ttsServiceUrl: 'cfg-ttsServiceUrl',
      ttsBackend: 'cfg-ttsBackend', ttsModel: 'cfg-ttsModel', ttsModelDir: 'cfg-ttsModelDir',
      ttsVoice: 'cfg-ttsVoice', ttsSpeed: 'cfg-ttsSpeed', ttsReplyMode: 'cfg-ttsReplyMode', ttsStyle: 'cfg-ttsStyle',
      ttsSanitizeWhitelist: 'cfg-ttsSanitizeWhitelist', ttsSanitizeBlacklist: 'cfg-ttsSanitizeBlacklist',
      ttsPreviewText: 'cfg-ttsPreviewText', ttsTimeoutMs: 'cfg-ttsTimeoutMs',
      ttsRuntimePolicy: 'cfg-ttsRuntimePolicy', ttsFallbackChain: 'cfg-ttsFallbackChain',
      ttsLongTextPreferredBackend: 'cfg-ttsLongTextPreferredBackend', ttsLongTextThreshold: 'cfg-ttsLongTextThreshold',
      ttsRvcShortTextMaxLength: 'cfg-ttsRvcShortTextMaxLength', ttsDefaultCharacter: 'cfg-ttsDefaultCharacter',
      sttModel: 'cfg-sttModel',
      scheduleGroups: 'cfg-scheduleGroups', astrbotQq: 'cfg-astrbotQq',
      astrbotComplexTaskKeywords: 'cfg-astrbotComplexTaskKeywords',
      astrbotComplexTaskGroupAllowlist: 'cfg-astrbotComplexTaskGroupAllowlist',
      astrbotComplexTaskGroupDenylist: 'cfg-astrbotComplexTaskGroupDenylist',
      astrbotComplexTaskGroupRouteOverrides: 'cfg-astrbotComplexTaskGroupRouteOverrides',
      astrbotComplexTaskMinLength: 'cfg-astrbotComplexTaskMinLength',
      astrbotComplexTaskMessageMaxChars: 'cfg-astrbotComplexTaskMessageMaxChars',
      astrbotTimeoutMs: 'cfg-astrbotTimeoutMs',
      selfLearningDataDir: 'cfg-selfLearningDataDir',
      selfLearningTargets: 'cfg-selfLearningTargets',
      selfLearningBlacklist: 'cfg-selfLearningBlacklist',
      selfLearningIntervalHours: 'cfg-selfLearningIntervalHours',
      selfLearningMinMessages: 'cfg-selfLearningMinMessages',
      selfLearningMaxBatch: 'cfg-selfLearningMaxBatch',
      selfLearningDbType: 'cfg-selfLearningDbType',
      selfLearningDbFile: 'cfg-selfLearningDbFile',
      selfLearningMysqlUrl: 'cfg-selfLearningMysqlUrl',
      selfLearningPostgresUrl: 'cfg-selfLearningPostgresUrl',
      selfLearningMaxMlSample: 'cfg-selfLearningMaxMlSample',
      selfLearningTotalAffectionCap: 'cfg-selfLearningTotalAffectionCap',
      selfLearningMaxUserAffection: 'cfg-selfLearningMaxUserAffection',
    };
    for (const entry of Object.entries(map)) {
      const k = entry[0];
      const id = entry[1];
      const el = document.getElementById(id);
      if (el && cfg[k] !== undefined) {
        el.value = Array.isArray(cfg[k]) ? cfg[k].join(',') : formatVoiceRouteMap(cfg[k]);
      }
    }
    const atEl = document.getElementById('cfg-atTrigger');
    if (atEl) atEl.className = 'config-toggle' + (cfg.atTrigger ? ' on' : '');
    const ttsEl = document.getElementById('cfg-ttsEnabled');
    if (ttsEl) ttsEl.className = 'config-toggle' + (cfg.ttsEnabled ? ' on' : '');
    const ttsFallbackEl = document.getElementById('cfg-ttsFallbackToBaidu');
    if (ttsFallbackEl) ttsFallbackEl.className = 'config-toggle' + (cfg.ttsFallbackToBaidu ? ' on' : '');
    const ttsExperimentalRvcEl = document.getElementById('cfg-ttsExperimentalRvcEnabled');
    if (ttsExperimentalRvcEl) ttsExperimentalRvcEl.className = 'config-toggle' + (cfg.ttsExperimentalRvcEnabled ? ' on' : '');
    const sttEl = document.getElementById('cfg-sttEnabled');
    if (sttEl) sttEl.className = 'config-toggle' + (cfg.sttEnabled ? ' on' : '');
    const slEl = document.getElementById('cfg-selfLearningEnabled');
    if (slEl) slEl.className = 'config-toggle' + (cfg.selfLearningEnabled ? ' on' : '');
    const slMlEl = document.getElementById('cfg-selfLearningEnableMl');
    if (slMlEl) slMlEl.className = 'config-toggle' + (cfg.selfLearningEnableMl ? ' on' : '');
    const astrbotComplexEl = document.getElementById('cfg-astrbotEnabledComplexTasks');
    if (astrbotComplexEl) astrbotComplexEl.className = 'config-toggle' + (cfg.astrbotEnabledComplexTasks ? ' on' : '');
    const astrbotFallbackEl = document.getElementById('cfg-astrbotFallbackToLocal');
    if (astrbotFallbackEl) astrbotFallbackEl.className = 'config-toggle' + (cfg.astrbotFallbackToLocal ? ' on' : '');
    renderVoiceBackends(state.voice.backends || []);
    renderVoiceModels(state.voice.models || []);
    updateAstrbotComplexTaskStatus(status && status.astrbot ? status.astrbot : null);
    await loadPersonas(selectedPersonaId);
    toast('配置已加载', 'success');
  }

  function bindTabs() {
    document.querySelectorAll('.config-tab').forEach(function(button) {
      button.addEventListener('click', function() {
        setConfigSection(button.dataset.configSection);
      });
    });
    var groupInput = document.getElementById('personaBindGroupId');
    if (groupInput) {
      groupInput.addEventListener('change', refreshPersonaBindingStatus);
      groupInput.addEventListener('blur', refreshPersonaBindingStatus);
    }
  }

  async function saveConfig() {
    const data = {};
    const fields = {
      WS_URL: 'cfg-wsUrl', ACCESS_TOKEN: 'cfg-accessToken',
      AI_API_KEY: 'cfg-aiApiKey', AI_BASE_URL: 'cfg-aiBaseUrl', AI_MODEL: 'cfg-aiModel',
      BOT_QQ: 'cfg-botQq', BOT_NICKNAME: 'cfg-botNickname',
      GROUP_WHITELIST: 'cfg-groupWhitelist', MAX_HISTORY: 'cfg-maxHistory',
      TTS_PROVIDER: 'cfg-ttsProvider', TTS_SERVICE_URL: 'cfg-ttsServiceUrl',
      TTS_BACKEND: 'cfg-ttsBackend', TTS_MODEL: 'cfg-ttsModel', TTS_MODEL_DIR: 'cfg-ttsModelDir',
      TTS_VOICE: 'cfg-ttsVoice', TTS_SPEED: 'cfg-ttsSpeed', TTS_REPLY_MODE: 'cfg-ttsReplyMode', TTS_STYLE: 'cfg-ttsStyle',
      TTS_SANITIZE_WHITELIST: 'cfg-ttsSanitizeWhitelist', TTS_SANITIZE_BLACKLIST: 'cfg-ttsSanitizeBlacklist',
      TTS_PREVIEW_TEXT: 'cfg-ttsPreviewText', TTS_TIMEOUT_MS: 'cfg-ttsTimeoutMs',
      TTS_RUNTIME_POLICY: 'cfg-ttsRuntimePolicy', TTS_FALLBACK_CHAIN: 'cfg-ttsFallbackChain',
      TTS_LONG_TEXT_PREFERRED_BACKEND: 'cfg-ttsLongTextPreferredBackend', TTS_LONG_TEXT_THRESHOLD: 'cfg-ttsLongTextThreshold',
      TTS_RVC_SHORT_TEXT_MAX_LENGTH: 'cfg-ttsRvcShortTextMaxLength', TTS_DEFAULT_CHARACTER: 'cfg-ttsDefaultCharacter',
      TTS_CHARACTER_MODEL_MAP: 'cfg-ttsCharacterModelMap', TTS_GROUP_VOICE_ROLE_MAP: 'cfg-ttsGroupVoiceRoleMap',
      STT_MODEL: 'cfg-sttModel',
      SCHEDULE_GROUPS: 'cfg-scheduleGroups', ASTRBOT_QQ: 'cfg-astrbotQq',
      ASTRBOT_COMPLEX_TASK_KEYWORDS: 'cfg-astrbotComplexTaskKeywords',
      ASTRBOT_COMPLEX_TASK_GROUP_ALLOWLIST: 'cfg-astrbotComplexTaskGroupAllowlist',
      ASTRBOT_COMPLEX_TASK_GROUP_DENYLIST: 'cfg-astrbotComplexTaskGroupDenylist',
      ASTRBOT_COMPLEX_TASK_GROUP_ROUTE_OVERRIDES: 'cfg-astrbotComplexTaskGroupRouteOverrides',
      ASTRBOT_COMPLEX_TASK_MIN_LENGTH: 'cfg-astrbotComplexTaskMinLength',
      ASTRBOT_COMPLEX_TASK_MESSAGE_MAX_CHARS: 'cfg-astrbotComplexTaskMessageMaxChars',
      ASTRBOT_TIMEOUT_MS: 'cfg-astrbotTimeoutMs',
      SELF_LEARNING_DATA_DIR: 'cfg-selfLearningDataDir',
      SELF_LEARNING_TARGETS: 'cfg-selfLearningTargets',
      SELF_LEARNING_BLACKLIST: 'cfg-selfLearningBlacklist',
      SELF_LEARNING_INTERVAL_HOURS: 'cfg-selfLearningIntervalHours',
      SELF_LEARNING_MIN_MESSAGES: 'cfg-selfLearningMinMessages',
      SELF_LEARNING_MAX_BATCH: 'cfg-selfLearningMaxBatch',
      SELF_LEARNING_DB_TYPE: 'cfg-selfLearningDbType',
      SELF_LEARNING_DB_FILE: 'cfg-selfLearningDbFile',
      SELF_LEARNING_MYSQL_URL: 'cfg-selfLearningMysqlUrl',
      SELF_LEARNING_POSTGRES_URL: 'cfg-selfLearningPostgresUrl',
      SELF_LEARNING_MAX_ML_SAMPLE: 'cfg-selfLearningMaxMlSample',
      SELF_LEARNING_TOTAL_AFFECTION_CAP: 'cfg-selfLearningTotalAffectionCap',
      SELF_LEARNING_MAX_USER_AFFECTION: 'cfg-selfLearningMaxUserAffection',
    };
    for (const entry of Object.entries(fields)) {
      const envKey = entry[0];
      const id = entry[1];
      const el = document.getElementById(id);
      if (el && el.value.trim()) data[envKey] = el.value.trim();
    }
    data.TTS_SANITIZE_WHITELIST = (document.getElementById('cfg-ttsSanitizeWhitelist').value || '').trim();
    data.TTS_SANITIZE_BLACKLIST = (document.getElementById('cfg-ttsSanitizeBlacklist').value || '').trim();
    data.AT_TRIGGER = document.getElementById('cfg-atTrigger').classList.contains('on') ? 'true' : 'false';
    data.TTS_ENABLED = document.getElementById('cfg-ttsEnabled').classList.contains('on') ? 'true' : 'false';
    data.TTS_FALLBACK_TO_BAIDU = document.getElementById('cfg-ttsFallbackToBaidu').classList.contains('on') ? 'true' : 'false';
    data.TTS_EXPERIMENTAL_RVC_ENABLED = document.getElementById('cfg-ttsExperimentalRvcEnabled').classList.contains('on') ? 'true' : 'false';
    data.STT_ENABLED = document.getElementById('cfg-sttEnabled').classList.contains('on') ? 'true' : 'false';
    data.ASTRBOT_ENABLED_COMPLEX_TASKS = document.getElementById('cfg-astrbotEnabledComplexTasks').classList.contains('on') ? 'true' : 'false';
    data.ASTRBOT_FALLBACK_TO_LOCAL = document.getElementById('cfg-astrbotFallbackToLocal').classList.contains('on') ? 'true' : 'false';
    data.SELF_LEARNING_ENABLED = document.getElementById('cfg-selfLearningEnabled').classList.contains('on') ? 'true' : 'false';
    data.SELF_LEARNING_ENABLE_ML = document.getElementById('cfg-selfLearningEnableMl').classList.contains('on') ? 'true' : 'false';

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      toast('配置已保存到 .env（需重启生效）', 'success');
    } else {
      toast('保存配置失败', 'error');
    }
  }

  return {
    applyConfigFieldMeta,
    setConfigSection,
    loadConfig,
    loadPersonas,
    prepareNewPersona,
    savePersonaProfile,
    setDefaultPersonaProfile,
    deletePersonaProfile,
    bindGroupPersona,
    unbindGroupPersona,
    refreshPersonaBindingStatus,
    saveConfig,
    bindTabs,
    getActiveSection,
  };
}
