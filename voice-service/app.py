from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import math
import os
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path
from time import perf_counter
from typing import Dict, List, Optional, Tuple
import wave

import edge_tts
from fastapi import FastAPI, HTTPException

from catalog import VoiceCatalog
from models import VoiceBackendOverride, VoiceModelEntry, VoiceSynthesisRequest, VoiceSynthesisResult


APP_VERSION = "0.1.0"
MODEL_DIR = os.getenv(
    "VOICE_MODEL_DIR",
    str((Path(__file__).resolve().parent.parent / "data" / "voice-models").resolve()),
)
DEFAULT_BACKEND = os.getenv("VOICE_DEFAULT_BACKEND", "gpt-sovits")
DEFAULT_EDGE_VOICE = os.getenv("VOICE_EDGE_DEFAULT", "zh-CN-XiaoyiNeural")
RVC_BASE_VOICE = os.getenv("VOICE_RVC_BASE_VOICE", "zh-CN-XiaoxiaoNeural").strip() or "zh-CN-XiaoxiaoNeural"
GPT_SOVITS_UPSTREAM = os.getenv("VOICE_GPTSOVITS_UPSTREAM", "").strip()
RVC_UPSTREAM = os.getenv("VOICE_RVC_UPSTREAM", "").strip()
GPT_TOP_K = int(os.getenv("VOICE_GPT_TOP_K", "10"))
GPT_TOP_P = float(os.getenv("VOICE_GPT_TOP_P", "0.9"))
GPT_TEMPERATURE = float(os.getenv("VOICE_GPT_TEMPERATURE", "0.7"))
GPT_REPETITION_PENALTY = float(os.getenv("VOICE_GPT_REPETITION_PENALTY", "1.1"))
GPT_SPLIT_METHOD = os.getenv("VOICE_GPT_TEXT_SPLIT_METHOD", "cut5").strip() or "cut5"
GPT_SPLIT_BUCKET = os.getenv("VOICE_GPT_SPLIT_BUCKET", "false").strip().lower() == "true"
GPT_FRAGMENT_INTERVAL = float(os.getenv("VOICE_GPT_FRAGMENT_INTERVAL", "0.12"))
GPT_PARALLEL_INFER = os.getenv("VOICE_GPT_PARALLEL_INFER", "true").strip().lower() != "false"
LOCAL_SEGMENT_MAX_CHARS = max(40, int(os.getenv("VOICE_LOCAL_SEGMENT_MAX_CHARS", "110")))
LOCAL_SEGMENT_SILENCE_MS = max(0, int(os.getenv("VOICE_LOCAL_SEGMENT_SILENCE_MS", "110")))
POST_HIGHPASS_HZ = max(0.0, float(os.getenv("VOICE_WAV_HIGHPASS_HZ", "115")))
POST_NORMALIZE_PEAK = min(0.99, max(0.0, float(os.getenv("VOICE_WAV_NORMALIZE_PEAK", "0.9"))))
MAX_AUX_REF_COUNT = max(0, int(os.getenv("VOICE_MAX_AUX_REF_COUNT", "2")))
ALLOW_RUNTIME_EXPERIMENTAL_RVC = os.getenv("VOICE_RUNTIME_EXPERIMENTAL_RVC", "false").strip().lower() == "true"
RVC_RUNTIME_MAX_CHARS = max(8, int(os.getenv("VOICE_RVC_RUNTIME_MAX_CHARS", "28")))

logging.basicConfig(level=os.getenv("VOICE_SERVICE_LOG_LEVEL", "INFO").upper())
LOGGER = logging.getLogger("qqtalker.voice-service")

app = FastAPI(title="QQTalker Voice Service", version=APP_VERSION)
catalog = VoiceCatalog(MODEL_DIR)


def read_rvc_health() -> Tuple[bool, Optional[str]]:
    if not RVC_UPSTREAM:
        return False, "未配置 VOICE_RVC_UPSTREAM，当前没有可用的 RVC 兼容推理服务"
    try:
        health_url = urllib.parse.urljoin(RVC_UPSTREAM if RVC_UPSTREAM.endswith("/") else f"{RVC_UPSTREAM}/", "../health")
        payload = fetch_json(health_url)
    except HTTPException as exc:
        return False, exc.detail
    if payload.get("ok") is True:
        return True, None
    return False, str(payload.get("importError") or payload.get("error") or "RVC 包装服务未就绪")


def list_backends() -> List[Dict[str, object]]:
    rvc_available, rvc_reason = read_rvc_health()
    return [
        {
            "id": "gpt-sovits",
            "name": "GPT-SoVITS",
            "description": "推荐的中文角色播报后端，可对接本机 GPU 推理服务。",
            "supportsModels": True,
            "supportsPreview": True,
            "supportsStyle": True,
            "requiresGpu": True,
            "available": bool(GPT_SOVITS_UPSTREAM),
            "availabilityReason": None if GPT_SOVITS_UPSTREAM else "未配置 VOICE_GPTSOVITS_UPSTREAM",
            "setupHint": "启动 GPT-SoVITS API 后，将其 /tts 地址写入 VOICE_GPTSOVITS_UPSTREAM。",
            "upstream": GPT_SOVITS_UPSTREAM or None,
        },
        {
            "id": "rvc-compat",
            "name": "RVC Compatible",
            "description": "兼容 RVC / 变声服务的代理后端，适合作为已有模型资产的补充链路。",
            "supportsModels": True,
            "supportsPreview": True,
            "supportsStyle": False,
            "requiresGpu": True,
            "available": rvc_available,
            "availabilityReason": None if rvc_available else rvc_reason,
            "setupHint": "导入 model.pth 后，还需要启动 RVC 兼容 HTTP 服务，并把地址写入 VOICE_RVC_UPSTREAM。",
            "upstream": RVC_UPSTREAM or None,
        },
        {
            "id": "edge-tts",
            "name": "Edge TTS",
            "description": "无需角色模型的自然中文回退后端。",
            "supportsModels": False,
            "supportsPreview": True,
            "supportsStyle": False,
            "requiresGpu": False,
            "available": True,
            "availabilityReason": None,
            "setupHint": "无需额外模型，可直接作为保底播报链路。",
            "upstream": None,
        },
    ]


def resolve_model(model_id: Optional[str]) -> Optional[VoiceModelEntry]:
    if not model_id:
        return None
    for item in catalog.list_models():
        if item.id == model_id:
            return item
    return None


def resolve_character_model(character: Optional[str], backend: str, *, exclude_id: Optional[str] = None) -> Optional[VoiceModelEntry]:
    if not character:
        return None
    for item in catalog.list_models():
        if item.id == exclude_id:
            continue
        if item.character == character and item.backend == backend and item.enabled and item.installed:
            return item
    return None


def get_backend_override(
    model: Optional[VoiceModelEntry],
    backend: str,
) -> Optional[VoiceBackendOverride]:
    if not model or not model.backendOverrides:
        return None
    return model.backendOverrides.get(backend)


async def synthesize_edge_tts(req: VoiceSynthesisRequest, model: Optional[VoiceModelEntry]) -> bytes:
    voice = req.voice
    if not voice and model and model.backend == "edge-tts":
        voice = model.name
    voice = voice or DEFAULT_EDGE_VOICE
    rate_pct = int((req.speed - 1.0) * 100)
    rate = f"{rate_pct:+d}%"
    try:
        communicator = edge_tts.Communicate(req.text, voice=voice, rate=rate)
        chunks: List[bytes] = []
        async for chunk in communicator.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)
    except Exception:
        return await asyncio.to_thread(fetch_baidu_tts, req.text, req.speed)


def fetch_baidu_tts(text: str, speed: float) -> bytes:
    spd = max(1, min(10, int(round(speed * 4))))
    encoded_text = urllib.parse.quote(text)
    url = f"https://fanyi.baidu.com/gettts?lan=zh&text={encoded_text}&source=web&spd={spd}"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://fanyi.baidu.com/",
            "Accept": "*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read()
    if not body:
        raise HTTPException(status_code=502, detail="百度TTS未返回音频")
    return body


def fetch_remote_audio(url: str, payload: Dict[str, object]) -> bytes:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            content_type = response.headers.get("Content-Type", "")
            body = response.read()
    except urllib.error.HTTPError as exc:
        error_body = ""
        try:
            raw_body = exc.read()
            error_body = raw_body.decode("utf-8", errors="ignore").strip()
        except Exception:
            error_body = ""
        detail = f"上游语音服务不可用: {exc}"
        if error_body:
            detail = f"{detail} | body={error_body[:500]}"
        raise HTTPException(status_code=502, detail=detail) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"上游语音服务不可用: {exc}") from exc

    if "application/json" in content_type:
        raw = json.loads(body.decode("utf-8"))
        if raw.get("audioBase64"):
            return base64.b64decode(raw["audioBase64"])
        if raw.get("audio_base64"):
            return base64.b64decode(raw["audio_base64"])
        raise HTTPException(status_code=502, detail="上游服务返回了 JSON，但没有音频字段")

    return body


def fetch_json(url: str) -> Dict[str, object]:
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"上游语音服务不可用: {exc}") from exc


def _calc_last_break(current: str) -> Tuple[int, str]:
    strong_breaks = set("。！？!?;\n")
    weak_breaks = set("，,、；：")
    for index in range(len(current) - 1, -1, -1):
        char = current[index]
        if char in strong_breaks:
            return index + 1, "strong"
        if char in weak_breaks:
            return index + 1, "weak"
    return -1, "none"


def split_long_text(text: str, max_chars: int = LOCAL_SEGMENT_MAX_CHARS) -> List[str]:
    clean = (text or "").strip()
    if len(clean) <= max_chars:
        return [clean]

    result: List[str] = []
    current = ""
    min_split_chars = max(18, int(max_chars * 0.45))
    overflow_limit = max_chars + max(8, int(max_chars * 0.15))

    for char in clean:
        current += char
        if len(current) < max_chars:
            continue

        split_at, _ = _calc_last_break(current)
        if split_at >= min_split_chars:
            chunk = current[:split_at].strip()
            current = current[split_at:].lstrip()
        elif len(current) < overflow_limit:
            continue
        else:
            chunk = current.strip()
            current = ""

        if chunk:
            result.append(chunk)

    if current.strip():
        result.append(current.strip())
    return [item for item in result if item]


def pause_ms_for_segment(text: str, base_silence_ms: int = LOCAL_SEGMENT_SILENCE_MS) -> int:
    clean = (text or "").rstrip()
    if not clean:
        return max(12, int(base_silence_ms * 0.12))
    last_char = clean[-1]
    if last_char in "。！？!?;\n":
        return max(55, int(base_silence_ms * 0.55))
    if last_char in "，,、；：":
        return max(28, int(base_silence_ms * 0.28))
    return max(12, int(base_silence_ms * 0.12))


def trim_wav_segment_edges(
    chunk: bytes,
    max_trim_ms: int = 180,
    keep_padding_ms: int = 12,
    threshold_ratio: float = 0.012,
) -> bytes:
    if not chunk:
        return chunk

    with wave.open(io.BytesIO(chunk), "rb") as reader:
        channels = reader.getnchannels()
        sample_width = reader.getsampwidth()
        frame_rate = reader.getframerate()
        comptype = reader.getcomptype()
        compname = reader.getcompname()
        raw_frames = reader.readframes(reader.getnframes())

    if sample_width != 2 or channels <= 0 or frame_rate <= 0:
        return chunk

    samples = memoryview(raw_frames).cast("h")
    frame_count = len(samples) // channels
    if frame_count <= 0:
        return chunk

    peak = max((abs(sample) for sample in samples), default=0)
    if peak <= 0:
        return chunk

    threshold = max(120, int(peak * threshold_ratio))
    start_frame = 0
    end_frame = frame_count - 1

    while start_frame < frame_count:
        frame_peak = 0
        base = start_frame * channels
        for channel in range(channels):
            frame_peak = max(frame_peak, abs(samples[base + channel]))
        if frame_peak >= threshold:
            break
        start_frame += 1

    while end_frame > start_frame:
        frame_peak = 0
        base = end_frame * channels
        for channel in range(channels):
            frame_peak = max(frame_peak, abs(samples[base + channel]))
        if frame_peak >= threshold:
            break
        end_frame -= 1

    if start_frame >= end_frame:
        return chunk

    max_trim_frames = int(frame_rate * max_trim_ms / 1000)
    keep_padding_frames = int(frame_rate * keep_padding_ms / 1000)
    start_frame = max(0, min(start_frame, max_trim_frames) - keep_padding_frames)
    end_distance = frame_count - 1 - end_frame
    end_trim_frames = max(0, min(end_distance, max_trim_frames) - keep_padding_frames)
    end_frame = min(frame_count - 1, frame_count - 1 - end_trim_frames)

    if start_frame <= 0 and end_frame >= frame_count - 1:
        return chunk

    trimmed_samples = samples[start_frame * channels:(end_frame + 1) * channels]
    if len(trimmed_samples) <= 0:
        return chunk

    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(channels)
        writer.setsampwidth(sample_width)
        writer.setframerate(frame_rate)
        writer.setcomptype(comptype, compname)
        writer.writeframes(trimmed_samples.tobytes())
    return output.getvalue()


def concat_wav_segments(
    chunks: List[bytes],
    pause_durations: Optional[List[int]] = None,
    silence_ms: int = LOCAL_SEGMENT_SILENCE_MS,
) -> bytes:
    if len(chunks) <= 1:
        return chunks[0] if chunks else b""

    params = None
    frames: List[bytes] = []
    silence_cache: Dict[int, bytes] = {}

    for chunk in chunks:
        trimmed_chunk = trim_wav_segment_edges(chunk)
        with wave.open(io.BytesIO(trimmed_chunk), "rb") as reader:
            current_params = (
                reader.getnchannels(),
                reader.getsampwidth(),
                reader.getframerate(),
                reader.getcomptype(),
                reader.getcompname(),
            )
            if params is None:
                params = current_params
            elif current_params != params:
                raise HTTPException(status_code=502, detail="分段合成返回的 WAV 参数不一致，无法拼接")
            frames.append(reader.readframes(reader.getnframes()))

    output = io.BytesIO()
    assert params is not None
    with wave.open(output, "wb") as writer:
        writer.setnchannels(params[0])
        writer.setsampwidth(params[1])
        writer.setframerate(params[2])
        for index, frame_bytes in enumerate(frames):
            writer.writeframes(frame_bytes)
            if index >= len(frames) - 1:
                continue
            pause_ms = silence_ms
            if pause_durations and index < len(pause_durations):
                pause_ms = pause_durations[index]
            if pause_ms <= 0:
                continue
            silence = silence_cache.get(pause_ms)
            if silence is None:
                silence_frame_count = int(params[2] * pause_ms / 1000)
                silence = b"\x00" * silence_frame_count * params[0] * params[1]
                silence_cache[pause_ms] = silence
            if silence:
                writer.writeframes(silence)
    return output.getvalue()


def post_process_wav(chunk: bytes) -> bytes:
    if not chunk:
        return chunk

    with wave.open(io.BytesIO(chunk), "rb") as reader:
        channels = reader.getnchannels()
        sample_width = reader.getsampwidth()
        frame_rate = reader.getframerate()
        comptype = reader.getcomptype()
        compname = reader.getcompname()
        raw_frames = reader.readframes(reader.getnframes())

    if sample_width != 2 or channels <= 0:
        return chunk

    samples = memoryview(raw_frames).cast("h")
    processed = [0] * len(samples)
    if POST_HIGHPASS_HZ > 0 and frame_rate > 0:
        rc = 1.0 / (2 * math.pi * POST_HIGHPASS_HZ)
        dt = 1.0 / frame_rate
        alpha = rc / (rc + dt)
        previous_input = [0.0] * channels
        previous_output = [0.0] * channels
        for index, sample in enumerate(samples):
            channel = index % channels
            current_input = float(sample)
            current_output = alpha * (previous_output[channel] + current_input - previous_input[channel])
            previous_input[channel] = current_input
            previous_output[channel] = current_output
            processed[index] = int(max(-32768, min(32767, round(current_output))))
    else:
        processed = list(samples)

    if POST_NORMALIZE_PEAK > 0:
        peak = max((abs(sample) for sample in processed), default=0)
        if peak > 0:
            target_peak = int(32767 * POST_NORMALIZE_PEAK)
            gain = min(1.35, target_peak / peak)
            if gain > 1.02:
                processed = [
                    int(max(-32768, min(32767, round(sample * gain))))
                    for sample in processed
                ]

    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(channels)
        writer.setsampwidth(sample_width)
        writer.setframerate(frame_rate)
        writer.setcomptype(comptype, compname)
        writer.writeframes(b"".join(int(sample).to_bytes(2, byteorder="little", signed=True) for sample in processed))
    return output.getvalue()


def build_gpt_request_text(text: str, override: Optional[VoiceBackendOverride]) -> str:
    clean = (text or "").strip()
    if not clean:
        return clean
    minimum = override.recommendedTextMinLength if override and override.recommendedTextMinLength else 0
    if minimum and len(clean) < minimum and clean[-1] not in "。！？!?，,；;：:":
        return f"{clean}。"
    return clean


def pick_aux_paths(model: Optional[VoiceModelEntry], override: Optional[VoiceBackendOverride]) -> List[str]:
    if not model or not model.auxPaths:
        return []

    diagnostics = model.diagnostics.auxAudios if model.diagnostics else []
    scored = {item.path: item for item in diagnostics}
    ranked = sorted(
        model.auxPaths,
        key=lambda path: (
            0 if scored.get(path) and scored[path].exists else 1,
            len(scored.get(path).warnings) if scored.get(path) and scored[path].warnings else 0,
            scored.get(path).silenceRatio if scored.get(path) and scored[path].silenceRatio is not None else 1,
            scored.get(path).lowBandRatio if scored.get(path) and scored[path].lowBandRatio is not None else 1,
        ),
    )
    preferred_count = MAX_AUX_REF_COUNT
    if override and override.preferredAuxCount is not None:
        preferred_count = max(0, min(len(ranked), override.preferredAuxCount))
    else:
        preferred_count = min(len(ranked), MAX_AUX_REF_COUNT)
    return ranked[:preferred_count]


async def fetch_remote_audio_with_retry(
    url: str,
    payload: Dict[str, object],
    *,
    segment_index: int,
    max_retries: int = 1,
) -> bytes:
    attempt = 0
    while True:
        try:
            return await asyncio.to_thread(fetch_remote_audio, url, payload)
        except HTTPException as exc:
            if attempt >= max_retries or exc.status_code < 500:
                raise
            attempt += 1
            LOGGER.warning(
                "Segment %s synth failed, retrying (%s/%s): %s",
                segment_index,
                attempt,
                max_retries,
                exc.detail,
            )
            await asyncio.sleep(0.25 * attempt)


def official_gpt_payload(req: VoiceSynthesisRequest, model: Optional[VoiceModelEntry]) -> Dict[str, object]:
    override = get_backend_override(model, "gpt-sovits")
    ref_audio_path = None
    if model and model.refAudioPath:
        ref_audio_path = model.refAudioPath
    elif model and model.auxPaths:
        ref_audio_path = model.auxPaths[0]
    elif model and model.modelPath and model.modelPath.lower().endswith((".wav", ".mp3", ".flac")):
        ref_audio_path = model.modelPath

    if not ref_audio_path:
        raise HTTPException(status_code=400, detail="当前 GPT-SoVITS 模型缺少参考音频 refAudioPath")

    aux_paths = pick_aux_paths(model, override)
    gpt_text = build_gpt_request_text(req.text, override)
    prompt_text = (
        override.promptText
        if override and override.promptText
        else (model.promptText if model and model.promptText else (model.sampleText if model and model.sampleText else gpt_text[:80]))
    )

    return {
        "text": gpt_text,
        "text_lang": "zh",
        "ref_audio_path": ref_audio_path,
        "aux_ref_audio_paths": aux_paths,
        "prompt_lang": (model.promptLang if model and model.promptLang else "zh"),
        "prompt_text": prompt_text,
        "top_k": override.topK if override and override.topK is not None else GPT_TOP_K,
        "top_p": override.topP if override and override.topP is not None else GPT_TOP_P,
        "temperature": override.temperature if override and override.temperature is not None else GPT_TEMPERATURE,
        "text_split_method": GPT_SPLIT_METHOD,
        "batch_size": 1,
        "split_bucket": GPT_SPLIT_BUCKET,
        "speed_factor": req.speed,
        "fragment_interval": override.fragmentInterval if override and override.fragmentInterval is not None else GPT_FRAGMENT_INTERVAL,
        "media_type": "wav",
        "streaming_mode": False,
        "parallel_infer": GPT_PARALLEL_INFER,
        "repetition_penalty": (
            override.repetitionPenalty
            if override and override.repetitionPenalty is not None
            else GPT_REPETITION_PENALTY
        ),
    }


def build_upstream_payload(req: VoiceSynthesisRequest, model: Optional[VoiceModelEntry]) -> Dict[str, object]:
    return {
        "text": req.text,
        "model_id": model.id if model else req.modelId,
        "model_name": model.name if model else None,
        "model_path": model.modelPath if model else None,
        "aux_paths": model.auxPaths if model else [],
        "character": model.character if model else None,
        "voice": req.voice,
        "speed": req.speed,
        "style": req.style,
        "preview": req.preview,
        "upstream_path": model.upstreamPath if model else None,
    }


def resolve_rvc_index_path(model: Optional[VoiceModelEntry]) -> Optional[str]:
    if not model or not model.modelPath:
        return None
    model_path = Path(model.modelPath)
    parent = model_path.parent
    candidates = [
        parent / "feature.index",
        parent / "added.index",
        parent / f"{model_path.stem}.index",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate.resolve())
    return None


async def build_rvc_upstream_payload(req: VoiceSynthesisRequest, model: Optional[VoiceModelEntry]) -> Tuple[Dict[str, object], List[str]]:
    if not model or not model.modelPath:
        raise HTTPException(status_code=503, detail="当前 RVC 模型缺少 modelPath，需先导入训练产物")
    model_path = Path(model.modelPath)
    if not model_path.exists():
        raise HTTPException(status_code=503, detail=f"当前 RVC 模型文件不存在: {model_path}")
    warnings: List[str] = []
    base_audio_mime = "audio/mpeg"
    base_voice = req.voice or RVC_BASE_VOICE

    paired_gpt_model = resolve_character_model(model.character, "gpt-sovits", exclude_id=model.id)
    if paired_gpt_model and GPT_SOVITS_UPSTREAM:
        try:
            base_req = req.model_copy(update={"backend": "gpt-sovits", "modelId": paired_gpt_model.id})
            base_audio, base_warnings = await synthesize_proxy(base_req, paired_gpt_model, "gpt-sovits")
            warnings.extend(base_warnings)
            warnings.append(f"rvc-base:gpt-sovits:{paired_gpt_model.id}")
            base_audio_mime = "audio/wav"
            base_voice = paired_gpt_model.name or base_voice
        except HTTPException as exc:
            LOGGER.warning("RVC base GPT synthesis failed, fallback to edge-tts: %s", exc.detail)
            warnings.append("rvc-base-fallback:edge-tts")
            base_req = req.model_copy(update={"backend": "edge-tts", "voice": base_voice})
            base_audio = await synthesize_edge_tts(base_req, None)
    else:
        base_req = req.model_copy(update={"backend": "edge-tts", "voice": base_voice})
        base_audio = await synthesize_edge_tts(base_req, None)
        warnings.append("rvc-base:edge-tts")

    return {
        "audioBase64": base64.b64encode(base_audio).decode("utf-8"),
        "audioMimeType": base_audio_mime,
        "text": req.text,
        "model_id": model.id if model else req.modelId,
        "model_name": model.name if model else None,
        "model_path": str(model_path),
        "index_path": resolve_rvc_index_path(model),
        "character": model.character if model else None,
        "pitch_shift": 0,
        "index_rate": 0.78,
        "protect": 0.45,
        "filter_radius": 5,
        "rms_mix_rate": 0.72,
        "f0_method": "rmvpe",
        "base_voice": base_voice,
    }, warnings


async def synthesize_proxy(req: VoiceSynthesisRequest, model: Optional[VoiceModelEntry], backend: str) -> Tuple[bytes, List[str]]:
    upstream = ""
    if model and model.upstreamPath:
        upstream = model.upstreamPath
    elif backend == "gpt-sovits":
        upstream = GPT_SOVITS_UPSTREAM
    elif backend == "rvc-compat":
        upstream = RVC_UPSTREAM

    if not upstream:
        raise HTTPException(
            status_code=503,
            detail=f"{backend} 未配置上游服务，请设置对应环境变量或模型 upstreamPath",
        )

    if backend == "gpt-sovits" and upstream.rstrip("/").endswith("/tts"):
        segments = split_long_text(req.text)
        warnings: List[str] = []
        if model and model.diagnostics and model.diagnostics.risk and model.diagnostics.risk != "low":
            warnings.append(f"ref-audio-risk:{model.diagnostics.risk}")
        if len(segments) > 1:
            warnings.append(f"long-text-segmented:{len(segments)}")
        audio_chunks: List[bytes] = []
        pause_durations = [pause_ms_for_segment(segment) for segment in segments[:-1]]
        LOGGER.info(
            "Synthesizing %s segment(s) via GPT-SoVITS, pause_ms=%s",
            len(segments),
            pause_durations,
        )
        for index, segment in enumerate(segments, start=1):
            segment_started = perf_counter()
            payload = official_gpt_payload(req.model_copy(update={"text": segment}), model)
            LOGGER.debug("Segment %s/%s text=%s", index, len(segments), segment[:80])
            audio_chunks.append(
                await fetch_remote_audio_with_retry(
                    upstream,
                    payload,
                    segment_index=index,
                )
            )
            LOGGER.info(
                "Segment %s/%s synthesized in %sms",
                index,
                len(segments),
                int((perf_counter() - segment_started) * 1000),
            )
        return post_process_wav(concat_wav_segments(audio_chunks, pause_durations=pause_durations)), warnings

    if backend == "rvc-compat":
        payload, warnings = await build_rvc_upstream_payload(req, model)
        return await asyncio.to_thread(fetch_remote_audio, upstream, payload), warnings
    payload = build_upstream_payload(req, model)
    return await asyncio.to_thread(fetch_remote_audio, upstream, payload), []


async def synthesize(req: VoiceSynthesisRequest) -> VoiceSynthesisResult:
    start = perf_counter()
    model = resolve_model(req.modelId)
    backend = req.backend or (model.backend if model else DEFAULT_BACKEND)
    warnings: List[str] = []

    if not req.preview and backend == "rvc-compat":
        if not ALLOW_RUNTIME_EXPERIMENTAL_RVC:
            raise HTTPException(status_code=409, detail="当前运行时默认链路禁用 RVC，仅允许 /preview 或显式灰度实验使用")
        if len(req.text.strip()) > RVC_RUNTIME_MAX_CHARS:
            raise HTTPException(status_code=409, detail=f"当前运行时 RVC 仅开放给 {RVC_RUNTIME_MAX_CHARS} 字以内短句")
        warnings.append("runtime-rvc-experimental")

    if backend == "edge-tts":
        audio = await synthesize_edge_tts(req, model)
    elif backend in {"gpt-sovits", "rvc-compat"}:
        audio, warnings = await synthesize_proxy(req, model, backend)
    else:
        raise HTTPException(status_code=400, detail=f"不支持的语音后端: {backend}")

    if not audio:
        raise HTTPException(status_code=502, detail="语音服务未返回有效音频")

    elapsed = int((perf_counter() - start) * 1000)
    return VoiceSynthesisResult(
        success=True,
        backend=backend,
        modelId=model.id if model else req.modelId,
        modelName=model.name if model else None,
        audioBase64=base64.b64encode(audio).decode("utf-8"),
        durationMs=elapsed,
        warnings=warnings,
    )


@app.get("/health")
async def health() -> Dict[str, object]:
    model_summaries = []
    rvc_available, rvc_reason = read_rvc_health()
    for item in catalog.list_models():
        if item.diagnostics:
            model_summaries.append(
                {
                    "id": item.id,
                    "backend": item.backend,
                    "recommendedBackend": item.recommendedBackend,
                    "risk": item.diagnostics.risk,
                    "summary": item.diagnostics.summary,
                }
            )
    return {
        "ok": True,
        "service": "python-voice-service",
        "version": APP_VERSION,
        "defaultBackend": DEFAULT_BACKEND,
        "modelDir": MODEL_DIR,
        "gptTuning": {
            "topK": GPT_TOP_K,
            "topP": GPT_TOP_P,
            "temperature": GPT_TEMPERATURE,
            "repetitionPenalty": GPT_REPETITION_PENALTY,
            "splitMethod": GPT_SPLIT_METHOD,
            "fragmentInterval": GPT_FRAGMENT_INTERVAL,
            "parallelInfer": GPT_PARALLEL_INFER,
            "segmentMaxChars": LOCAL_SEGMENT_MAX_CHARS,
            "segmentSilenceMs": LOCAL_SEGMENT_SILENCE_MS,
            "postHighpassHz": POST_HIGHPASS_HZ,
            "postNormalizePeak": POST_NORMALIZE_PEAK,
            "maxAuxRefCount": MAX_AUX_REF_COUNT,
        },
        "runtimePolicy": {
            "allowExperimentalRvc": ALLOW_RUNTIME_EXPERIMENTAL_RVC,
            "rvcRuntimeMaxChars": RVC_RUNTIME_MAX_CHARS,
            "previewSupportsRvc": True,
        },
        "backends": {
            "gptSovitsUpstream": GPT_SOVITS_UPSTREAM or None,
            "rvcUpstream": RVC_UPSTREAM or None,
            "rvcAvailable": rvc_available,
            "rvcAvailabilityReason": rvc_reason,
        },
        "modelDiagnostics": model_summaries,
    }


@app.get("/backends")
async def backends() -> Dict[str, object]:
    return {"backends": list_backends()}


@app.get("/models")
async def models() -> Dict[str, object]:
    return {"models": [item.model_dump() for item in catalog.list_models()]}


@app.post("/models/rescan")
async def models_rescan() -> Dict[str, object]:
    return {"models": [item.model_dump() for item in catalog.list_models()]}


@app.post("/preview")
async def preview(req: VoiceSynthesisRequest) -> Dict[str, object]:
    request = req.model_copy(update={"preview": True})
    result = await synthesize(request)
    return result.model_dump()


@app.post("/synthesize")
async def synthesize_endpoint(req: VoiceSynthesisRequest) -> Dict[str, object]:
    result = await synthesize(req)
    return result.model_dump()
