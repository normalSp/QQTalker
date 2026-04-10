# Voice A/B Eval

- generatedAt: 2026-04-10T07:13:20.005Z
- baseUrl: http://127.0.0.1:8765
- profile: tafi-rvc

## short-chat / yongchutafi-gpt

- text: 今天状态不错，我们继续把这件事做好。
- output: short-chat__yongchutafi-gpt.mp3
- durationMs: 2049

## short-chat / yongchutafi-rvc-v1

- text: 今天状态不错，我们继续把这件事做好。
- error: yongchutafi-rvc-v1 试听失败

## character-line / yongchutafi-gpt

- text: 先把句子念清楚，再让声线更贴近角色本人。
- output: character-line__yongchutafi-gpt.mp3
- durationMs: 2344

## character-line / yongchutafi-rvc-v1

- text: 先把句子念清楚，再让声线更贴近角色本人。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>

## long-sentence / yongchutafi-gpt

- text: 如果这次训练真的有效，我希望它既能保留角色辨识度，也不会再出现长句只听清几个字的问题。
- output: long-sentence__yongchutafi-gpt.mp3
- durationMs: 4589

## long-sentence / yongchutafi-rvc-v1

- text: 如果这次训练真的有效，我希望它既能保留角色辨识度，也不会再出现长句只听清几个字的问题。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>

## chat-short-01 / yongchutafi-gpt

- text: 等一下喵，我先把这个问题想清楚。
- output: chat-short-01__yongchutafi-gpt.mp3
- durationMs: 1683

## chat-short-01 / yongchutafi-rvc-v1

- text: 等一下喵，我先把这个问题想清楚。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>

## chat-short-02 / yongchutafi-gpt

- text: 你先别急，我陪你一点点排查。
- output: chat-short-02__yongchutafi-gpt.mp3
- durationMs: 1581

## chat-short-02 / yongchutafi-rvc-v1

- text: 你先别急，我陪你一点点排查。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>

## chat-short-03 / yongchutafi-gpt

- text: 这个结果看起来不太对，我们再试一次。
- output: chat-short-03__yongchutafi-gpt.mp3
- durationMs: 1871

## chat-short-03 / yongchutafi-rvc-v1

- text: 这个结果看起来不太对，我们再试一次。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>

## chat-mid-01 / yongchutafi-gpt

- text: 如果你是想让我直接帮你改，那我会先把现状读清楚，再决定是走 GPT 还是实验链路。
- output: chat-mid-01__yongchutafi-gpt.mp3
- durationMs: 3190

## chat-mid-01 / yongchutafi-rvc-v1

- text: 如果你是想让我直接帮你改，那我会先把现状读清楚，再决定是走 GPT 还是实验链路。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>

## chat-mid-02 / yongchutafi-gpt

- text: 这句回复的信息密度比较高，所以更适合清晰一点、停顿更稳一点的播报方式。
- output: chat-mid-02__yongchutafi-gpt.mp3
- durationMs: 3153

## chat-mid-02 / yongchutafi-rvc-v1

- text: 这句回复的信息密度比较高，所以更适合清晰一点、停顿更稳一点的播报方式。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>

## chat-mid-03 / yongchutafi-gpt

- text: 短句如果只是情绪表达，其实可以试着放一点角色感，但前提还是不要把字念糊。
- output: chat-mid-03__yongchutafi-gpt.mp3
- durationMs: 7085

## chat-mid-03 / yongchutafi-rvc-v1

- text: 短句如果只是情绪表达，其实可以试着放一点角色感，但前提还是不要把字念糊。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>

## chat-long-01 / yongchutafi-gpt

- text: 今天的迭代先把默认链路稳定住，确保真实回复不会因为实验模型异常而中断；等清晰度和贴脸度的主观评分都过线之后，再考虑把实验链路放进灰度。
- output: chat-long-01__yongchutafi-gpt.mp3
- durationMs: 6220

## chat-long-01 / yongchutafi-rvc-v1

- text: 今天的迭代先把默认链路稳定住，确保真实回复不会因为实验模型异常而中断；等清晰度和贴脸度的主观评分都过线之后，再考虑把实验链路放进灰度。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>

## chat-long-02 / yongchutafi-gpt

- text: 如果后续要把塔菲语音真正接进 QQTalker 的默认输出，我更建议先把长句、信息密集句和连续追问场景都跑完，再看 RVC 有没有资格进入默认位候选。
- output: chat-long-02__yongchutafi-gpt.mp3
- durationMs: 7364

## chat-long-02 / yongchutafi-rvc-v1

- text: 如果后续要把塔菲语音真正接进 QQTalker 的默认输出，我更建议先把长句、信息密集句和连续追问场景都跑完，再看 RVC 有没有资格进入默认位候选。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>

## chat-expressive-01 / yongchutafi-gpt

- text: 诶，你这个点子好像真的可以喵。
- output: chat-expressive-01__yongchutafi-gpt.mp3
- durationMs: 1921

## chat-expressive-01 / yongchutafi-rvc-v1

- text: 诶，你这个点子好像真的可以喵。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>

## chat-expressive-02 / yongchutafi-gpt

- text: 不行不行，这句听起来还是有点机械，我们得继续调。
- output: chat-expressive-02__yongchutafi-gpt.mp3
- durationMs: 2814

## chat-expressive-02 / yongchutafi-rvc-v1

- text: 不行不行，这句听起来还是有点机械，我们得继续调。
- error: 上游语音服务不可用: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
