"""Keep previews source-only and compose full bilingual stable release notes.

The changelog remains exactly the text returned by GitHub; this module does not
guess changes or translate pull-request titles.
"""
import re


def compose_release_notes(channel, version, tag, sha, repository, generated_body, run_url=''):
    """Identify preview source, or describe stable downloads and generated changes."""
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
    if channel == 'preview':
        return f'Source: [`{sha}`](https://github.com/{repository}/commit/{sha})\n'

    title = 'Stable release'
    chinese_title = '正式发布'
    stable_en = 'Stable Unity metadata (`vpm-package.json`) is included for the VPM feed.'
    stable_zh = '附带供 VPM 正式索引使用的 Unity 元数据 `vpm-package.json`。'
    workflow_en = f' [Build workflow]({run_url}).' if run_url else ''
    workflow_zh = f' [构建工作流]({run_url})。' if run_url else ''
    changes = generated_body if generated_body.strip() else 'GitHub did not provide change notes for this range. / GitHub 未返回此范围的变更条目。'
    return f'''Sensa {version} · {title}

Source commit: [`{sha}`](https://github.com/{repository}/commit/{sha}).{workflow_en}

Includes six self-contained desktop archives (Windows, Linux and macOS, each for x64 and ARM64) and one Unity avatar archive. Choose the archive for your OS and processor: ZIP for Windows, tar.gz for Linux/macOS. Extract the complete directory and run `Sensa.exe` on Windows or `./Sensa` on Linux/macOS, then open http://127.0.0.1:5086 . No separate .NET runtime is required.

Unity projects need the matching VRChat SDK and Modular Avatar/NDMF; SPS automation also requires VRCFury. {stable_en}

Verify downloads against `SHA256SUMS.txt`. This source commit passed unit checks and the full browser screenshot comparison before publication. These checks do not validate real hardware or PCVR behavior.

[Installation and usage](https://sealoong.github.io/Sensa/) · [Standalone parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html)

## 简体中文

Sensa {version} · {chinese_title}

源码提交：[`{sha}`](https://github.com/{repository}/commit/{sha})。{workflow_zh}

包含六个自包含桌面压缩包（Windows、Linux、macOS，各提供 x64 和 ARM64）及一个 Unity Avatar 组件包。按系统和处理器选择下载：Windows 使用 ZIP，Linux/macOS 使用 tar.gz。解压时保留完整目录，Windows 运行 `Sensa.exe`，Linux/macOS 运行 `./Sensa`，再打开 http://127.0.0.1:5086 。无需另装 .NET。

Unity 工程需要对应 VRChat SDK 与 Modular Avatar/NDMF；SPS 自动配置还需要 VRCFury。{stable_zh}

通过 `SHA256SUMS.txt` 核对下载文件。此源码提交已在发布前通过单元检查和完整浏览器截图比较。这些检查不代表真实硬件或 PCVR 行为已验收。

[安装与使用文档](https://sealoong.github.io/Sensa/) · [独立参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html)

## Changes / 变更记录

{changes}
'''
