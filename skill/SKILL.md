---
name: qiqi-list
description: 柒柒清单——贴在 Windows 桌面上的置顶便签清单（左待办、右已完成、拖一下换状态）的安装与日常打理。当用户要装/打开这个桌面清单，要加待办、勾完成、改优先级或截止日、清空已完成、查看今天还剩什么事，或者要把一批选题/任务灌进清单时使用。
---

# 柒柒清单

一个 Windows 桌面小工具：无边框、默认置顶、可以拖到屏幕任何角落、随时拉大拉小。左边待办右边已完成，拖过去就算做完。数据存在本机，不联网、不登录。

这个 Skill 管两件事：**把它装到用户机器上**，以及**替用户打理清单里的内容**。前者只需要一次，后者是日常。

项目主页与下载：https://github.com/ludy5230/qiqi-list

## 先确认能不能动数据

在操作清单之前，先跑一次读取，确认程序装在哪里、数据文件在哪：

```bash
node scripts/kanban.js path
```

- 输出一个 `...\data\kanban.json` 的路径 → 已装好，可以直接读写。
- 提示「没找到清单数据文件」→ 还没装，走下面的安装流程。

数据文件是 JSON，人眼可读。应用开着的时候改它，窗口会在 0.3 秒内自动同步，**不需要重启、不需要让用户手动刷新**。改完直接告诉用户「已经加好了，看一眼窗口就行」。

## 安装

```bash
node scripts/install.js           # 装好但先不启动
node scripts/install.js --launch  # 装好并启动
node scripts/install.js --dir "D:\Apps\QiqiList"   # 指定安装位置
```

脚本会：查询 GitHub 最新发行版 → 下载便携版 exe（约 110MB，要一两分钟）→ 放到 D 盘（没有 D 盘就放用户目录）的 `QiqiList` 文件夹 → 建桌面快捷方式 → 把路径记到 `~/.workbuddy/qiqi-list.json`。

已经装过时它只报告路径，不会重复下载。

**下载前先告诉用户要下 110MB**，让人有个预期；下载过程中不要反复追问，等它跑完。

装完提醒用户：以后双击桌面上的「柒柒清单」就能用；程序和数据都在同一个文件夹里，整个文件夹拷走就能搬到别的电脑。

## 看清单

```bash
node scripts/kanban.js list     # 待办按「急/本周/普通」分组，附已完成
node scripts/kanban.js today    # 今天到期、已逾期、未来 7 天、其它「急」的事
```

`list` 的输出每条都带 `#id`。跟用户复述时不要念 id，除非需要精确指认某一条。

用户问「我今天该干什么」「有什么快到期了」时用 `today`，不要用 `list` 全量倒出来。

## 改清单

```bash
node scripts/kanban.js add "买电池" --prio high --due 2026-11-28 --note "超市那种"
node scripts/kanban.js add-bulk              # 从标准输入按行批量加
node scripts/kanban.js done "买电池"
node scripts/kanban.js undone "买电池"
node scripts/kanban.js prio "买电池" mid      # high / mid / none
node scripts/kanban.js due "买电池" 2026-12-01
node scripts/kanban.js due "买电池" none      # 清掉截止日
node scripts/kanban.js note "买电池" "要南孚的"
node scripts/kanban.js rm "买电池"
node scripts/kanban.js clear-done
```

**指认某一条**：优先用 `#id`，其次用原文（完全匹配优先），再其次用一段能唯一命中的文字。命中多条时脚本会列出候选并以退出码 2 结束——这时把候选项报给用户，让他挑，**不要自己猜**。

**批量灌入**（比如用户给一段选题清单、一列会议任务）：

```bash
printf '%s\n' "线锯拉锯成本对比" "五里桥" "深井老路开场" | node scripts/kanban.js add-bulk
```

批量添加前先把解析出来的条目念一遍让用户确认，尤其是从长文里抽出来的。

## 动手时的分寸

- **删除必须二次确认**。`rm` 和 `clear-done` 都是不可恢复的，先说清楚要删哪几条、几条，等用户明确同意再执行。
- **改优先级、改截止日可以直接做**，这类操作随时能改回来。但一次要改五条以上，先报个清单。
- 用户说「都做完了」「上周那些清掉」这类模糊指令时，先用 `list` 查清楚具体是哪几条，报给他确认，别凭印象批量勾选。
- 不要在用户没有要求时主动整理、重排、改优先级。清单是他的，不是你的。

## 数据在哪

| 内容 | 位置 |
| --- | --- |
| 清单条目 | `<安装目录>\data\kanban.json` |
| 窗口位置、大小、是否置顶 | `<安装目录>\data\window.json` |
| 安装路径记录（本 Skill 用） | `~/.workbuddy/qiqi-list.json` |

数据只在本机。用户换电脑时，把整个安装目录拷走就行，或者用 `node scripts/kanban.js export` 导出一份 JSON 到桌面。

## 排错

- **找不到数据文件**：确认装没装（`install.js` 会报路径）。装过但提示不存在，可能是还没启动过一次——应用首次启动才会生成 `kanban.json`，让用户先双击打开一次。
- **改了但窗口没变**：先确认应用真的开着。窗口关掉时写文件当然看不到变化，下次启动会读到新内容。如果开着还没变，看文件是不是被别的程序锁住了。
- **下载失败**：GitHub 在国内偶尔连不上。让用户直接用浏览器打开 https://github.com/ludy5230/qiqi-list/releases/latest 手动下载，然后 `install.js --dir` 指定一个已有该 exe 的目录，脚本会识别并接管。

## 关于协议

个人使用免费，禁止商业用途。帮用户装、帮用户管都没问题；但如果用户想拿它去卖、或者改成自己的产品发布，先说明这是不允许的，并把 LICENSE 指给他看。
