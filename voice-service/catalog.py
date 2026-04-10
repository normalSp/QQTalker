from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import wave

from models import VoiceAudioDiagnostic, VoiceBackendOverride, VoiceModelDiagnostics, VoiceModelEntry


class VoiceCatalog:
    def __init__(self, model_dir: str) -> None:
        self.model_dir = Path(model_dir).resolve()
        self._audio_diag_cache: Dict[str, Tuple[int, VoiceAudioDiagnostic]] = {}

    def list_models(self) -> List[VoiceModelEntry]:
        merged: Dict[str, VoiceModelEntry] = {}

        for model in self._load_catalog_json():
            merged[model.id] = model

        for model in self._load_meta_files():
            previous = merged.get(model.id)
            if previous:
                merged[model.id] = VoiceModelEntry.model_validate(
                    {
                        **previous.model_dump(),
                        **model.model_dump(exclude_unset=True),
                    }
                )
            else:
                merged[model.id] = model

        return sorted(
            merged.values(),
            key=lambda item: (0 if item.installed else 1, item.name),
        )

    def _load_catalog_json(self) -> List[VoiceModelEntry]:
        catalog_path = self.model_dir / "catalog.json"
        if not catalog_path.exists():
            return []

        try:
            raw = json.loads(catalog_path.read_text("utf-8"))
        except Exception:
            return []

        rows = raw if isinstance(raw, list) else raw.get("models", [])
        return [model for model in (self._normalize(item) for item in rows) if model]

    def _load_meta_files(self) -> List[VoiceModelEntry]:
        if not self.model_dir.exists():
            return []
        rows: List[VoiceModelEntry] = []
        for file_path in self.model_dir.rglob("voice-model.json"):
            try:
                raw = json.loads(file_path.read_text("utf-8"))
            except Exception:
                continue

            model = self._normalize(
                raw,
                base_dir=file_path.parent,
            )
            if model:
                rows.append(model)
        return rows

    def _normalize(self, raw: object, base_dir: Path | None = None) -> VoiceModelEntry | None:
        if not isinstance(raw, dict):
            return None

        required = ("id", "name", "backend")
        if any(key not in raw for key in required):
            return None

        base = base_dir or self.model_dir
        model_path = raw.get("modelPath")
        ref_audio_path = raw.get("refAudioPath")
        aux_paths = raw.get("auxPaths", [])
        alternate_backends = raw.get("alternateBackends", [])
        backend_overrides = raw.get("backendOverrides", {})

        resolved_model_path = str((base / model_path).resolve()) if model_path else None
        resolved_ref_audio_path = str((base / ref_audio_path).resolve()) if ref_audio_path else None
        resolved_aux_paths = [
            str((base / item).resolve()) if not os.path.isabs(item) else item
            for item in aux_paths
            if isinstance(item, str)
        ]

        installed = bool(raw.get("installed"))
        if resolved_model_path:
            installed = Path(resolved_model_path).exists()
        elif resolved_ref_audio_path:
            installed = Path(resolved_ref_audio_path).exists()

        overrides: Dict[str, VoiceBackendOverride] = {}
        if isinstance(backend_overrides, dict):
            for key, value in backend_overrides.items():
                if isinstance(key, str) and isinstance(value, dict):
                    try:
                        overrides[key] = VoiceBackendOverride(**value)
                    except Exception:
                        continue

        diagnostics = self._build_model_diagnostics(
            resolved_ref_audio_path,
            resolved_aux_paths,
            overrides.get(str(raw["backend"])),
        )

        return VoiceModelEntry(
            id=str(raw["id"]),
            name=str(raw["name"]),
            character=str(raw.get("character")) if raw.get("character") is not None else None,
            backend=str(raw["backend"]),
            tags=[str(item) for item in raw.get("tags", [])],
            avatar=str(raw.get("avatar")) if raw.get("avatar") is not None else None,
            sampleText=str(raw.get("sampleText")) if raw.get("sampleText") is not None else None,
            notes=str(raw.get("notes")) if raw.get("notes") is not None else None,
            installed=installed,
            enabled=raw.get("enabled", True) is not False,
            source=str(raw.get("source", "catalog")),
            modelPath=resolved_model_path,
            refAudioPath=resolved_ref_audio_path,
            promptText=str(raw.get("promptText")) if raw.get("promptText") is not None else None,
            promptLang=str(raw.get("promptLang")) if raw.get("promptLang") is not None else None,
            auxPaths=resolved_aux_paths,
            upstreamPath=str(raw.get("upstreamPath")) if raw.get("upstreamPath") is not None else None,
            recommendedBackend=str(raw.get("recommendedBackend")) if raw.get("recommendedBackend") is not None else None,
            alternateBackends=[str(item) for item in alternate_backends if isinstance(item, str)],
            qualityTier=str(raw.get("qualityTier")) if raw.get("qualityTier") is not None else None,
            trainingStatus=str(raw.get("trainingStatus")) if raw.get("trainingStatus") is not None else None,
            previewHint=str(raw.get("previewHint")) if raw.get("previewHint") is not None else None,
            experimental=raw.get("experimental", False) is True,
            backendOverrides=overrides,
            diagnostics=diagnostics,
        )

    def _build_model_diagnostics(
        self,
        ref_audio_path: Optional[str],
        aux_paths: List[str],
        override: Optional[VoiceBackendOverride],
    ) -> Optional[VoiceModelDiagnostics]:
        if not ref_audio_path and not aux_paths:
            return None

        ref_diag = self._inspect_audio(ref_audio_path, "主参考音") if ref_audio_path else None
        aux_diags = [
            self._inspect_audio(path, f"辅助参考音 {index + 1}")
            for index, path in enumerate(aux_paths)
        ]
        warnings = sum(len(item.warnings) for item in ([ref_diag] if ref_diag else []) + aux_diags)
        risk = "low"
        if ref_diag and not ref_diag.exists:
            risk = "high"
        elif warnings >= 5:
            risk = "high"
        elif warnings >= 2:
            risk = "medium"

        summary: List[str] = []
        if ref_diag:
            if ref_diag.exists:
                summary.append(
                    f"主参考音 {ref_diag.durationSec or 0:.1f}s / {ref_diag.sampleRate or 0}Hz / 风险 {len(ref_diag.warnings)}"
                )
            else:
                summary.append("主参考音缺失或无法读取")
        if aux_diags:
            healthy_aux = sum(1 for item in aux_diags if item.exists and not item.warnings)
            summary.append(f"辅助参考音 {healthy_aux}/{len(aux_diags)} 段较稳")
        if override and override.recommendedTextMinLength:
            summary.append(f"推荐文本长度 >= {override.recommendedTextMinLength} 字")

        return VoiceModelDiagnostics(
            summary=summary,
            risk=risk,
            recommendedTextMinLength=override.recommendedTextMinLength if override else None,
            refAudio=ref_diag,
            auxAudios=aux_diags,
        )

    def _inspect_audio(self, file_path: str, label: str) -> VoiceAudioDiagnostic:
        resolved = str(Path(file_path).resolve())
        path_obj = Path(resolved)
        if not path_obj.exists():
            return VoiceAudioDiagnostic(
                path=resolved,
                label=label,
                exists=False,
                warnings=["missing-file"],
                score=0,
            )

        stat = path_obj.stat()
        cache_key = resolved
        cached = self._audio_diag_cache.get(cache_key)
        if cached and cached[0] == stat.st_mtime_ns:
            return cached[1]

        try:
            with wave.open(str(path_obj), "rb") as reader:
                channels = reader.getnchannels()
                sample_width = reader.getsampwidth()
                sample_rate = reader.getframerate()
                frame_count = reader.getnframes()
                raw_frames = reader.readframes(frame_count)
        except Exception:
            diagnostic = VoiceAudioDiagnostic(
                path=resolved,
                label=label,
                exists=True,
                warnings=["unreadable-wav"],
                score=5,
            )
            self._audio_diag_cache[cache_key] = (stat.st_mtime_ns, diagnostic)
            return diagnostic

        duration_sec = round(frame_count / sample_rate, 3) if sample_rate > 0 else None
        warnings: List[str] = []
        if sample_width != 2:
            warnings.append("unsupported-sample-width")
        if duration_sec is not None and duration_sec < 3:
            warnings.append("too-short")
        elif duration_sec is not None and duration_sec > 12:
            warnings.append("too-long")
        if sample_rate not in {32000, 44100, 48000}:
            warnings.append("uncommon-sample-rate")
        if channels != 1:
            warnings.append("not-mono")

        silence_ratio: Optional[float] = None
        low_band_ratio: Optional[float] = None
        peak: Optional[float] = None
        score = float(len(warnings))

        if sample_width == 2 and raw_frames:
            samples = memoryview(raw_frames).cast("h")
            abs_values = [abs(sample) for sample in samples]
            peak = round((max(abs_values) / 32767) if abs_values else 0, 4)
            rms = ((sum(value * value for value in abs_values) / max(len(abs_values), 1)) ** 0.5) if abs_values else 0
            silence_threshold = max(120, int(rms * 0.22))
            silence_ratio = round(
                sum(1 for value in abs_values if value <= silence_threshold) / max(len(abs_values), 1),
                4,
            )

            if sample_rate > 0:
                previous = 0.0
                low_energy = 0.0
                total_energy = 0.0
                alpha = 0.035
                for sample in samples:
                    current = float(sample)
                    previous = previous + alpha * (current - previous)
                    low_energy += previous * previous
                    total_energy += current * current
                low_band_ratio = round(low_energy / total_energy, 4) if total_energy > 0 else 0.0

            if silence_ratio is not None and silence_ratio > 0.42:
                warnings.append("high-silence")
                score += 1.5
            if low_band_ratio is not None and low_band_ratio > 0.5:
                warnings.append("heavy-low-band")
                score += 1.5
            if peak is not None and peak > 0.985:
                warnings.append("possible-clipping")
                score += 1

        diagnostic = VoiceAudioDiagnostic(
            path=resolved,
            label=label,
            exists=True,
            format="wav",
            durationSec=duration_sec,
            sampleRate=sample_rate,
            channels=channels,
            silenceRatio=silence_ratio,
            lowBandRatio=low_band_ratio,
            peak=peak,
            warnings=warnings,
            score=round(score, 2),
        )
        self._audio_diag_cache[cache_key] = (stat.st_mtime_ns, diagnostic)
        return diagnostic
