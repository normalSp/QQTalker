import io
import json
import sys
import tempfile
import unittest
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import concat_wav_segments, pause_ms_for_segment, post_process_wav, split_long_text, trim_wav_segment_edges  # noqa: E402
from catalog import VoiceCatalog  # noqa: E402


def build_wav(duration_ms: int, sample_rate: int = 32000) -> bytes:
    frame_count = int(sample_rate * duration_ms / 1000)
    silence = b"\x00\x00" * frame_count
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate)
        writer.writeframes(silence)
    return output.getvalue()


def build_tone_wav(
    tone_ms: int,
    *,
    lead_silence_ms: int = 0,
    tail_silence_ms: int = 0,
    sample_rate: int = 32000,
    amplitude: int = 6000,
) -> bytes:
    def pcm_frame(value: int) -> bytes:
        return int(value).to_bytes(2, byteorder="little", signed=True)

    lead_frames = int(sample_rate * lead_silence_ms / 1000)
    tone_frames = int(sample_rate * tone_ms / 1000)
    tail_frames = int(sample_rate * tail_silence_ms / 1000)
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate)
        writer.writeframes(b"\x00\x00" * lead_frames)
        tone = b"".join(pcm_frame(amplitude if index % 2 == 0 else -amplitude) for index in range(tone_frames))
        writer.writeframes(tone)
        writer.writeframes(b"\x00\x00" * tail_frames)
    return output.getvalue()


class VoiceServiceHelpersTest(unittest.TestCase):
    def test_split_long_text_prefers_punctuation(self) -> None:
        text = "第一句稍微长一点，我们继续往下说，把自然停顿留给逗号。第二句也要保持完整，不要硬切。"
        segments = split_long_text(text, max_chars=24)
        self.assertGreater(len(segments), 1)
        self.assertTrue(all(segment.strip() for segment in segments))
        self.assertEqual("".join(segments), text)
        self.assertLessEqual(max(len(segment) for segment in segments), 28)

    def test_pause_ms_for_segment_distinguishes_punctuation(self) -> None:
        strong = pause_ms_for_segment("这样说完。", 90)
        weak = pause_ms_for_segment("这样说完，", 90)
        neutral = pause_ms_for_segment("这样说完", 90)
        self.assertGreater(strong, weak)
        self.assertGreater(weak, neutral)

    def test_concat_wav_segments_accepts_variable_pauses(self) -> None:
        first = build_wav(200)
        second = build_wav(200)
        merged = concat_wav_segments([first, second], pause_durations=[80])
        with wave.open(io.BytesIO(merged), "rb") as reader:
            duration_ms = int(reader.getnframes() * 1000 / reader.getframerate())
        self.assertGreaterEqual(duration_ms, 470)

    def test_trim_wav_segment_edges_removes_excess_padding(self) -> None:
        padded = build_tone_wav(160, lead_silence_ms=140, tail_silence_ms=160)
        trimmed = trim_wav_segment_edges(padded)
        with wave.open(io.BytesIO(trimmed), "rb") as reader:
            duration_ms = int(reader.getnframes() * 1000 / reader.getframerate())
        self.assertLess(duration_ms, 340)
        self.assertGreater(duration_ms, 150)

    def test_post_process_wav_preserves_valid_wav(self) -> None:
        processed = post_process_wav(build_wav(160))
        with wave.open(io.BytesIO(processed), "rb") as reader:
            self.assertEqual(reader.getnchannels(), 1)
            self.assertEqual(reader.getsampwidth(), 2)
            self.assertEqual(reader.getframerate(), 32000)

    def test_voice_catalog_builds_diagnostics_and_overrides(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir) / "dongxuelian"
            model_dir.mkdir(parents=True, exist_ok=True)
            (model_dir / "reference.wav").write_bytes(build_wav(4200))
            (model_dir / "aux-1.wav").write_bytes(build_wav(3500))
            (model_dir / "voice-model.json").write_text(
                json.dumps(
                    {
                        "id": "preset-dongxuelian",
                        "name": "冬雪莲",
                        "backend": "gpt-sovits",
                        "refAudioPath": "./reference.wav",
                        "auxPaths": ["./aux-1.wav"],
                        "recommendedBackend": "gpt-sovits",
                        "backendOverrides": {
                            "gpt-sovits": {
                                "preferredAuxCount": 1,
                                "recommendedTextMinLength": 8,
                            }
                        },
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )

            catalog = VoiceCatalog(temp_dir)
            model = catalog.list_models()[0]

            self.assertEqual(model.recommendedBackend, "gpt-sovits")
            self.assertIn("gpt-sovits", model.backendOverrides)
            self.assertIsNotNone(model.diagnostics)
            self.assertEqual(model.diagnostics.recommendedTextMinLength, 8)
            self.assertTrue(model.diagnostics.refAudio.exists)
            self.assertEqual(len(model.diagnostics.auxAudios), 1)


if __name__ == "__main__":
    unittest.main()
