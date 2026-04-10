from __future__ import annotations

import base64
import io
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Dict, Optional, Tuple

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

APP_VERSION = "0.1.0"
FFMPEG_BIN = os.getenv("RVC_WRAPPER_FFMPEG", "ffmpeg")
DEVICE = os.getenv("RVC_WRAPPER_DEVICE", "cuda:0")

IMPORT_ERROR: Optional[str] = None
RVCInference = None

try:
    from rvc_python.infer import RVCInference as _RVCInference

    RVCInference = _RVCInference
except Exception as exc:  # pragma: no cover - dependency may be unavailable on user machines
    IMPORT_ERROR = str(exc)


class RvcConvertRequest(BaseModel):
    audioBase64: str = Field(min_length=1)
    audioMimeType: str = "audio/mpeg"
    model_path: str = Field(min_length=1)
    index_path: Optional[str] = None
    model_id: Optional[str] = None
    model_name: Optional[str] = None
    character: Optional[str] = None
    text: Optional[str] = None
    base_voice: Optional[str] = None
    pitch_shift: int = 0
    index_rate: float = 0.66
    protect: float = 0.33
    filter_radius: int = 3
    rms_mix_rate: float = 0.25
    f0_method: str = "rmvpe"


app = FastAPI(title="QQTalker RVC Compatible Wrapper", version=APP_VERSION)
_converter = None
_loaded_model: Optional[Tuple[str, Optional[str]]] = None


def ensure_runtime() -> None:
    if IMPORT_ERROR:
        raise HTTPException(
            status_code=503,
            detail=(
                "rvc-python runtime unavailable: "
                + IMPORT_ERROR
                + " ; install missing Python deps and Windows C++ Build Tools, then restart wrapper."
            ),
        )


def get_converter():
    global _converter
    ensure_runtime()
    if _converter is None:
        _converter = RVCInference(device=DEVICE)
    return _converter


def ensure_model_loaded(model_path: str, index_path: Optional[str]) -> object:
    global _loaded_model
    converter = get_converter()
    resolved = (str(Path(model_path).resolve()), str(Path(index_path).resolve()) if index_path else None)
    if _loaded_model == resolved:
        return converter
    converter.load_model(resolved[0], index_path=resolved[1] or "")
    _loaded_model = resolved
    return converter


def decode_to_wav(input_bytes: bytes, suffix: str) -> bytes:
    if suffix == ".wav":
        try:
            with wave.open(io.BytesIO(input_bytes), "rb"):
                return input_bytes
        except Exception:
            pass
    with tempfile.TemporaryDirectory(prefix="qqtalker-rvc-") as tmp_dir:
        raw_path = Path(tmp_dir) / f"input{suffix}"
        wav_path = Path(tmp_dir) / "input.wav"
        raw_path.write_bytes(input_bytes)
        result = subprocess.run(
            [
                FFMPEG_BIN,
                "-y",
                "-i",
                str(raw_path),
                "-ac",
                "1",
                "-ar",
                "32000",
                str(wav_path),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not wav_path.exists():
            raise HTTPException(status_code=502, detail=f"ffmpeg decode failed: {result.stderr.strip() or result.stdout.strip()}")
        return wav_path.read_bytes()


def convert_with_rvc(req: RvcConvertRequest) -> bytes:
    converter = ensure_model_loaded(req.model_path, req.index_path)
    input_bytes = base64.b64decode(req.audioBase64)
    suffix = ".mp3" if "mpeg" in (req.audioMimeType or "") else ".wav"
    wav_bytes = decode_to_wav(input_bytes, suffix)

    with tempfile.TemporaryDirectory(prefix="qqtalker-rvc-") as tmp_dir:
        input_path = Path(tmp_dir) / "input.wav"
        output_path = Path(tmp_dir) / "output.wav"
        input_path.write_bytes(wav_bytes)
        if hasattr(converter, "set_params"):
            converter.set_params(
                index_rate=req.index_rate,
                filter_radius=req.filter_radius,
                rms_mix_rate=req.rms_mix_rate,
                protect=req.protect,
                f0up_key=req.pitch_shift,
                f0method=req.f0_method,
            )
        if hasattr(converter, "infer_file"):
            converter.infer_file(str(input_path), str(output_path))
        else:
            raise HTTPException(status_code=503, detail="rvc-python API shape unsupported: missing infer_file")
        if not output_path.exists():
            raise HTTPException(status_code=502, detail="rvc-python did not produce output.wav")
        return output_path.read_bytes()


@app.get("/health")
async def health() -> Dict[str, object]:
    return {
        "ok": IMPORT_ERROR is None,
        "service": "qqtalker-rvc-compat-wrapper",
        "version": APP_VERSION,
        "device": DEVICE,
        "importError": IMPORT_ERROR,
        "loadedModel": _loaded_model[0] if _loaded_model else None,
    }


@app.post("/convert")
async def convert(req: RvcConvertRequest):
    try:
        audio = convert_with_rvc(req)
        return {
            "success": True,
            "audioBase64": base64.b64encode(audio).decode("utf-8"),
            "mimeType": "audio/wav",
            "modelId": req.model_id,
            "modelName": req.model_name,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"rvc convert failed: {exc}") from exc
