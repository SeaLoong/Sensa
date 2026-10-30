"""Lead with desktop downloads and compose concise preview or full stable notes.

The changelog remains exactly the text returned by GitHub; this module does not
guess changes or translate pull-request titles.
"""
import re


def compose_release_notes(channel, version, tag, sha, repository, generated_body, run_url=''):
    """Link the checked release's formats, then its source and stable changes."""
    if channel not in ('preview', 'stable'):
        raise ValueError('Invalid release channel / 发布渠道无效')
    if not isinstance(version, str) or not re.fullmatch(r'(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)', version):
        raise ValueError('A complete stable version is required / 需要完整正式版本号')
    if not isinstance(sha, str) or not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Invalid release commit / 发布提交无效')
    if not isinstance(repository, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*', repository):
        raise ValueError('Invalid repository identity / 仓库身份无效')
    if channel == 'stable':
        valid_tag = tag == 'v' + version
    else:
        match = re.fullmatch(r'preview-([1-9]\d*)-([1-9]\d*)-([0-9a-f]{8})', tag) if isinstance(tag, str) else None
        valid_tag = match is not None and match[3] == sha[:8]
    if not valid_tag:
        raise ValueError('Release tag does not match its identity / 发布标签与身份不符')
    if not isinstance(run_url, str) or run_url and not re.fullmatch(
            r'https://github\.com/' + re.escape(repository) + r'/actions/runs/[1-9]\d*', run_url):
        raise ValueError('Invalid build workflow URL / 构建工作流地址无效')
    if not isinstance(generated_body, str):
        raise ValueError('Generated change notes must be text / 自动变更说明必须是文本')
    asset_version = version if channel == 'stable' else f'{version}-preview.{match[1]}.{match[2]}.{match[3]}'
    download_base = f'https://github.com/{repository}/releases/download/{tag}/'

    def desktop_links(runtime, suffix):
        return ' · '.join(f'[{"ARM64" if arch == "arm64" else "x64"}]({download_base}Sensa-{asset_version}-{runtime}-{arch}{suffix})'
                          for arch in ('x64', 'arm64'))

    desktop = ('Desktop / 桌面版: '
               f'Windows {desktop_links("win", "-Desktop.zip")} · '
               f'macOS {desktop_links("osx", "-Desktop.zip")} · '
               f'Linux {desktop_links("linux", "-Desktop.tar.gz")}')
    downloads = f'''| Format / 格式 | {asset_version} |
| --- | --- |
| Windows Desktop / 桌面 ZIP | {desktop_links('win', '-Desktop.zip')} |
| macOS Desktop / 桌面 ZIP | {desktop_links('osx', '-Desktop.zip')} |
| Linux Desktop / 桌面 tar.gz | {desktop_links('linux', '-Desktop.tar.gz')} |
| Windows CLI installer / CLI 安装器 | {desktop_links('win', '-Setup.exe')} |
| Windows CLI single file / CLI 单文件 EXE | {desktop_links('win', '-SingleFile.exe')} |
| Windows CLI portable / CLI 便携 ZIP | {desktop_links('win', '.zip')} |
| Linux CLI portable / CLI 便携 tar.gz | {desktop_links('linux', '.tar.gz')} |
| macOS CLI portable / CLI 便携 tar.gz | {desktop_links('osx', '.tar.gz')} |
| Unity package / 组件 ZIP | [top.sealoong.sensa-{asset_version}.zip]({download_base}top.sealoong.sensa-{asset_version}.zip) |
| SHA-256 checksums / 校验值 | [SHA256SUMS.txt]({download_base}SHA256SUMS.txt) |'''
    if channel == 'preview':
        return f'{desktop}\n\n{downloads}\n\nSource: [`{sha}`](https://github.com/{repository}/commit/{sha})\n'

    metadata = f'[vpm-package.json]({download_base}vpm-package.json)'
    workflow_en = f' [Build workflow]({run_url}).' if run_url else ''
    workflow_zh = f' [构建工作流]({run_url})。' if run_url else ''
    changes = generated_body if generated_body.strip() else 'GitHub did not provide change notes for this range. / GitHub 未返回此范围的变更条目。'
    return f'''{desktop}

{downloads}

Sensa {version} · Stable release

Source commit: [`{sha}`](https://github.com/{repository}/commit/{sha}).{workflow_en}

Desktop opens the shared workbench in its own Electron window. Extract the complete archive and launch Sensa; the window coordinates one bundled Node service and retains your selected profile. Windows and macOS use ZIP; Linux uses tar.gz. Choose x64 or ARM64 for your processor.

The CLI edition opens the same workbench in your browser and can run headless with `--open-browser false`. Its six portable archives include offline guides, Shader tools and the serial/BLE bridge. Windows also offers a per-user CLI installer and a standalone `SingleFile.exe`. The single executable embeds its Web UI and serial/MIDI dependencies; native libraries use a private temporary directory. Python tools and full Markdown guides are supplied with the installer or portable archive. All application formats include their Node runtime.

Configuration and recordings stay in the selected profile. CLI `--config`, `--instance` and `--new-instance` select independent profiles; desktop profiles use the user application-data directory. Open http://127.0.0.1:5086 for the default CLI workbench, or use the actual address printed at startup. Downloads do not have a publisher code signature.

Unity projects need the matching VRChat SDK and Modular Avatar/NDMF; SPS automation also requires VRCFury. Stable Unity metadata ({metadata}) is included for the VPM feed.

Verify downloads against `SHA256SUMS.txt`. This source commit passed unit checks and the full browser screenshot comparison before publication. Native package and desktop tests use isolated configurations and simulated transports; real hardware and PCVR remain separate acceptance work.

[Installation and usage](https://sealoong.github.io/Sensa/) · [WebSensa](https://sealoong.github.io/Sensa/websensa/) · [Parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html)

## 简体中文

Sensa {version} · 正式发布

源码提交：[`{sha}`](https://github.com/{repository}/commit/{sha})。{workflow_zh}

Desktop 在 Electron 窗口中打开共用工作台。完整解压后运行 Sensa，窗口协调一个内置 Node 服务并保留所选配置。Windows 和 macOS 提供 ZIP，Linux 提供 tar.gz，按处理器选择 x64 或 ARM64。

CLI 在浏览器中打开同一工作台，也可通过 `--open-browser false` 无界面运行。六个平台的便携包附带离线指南、Shader 工具与串口／BLE 桥。Windows 另有每用户 CLI 安装器和独立 `SingleFile.exe`。单 EXE 内置 Web 界面及串口／MIDI 依赖，原生库使用私有临时目录；Python 工具和完整 Markdown 指南随安装器或便携包提供。所有应用格式都包含 Node 运行时。

配置和录制保存在所选配置目录。CLI 的 `--config`、`--instance` 和 `--new-instance` 可以选择独立配置；桌面版使用用户应用数据目录。默认 CLI 工作台地址为 http://127.0.0.1:5086，端口调整后使用启动时显示的实际地址。下载文件尚无发布者代码签名。

Unity 工程需要对应 VRChat SDK 与 Modular Avatar/NDMF；SPS 自动配置还需要 VRCFury。附带供 VPM 正式索引使用的 Unity 元数据 {metadata}。

通过 `SHA256SUMS.txt` 核对下载文件。此源码提交已在发布前通过单元检查和完整浏览器截图比较。原生包与桌面测试使用隔离配置和模拟传输；真实硬件与 PCVR 另行验收。

[安装与使用文档](https://sealoong.github.io/Sensa/) · [WebSensa](https://sealoong.github.io/Sensa/websensa/) · [参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)

## Changes / 变更记录

{changes}
'''
