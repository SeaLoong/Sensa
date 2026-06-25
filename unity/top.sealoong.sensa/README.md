# Sensa — Unity 包

VRChat SPS/OGB/TPS 触点感知桥接，用于在 VRChat 头像上自动生成触点组件。

## 依赖

- Unity 2022.3+
- [VRChat SDK - Avatars](https://creators.vrchat.com/sdk/) 3.7+
- [Modular Avatar](https://modular-avatar.nadena.dev/) 1.10+
- [NDMF](https://ndmf.nadena.dev/) 1.5+

## 安装（VCC）

1. 在 VCC / ALCOM 中添加此 VPM 源：
   - **仓库地址**：`https://github.com/SeaLoong/Sensa`
2. 安装 **Sensa** 包到你的项目。
3. 在头像的 GameObject 上添加 `Sensa Component` 组件。
4. 在 Inspector 中配置 Socket/Plug 参数。
5. 上传头像——Sensa 会自动生成所需的触点与参数。

## 手动安装

将 `top.sealoong.sensa` 文件夹复制到 Unity 项目的 `Packages/` 目录下。

## 使用说明

参见 [Sensa 主仓库 README](https://github.com/SeaLoong/Sensa)。
