# Chinese and English

[简体中文](languages.md) | **English**

Choose Chinese or English in the top bar. A first visit follows supported browser preferences, falling back to English. The preference is stored in this browser; restricted storage still permits an in-page switch.

UI text, basic controls, five presets, parameter meanings, experimental diagnostics, help and timestamps update together. Switching does not reload, discard drafts, save configuration, change mode or enable input. User names, files, protocol enums and OSC paths remain literal, as do unknown firmware/system/third-party errors.

Unity inspectors provide bilingual labels/help while keeping generated protocol identifiers and technical menu names searchable. Public guides have reciprocal language entry points, and desktop archives contain both languages. Updating documentation does not rebuild or upload avatars/worlds.

## Maintenance

Web text uses `t(Chinese source, values)` and the English catalog, with matching `{0}` placeholders. Insert user values once, without recursive translation or HTML interpretation. Dynamic service diagnostics are translated at display boundaries using templates, not DOM traversal.

Unit contracts check source keys, presets, placeholders, fallback, storage failure and subscriptions. CI browser coverage checks persistence, draft survival and absence of control requests during switching. Obsolete UI showcase images have been removed; use reviewed CI comparisons for the actual candidate instead of historical screenshots to demonstrate the new layout.

[User guide](guide.en.md) · [Screenshots/baselines](e2e.en.md)
