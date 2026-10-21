# Synthetic camera-only prototype

[简体中文](CAMERA-PROTOTYPE.md) | **English**

This retained lab prototype is **not** the package's current single-camera native SPS root producer. It renders a synthetic test pattern and requires no Udon or arbitrary Avatar runtime script.

`Generated/CameraOnlyPrototype.prefab` starts inactive. Its private camera writes a 256×128 RenderTexture; a separate presenter camera reads it into a fixed desktop viewport. Shader sequence is a test clock, not source freshness. Layer/camera signatures and None-eye settings are engineering guards, not proof of invisible HMD composition.

The world's third cube controls this prototype; another cube controls a different Udon output experiment. Test only one at a time. Inspect desktop and both VR eyes for unwanted output, lag, resizing, mirrors, facing away and disabling.

**Tools → Sensa Lab → Export camera-only prototype** exports an experimental unitypackage for a separate Avatars project. Keep it off/local and do not import Worlds SDK/Udon into that project. It does not replace [native root capture and registration](../../unity/top.sealoong.sensa/GPU-TRACKING.en.md).

Historical editor render/CRC results are not uploaded-client retention, PCVR isolation or external capture timing. Release CI units, browser and native mock checks do not cover this prototype's Unity rendering or PlayMode. Inspect it as separate work.

[World setup and language](README.md) · [Transport](CAPABILITIES.en.md)
