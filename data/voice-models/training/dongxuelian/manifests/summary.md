# 冬雪莲 训练工作区摘要

- 角色ID: `dongxuelian`
- 官方主页: https://space.bilibili.com/1437582453
- 直播间: https://live.bilibili.com/22816111
- 数据策略: 优先补充清晰普通叙述和轻情绪闲聊原声，避免只用歌回和高混响片段。

## 公开来源候选

- 東雪蓮 B 站个人空间
  - 链接: https://space.bilibili.com/1437582453
  - 标签: bilibili / official-space / high
  - 状态: todo
  - 适合作主参考音: 否
  - 适合作辅助参考音: 否
  - 适合作训练集: 是
  - 备注: 优先从非纯歌回、低混响的日常说话视频中切语音。
- 東雪蓮直播间
  - 链接: https://live.bilibili.com/22816111
  - 标签: bilibili / live-room / high
  - 状态: todo
  - 适合作主参考音: 是
  - 适合作辅助参考音: 是
  - 适合作训练集: 是
  - 备注: 重点寻找 6~15 秒低噪闲聊段，作为 ref/aux 候选。
- 【東雪蓮】偷拍我线下m3塔照倒卖20一份再给我打米？你是懂可循环利用的
  - 链接: https://www.bilibili.com/video/BV1UC411L72U/
  - 标签: bilibili / clip / high
  - 状态: todo
  - 适合作主参考音: 是
  - 适合作辅助参考音: 是
  - 适合作训练集: 是
  - 备注: 偏杂谈与日常说话，优先切 5~10 秒低混响、无明显观众叠声片段。
- 【東雪蓮】【蓮歌】Just Love (feat. PSYQUI)
  - 链接: https://www.bilibili.com/video/BV1Vr4y1r7aA/
  - 标签: bilibili / song-live-clip / medium
  - 状态: todo
  - 适合作主参考音: 否
  - 适合作辅助参考音: 否
  - 适合作训练集: 否
  - 备注: 歌回片段混响和伴奏较重，不适合作清晰度修复训练。
- 《Cry For Me（feat. Ami）》东雪莲 纯享版
  - 链接: https://www.bilibili.com/video/av113622504183606/
  - 标签: bilibili / song-video / low
  - 状态: todo
  - 适合作主参考音: 否
  - 适合作辅助参考音: 否
  - 适合作训练集: 否
  - 备注: 保留作角色声线参考，不直接进入清晰语音数据集。

## 训练版本

- stable-gpt: baseline / gpt-sovits / 当前线上稳定链路，优先修复可懂度。
- exp-rvc: planned / rvc-compat / 待补充公开闲聊原声后训练，用于 A/B 对比清晰度与贴脸度。

## 下一步

- 补充 raw/ 与 cleaned/ 中的真实音频素材
- 根据素材质量更新 usableForRef / usableForAux / usableForTrain
- 训练后回填 versions.json 与试听结论

