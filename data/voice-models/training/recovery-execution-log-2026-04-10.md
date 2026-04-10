# 2026-04-10 恢复执行日志

## 任务目标
- 恢复 crash 前 `voice:eval -- --profile=tafi-rvc` 的执行上下文与最新可得试听结果。
- 确认真实回复频繁回退是否主要由老版本 `QQTalker` 后台未重启导致。
- 梳理 `QQTalker` 语音输出项目当前进度，并给出接下来的详细迭代计划。

## 执行原则
- 每个关键步骤都记录计划、命令、结果与下一步。
- 优先验证“旧后台未重启”这一已知高概率原因，再继续追上游与模型问题。
- 若再次异常中断，应能直接从本文件继续恢复。

## 执行记录

### 1. 初始化与溯源
- 时间：2026-04-10
- 计划：确认 `voice:eval` 入口、最新评测产物、TTS 主链路代码路径与项目计划文档。
- 结果：
  - `voice:eval` 入口确认是 `package.json` -> `scripts/voice-training/run-ab-eval.mjs`。
  - `tafi-rvc` profile 设计为三路：`yongchutafi-gpt`、`yongchutafi-rvc-v1`、`yongchutafi-rvc-v2`。
  - 仓库内最新可见评测结果是 `eval-results/2026-04-10T05-54-06-739Z`，但其 `profile` 为 `default`，不是 `tafi-rvc`。
  - 真实回复的语音播报入口是 `src/handlers/message-handler.ts` 中的 `tts.textToSpeech(reply, { scene: 'at-reply', allowExperimental: false })`。
  - TTS 主链路与回退链控制位于 `src/services/tts-service.ts`。
- 下一步：检查当前运行中的 `QQTalker` / `voice-service` 状态，优先验证是否仍是老版本后台实例。

### 2. 运行态检查
- 时间：2026-04-10
- 计划：确认当前是否已有 `QQTalker` / `voice-service` / `GPT-SoVITS` / `RVC compat` 实例在运行，并记录启动时间。
- 命令：
  - `Get-CimInstance Win32_Process | Where-Object { ($_.Name -match 'node|python') -and ($_.CommandLine -match 'QQTalker|voice-service|gpt|tts') }`
  - `Get-Process -Id 34432,18248,19560,17152`
  - `Invoke-WebRequest http://127.0.0.1:8765/docs`
  - `Invoke-WebRequest http://127.0.0.1:9880/`
- 结果：
  - 发现正在运行的关键进程：
    - `node.exe -> ts-node src/index.ts`，PID `34432`，启动时间 `2026-04-10 13:53:25`
    - `voice-service uvicorn`，PID `18248`，启动时间 `2026-04-10 13:33:42`
    - `GPT-SoVITS api_v2.py`，PID `19560`，启动时间 `2026-04-10 13:33:24`
    - `rvc_compat_service`，PID `17152`，启动时间 `2026-04-10 13:33:53`
  - `voice-service` 的 `/docs` 返回 `200 OK`，说明 HTTP 服务在线。
  - `GPT-SoVITS` 根路径 `/` 返回 `404 Not Found`，更像是根路径未定义而不是服务进程缺失。
- 初步判断：
  - 当前不是“服务全挂”的情况，确实有一套完整后台在运行。
  - 是否仍是“老版本 QQTalker 后台”还不能仅靠进程存在性判断，需要继续比对关键代码修改时间、当前实例启动时间以及实际请求命中的行为。
- 下一步：比对 `QQTalker` 关键 TTS 代码文件的修改时间与 `node` 进程启动时间，并确认 `tafi-rvc` 三路模型是否可运行。

### 3. 旧后台实例判定
- 时间：2026-04-10
- 计划：核对关键 TTS 文件修改时间、当前 `node` 进程启动时间，以及 `tafi-rvc` 评测所需模型是否安装。
- 命令：
  - `Get-Item src/handlers/message-handler.ts src/services/tts-service.ts src/types/config.ts`
  - 读取 `data/voice-models/catalog.json`
- 结果：
  - `message-handler.ts` / `tts-service.ts` / `config.ts` 的最后修改时间均为 `2026-04-10 14:05:25`。
  - 当前运行中的 `QQTalker` `node` 进程启动时间为 `2026-04-10 13:53:25`。
  - 这意味着当前后台进程早于关键 TTS 改动，极大概率仍在运行旧代码，符合“老版本后台未重启导致主链路没有切到 GPT”的历史结论。
  - `catalog.json` 中：
    - `preset-yongchutafi` 已安装。
    - `preset-yongchutafi-rvc` 已安装。
    - `preset-yongchutafi-rvc-v2` 仍为 `installed: false`，因此本轮 `tafi-rvc` 评测即使按 profile 运行，也不会得到完整三路产物，最多只会落到 `GPT + RVC v1`。
- 当前结论：
  - 对“真实回复频繁回退”的首要原因判断已收敛为：`QQTalker` 后台未在关键改动后重启。
  - 对“GPT vs 塔菲 RVC v1”的最新试听结果，可以继续通过当前可用的 `GPT + RVC v1` 组合补跑得到。
- 下一步：重启 `QQTalker` 后台进程，使其加载最新 TTS 链路代码；随后执行 `voice:eval -- --profile=tafi-rvc`，产出新的可用试听结果。

### 4. 重启 QQTalker 后台
- 时间：2026-04-10
- 计划：停止旧 `node` 进程并启动新的 `npm run dev` 实例，确认它已经加载当前 TTS 配置。
- 命令：
  - `Stop-Process -Id 34432`
  - `npm run dev`
- 结果：
  - 新的 `QQTalker` 开发进程已启动，终端日志显示：
    - `🔔 TTS语音功能已启用 provider=local-http backend=gpt-sovits policy=model-default`
    - `✅ QQTalker 启动成功！正在监听消息...`
  - 这说明最新进程已经加载当前 TTS 主链路配置，而不是继续停留在旧实例上。
- 当前判断：
  - “真实回复还在频繁回退”的首要问题已完成一次关键修复动作：旧后台已被替换为新后台。
  - 后续若仍出现回退，需要基于新进程继续观察，不能再把旧进程结论与新进程混在一起。
- 下一步：运行 `voice:eval -- --profile=tafi-rvc`，产出新的最新试听结果并对比 GPT 与塔菲 RVC v1。

### 5. `tafi-rvc` 评测恢复
- 时间：2026-04-10
- 计划：产出真正的 `tafi-rvc` 评测结果，并区分 `GPT` 与 `RVC v1` 的最新状态。
- 执行经过：
  - 首次执行 `npm run voice:eval -- --profile=tafi-rvc` 时，实际输出从 `dongxuelian-gpt` 开始，说明仍按 `default` profile 跑；为避免污染结论，已中止该轮。
  - 改为直接执行 `node scripts/voice-training/run-ab-eval.mjs --profile=tafi-rvc`，参数正确生效。
- 第一轮正确 profile 结果：
  - 输出目录：`data/voice-models/training/eval-results/2026-04-10T06-42-15-129Z`
  - `summary.json`：
    - `yongchutafi-gpt`: `13/13` 成功，平均 `11447ms`
    - `yongchutafi-rvc-v1`: `9/13` 成功，平均 `9712ms`
  - 可试听音频已落盘，`GPT` 13 条音频完整，`RVC v1` 落盘 9 条。
  - 失败集中在：
    - `chat-long-01`: `yongchutafi-rvc-v1 试听失败`
    - `chat-long-02` / `chat-expressive-01` / `chat-expressive-02`: `WinError 10061`，表现为上游连接被拒绝
  - 结论：这是第一份真正可用于“GPT vs 塔菲 RVC v1”回听的最新试听结果。

### 6. RVC compat 服务恢复与二次验证
- 时间：2026-04-10
- 计划：验证 `RVC v1` 的失败究竟是中途服务掉线，还是当前 wrapper/runtime 本身不可用。
- 命令：
  - 启动 `voice-service/.venv/Scripts/python.exe -m uvicorn rvc_compat_service:app --host 127.0.0.1 --port 8766`
  - 校验 `http://127.0.0.1:8766/docs`
  - 再次执行 `node scripts/voice-training/run-ab-eval.mjs --profile=tafi-rvc`
- 结果：
  - `8766/docs` 返回 `200`，wrapper 进程恢复在线。
  - 第二轮评测输出目录：`data/voice-models/training/eval-results/2026-04-10T06-48-37-617Z`
  - `summary.json`：
    - `yongchutafi-gpt`: `13/13` 成功，平均 `2987ms`
    - `yongchutafi-rvc-v1`: `0/13` 成功
  - `report.md` 中所有 `RVC v1` case 都失败，统一错误：
    - `rvc-python runtime unavailable: No module named 'rvc_python' ; install missing Python deps and Windows C++ Build Tools, then restart wrapper.`
- 当前结论：
  - GPT 主链路在新后台上是稳定的，且两轮 `tafi-rvc` 评测均为 `13/13` 成功。
  - RVC v1 当前存在两层问题：
    - 一层是早先环境里存在“中途掉线 / 连接拒绝”的不稳定问题。
    - 另一层是手动恢复后的 wrapper 环境直接缺少 `rvc_python` 依赖，导致当前最新环境下 `RVC v1` 实际不可用。
  - 因此：
    - “最新可试听的 GPT vs 塔菲 RVC v1 结果”应参考 `2026-04-10T06-42-15-129Z`。
    - “最新环境状态”应参考 `2026-04-10T06-48-37-617Z`，它表明 RVC runtime 需要先补依赖后才有继续对比意义。
- 下一步：整理最终结论，明确项目阶段、主链路判断与后续详细迭代计划。

### 7. 下一轮执行：真实 at-reply 在线验证
- 时间：2026-04-10
- 计划：确认重启后的 `QQTalker` 在真实 `at-reply` 场景里是否仍会频繁回退。
- 观测方式：
  - 读取 `http://localhost:3180/api/voice/status`
  - 读取 `http://localhost:3180/api/logs`
- 结果：
  - `telemetry.lastRequest.scene = "at-reply"`
  - `telemetry.lastRequest.source = "local-http"`
  - `telemetry.lastRequest.backend = "gpt-sovits"`
  - `telemetry.fallbackRate = 0`
  - Dashboard 日志在重启后出现连续 `message -> ai -> tts` 记录，说明在线消息链路与 TTS 播报均实际发生。
- 结论：
  - 重启后的真实 `at-reply` 已观测到稳定命中 GPT 主链路，当前没有证据表明仍在频繁回退。

### 8. 下一轮执行：修复 RVC compat 运行环境
- 时间：2026-04-10
- 计划：修复 `rvc_python` 缺失问题，并确认 wrapper 运行在项目预期的 Python 环境中。
- 排查结果：
  - `GPT-SoVITS/.venv` 中已安装 `rvc-python 0.1.5`
  - `QQTalker/voice-service/.venv` 中未安装 `rvc-python`
  - `voice-service/start-rvc-compat-service.ps1` 明确要求使用 `GPT-SoVITS/.venv`
  - 此前 `503 No module named 'rvc_python'` 的直接原因是 wrapper 启动在错误的 venv 上
- 修复动作：
  - 停止错误环境下的 `8766` 进程
  - 改为使用 `start-rvc-compat-service.ps1` 启动正确 wrapper
  - 校验 `http://127.0.0.1:8766/health` 返回 `ok: true`
  - 再次校验 `http://localhost:3180/api/voice/status` 返回 `rvcAvailable: true`
- 补充确认：
  - `preset-yongchutafi-rvc` 的本地产物路径存在：
    - `data/voice-models/yongchutafi/rvc/model.pth`
    - `data/voice-models/yongchutafi/rvc/feature.index`
  - `preset-yongchutafi-rvc-v2` 产物路径仍不存在：`data/voice-models/yongchutafi/rvc/v2/model.pth`
- 下一步：在正确运行环境下重跑 `tafi-rvc`，更新 GPT vs RVC v1 结果；随后准备 `v2` 导入。

### 9. 修复后重跑 `tafi-rvc`
- 时间：2026-04-10
- 计划：在 `rvcAvailable=true` 的状态下重跑 `tafi-rvc`，确认 `RVC v1` 是否恢复。
- 结果目录：`data/voice-models/training/eval-results/2026-04-10T07-13-20-004Z`
- `summary.json`：
  - `yongchutafi-gpt`: `13/13`，平均 `3528ms`
  - `yongchutafi-rvc-v1`: `0/13`
- 进一步溯源：
  - `RVC wrapper` 启动后在首次请求期间加载 `model.pth`
  - 随后终端出现：
    - `Loading rmvpe model - base_models/rmvpe.pth`
    - `OpenBLAS: malloc failed in gemm_driver`
  - wrapper 进程随即退出，之后评测侧统一表现为 `WinError 10061`。
- 当前判断：
  - 这轮失败的真实根因不是 `rvc_python` 缺失，而是 `RVC wrapper` 在模型加载/推理阶段因为 OpenBLAS 内存或线程问题崩溃。
  - `GPT` 默认链路继续保持稳定，`RVC v1` 仍未恢复到可比较状态。
- 下一步：先尝试用更保守的 OpenBLAS/OMP 线程设置重新拉起 wrapper，再决定是否继续做 `v2` 导入与三路对比。

### 10. OpenBLAS 降线程修复与再次评测
- 时间：2026-04-10
- 计划：通过限制 `OPENBLAS_NUM_THREADS` / `OMP_NUM_THREADS` / `MKL_NUM_THREADS` 避免 `rvc_python` 在首次推理时崩溃。
- 验证过程：
  - 以低线程环境重新启动 `RVC wrapper`
  - 先做一条 `RVC v1` preview 短句验证
  - wrapper 成功加载：
    - `Loading: ... yongchutafi\\rvc\\model.pth`
    - `Model model.pth loaded.`
    - `POST /convert HTTP/1.1" 200 OK`
  - `/health` 中 `loadedModel` 变为塔菲 `model.pth`
- 完整重跑结果：
  - 输出目录：`data/voice-models/training/eval-results/2026-04-10T07-17-41-788Z`
  - `summary.json`：
    - `yongchutafi-gpt`: `13/13`，平均 `3318ms`
    - `yongchutafi-rvc-v1`: `13/13`，平均 `8015ms`
  - `RVC v1` 所有 case 均已产出音频，且统一带有 `warnings: rvc-base:gpt-sovits:preset-yongchutafi`
- 当前结论：
  - `RVC v1` 已从“不可用”恢复到“可完整评测”状态。
  - 与 `GPT` 相比，`RVC v1` 当前延迟明显更高，尤其在长句与情绪句上耗时偏大，但稳定性已恢复。

### 11. `RVC v2` 导入阻塞
- 时间：2026-04-10
- 计划：继续导入 `preset-yongchutafi-rvc-v2` 并做真正三路对比。
- 已确认：
  - `v2` 目标路径应为 `data/voice-models/yongchutafi/rvc/v2/model.pth`
  - 当前该路径不存在
  - 工作区内已有的导入记录只有 `v1`：`data/voice-models/yongchutafi/rvc/imported-artifacts.json`
- 搜索结果：
  - 在工作区、`Downloads`、`Desktop`、`GPT-SoVITS` 目录中均未找到新的 `v2 model.pth` / `.index` 产物
- 阻塞说明：
  - 没有 `v2` 产物源文件路径，就无法执行 `import-rvc-artifacts.mjs --slot=v2`
- 下一步：等待提供 `v2` 产物路径后继续导入并做三路评测。

### 12. 当前阶段收口决定
- 时间：2026-04-10
- 用户决策：先停在 `GPT vs RVC v1`，暂不等待 `v2` 产物。
- 当前阶段结论：
  - 真实 `at-reply` 在线链路已验证稳定命中 `gpt-sovits`，没有观测到频繁回退。
  - `RVC v1` 在修复运行环境后已恢复到 `13/13` 可评测状态，但平均耗时 `8015ms`，显著高于 `GPT` 的 `3318ms`。
  - 因此在当前阶段：
    - `GPT-SoVITS` 仍应保持默认主链路地位
    - `RVC v1` 恢复为“可继续 A/B 试听和小范围候选”状态
    - 但尚不足以替代 `GPT` 成为默认位
- 后续恢复条件：
  - 一旦拿到 `v2 model.pth / index`，可直接继续 `slot=v2` 导入并做真正三路对比。

### 13. GPT 上线迭代
- 时间：2026-04-10
- 新决策：
  - `GPT-SoVITS` 已足够优秀，进入当前上线迭代
  - `RVC` 从当前上线计划中移除，不再纳入默认启动、测试与验收范围
- 落地动作：
  - 一键启动脚本改为只拉起 `GPT-SoVITS`、`voice-service`、`QQTalker`
  - README 与上线文档统一更新为 `GPT-only` 口径
  - 增加 `npm run start:stack` 作为一键启动别名
- 验证结果：
  - `npm test`：`20/20` 通过
  - `npm run build`：通过
  - `powershell -ExecutionPolicy Bypass -File .\start-voice-stack.ps1`：通过，能正确识别 GPT、voice-service、QQTalker 的就绪状态
- 下一步：关闭当前后台，让用户使用一键启动脚本自行验证。
