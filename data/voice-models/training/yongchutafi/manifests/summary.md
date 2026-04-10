# 永雏塔菲 训练工作区摘要

- 角色ID: `yongchutafi`
- 官方主页: https://space.bilibili.com/1265680561
- 直播间: https://live.bilibili.com/22603245
- 数据策略: 在保持当前稳定度的前提下，补充更贴角色的公开闲聊原声和低噪短句，优先保证中短句自然度。

## 公开来源候选

- 永雏塔菲 B 站个人空间
  - 链接: https://space.bilibili.com/1265680561
  - 标签: bilibili / official-space / high
  - 状态: todo
  - 适合作主参考音: 否
  - 适合作辅助参考音: 否
  - 适合作训练集: 是
  - 备注: 优先从杂谈、配音、无重 BGM 的公开视频中切片。
- 永雏塔菲直播间
  - 链接: https://live.bilibili.com/22603245
  - 标签: bilibili / live-room / high
  - 状态: todo
  - 适合作主参考音: 是
  - 适合作辅助参考音: 是
  - 适合作训练集: 是
  - 备注: 适合继续补充自然闲聊、中短句、尾音稳定的样本。
- 【永雏塔菲】好似喵~ 好似喵！！
  - 链接: https://www.bilibili.com/video/BV13S4y1Y7Zr/
  - 标签: bilibili / clip / medium
  - 状态: todo
  - 适合作主参考音: 否
  - 适合作辅助参考音: 是
  - 适合作训练集: 是
  - 备注: 适合做角色口癖和高辨识度短句样本，但不宜作为主参考音。
- 【永雏塔菲】亲自配音《異世界也要灌注永雛塔菲》
  - 链接: https://www.bilibili.com/video/BV1ZJ4m1w7Fq/
  - 标签: bilibili / dub-video / high
  - 状态: todo
  - 适合作主参考音: 是
  - 适合作辅助参考音: 是
  - 适合作训练集: 是
  - 备注: 可能是更高质量的角色化人声来源，值得优先整理。

## 训练版本

- stable-gpt: baseline / gpt-sovits / 当前线上稳定链路，作为冬雪莲修复的对照组。
- exp-rvc: planned / rvc-compat / 待补充公开闲聊和配音原声后训练，用于验证贴脸度是否还能提升。

## 下一步

- 补充 raw/ 与 cleaned/ 中的真实音频素材
- 根据素材质量更新 usableForRef / usableForAux / usableForTrain
- 训练后回填 versions.json 与试听结论

