# QQTalker Voice Service

本目录提供 QQTalker 语音播报插件配套的本机 Python 服务。

## 目标

- 提供统一的 HTTP 接口给 `QQTalker`
- 扫描本地 `data/voice-models` 模型目录
- 对接 `GPT-SoVITS` 一类本地 GPU 语音服务
- 在模型未准备好时，使用 `edge-tts` 作为自然中文回退

## 快速启动

```bash
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8765
```

Windows 下也可以直接使用：

```powershell
powershell -ExecutionPolicy Bypass -File start-local-service.ps1
```

## 环境变量

- `VOICE_MODEL_DIR`: 模型目录，默认 `../data/voice-models`
- `VOICE_DEFAULT_BACKEND`: 默认后端，默认 `gpt-sovits`
- `VOICE_GPTSOVITS_UPSTREAM`: 本机 GPT-SoVITS 上游 HTTP 接口
- `VOICE_RVC_UPSTREAM`: 本机 RVC 兼容上游 HTTP 接口
- `VOICE_EDGE_DEFAULT`: Edge TTS 默认语音，默认 `zh-CN-XiaoyiNeural`

推荐和当前仓库联调一致的配置：

```text
VOICE_MODEL_DIR=../data/voice-models
VOICE_DEFAULT_BACKEND=gpt-sovits
VOICE_GPTSOVITS_UPSTREAM=http://127.0.0.1:9880/tts
```

## 目录约定

支持两种模型清单来源：

1. 根目录 `catalog.json`
2. 任意子目录内的 `voice-model.json`

示例字段：

```json
{
  "id": "preset-dongxuelian",
  "name": "冬雪莲",
  "character": "冬雪莲",
  "backend": "gpt-sovits",
  "modelPath": "./dongxuelian/model.ckpt",
  "auxPaths": ["./dongxuelian/reference.wav"],
  "sampleText": "今天也要元气满满地和大家打招呼哦。"
}
```

## GPT-SoVITS 联调说明

推荐将官方 `GPT-SoVITS` 放在 `QQTalker` 同级目录，例如：

```text
CodeBuddyWorkSpace/
  QQTalker/
  GPT-SoVITS/
```

然后通过 `VOICE_GPTSOVITS_UPSTREAM=http://127.0.0.1:9880/tts` 接入。

当前仓库已验证可用的部署流程：

1. 在 `../GPT-SoVITS` 内准备 Python 3.10 虚拟环境。
2. 安装官方依赖后，若 Windows 无法构建 `jieba_fast`，可保留普通 `jieba` 并使用仓库中的兼容补丁。
3. 启动 `start-api-v2.ps1`，确认 `http://127.0.0.1:9880` 可访问。
4. 再启动本目录下的 `start-local-service.ps1`。

Windows 兼容备注：

- `GPT-SoVITS` 首次运行可能缺少 `g2p_en` 相关依赖。
- 英文词性资源缺失时，当前仓库已在 `GPT_SoVITS/text/english.py` 中加入回退逻辑，不阻塞中文推理。
- 如果本机缺少 CUDA 对应的 `cuDNN`，`onnxruntime` 会打印 CUDA Provider 加载失败，但只要 `torch` 侧 CUDA 可用，主推理链仍可继续。

## 上游服务说明

当前上线口径下，`gpt-sovits` 是默认生产链路，`edge-tts` 是保底回退。

仓库中仍保留 `rvc-compat` 相关代码与脚本，主要用于历史实验回溯，不再属于当前默认启动流程。

如果你已经部署了 GPT-SoVITS WebUI / API，可以把其可用的合成接口填入 `VOICE_GPTSOVITS_UPSTREAM`。本服务会把文本、模型路径、参考资源路径和风格参数打包后 POST 给该接口，并接受音频二进制或 `audioBase64` JSON 响应。

## 已验证结果

本次实际联调验证通过：

- `/health`
- `/models`
- `/preview` -> `gpt-sovits / preset-dongxuelian`
- `QQTalker /api/voice/preview` 到 `voice-service` 的完整代理链路
