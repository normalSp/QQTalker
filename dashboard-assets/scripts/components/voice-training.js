export function createVoiceTrainingController(options) {
  const {
    state,
    api,
    dashboardApi,
    toast,
    esc,
    loadVoicePanel,
    getActiveSection,
    setPoller,
    getPoller,
  } = options;

  function renderVoiceTrainingCharacters(characters) {
    const wrap = document.getElementById('voiceTrainingCharacters');
    if (!wrap) return;
    if (!characters || !characters.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:20px 0;"><div class="empty-text">训练工作区还没有角色目录</div></div>';
      return;
    }
    wrap.innerHTML = characters.map(function(item) {
      const qualityText = '来源 ' + (item.sourceCount || 0) + ' / 版本 ' + (item.versionCount || 0)
        + ' / 切片 ' + (item.totalSegments || 0) + ' / 可用 ' + (item.usableSegments || 0);
      const assetText = 'raw ' + (item.rawFileCount || 0)
        + ' / cleaned ' + (item.cleanedFileCount || 0)
        + ' / segments ' + (item.segmentFileCount || 0);
      const flags = [
        item.summaryReady ? 'summary-ready' : 'summary-missing',
        item.manifestReady ? 'manifest-ready' : 'manifest-missing',
        item.versionsReady ? 'versions-ready' : 'versions-missing',
      ].join(' | ');
      return '<div class="voice-model-card">'
        + '<div class="voice-card-head"><div><div class="voice-card-title">' + esc(item.name || item.id) + '</div>'
        + '<div class="voice-card-sub">' + esc(item.strategy || '暂无训练策略说明') + '</div></div>'
        + '<span class="voice-card-status ' + ((item.usableSegments || 0) > 0 ? 'active' : 'experimental') + '">'
        + (((item.usableSegments || 0) > 0) ? '可继续训练' : '待整理') + '</span></div>'
        + '<div class="voice-model-meta"><span>' + esc(qualityText) + '</span><span>' + esc(assetText) + '</span></div>'
        + '<div class="voice-muted" style="margin-top:10px;">' + esc(flags)
        + (item.lastGeneratedAt ? (' / manifest ' + esc(item.lastGeneratedAt)) : '') + '</div>'
        + '<div class="voice-model-actions wrap">'
        + '<button class="voice-card-btn primary" onclick="loadVoiceTrainingDetail(\'' + esc(item.id) + '\')">查看详情</button>'
        + '<button class="voice-card-btn" onclick="runVoiceTrainingAction(\'clips-suggest\', \'' + esc(item.id) + '\')">建议切片</button>'
        + '<button class="voice-card-btn" onclick="runVoiceTrainingAction(\'transcribe\', \'' + esc(item.id) + '\')">批量转写</button>'
        + '<button class="voice-card-btn success" onclick="runVoiceTrainingAction(\'manifest\', \'' + esc(item.id) + '\')">生成清单</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  function renderVoiceTrainingScripts(scripts) {
    const wrap = document.getElementById('voiceTrainingScripts');
    if (!wrap) return;
    if (!scripts || !scripts.length) {
      wrap.innerHTML = '<div class="voice-muted">暂无训练脚本说明</div>';
      return;
    }
    wrap.innerHTML = scripts.map(function(item) {
      return '<div><strong>' + esc(item.label) + '</strong>：'
        + esc(item.description) + ' <code>' + esc(item.command) + '</code></div>';
    }).join('');
  }

  function renderVoiceTrainingQueue(taskState) {
    const wrap = document.getElementById('voiceTrainingQueue');
    if (!wrap) return;
    const runningTask = taskState && taskState.runningTask ? taskState.runningTask : null;
    const queuedTasks = taskState && taskState.queuedTasks ? taskState.queuedTasks : [];
    if (!runningTask && !queuedTasks.length) {
      wrap.innerHTML = '<div class="voice-muted">当前没有排队中的训练任务。</div>';
      return;
    }
    wrap.innerHTML = ''
      + (runningTask
        ? ('<div><strong>运行中</strong> / ' + esc(runningTask.action)
          + (runningTask.characterId ? (' / ' + esc(runningTask.characterId)) : '')
          + (runningTask.startedAt ? (' / started ' + esc(runningTask.startedAt)) : '')
          + '</div>')
        : '')
      + (queuedTasks.length
        ? queuedTasks.map(function(task, index) {
            return '<div><strong>排队 #' + esc(String(index + 1)) + '</strong> / ' + esc(task.action)
              + (task.characterId ? (' / ' + esc(task.characterId)) : '')
              + (task.queuedAt ? (' / queued ' + esc(task.queuedAt)) : '')
              + '</div>';
          }).join('')
        : '');
  }

  function renderVoiceTrainingTasks(tasks) {
    const wrap = document.getElementById('voiceTrainingTasks');
    if (!wrap) return;
    if (!tasks || !tasks.length) {
      wrap.innerHTML = '<div class="voice-muted">最近还没有训练任务记录。</div>';
      return;
    }
    wrap.innerHTML = tasks.map(function(task) {
      return '<div><strong>' + esc(task.action) + '</strong>'
        + (task.characterId ? (' / ' + esc(task.characterId)) : '')
        + ' / ' + esc(task.status)
        + (task.queuedAt ? (' / queued ' + esc(task.queuedAt)) : '')
        + (task.startedAt ? (' / started ' + esc(task.startedAt)) : '')
        + (task.finishedAt ? (' / ' + esc(task.finishedAt)) : '')
        + (task.error ? (' / error: ' + esc(task.error)) : '')
        + '</div>';
    }).join('');
  }

  function updateVoiceTrainingStatus(overview, syncOutput) {
    const pill = document.getElementById('voiceTrainingStatus');
    const meta = document.getElementById('voiceTrainingMeta');
    if (!pill || !meta) return;
    if (!overview) {
      pill.textContent = '训练工作区：不可用';
      pill.className = 'voice-status-pill error';
      meta.textContent = '未读取到训练工作区。';
      return;
    }
    const characters = overview.characters || [];
    const readyCount = characters.filter(function(item) { return (item.usableSegments || 0) > 0; }).length;
    const recentTask = overview.recentTasks && overview.recentTasks.length ? overview.recentTasks[0] : null;
    const taskState = overview.taskState || {};
    const queuedCount = (taskState.queuedTasks || []).length;
    const runningTask = taskState.runningTask || null;
    pill.textContent = '训练工作区：已连接';
    pill.className = 'voice-status-pill ok';
    meta.textContent = '角色 ' + characters.length + ' 个，可继续训练 ' + readyCount
      + ' 个，根目录 ' + (overview.trainingRoot || '-')
      + (runningTask ? ('，运行中：' + runningTask.action + (runningTask.characterId ? ('/' + runningTask.characterId) : '')) : '')
      + (queuedCount ? ('，排队中：' + queuedCount + ' 个') : '')
      + (recentTask ? ('，最近任务：' + recentTask.action + ' / ' + recentTask.status) : '')
      + (syncOutput ? ('，最近同步输出：' + syncOutput) : '');
  }

  function renderVoiceTrainingDetail(detail) {
    const wrap = document.getElementById('voiceTrainingDetail');
    if (!wrap) return;
    if (!detail) {
      wrap.innerHTML = '<div class="voice-model-panel-title">角色训练详情</div><div class="voice-muted">点击上方角色卡片可查看来源、版本和 manifest 条目。</div>';
      return;
    }
    const sources = detail.sourceItems || [];
    const versions = detail.versionItems || [];
    const entries = detail.manifestEntries || [];
    const releases = detail.releaseHistory || [];
    const reviewEntries = detail.reviewEntries || [];
    const versionRows = versions.slice(0, 8).map(function(item) {
      const versionId = item.id || 'unknown';
      const backend = item.backend || '-';
      const stage = item.stage || '-';
      const active = item.publish && item.publish.active;
      return '<div><strong>' + esc(versionId) + '</strong> / ' + esc(backend) + ' / ' + esc(stage)
        + (active ? ' / 当前发布' : '')
        + ' <button class="voice-card-btn success" style="margin-left:8px;" onclick="publishVoiceTrainingModel(\'' + esc(detail.id).replace(/'/g, '&#39;') + '\', \'' + esc(versionId).replace(/'/g, '&#39;') + '\')">入库模型</button></div>';
    }).join('');
    const releaseRows = releases.slice(0, 8).map(function(item) {
      return '<div><strong>' + esc(item.versionId || 'unknown') + '</strong>'
        + ' / ' + esc(item.modelId || '-')
        + ' / ' + esc(item.publishedAt || '-')
        + (item.rolledBackAt ? (' / rolled-back ' + esc(item.rolledBackAt)) : '')
        + (!item.rolledBackAt
          ? (' <button class="voice-card-btn" style="margin-left:8px;" onclick="rollbackVoiceTrainingRelease(\'' + esc(detail.id).replace(/'/g, '&#39;') + '\', \'' + esc(item.releaseId).replace(/'/g, '&#39;') + '\')">回滚到发布前</button>')
          : '')
        + '</div>';
    }).join('');
    const reviewRows = reviewEntries.slice(0, 8).map(function(item) {
      const entryId = item.id || 'unknown';
      return '<div class="voice-model-panel" style="margin-top:8px;">'
        + '<div class="voice-card-sub"><strong>' + esc(entryId) + '</strong> / ' + esc(item.reviewStatus || '-') + ' / usable=' + esc(String(Boolean(item.usableForTrain))) + '</div>'
        + '<textarea class="config-input" id="review-transcript-' + esc(entryId) + '" style="margin-top:8px;min-height:68px;">' + esc(item.transcript || '') + '</textarea>'
        + '<input class="config-input" id="review-notes-' + esc(entryId) + '" style="margin-top:8px;" value="' + esc(item.notes || '') + '" placeholder="备注">'
        + '<div class="voice-inline-actions" style="margin-top:8px;">'
        + '<select class="config-input" id="review-status-' + esc(entryId) + '" style="max-width:180px;">'
        + '<option value="pending-review"' + ((item.reviewStatus === 'pending-review') ? ' selected' : '') + '>pending-review</option>'
        + '<option value="needs-manual-review"' + ((item.reviewStatus === 'needs-manual-review') ? ' selected' : '') + '>needs-manual-review</option>'
        + '<option value="needs-recut"' + ((item.reviewStatus === 'needs-recut') ? ' selected' : '') + '>needs-recut</option>'
        + '<option value="approved"' + ((item.reviewStatus === 'approved') ? ' selected' : '') + '>approved</option>'
        + '</select>'
        + '<select class="config-input" id="review-transcription-' + esc(entryId) + '" style="max-width:180px;">'
        + '<option value="draft"' + ((item.transcriptionStatus === 'draft') ? ' selected' : '') + '>draft</option>'
        + '<option value="cleaned"' + ((item.transcriptionStatus === 'cleaned') ? ' selected' : '') + '>cleaned</option>'
        + '<option value="empty"' + ((item.transcriptionStatus === 'empty') ? ' selected' : '') + '>empty</option>'
        + '</select>'
        + '<label class="voice-card-sub"><input type="checkbox" id="review-usable-' + esc(entryId) + '"' + (item.usableForTrain ? ' checked' : '') + '> usableForTrain</label>'
        + '<button class="voice-card-btn success" onclick="saveVoiceTrainingReview(\'' + esc(detail.id).replace(/'/g, '&#39;') + '\', \'' + esc(entryId).replace(/'/g, '&#39;') + '\')">保存修订</button>'
        + '</div></div>';
    }).join('');
    wrap.innerHTML = '<div class="voice-model-panel-title">' + esc(detail.name || detail.id) + ' 训练详情</div>'
      + '<div class="voice-muted">space: ' + esc(detail.spaceUrl || '-') + ' / live: ' + esc(detail.liveRoomUrl || '-') + '</div>'
      + '<div class="voice-inline-actions" style="margin-top:10px;">'
      + '<button class="voice-card-btn" onclick="runVoiceTrainingAction(\'clips-suggest\', \'' + esc(detail.id) + '\')">建议切片</button>'
      + '<button class="voice-card-btn" onclick="runVoiceTrainingAction(\'transcribe\', \'' + esc(detail.id) + '\')">批量转写</button>'
      + '<button class="voice-card-btn success" onclick="runVoiceTrainingAction(\'manifest\', \'' + esc(detail.id) + '\')">生成清单</button>'
      + '</div>'
      + '<div class="voice-model-list" style="margin-top:10px;">'
      + '<div><strong>来源候选</strong>：' + sources.slice(0, 5).map(function(item) { return esc(item.title || item.id || 'unknown'); }).join(' / ') + '</div>'
      + '<div><strong>训练版本</strong>：</div>' + (versionRows || '<div>暂无</div>')
      + '<div><strong>发布历史</strong>：</div>' + (releaseRows || '<div>暂无</div>')
      + '<div><strong>最近 manifest 条目</strong>：' + entries.slice(0, 5).map(function(item) { return esc(item.id || 'unknown'); }).join(' / ') + '</div>'
      + '<div><strong>浏览器质检与转写修订</strong>：</div>' + (reviewRows || '<div>暂无</div>')
      + '</div>';
  }

  function applyVoiceTrainingSnapshot(overview, detail, syncOutput) {
    state.voiceTraining.overview = overview || state.voiceTraining.overview;
    if (detail !== undefined) {
      state.voiceTraining.detail = detail;
    }
    renderVoiceTrainingScripts(state.voiceTraining.overview ? state.voiceTraining.overview.scripts : []);
    renderVoiceTrainingQueue(state.voiceTraining.overview ? state.voiceTraining.overview.taskState : null);
    renderVoiceTrainingTasks(state.voiceTraining.overview ? state.voiceTraining.overview.recentTasks : []);
    renderVoiceTrainingCharacters(state.voiceTraining.overview ? state.voiceTraining.overview.characters : []);
    renderVoiceTrainingDetail(state.voiceTraining.detail);
    updateVoiceTrainingStatus(state.voiceTraining.overview, syncOutput || '');
  }

  async function loadVoiceTrainingPanel() {
    const res = await dashboardApi.getVoiceTrainingOverview();
    state.voiceTraining.overview = (res && res.overview) ? res.overview : null;
    applyVoiceTrainingSnapshot(state.voiceTraining.overview, state.voiceTraining.detail, '');
  }

  async function loadVoiceTrainingDetail(characterId) {
    state.voiceTraining.selectedCharacterId = characterId || '';
    const res = await dashboardApi.getVoiceTrainingDetail(characterId);
    if (!res || res.success === false) {
      toast('加载训练详情失败：' + ((res && res.error) || 'unknown'), 'error');
      return;
    }
    state.voiceTraining.detail = res.detail;
    renderVoiceTrainingDetail(res.detail);
  }

  async function refreshVoiceTrainingTaskState() {
    if (getActiveSection() !== 'voice') return;
    const res = await dashboardApi.getVoiceTrainingTaskState(state.voiceTraining.selectedCharacterId);
    if (!res || res.success === false) return;
    applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, '');
  }

  function startVoiceTrainingTaskPolling() {
    stopVoiceTrainingTaskPolling();
    setPoller(setInterval(function() {
      refreshVoiceTrainingTaskState().catch(function() {});
    }, 4000));
  }

  function stopVoiceTrainingTaskPolling() {
    if (getPoller()) {
      clearInterval(getPoller());
      setPoller(null);
    }
  }

  async function syncVoiceTrainingWorkspace() {
    const res = await api('/api/voice-training/sync', { method: 'POST' });
    if (!res || res.success === false) {
      toast('训练工作区同步失败：' + ((res && res.error) || 'unknown'), 'error');
      return;
    }
    applyVoiceTrainingSnapshot(res.overview || null, state.voiceTraining.detail, res.output || '');
    toast('训练工作区摘要已同步', 'success');
  }

  async function runVoiceTrainingAction(action, characterId) {
    const res = await api('/api/voice-training/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, characterId: characterId || '' })
    });
    if (!res || res.success === false) {
      toast('训练任务执行失败：' + ((res && res.error) || 'unknown'), 'error');
      return;
    }
    applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, '');
    if (res.task && res.task.status === 'queued') {
      toast('训练任务已入队：' + action, 'success');
      refreshVoiceTrainingTaskState().catch(function() {});
      return;
    }
    if (action === 'publish-model') {
      await loadVoicePanel();
      toast('训练版本已入库并刷新模型目录', 'success');
      return;
    }
    toast('训练任务完成：' + action, 'success');
  }

  async function publishVoiceTrainingModel(characterId, versionId) {
    const res = await api('/api/voice-training/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish-model', characterId: characterId, versionId: versionId })
    });
    if (!res || res.success === false) {
      toast('训练版本入库失败：' + ((res && res.error) || 'unknown'), 'error');
      return;
    }
    applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, res.task && res.task.output ? res.task.output : '');
    await loadVoicePanel();
    toast('训练版本已入库：' + versionId, 'success');
  }

  async function rollbackVoiceTrainingRelease(characterId, releaseId) {
    const res = await api('/api/voice-training/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rollback-model', characterId: characterId, releaseId: releaseId })
    });
    if (!res || res.success === false) {
      toast('训练版本回滚失败：' + ((res && res.error) || 'unknown'), 'error');
      return;
    }
    applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, res.task && res.task.output ? res.task.output : '');
    await loadVoicePanel();
    toast('训练版本已回滚', 'success');
  }

  async function importVoiceTrainingRaw() {
    const characterId = (document.getElementById('voiceTrainingImportCharacter').value || '').trim();
    const sourcePath = (document.getElementById('voiceTrainingImportPath').value || '').trim();
    if (!characterId || !sourcePath) {
      toast('请先填写导入角色和本地素材路径', 'error');
      return;
    }
    const res = await api('/api/voice-training/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import-raw', characterId: characterId, sourcePath: sourcePath })
    });
    if (!res || res.success === false) {
      toast('导入素材失败：' + ((res && res.error) || 'unknown'), 'error');
      return;
    }
    applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, res.task && res.task.output ? res.task.output : '');
    toast('原始素材导入完成', 'success');
  }

  async function handleVoiceTrainingUpload(event) {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    const characterId = (document.getElementById('voiceTrainingImportCharacter').value || '').trim();
    if (!characterId) {
      toast('请先填写导入角色，再选择上传文件', 'error');
      if (input) input.value = '';
      return;
    }
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      const uploadId = 'upload-' + Date.now();
      const chunkSize = 1024 * 1024;
      let offset = 0;
      while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize);
        const base64 = await new Promise(function(resolve, reject) {
          const reader = new FileReader();
          reader.onload = function() {
            const result = String(reader.result || '');
            resolve(result.includes(',') ? result.split(',')[1] : result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(chunk);
        });
        const res = await api('/api/voice-training/upload-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterId: characterId,
            uploadId: uploadId,
            fileName: file.name,
            fileBase64Chunk: base64,
            finalize: offset + chunk.size >= file.size,
          })
        });
        if (!res || res.success === false) {
          toast('分片上传失败：' + ((res && res.error) || 'unknown'), 'error');
          if (input) input.value = '';
          return;
        }
        applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, res.output || '');
        offset += chunk.size;
      }
      toast('大文件分片上传完成：' + file.name, 'success');
      if (input) input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async function() {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      const res = await api('/api/voice-training/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload-raw',
          characterId: characterId,
          fileName: file.name,
          fileBase64: base64,
        })
      });
      if (!res || res.success === false) {
        toast('上传素材失败：' + ((res && res.error) || 'unknown'), 'error');
        if (input) input.value = '';
        return;
      }
      applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, res.task && res.task.output ? res.task.output : '');
      toast('上传素材完成：' + file.name, 'success');
      if (input) input.value = '';
    };
    reader.onerror = function() {
      toast('读取上传文件失败', 'error');
      if (input) input.value = '';
    };
    reader.readAsDataURL(file);
  }

  async function saveVoiceTrainingReview(characterId, entryId) {
    const transcript = (document.getElementById('review-transcript-' + entryId).value || '').trim();
    const notes = (document.getElementById('review-notes-' + entryId).value || '').trim();
    const reviewStatus = (document.getElementById('review-status-' + entryId).value || '').trim();
    const transcriptionStatus = (document.getElementById('review-transcription-' + entryId).value || '').trim();
    const usableForTrain = document.getElementById('review-usable-' + entryId).checked;
    const res = await api('/api/voice-training/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterId: characterId,
        entryId: entryId,
        transcript: transcript,
        notes: notes,
        reviewStatus: reviewStatus,
        transcriptionStatus: transcriptionStatus,
        usableForTrain: usableForTrain,
      })
    });
    if (!res || res.success === false) {
      toast('保存训练修订失败：' + ((res && res.error) || 'unknown'), 'error');
      return;
    }
    applyVoiceTrainingSnapshot(res.overview || state.voiceTraining.overview, res.detail !== undefined ? res.detail : state.voiceTraining.detail, '');
    toast('训练修订已保存', 'success');
  }

  return {
    applyVoiceTrainingSnapshot,
    loadVoiceTrainingPanel,
    loadVoiceTrainingDetail,
    refreshVoiceTrainingTaskState,
    startVoiceTrainingTaskPolling,
    stopVoiceTrainingTaskPolling,
    syncVoiceTrainingWorkspace,
    runVoiceTrainingAction,
    publishVoiceTrainingModel,
    rollbackVoiceTrainingRelease,
    importVoiceTrainingRaw,
    handleVoiceTrainingUpload,
    saveVoiceTrainingReview,
  };
}
