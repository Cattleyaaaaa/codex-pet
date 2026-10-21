# 抠图质量复查（2026-10-21）

> 本文原为本地质检记录（`work/matte-audit/REPORT.md`），发布时整理进仓库。文中提到的产物路径均在本地 `work/` 目录，不入库。


对象：`assets/animations/*.webm`（当时 85 段，640×576；现已扩充到 87 段）以及对应的
`assets/animations-original/*.webm`（800×720 master）。

## 一、检查方法

- 解码：必须 `-c:v libvpx-vp9`，否则 FFmpeg 原生 vp9 解码器丢 WebM 的 alpha 通道。
- 静态指标（每段抽 9 帧，`work/matte-audit/audit.py`）：
  `green`(绿残留) / `green_edge`(边缘绿残留) / `dark`(暗边) / `white`(亮边) /
  `ghost`(半透明雾) / `holes`(被轮廓包住的透明区) / `touch`(贴边裁切) / `speck`(碎点) / `edge`(软边占比)
- 时序指标（6 fps，`temporal-audit.py`）：覆盖率抖动、孔洞抖动、连通域碎裂。
- 目视：3 倍放大的“最软边缘”瓦片（`edge-sheets/`）、1:1 桌面尺度渲染、源 MP4 与抠图结果同点对比（`src/`）。

## 二、总体结论

1. **绿幕没有残留**：85 段的 `green` 和 `green_edge` 全部为 0.0000，despill 正常工作，不存在“绿边/绿雾”。
2. **时序稳定**：覆盖率抖动 ≤ 3%（只在 idle-bow 这种鞠躬动作上出现），没有闪洞、没有碎裂。
3. 实际能看出来的瑕疵是三类：
   - **A 暗边/灰晕**：描边外侧 2–4 px 的灰带（feather 0.55 + despill 8 的产物）。深色壁纸上看不见，浅色背景下像脏描边。
   - **B 亮边**：compact 重编码产生的浅色边缘像素，640 集是 800 master 的 **6.5 倍**。
   - **C 边缘发虚/块状**：640 宽 + CRF 40 + straight-alpha 直接缩放，软边占比从 3.4% 涨到 4.1%。
4. **问题高度集中**：11 段 10 秒新片段的暗边均值 **0.00348**，老片段 74 段是 **0.00113**（3.1 倍）；
   亮边 3–6 倍。这批源本来就是 1280×720、描边更重、投影更明显，800 master 上已经是 3 倍暗边，
   所以**不是 compact 转码造成的，是 key/源本身的问题**。

## 三、名单

### A 档：优先重做（10 秒新片段，暗边/亮边都超基线）

| # | key | 中文名 | 暗边 | 亮边 | 软边(640/800) |
|---|-----|--------|------|------|----------------|
| 1 | done-thumbs-up | 竖起大拇指 | 4.66 | 4.10 | 4.1 / 3.4 |
| 2 | idle-peace-sign | 比个耶 | 4.89 | 2.80 | 4.0 / 3.3 |
| 3 | idle-forehead-touch | 扶一下额头 | 4.66 | 3.30 | 4.1 / 3.3 |
| 4 | idle-hair-tuck | 撩一下头发 | 4.70 | 2.70 | 4.1 / 3.3 |
| 5 | idle-clasp-laugh | 合手开心 | 3.68 | 6.30 | 4.2 / 3.4 |
| 6 | hello-small-wave | 轻轻挥手 | 4.08 | 3.50 | 4.2 / 3.4 |
| 7 | idle-shy-tilt | 歪头害羞 | 4.10 | 2.60 | 4.1 / 3.3 |
| 8 | done-open-arms | 张开双手 | 3.28 | 3.10 | 4.3 / 3.4 |

（暗边/亮边为“可见像素占比 ×1000/×10000”，越大越脏；软边为 30≤alpha<235 的像素占比 %。）

### B 档：略高于基线，可顺手一起修

| key | 中文名 | 暗边 | 备注 |
|-----|--------|------|------|
| idle-clasp-hope | 合手期待 | 1.67 | 10 秒批次 |
| idle-stretch | 伸个懒腰 | 1.55 | 10 秒批次 |
| hello-both-hands | 双手打招呼 | 1.05 | 10 秒批次 |
| waiting-reassure-gesture | 抬手安慰 | 2.44 | 老片段里最高 |
| waiting-small-gesture | 轻轻示意 | 2.38 | 老片段 |
| done-quiet-cheer | 安静庆祝 | 2.37 | 老片段 |
| run-loop | 原地小跑 | 0.40(暗)/4.0(亮) | 亮边最高的一档，且贴边 21 px |

### C 档：腿间/裙下有灰褐投影残影（需遮罩手修，指标不敏感）

`error-surprised`(吓一跳)、`idle-bow`(鞠躬道谢，腿间偏绿)、`idle-doze`(困困的)、
`idle-lookaround-loop`(左右看看)、`idle-hair-fix`(整理头发)、`hello-small-wave`(轻轻挥手)。

### 说明

`idle-laugh`（忍不住笑）在指标上属于**最干净的一档**（暗边 0.0007、绿残留 0、无孔洞）。
如果它的观感仍然差，问题不在“抠得干不干净”，而在**描边风格**：这版角色是高对比黑色线稿，
640/CRF40 之后黑线会糊成灰边，小尺寸下看起来像“贴纸边缘”。这属于 C 类（清晰度），
需要提高编码质量或直接用 800 master。

## 四、修复建议（按性价比）

1. **只把这 11 段换回 800×720 master**：亮边降到 1/6.5、软边降 21%。体积 0.79 MB → 3.66 MB/段，
   只影响这 11 段，总增量约 +30 MB。脚本已有：`scripts/switch-animation-set.ps1` 保留的
   `assets/animations-original` 就是全套 800 master。
2. **重新 key 这 11 段**：`--feather 0.25`、`--erode 2`、`--relative-low 0.012`、`--despill 4`，
   预计暗边降 40–50%，同时别把手指/发丝切掉（抽 3 段验证后再全量）。
3. **重编码改预乘 alpha**：`format=rgba,premultiply=inplace=1` → scale → `premultiply=inverse`，
   或把 CRF 40 提到 28；可直接消掉 B 类亮边。
4. **C 类逐段手修**：腿间的灰褐投影是绿幕上的地面投影，`shadow-strip` 只去底部 10%，
   夹在两条腿中间的去不掉，需要按段生成遮罩抹掉。

## 五、产物

- 名单数据：`work/matte-audit/ranking-10s.json`、`ranking.txt`
- 指标：`metrics.json`（640 集）、`metrics-original.json`（800 master）、`temporal.json`、`pinholes.json`、`mud.json`
- 证据图：`work/matte-audit/evidence/matte-listing.png`（8 段最差 + 3 倍边缘放大）
- 边缘瓦片：`work/matte-audit/edge-sheets/edge-light-1..6.png`（全部 85 段）
- 源对比：`work/matte-audit/src/s-*.png`（绿幕源 vs 抠图结果，同一点位）

## 六、已执行的修复（2026-10-21）

修的是 17 段：A/B 档 11 段 10 秒片段 + C 档 6 段。原始绿幕 MP4 全在
`assets/animations-original/<key>.mp4`（1280×720 / 24fps / 10.08s 或 4.04s），所以是重抠，不是重新生成。

**重抠参数**（`scripts/key-green-video.py`）：
`--feather 0.2 --erode 1 --relative-low 0.012 --relative-high 0.05 --min-green 34 --despill 4 --min-area 120`
C 档 6 段另外加 `--shadow-strip 0.24`（原来 0.10，腿间的地面投影去不掉；紫色鞋底有保护，不会被吃掉）。

**640 线上版**改用新脚本 `scripts/compact-premultiplied.py`（CRF 36）：
先按 alpha 预乘再缩放到 640，最后还原直通 alpha。原来的 `scale` 直接缩直通 alpha，
会把透明像素的 RGB 平均进轮廓，这正是“亮边 6.5 倍 + 灰边”的来源。实测同一段 800 源：
直通缩放暗边 0.0033，预乘缩放 0.0006（5.5 倍差距）。

**结果（17 段合计）**

| 指标 | 修复前（640 线上） | 修复后（640 线上） | 修复后（800 母版） |
|---|---|---|---|
| 暗边 dark | 0.0033–0.0049 | 0.0006–0.0023 | 0.0003–0.0011 |
| 亮边 white | 0.0003–0.0006 | 0.0000–0.0002 | 0.0000 |
| 软边 edge | 0.041 | 0.024–0.036 | 0.005–0.011 |
| 绿残留 green | 0 | 0 | 0 |
| 体积 | 21.7 MB | 24.8 MB（+3.1 MB） | — |

C 档 6 段的地面投影（鞋底周围那层灰绿色膜）已经消失，鞋底、鞋带边缘完好，没被 shadow-strip 吃掉。

**改动清单**

- `assets/animations/<17 个>.webm`（640×576，替换）
- `assets/animations-original/<17 个>.webm`（800×720，替换）
- 两个目录的 `manifest.json`（用 `scripts/package-animations.ps1 -ManifestOnly` 重新生成）

**回滚**：`work/matte-audit/backup-2026-10-21/` 里是这 17 段改动前的原文件
（`animations/` 与 `animations-original/`），拷回去再跑一次 `-ManifestOnly` 即可。

**证据**：`work/matte-audit/evidence/final-before-after.png`（头顶发卷 6 倍放大，前/后）、
`work/matte-audit/evidence/feet-after.png`（C 档鞋底与地面投影，前/后）、
`work/matte-audit/evidence/rekey-before-after.png`（试点三段的整图 + 3 倍边缘）。

## 七、色彩对齐（2026-10-21）

起因是「扶一下额头」看着颜色不对。查下来**跟抠图、转码都无关**：

- `work/matte-audit/tone-check.py`：同一点位 RGB，当前 640 / 旧 640 / 当前 800 / 旧 800 / 绿幕源 mp4
  五者相差 < 2/255。
- `work/matte-audit/forehead-hand.py` + `source-sat.py`：手、脸、翅膀区域在源 MP4 上和抠图后数值一致；
  手部 alpha 最小 255，没被抠掉。
- 真正的原因是**这批 10 秒片段的源视频本身就是更艳更暗的画风**：同区域饱和度 +18%，
  品红像素面积是老片段的 6–7 倍，脸/裙亮度低 ~20。全库普查（`color-census.py` → `color-stats.json`）
  显示饱和度中位数 39.2，而这批在 43–46。

**处理**：新脚本 `scripts/color-match-animations.py`，按每段实测值自适应回正，
不套一个死系数 —— `sat_gain = clamp(39.2 / 段饱和, 0.80, 1.00)`、`v_gain = clamp(197.8 / 段亮度, 0.98, 1.05)`，
只在 HSV 上改 S/V，H 与 alpha 不动，编码参数与重抠脚本完全一致（libvpx-vp9 / yuva420p / CRF 18），
之后再用 `scripts/compact-premultiplied.py --crf 36` 出 640。饱和度已经在目标 ±3% 以内的片段直接跳过，
不做无谓的二次编码（hello-both-hands、idle-clasp-hope、idle-stretch 三段就没动）。

**结果（8 段）**

| 片段 | 改前 S / V / 品红占比 | 改后 S / V / 品红占比 |
|---|---|---|
| done-open-arms 张开双手 | 43.7 / 196.0 / 0.160 | 40.0 / 194.0 / 0.121 |
| done-thumbs-up 竖起大拇指 | 45.0 / 198.6 / 0.158 | 39.6 / 196.7 / 0.112 |
| hello-small-wave 轻轻挥手 | 43.6 / 196.6 / 0.146 | 40.1 / 194.7 / 0.114 |
| idle-clasp-laugh 合手开心 | 43.7 / 182.7 / 0.142 | 39.0 / 190.4 / 0.102 |
| idle-forehead-touch 扶一下额头 | 44.4 / 196.4 / 0.152 | 39.3 / 194.5 / 0.107 |
| idle-hair-tuck 撩一下头发 | 45.4 / 196.1 / 0.158 | 39.8 / 195.2 / 0.110 |
| idle-peace-sign 比个耶 | 43.4 / 196.5 / 0.143 | 39.8 / 195.6 / 0.114 |
| idle-shy-tilt 歪头害羞 | 44.8 / 197.4 / 0.153 | 39.7 / 196.6 / 0.110 |

调色后重新审计，抠图质量没有退化（`metrics-colormatch.json`）：
dark 0.0016–0.0026、white 0、edge 0.027–0.029、green 0、无孔洞异常。

**回滚**：`work/matte-audit/backup-color-2026-10-21/` 是这 8 段调色前的 640 与 800 原文件。

**证据**：`work/matte-audit/evidence/color-match-result.png`（8 段 × 改前/改后/老批次参考三列）、
`work/matte-audit/evidence/color-match-preview.png`（最初 ×0.85/×1.05 的试算）、
`work/matte-audit/evidence/forehead-color.png`、`forehead-timeline.png`（颜色问题的排查过程）。
