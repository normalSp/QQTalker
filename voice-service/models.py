from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


BackendId = Literal["gpt-sovits", "rvc-compat", "edge-tts"]


class VoiceAudioDiagnostic(BaseModel):
    path: str
    label: Optional[str] = None
    exists: bool = False
    format: Optional[str] = None
    durationSec: Optional[float] = None
    sampleRate: Optional[int] = None
    channels: Optional[int] = None
    silenceRatio: Optional[float] = None
    lowBandRatio: Optional[float] = None
    peak: Optional[float] = None
    warnings: List[str] = Field(default_factory=list)
    score: Optional[float] = None


class VoiceModelDiagnostics(BaseModel):
    summary: List[str] = Field(default_factory=list)
    risk: Optional[str] = None
    recommendedTextMinLength: Optional[int] = None
    refAudio: Optional[VoiceAudioDiagnostic] = None
    auxAudios: List[VoiceAudioDiagnostic] = Field(default_factory=list)


class VoiceBackendOverride(BaseModel):
    preferredAuxCount: Optional[int] = None
    recommendedTextMinLength: Optional[int] = None
    promptText: Optional[str] = None
    previewText: Optional[str] = None
    topK: Optional[int] = None
    topP: Optional[float] = None
    temperature: Optional[float] = None
    repetitionPenalty: Optional[float] = None
    fragmentInterval: Optional[float] = None
    notes: Optional[str] = None


class VoiceModelEntry(BaseModel):
    id: str
    name: str
    character: Optional[str] = None
    backend: str
    tags: List[str] = Field(default_factory=list)
    avatar: Optional[str] = None
    sampleText: Optional[str] = None
    notes: Optional[str] = None
    installed: bool = False
    enabled: bool = True
    source: str = "catalog"
    modelPath: Optional[str] = None
    refAudioPath: Optional[str] = None
    promptText: Optional[str] = None
    promptLang: Optional[str] = None
    auxPaths: List[str] = Field(default_factory=list)
    upstreamPath: Optional[str] = None
    recommendedBackend: Optional[str] = None
    alternateBackends: List[str] = Field(default_factory=list)
    qualityTier: Optional[str] = None
    trainingStatus: Optional[str] = None
    previewHint: Optional[str] = None
    experimental: bool = False
    backendOverrides: Dict[str, VoiceBackendOverride] = Field(default_factory=dict)
    diagnostics: Optional[VoiceModelDiagnostics] = None


class VoiceSynthesisRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    backend: Optional[str] = None
    modelId: Optional[str] = None
    voice: Optional[str] = None
    speed: float = 1.0
    style: Optional[str] = None
    preview: bool = False


class VoiceSynthesisResult(BaseModel):
    success: bool
    backend: str
    mimeType: str = "audio/mpeg"
    audioBase64: str
    modelId: Optional[str] = None
    modelName: Optional[str] = None
    durationMs: Optional[int] = None
    warnings: List[str] = Field(default_factory=list)
