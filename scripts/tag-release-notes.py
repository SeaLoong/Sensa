"""Write English-first tagged release instructions. / 写入英语默认标签发布说明。"""
import argparse
from pathlib import Path
import re


def release_notes(tag):
    if not re.fullmatch(r'(?:unity-)?v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', tag):
        raise ValueError('Invalid release tag / 发布标签无效')
    return f'''Sensa {tag}

Choose the archive matching your OS and processor. Extract the complete directory and run Sensa.exe (Windows) or ./Sensa (Linux/macOS), then open http://127.0.0.1:5086 . No separate .NET runtime is required. Configure inputs and observe signals before explicitly activating outputs.

Unity packages require the matching VRChat SDK and Modular Avatar/NDMF. SPS automation also requires VRCFury. Development prereleases are separate from the stable VPM index. Real hardware and PCVR behavior require their own validation.

[Documentation](https://sealoong.github.io/Sensa/) · [Standalone parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)

## 简体中文

选择适合系统和处理器的压缩包并保留完整目录。Windows 运行 Sensa.exe，Linux/macOS 运行 ./Sensa，再打开 http://127.0.0.1:5086 。无需另装 .NET。先配置输入、观察信号，再明确启用输出。

Unity 包需要对应 VRChat SDK 与 Modular Avatar/NDMF；SPS 自动配置还需要 VRCFury。开发预发布与 VPM 正式索引分开。真实硬件与 PCVR 行为需要单独验收。

[文档](https://sealoong.github.io/Sensa/?lang=zh-CN) · [独立参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)

'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(release_notes(args.tag), encoding='utf-8')
