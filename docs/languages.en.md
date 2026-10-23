# Language and automatic detection

[简体中文](languages.md) | **English**

Sensa provides Simplified Chinese and English for interface text. OSC paths, parameter names, numeric formats, device protocols and user-defined names retain their original values and formats. User data and diagnostics appear in their original text so they can be checked against their sources.

## Browser application and parameter explorer

Use the first supported locale in this order:

1. An explicit URL `?lang=`.
2. The explicit choice in this origin's `localStorage["sensa.locale"]`.
3. Every entry in `navigator.languages`, in order, then `navigator.language`.
4. English when nothing matches.

Case and underscores are normalized. English regional values such as `en_GB` resolve to `en-US`; Chinese values including `zh-TW`, `zh-Hant` and `zh-HK` resolve to `zh-CN` and use the Simplified translation. Other languages fall through to the next preference. A manual choice still works for the current page when storage access fails.

A manual switch saves the canonical locale and updates lang if the current URL already has it, so reloading keeps the new choice. Switching preserves mapping drafts, scripts, explorer scenes, coordinates, selection and device state. Storage is origin-specific: the application, Pages and file documents each keep their own preferences.

The [online explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) runs independently from Sensa and accepts explicit [English](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) or [Chinese](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN). The release's identical HTML works offline; browsers may restrict persistent storage for file pages.

## Documentation entry points

- Root and tool `README.md` files contain canonical English; `README.zh-CN.md` contains complete Chinese; `README.en.md` is only an English alias.
- Other guides retain `*.md` for Chinese and `*.en.md` for English. Changing the default entry does not rename their source paths.
- The [documentation site](https://sealoong.github.io/Sensa/) renders these files under `/en/` and `/zh-CN/`. An explicit language route takes precedence over automatic detection; switching opens the corresponding document.
- Application explorer links use the local bundled HTML with the current locale. Online explorer document links stay on the site; file pages retain neighboring Markdown links.

## Unity Editor and Avatar menus

Sensa Editor offers **Auto / English / 简体中文**, with an explicit preference in Unity EditorPrefs. Auto uses the actual Editor UI language when available, otherwise the system language; other languages fall back to English. Both Chinese variants use Simplified text. Serialized fields, asset identity and protocol parameters retain their original contents.

Avatar Expression Menu labels are generated in the **build-time** Editor language, and every player sees that menu after upload. To update its language, change the Editor preference and rebuild/upload. Existing user assets retain their original contents.

## World Lab local language

World Lab uses `VRCPlayerApi.GetCurrentLanguage()` and `OnLanguageChanged` for local automatic language, with English fallback and Simplified Chinese for Chinese variants. The **Sensa Lab Language** panel offers Auto / English / 简体中文. An explicit choice overrides automatic detection through a local player tag for that player's current client session; a new session starts with automatic detection. Other players' language and OSC/device states retain their own settings.

The actual API signatures were checked in Worlds SDK **3.10.5**. Confirm that the installed SDK exposes these Udon language APIs. Compatibility with older versions needs separate verification.

The six dynamic HUDs localize known UI phrases through UGUI `Text`, preserving their English measurement/status source and technical identifiers. For static `TextMesh`, Editor generation creates English/Chinese display children, retains the original object, Transform, identity and text, and disables the original Renderer. Runtime switches the display children with `SetActive`; their static text is determined during Editor generation.

**Tools → Sensa Lab → Refresh display language - 刷新显示语言** updates the open scene's language display. **Validate localization (Editor only)** checks Udon compilation and pure Editor presentation while preserving user lab scenes, playback state and device state. After uploading to VRChat, check client fonts, layout and HMD readability and record those results separately.

## Maintenance

Add both translations for user-facing text and preserve identifiers/raw exceptions. CI isolated units and browser E2E check normalization, precedence, denied storage and state preservation; read actual reports for the selected commit. Confirm fonts and layout by inspecting the actual pages. [Development and releases](development.en.md) · [User guide](guide.en.md)
