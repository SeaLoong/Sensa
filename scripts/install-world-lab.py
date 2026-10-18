"""安装 Sensa world 实验工具。 / Install first-party Sensa world lab sources."""
import argparse
from pathlib import Path

from lab_installation import install_lab


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    args = parser.parse_args()
    try:
        count = install_lab(args.project, 'world')
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(f'已安装 {count} 个自有源文件。 / Installed {count} first-party source files.')


if __name__ == '__main__':
    main()
