# Camera-only prototype

[简体中文](CAMERA-PROTOTYPE.md) | **English**

This is a rendering-path test pattern, not a finished SPS bridge.

`Generated/CameraOnlyPrototype.prefab` contains two native Unity Cameras, one RenderTexture, two display objects and their shaders/materials. No Udon or ordinary runtime C# is required. The root defaults inactive.

- Private capture camera writes the test pattern into a 256×128 RenderTexture.
- Desktop presenter reads it and attempts to draw a fixed bottom-left desktop region. stereoTargetEye=None and shader guards exclude stereo/mirror rendering.
- Sequence comes from a shader test clock; it does not prove SPS source freshness. XYZ is synthetic.
- Fixed projection features and Layer 22 separate the experiment. This is not a reliable VRChat camera-identity API; layer/culling behavior after upload needs testing. Do not modify world/other-player layers to accommodate it.

The world's third cube controls this experiment; the second controls another Udon output experiment. Do not enable both. HMD visibility, desktop overlay and VR composition still need real-client checks.

With outputs disconnected, test stationary view, fast head turns, facing away, mirrors, resizing and disabling. Inspect both HMD and desktop: does code appear, move, lag or remain after disabling?

**Tools → Sensa Lab → Export camera-only prototype** creates `Exports/Sensa-CameraOnly-Experimental.unitypackage` for a separate Avatars project. Do not mix Worlds SDK/Udon into it. Keep the imported rig off and local-only; do not synchronize camera activation to other players.

Previously verified: actual Camera→RT→Presenter rendering and rotated CRC decoding in Unity 2022.3.22f1 on AMD RX 6750 XT. Unverified: full client camera retention, PCVR isolation, external capture timing and cross-client behavior. A passing non-stereo editor test does not mean “completely invisible in the headset”.
