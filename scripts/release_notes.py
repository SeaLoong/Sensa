"""Lead with installer downloads and compose concise preview or full stable notes.

The changelog remains exactly the text returned by GitHub; this module does not
guess changes or translate pull-request titles.
"""
import re


def compose_release_notes(channel, version, tag, sha, repository, generated_body, run_url=''):
    """Link checked installers first, then identify the source and stable changes."""
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
    download_base = f'https://github.com/{repository}/releases/download/{tag}/Sensa-{asset_version}-win-'
    installers = ('Windows installers (recommended) / Windows 安装器（推荐）: '
                  f'[x64]({download_base}x64-Setup.exe) · [ARM64]({download_base}arm64-Setup.exe)')
    if channel == 'preview':
        return f'{installers}\n\nSource: [`{sha}`](https://github.com/{repository}/commit/{sha})\n'

    title = 'Stable release'
    chinese_title = '正式发布'
    stable_en = 'Stable Unity metadata (`vpm-package.json`) is included for the VPM feed.'
    stable_zh = '附带供 VPM 正式索引使用的 Unity 元数据 `vpm-package.json`。'
    workflow_en = f' [Build workflow]({run_url}).' if run_url else ''
    workflow_zh = f' [构建工作流]({run_url})。' if run_url else ''
    changes = generated_body if generated_body.strip() else 'GitHub did not provide change notes for this range. / GitHub 未返回此范围的变更条目。'
    return f'''{installers}

Sensa {version} · {title}

Source commit: [`{sha}`](https://github.com/{repository}/commit/{sha}).{workflow_en}

On Windows, choose `win-x64-Setup.exe` or `win-arm64-Setup.exe` for your processor (recommended). The installer adds Sensa to the Start menu for your user account and includes offline guides and Shader bridge tools. It needs no administrator access. Updates and uninstall preserve your configuration and recordings.

Windows also offers `SingleFile.exe`: run this standalone download directly; it includes the Web UI and needs no adjacent application files. Native libraries extract to .NET's cache on first launch. Configuration and recording-output files stay beside the EXE by default, so keep it in a writable folder. Workbench funscript exports use your Documents/Sensa/recordings folder. The Python Shader bridge and full offline Markdown guides are supplied by the installer or portable archive.

Six self-contained portable archives remain available for Windows, Linux and macOS, each for x64 and ARM64. Use these for a folder-based installation or the complete offline tools: extract the entire ZIP (Windows) or tar.gz (Linux/macOS), then run `Sensa.exe` or `./Sensa`. Open http://127.0.0.1:5086 . All desktop formats include .NET; no separate runtime is required. Downloads are not code-signed; Windows may show a publisher or reputation prompt. One Unity avatar archive is also included.

Unity projects need the matching VRChat SDK and Modular Avatar/NDMF; SPS automation also requires VRCFury. {stable_en}

Verify downloads against `SHA256SUMS.txt`. This source commit passed unit checks and the full browser screenshot comparison before publication. These checks do not validate real hardware or PCVR behavior.

[Installation and usage](https://sealoong.github.io/Sensa/) · [Standalone parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html)

## 简体中文

Sensa {version} · {chinese_title}

源码提交：[`{sha}`](https://github.com/{repository}/commit/{sha})。{workflow_zh}

Windows 推荐按处理器选择 `win-x64-Setup.exe` 或 `win-arm64-Setup.exe`。安装器只为当前用户安装，在开始菜单添加 Sensa，并附带离线指南与 Shader 桥工具，无需管理员权限。升级和卸载保留配置与录制文件。

Windows 也提供 `SingleFile.exe`：直接运行这个文件即可，内置 Web 界面，无需旁边另放程序文件。首次启动时，原生库会提取到 .NET 缓存。配置与“录制输出”文件默认保存在 EXE 旁，请放在可写目录；工作台导出的 funscript 保存在系统文档目录的 Sensa/recordings 下。Python Shader 桥与完整离线 Markdown 指南随安装器或便携压缩包提供。

另保留六个自包含便携压缩包，覆盖 Windows、Linux、macOS 的 x64 与 ARM64，适合按文件夹管理程序或使用完整离线工具。完整解压 ZIP（Windows）或 tar.gz（Linux/macOS），运行 `Sensa.exe` 或 `./Sensa`，再打开 http://127.0.0.1:5086 。所有桌面格式都包含 .NET，无需另装运行时。下载文件未作代码签名，Windows 可能显示发布者或信誉提示。另附一个 Unity Avatar 组件包。

Unity 工程需要对应 VRChat SDK 与 Modular Avatar/NDMF；SPS 自动配置还需要 VRCFury。{stable_zh}

通过 `SHA256SUMS.txt` 核对下载文件。此源码提交已在发布前通过单元检查和完整浏览器截图比较。这些检查不代表真实硬件或 PCVR 行为已验收。

[安装与使用文档](https://sealoong.github.io/Sensa/) · [独立参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)

## Changes / 变更记录

{changes}
'''
