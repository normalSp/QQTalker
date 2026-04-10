# Voice A/B Eval

- generatedAt: 2026-04-09T17:31:30.458Z
- baseUrl: http://127.0.0.1:8765

## short-chat / yongchutafi-gpt

- text: 今天状态不错，我们继续把这件事做好。
- error: 上游语音服务不可用: HTTP Error 400: Bad Request | body={"message":"tts failed","Exception":"[Errno 22] Invalid argument"}

## short-chat / yongchutafi-rvc

- text: 今天状态不错，我们继续把这件事做好。
- error: 上游语音服务不可用: HTTP Error 500: Internal Server Error | body={"detail":"rvc convert failed: 'config'"}

## character-line / yongchutafi-gpt

- text: 先把句子念清楚，再让声线更贴近角色本人。
- error: 上游语音服务不可用: HTTP Error 400: Bad Request | body={"message":"tts failed","Exception":"[Errno 22] Invalid argument"}

## character-line / yongchutafi-rvc

- text: 先把句子念清楚，再让声线更贴近角色本人。
- error: 上游语音服务不可用: HTTP Error 500: Internal Server Error | body={"detail":"rvc convert failed: 'config'"}

## long-sentence / yongchutafi-gpt

- text: 如果这次训练真的有效，我希望它既能保留角色辨识度，也不会再出现长句只听清几个字的问题。
- error: 上游语音服务不可用: HTTP Error 400: Bad Request | body={"message":"tts failed","Exception":"[Errno 22] Invalid argument"}

## long-sentence / yongchutafi-rvc

- text: 如果这次训练真的有效，我希望它既能保留角色辨识度，也不会再出现长句只听清几个字的问题。
- error: 上游语音服务不可用: HTTP Error 500: Internal Server Error | body={"detail":"rvc convert failed: 'config'"}
