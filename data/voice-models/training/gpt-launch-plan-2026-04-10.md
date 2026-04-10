# GPT 上线计划（2026-04-10）

## 当前决策

- `GPT-SoVITS` 已达到当前上线要求，作为 `QQTalker` 默认语音主链路进入上线迭代。
- `edge-tts` 保留为故障回退链路。
- `RVC` 从当前上线计划中移除，不再作为默认位候选，也不再纳入本轮启动、测试与验收范围。

## 上线范围

- `QQTalker` 真实 `at-reply` 语音回复固定走 `gpt-sovits`
- `voice-service` 作为统一本地语音代理层
- `GPT-SoVITS` 官方 API 作为上游合成服务
- `Dashboard` 保留现有观测能力，用于确认 `fallbackRate`、`lastRequest` 和服务健康状态

## 验收标准

- 真实 `at-reply` 在线验证命中 `gpt-sovits / local-http`
- `fallbackRate = 0`，或至少不再出现“旧后台未重启导致频繁回退”的现象
- 一键启动脚本可拉起：
  - `GPT-SoVITS`
  - `voice-service`
  - `QQTalker`
- `npm test` 通过
- 关键启动链路和 Dashboard 健康检查通过

## 当前一键启动入口

```powershell
powershell -ExecutionPolicy Bypass -File .\start-voice-stack.ps1
```

或：

```bash
npm run start:stack
```

## 当前结论

- `GPT` 已可作为默认上线方案
- `RVC v1` 虽已恢复可评测，但平均时延仍显著高于 `GPT`
- 因此当前阶段不再继续推进 `RVC` 上线计划，后续如需恢复，仅作为独立实验分支处理
