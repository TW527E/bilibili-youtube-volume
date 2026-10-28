# Bilibili YouTube 样式音量条

[繁體中文](https://github.com/TW527E/bilibili-youtube-volume/blob/main/README.md) · **简体中文** · [English](https://github.com/TW527E/bilibili-youtube-volume/blob/main/README.en.md)

将 Bilibili 音量控制移到左侧，鼠标移入时向右展开水平音量条，并提供滚轮与触控板双指无级调整、细致的低音量控制与可选的音量平衡。

**当前版本：1.4.0** · [安装脚本](https://raw.githubusercontent.com/TW527E/bilibili-youtube-volume/main/bilibili-youtube-volume.user.js) · [反馈问题](https://github.com/TW527E/bilibili-youtube-volume/issues)

## 安装与更新

也可从 [GreasyFork](https://greasyfork.org/scripts/602247) 安装。GreasyFork 已设置从本仓库的 `main` 分支定时自动同步脚本与说明；更新不一定在推送后立即出现。请选择一个来源安装，避免重复启用。

1. 在桌面浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 或兼容的用户脚本管理器。
2. 点击上方“安装脚本”，在管理器中确认安装。
3. 刷新 Bilibili 视频页面。

如果安装链接只显示源代码，可以在管理器中创建新脚本，粘贴文件全文并保存。已使用试用版的用户，请更新原来的同名脚本，避免同时启用多份。GitHub 发布版包含更新地址，后续可由管理器检查更新。

## 操作

| 操作 | 效果 |
| --- | --- |
| 鼠标移到左侧音量图标 | 在播放按钮后、时间前，向右展开 108px 音量条 |
| 拖动音量条 | 使用三次方听感近似刻度；50% 刻度对应 12.5% 媒体增益 |
| 在音量图标或音量条上双指滑动／滚动 | 向右／向上增加、向左／向下减少；按位移量连续调整 |
| 点击音量图标 | 静音／恢复，保留细微的低音量设置 |
| 键盘聚焦音量条 | 使用原生滑块的方向键、Home、End 操作 |

双指滑动会保留小数位移，滑块与音量可连续变化，不会每个事件都跳 5%。相同的总移动距离，即使拆成很多微小事件，调整幅度仍一致。滑动方向以浏览器报告的方向为准，会受自然滚动设置影响。

调整音量时不会滚动页面；Ctrl 与 Shift 组合手势不会被拦截。静音时向增加方向滑动，从 0 按位移量增加；向减少方向滑动不会取消静音。

该刻度不是实时音频波形，也不是实际声压测量。

## 音量平衡

播放器设置首页的“**音量平衡**”开关只切换当前视频。在“更多播放设置”→“**開啟音量平衡**”中选择默认范围。下表保留脚本实际显示的繁体中文选项：

| 选项 | 行为 |
| --- | --- |
| 所有視頻 | 所有分区默认开启 |
| 除了音樂分區 | **初始默认**：音乐关闭，其余分区开启；分区未知时先关闭 |
| 關閉 | 所有分区默认关闭 |

默认范围保存在 Bilibili 网站的 localStorage 中。单个视频的开关只保留在本次页面中；更改默认范围会清除本页的单片覆盖并立即应用。分区未知或音乐视频仍可手动开启。

开关与选项沿用播放器 BUI 的 CSS 结构和主题变量，跟随兼容主题的配色；功能逻辑由脚本管理。播放器菜单的自定义文字目前使用繁体中文。

### 处理方式

音频在本机的 AudioWorklet 中处理：短时 RMS 自动增益、双声道联动压缩，然后限制采样峰值。手动音量仍控制最终输出。

- 目标约 −12 dBFS RMS，向上增益最多约 +12 dB。
- 低于约 −40 dBFS 的信号不持续追增益，减少放大底噪。
- 高于约 −6 dBFS 的峰值采用 4:1 压缩；最终采样幅度上限为 0.98，再应用手动音量。
- 切换时短暂淡入／淡出；关闭后回到未处理信号。

这是稳定音量的近似实现，**不是 YouTube 的专有 Stable Volume 算法**，也不是 LUFS 归一化或 true-peak 限制器。突发峰值触及硬限制时仍可能失真。

## 兼容性与隐私

- 主要支持桌面 Bilibili 的 BPX／HTML video 播放器，包括繁体中文视频网址。网址匹配规则不代表所有播放器类型都受支持。
- 已在 Chromium 类浏览器验证音量控制、滚轮、设置与主题变量；用户已完成实际环境审核。Firefox、直播、番剧、BWP 特殊播放器、多声道内容及所有第三方音效组合尚未完整验证。
- 无法安全接入音频时会显示“無法啟用”；处理器出错时尝试恢复直接输出。其他音效脚本较早接管音源时，可能需要刷新页面。
- 音频不会上传，不使用麦克风，没有分析追踪。页面缺少分区数据时，会向 Bilibili 公开视频信息 API 查询当前 BV 号。
- 脚本不包含剧场模式、深色模式或自动关灯功能。停用后刷新页面，即可移除音频路由与界面修改。

## 开发与测试

无需构建、安装软件包或引入外部 JavaScript 依赖。使用 Node.js 执行：

```sh
node --check bilibili-youtube-volume.user.js
node tests/audio.test.cjs
```

浏览器检查方式见 [tests/README.md](https://github.com/TW527E/bilibili-youtube-volume/blob/main/tests/README.md)。测试包含音量刻度、滚轮、静音、音频路由、分区默认设置、设置重建及主题配色。合成音频检查不等同于实际听感校准。

## 参考与许可

本项目为独立实现。音量平衡调校曾参考用户提供的 [Bilibili 视频音量均衡器](https://greasyfork.org/scripts/557295)（Timothy Tao & Github Copilot，MIT）进行行为比较；没有直接合并该脚本。

[MIT License](https://github.com/TW527E/bilibili-youtube-volume/blob/main/LICENSE) · 与 Bilibili、YouTube 无隶属关系。
