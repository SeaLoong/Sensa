"""安装 Sensa avatar 实验工具。 / Install first-party Sensa avatar lab sources."""
import argparse
from pathlib import Path

from lab_installation import install_lab


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    parser.add_argument('--tests', action='store_true', help='启用 Sensa 包测试。 / Enable Sensa package tests.')
    args = parser.parse_args()
    try:
        count = install_lab(args.project, 'avatar', enable_tests=args.tests)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(f'已安装 {count} 个自有源文件。 / Installed {count} first-party source files.')


if __name__ == '__main__':
    main()
