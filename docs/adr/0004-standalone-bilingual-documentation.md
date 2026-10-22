# Standalone bilingual documentation / 独立双语文档站

**Status: retained; current CI organization is defined by [ADR 0005](0005-simplified-ci-and-releases.md). / 状态：保留；当前 CI 组织方式由 [ADR 0005](0005-simplified-ci-and-releases.md) 规定。**

The user requested a complete documentation refresh, English as the default README and release language, automatic language selection, and a public parameter explorer independent of the Sensa process. The former Pages job ran only after stable Unity publication. That coupled ordinary documentation updates to an unrelated release and hid the explorer from readers without the application.

`pages.yml` owns static documentation. Main documentation/site pushes automatically build both languages, run site E2E and deploy the same checked artifact. Successful stable publication refreshes the stable VPM index through the same workflow, using current main documentation rather than historical tag contents. Pages does not publish desktop or Unity releases. The current check/build/publication rules are in ADR 0005.

English canonical READMEs use `README.md`; complete Chinese entries use `README.zh-CN.md`. Existing `README.en.md` entries remain small links to the English canonical file. Other established guide pairs retain their Chinese `.md` and English `.en.md` paths. Static HTML exposes explicit `en/` and `zh-CN/` routes. The homepage and independent explorer share the application's language preference policy; explicit documentation routes keep their selected language.

The VPM builder still verifies published stable assets and historical archive hashes. Documentation builds may explicitly allow an empty stable index when no stable package exists. The homepage then hides installation actions and explains that development previews are separate. Network errors or corrupt historical packages still fail deployment. Stable releases, drafts, tags and package versions are not synthesized for documentation.

The parameter explorer is copied with its local runtime assets and needs no Sensa server, OSC listener, device or Unity installation. A metadata hook routes its reference links into the published docs. The original file and desktop archive retain adjacent/offline behavior.

用户要求全面更新文档、README 与发布说明默认英语、自动识别语言，并公开不依赖 Sensa 进程的参数图解。原先 Pages 只能跟随 Unity 正式版更新，导致普通文档维护依赖无关的正式发布，未安装软件的读者也难以使用图解。

`pages.yml` 专门负责静态文档。main 上文档或站点变更会自动生成双语页面，通过站点 E2E 后部署同一产物。正式发布成功后通过同一工作流刷新 VPM，并读取当前 main 文档，避免历史标签覆盖新站点。Pages 不发布桌面程序或 Unity 包。当前检查、构建与发布规则见 ADR 0005。

README 的英语正式入口是 `README.md`，完整中文入口是 `README.zh-CN.md`；保留 `README.en.md` 为简短英语链接，避免旧地址失效。其他已建立的指南仍保留中文 `.md`、英语 `.en.md`。静态站点提供明确的 `en/` 与 `zh-CN/` 路由。首页与独立图解复用应用的语言偏好策略；明确语言的文档路由保持原选择。

VPM 构建仍校验已发布正式包及历史压缩包摘要。只有文档构建可以显式允许“没有正式包”的空索引，此时首页隐藏安装操作并说明预览包与正式包的区别。网络错误或历史包损坏仍阻止部署。不得为更新文档虚构稳定发布、草稿、标签或包版本。

参数图解连同本地运行资源复制到站点，无需 Sensa 服务、OSC 监听、设备或 Unity。仅发布副本注入元数据，使参考链接进入站内文档；源码文件与桌面压缩包保留相邻文档和离线行为。
