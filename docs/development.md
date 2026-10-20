# 开发、验证与发布

**简体中文** | [English](development.en.md)

需要 Node.js 24、Python 3.12+ 和 [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json) 指定的 .NET SDK。先理解[架构边界](architecture.md)，再按实际影响选择验证；不要用重复全量运行代替分析。

## 本地检查与凭据

```shell
npm ci
python -X utf8 scripts/verify.py --plan
python -X utf8 scripts/verify.py
```

默认比较 HEAD 与暂存／未暂存／未跟踪工作区；已提交变更可传 `--base <ref>`，`--all` 选全部本地检查，`--force` 仅用于有理由的重跑。SDK 默认优先 `artifacts/toolchain/dotnet/` 再 PATH，可用 `--dotnet <path>` 覆盖。

成功 receipt 位于 `artifacts/verification/`，指纹覆盖相关内容、命令和工具链。相同内容复用；失败、相关变化或运行期间源码变化不产生可复用成功结果。Python 全套包含文档检查，不重复执行；后端单元以 SkipWebBuild=true 隔离 Web 构建。

修改 Three.js 源码／依赖后运行 `npm run build:web`，提交可再现的 `docs/assets/parameter-geometry-3d.js` 与完整 `3d.LICENSE.txt`。运行文件是经典 IIFE，支持 file 离线；ESM 源不是另一个运行时资源。普通 Markdown 不需要重建该 bundle。站点用 `npm run build:pages` 生成 `artifacts/pages/`，不启动 Sensa。

## 哪些验证在哪里执行

| 变更 | 本地 | Actions |
| --- | --- | --- |
| Markdown／文档站 | 文档／链接／站点构建契约 | 文档检查；站点变化由独立 Pages 流程验证发布 |
| 交互图解 HTML/CSS/JS | Web lint／模型与构建契约／文档 | 全量浏览器比较，独立离线与真实图形检查 |
| Web／后端测试 | 受影响 lint／单元／构建 | 对应接口检查；无待接续产品任务时不发布 |
| E2E／基线 | 静态／单元 | 必要全量比较，不自动更新基线 |
| 产品／协议／打包 | 受影响接口 | 同 SHA 比较与必要平台构建／隔离冒烟 |
| 未知差异 | 保守本地全量 | 保守产品验证 |

以上纯文档／测试跳过只适用于**没有未完成产品验证**。分类由 [ci-plan.py](https://github.com/SeaLoong/Sensa/blob/main/scripts/ci-plan.py) 与契约决定；本地规划不读取 GitHub 状态，CI 另检查产品 owner 的实际结果。

浏览器 E2E、截图、完整进程冒烟与 World PlayMode **仅在 Actions**。本地入口只报告这些计划；不得伪造 CI 环境绕过。隔离单元／静态／Unity EditMode 可本地运行，设备测试只用临时配置与模拟传输。[E2E 细节](e2e.md)

## 四个工作流

| Workflow | 责任与发布边界 |
| --- | --- |
| `ci.yml` | PR、main、手动全量及标签复用；统一规划、接口、必要 E2E／六平台；仅符合条件 main 自动预览 |
| `e2e.yml` | 复用或手动正常比较；仅手动 update_snapshots=true 生成待审图片，不提供发布比较凭据 |
| `release.yml` | 明确 v*／unity-v* 标签；复用同 SHA 验证后发布相应产品 |
| `pages.yml` | main 文档／站点变更及手动文档构建，另供 Unity 稳定发布刷新；静态站点独立验证部署，不发布产品 |

Pages 规则由 [ADR 0004](adr/0004-standalone-bilingual-documentation.md)说明，取代旧“必须等待 Unity 稳定版才发布文档”的耦合。站点构建双语 Markdown、保留六资产独立图解，运行专用浏览器导航／语言检查后部署**同一产物**。稳定包刷新使用当前 main 文档，不能让旧标签覆盖新指南。

VPM 只收录正式 Unity 包，并保留已校验历史索引与同源归档。不能用 GitHub 当前稳定 Release 数量推断历史 VPM 不存在；网络／摘要错误须失败，不可伪装空索引。只有确实没有可验证稳定包时允许文档站显示不可用。预览和当前开发不自动变成 VPM 正式版。

## 产品 owner 与汇合门槛

plan 决定差异与 main 接续；validate 与必要 E2E 可并行。六平台等待 plan／validate，不必等待 E2E，但发布必须汇合所有必要成功和**候选 SHA 的全量正常比较**。手动候选生成不算比较；手动全量 CI 不发布。

main 后续文档 push 遇到运行中 owner，只继承待完成记录，不取消／复制必要产品链。后续文档 success 或 intent artifact 都不能清除待验项；必须读 owner 必要 jobs 的实际成功。缺失／未知／必要 skipped 均按未完成保守处理。

产品失败后的测试／配置修复 push 会在当前提交恢复必要全链，不能因“只改测试”跳过。没有待接续项时，普通文档／测试不发布。PR 取消过期同 ref；main 产品任务保留。发布与清理共用 `sensa-preview-publication` 队列，旧于已公开候选的任务跳过；不要对仍运行的同提交重复派发。

明确需要时才手动调用：

```shell
gh workflow run ci.yml --ref main
gh workflow run e2e.yml --ref main -f update_snapshots=false
```

## 产物与保留

桌面提供 Windows／Linux／macOS × x64／ARM64。Windows ZIP，Linux/macOS tar.gz 保留执行位；Unity ZIP 与校验文件一并审计。预发布先 draft，核对远端附件名、状态、大小、SHA-256 与提交后公开；单文件上传有界重试，失败保留未公开草稿。

发布后分页列出 release，按发布时间保留最新 **10 个已发布 prerelease**。删除前重新核对数字 ID、tag、目标、时间与状态；稳定版、草稿和 Git tag 不删除。`publish-preview.py --prune-only` 会真实删除，只用于已授权保留任务。稳定版必须有明确授权标签，普通预览不升级版本或新增内部兼容分支。

## Unity 与实验工程

Unity 编译／EditMode 可在独立工程运行；元数据检查不能代替 NDMF、Udon、ClientSim 或上传后验收。World 仓库保持本地无 remote。安装前预检所有受管源码／manifest，冲突不覆盖用户资产：

```shell
python scripts/install-world-lab.py "<World project>"
python scripts/install-avatar-lab.py "<Avatar project>" --tests
```

`validate-labs.py` 的 world-editor／functional／geometry／offset 涉及图形、PlayMode 或截图，只在授权 Actions runner。avatar-tests 是 EditMode；avatar-build 是 SDK bundle，不上传。每套使用新报告目录、原场景摘要、退出码与明确成功；空 XML、失败或跳过不能算通过。

人工视觉按 [V1–V6](ui-quality.md)审图，自动 axe／键盘是独立底线。真实 OSC、VR 抓取、HMD、GPU 捕获、准确度与设备动作须另验；结果始终链接实际提交报告，不在通用指南硬编码易过时总数。
