# Language and automatic detection

[简体中文](languages.md) | **English**

Sensa provides Simplified Chinese and English. Localization changes presentation, not OSC paths, parameter names, numeric culture, device protocols or user-defined names. User data and raw diagnostics are not guessed translations.

## Browser application and parameter explorer

Use the first supported locale in this order:

1. An explicit URL `?lang=`.
2. The explicit choice in this origin's `localStorage["sensa.locale"]`.
3. Every entry in `navigator.languages`, in order, then `navigator.language`.
4. English when nothing matches.

Case and underscores are normalized. English regional values such as `en_GB` resolve to `en-US`; Chinese values including `zh-TW`, `zh-Hant` and `zh-HK` resolve to `zh-CN` and use the Simplified translation. Unsupported entries fall through to the next preference. Storage access failures do not prevent use; a manual choice still works for the current page.

A manual switch saves the canonical locale and updates lang if the current URL already has it, so an old URL does not override the new choice on reload. Switching preserves mapping drafts, scripts, explorer scenes, coordinates and selection, and sends no device commands. Storage is origin-specific: the application, Pages and file documents need not share preferences.

The [online explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) runs independently from Sensa and accepts explicit [English](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) or [Chinese](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN). The release's identical HTML works offline; browsers may restrict persistent storage for file pages.

## Documentation entry points

- Root and tool `README.md` files contain canonical English; `README.zh-CN.md` contains complete Chinese; `README.en.md` is only an English alias.
- Other guides retain `*.md` for Chinese and `*.en.md` for English. Changing the default entry does not rename their source paths.
- The [documentation site](https://sealoong.github.io/Sensa/) renders these files under `/en/` and `/zh-CN/`. An explicit language route takes precedence over automatic detection; switching opens the corresponding document.
- Application explorer links use the local bundled HTML with the current locale. Online explorer document links stay on the site; file pages retain neighboring Markdown links.

## Unity Editor and Avatar menus

Sensa Editor offers **Auto / English / 简体中文**, with an explicit preference in Unity EditorPrefs. Auto uses the actual Editor UI language when available, otherwise the system language; unsupported languages fall back to English. Both Chinese variants use Simplified text. Localization does not change serialized fields, asset identity or protocol parameters.

Avatar Expression Menu labels are generated in the **build-time** Editor language. They do not translate per player after upload. Changing language requires rebuilding/uploading, and switching preferences does not rewrite existing user assets.

## World Lab local language

World Lab uses `VRCPlayerApi.GetCurrentLanguage()` and `OnLanguageChanged` for local automatic language, with English fallback and Simplified Chinese for Chinese variants. The **Sensa Lab Language** panel offers Auto / English / 简体中文; explicit choice overrides automatic detection for that client's session through a local player tag. It is neither cross-session persistence nor a synchronized setting, and sends no OSC or device commands.

The actual API signatures were checked in Worlds SDK **3.10.5**. The installed SDK must expose these Udon language APIs; older-version support is not assumed.

The six dynamic HUDs localize known UI phrases through UGUI `Text`, preserving their English measurement/status source and technical identifiers. Static `TextMesh` uses a different path: Editor generation retains the original object, Transform, identity and text, disables its Renderer, and creates English/Chinese display children. Runtime only switches those children with `SetActive`; it does not read/write `TextMesh.text` or poll static text every frame.

**Tools → Sensa Lab → Refresh display language - 刷新显示语言** explicitly upgrades an open scene. **Validate localization (Editor only)** compiles Udon and checks pure Editor presentation without generating user lab scenes, entering PlayMode or operating devices. Source, compile and EditMode results are not uploaded VRChat, client font/layout or HMD readability acceptance.

## Maintenance

Add both translations for user-facing text; preserve identifiers and raw exceptions. Tests cover normalization, precedence, denied storage and state preservation. Browser conclusions belong to the corresponding CI report. [Development](development.en.md) · [User guide](guide.en.md)
