using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace UnityBox.Sensa
{
    /// <summary>Editor-only, explicitly armed single-camera GPU experiment. No avatar runtime component or OSC output.</summary>
    public sealed class SensaGpuProbe : EditorWindow
    {
        private static string Package
        {
            get
            {
                var paths = AssetDatabase.FindAssets("SensaGpuProbe t:MonoScript").Select(AssetDatabase.GUIDToAssetPath)
                    .Where(p => Path.GetFileName(p) == "SensaGpuProbe.cs").ToArray();
                if (paths.Length != 1) throw new InvalidOperationException(SensaEditorLocalization.Text("Expected exactly one SensaGpuProbe.cs in the project."));
                return Path.GetDirectoryName(paths[0]).Replace('\\', '/') + "/";
            }
        }
        private const string Generated = "Assets/SensaGpuDiagnostics/SpsGpuProbe.shader";
        private const string Sps3Generated = "Assets/SensaGpuDiagnostics/Sps3GpuProbe.shader";
        public enum ModelAdapter { Sps2Resolver, Sps3RendererContacts }
        private ModelAdapter armedAdapter;
        private Renderer armedRenderer;
        private Material armedMaterial;
        private int armedMaterialSlot = -1;
        private static readonly string[] ContactChannels = { "SPS_Self", "SPS_Others", "SPS_Path" };
        private static readonly string[] Sps3DependencyPaths =
        {
            "com.vrcfury.vrcfury/SPS/common/sps_flags.cginc",
            "com.vrcfury.vrcfury/SPS/common/sps_types.cginc",
            "com.vrcfury.vrcfury/SPS/common/sps_utils.cginc",
            "com.vrcfury.vrcfury/SPS/deform/sps_deform_bake.cginc",
            "com.vrcfury.vrcfury/SPS/deform/sps_deform_bezier.cginc",
            "com.vrcfury.vrcfury/SPS/deform/sps_deform_contacts.cginc",
            "com.vrcfury.vrcfury/SPS/deform/sps_deform_control_points.cginc",
            "com.vrcfury.vrcfury/SPS/deform/sps_deform_curve.cginc",
            "com.vrcfury.vrcfury/SPS/deform/sps_deform_globals.cginc",
            "com.vrcfury.vrcfury/SPS/deform/sps_deform_lights.cginc",
            "com.vrcfury.vrcfury/SPS/deform/sps_deform_main.cginc",
            "com.vrcfury.vrcfury/SPS/deform/sps_deform_path.cginc",
            "com.vrcfury.vrcfury/SPS/deform/sps_deform_props.cginc",
            "com.vrchat.base/ShaderLibrary/VRCContacts.cginc",
        };
        private static readonly string[] Sps3Properties = { "_SPS_Enabled", "_SPS_BakedLength", "_SPS_BakedRadius",
            "_SPS_OthersChannelTagCount", "_SPS_OthersLegacyTags", "_SPS_UseLegacyLights", "_SPS_Overrun" };
        private static readonly string[] IdProperties = { "_SPS_Configured", "_SPS_IdLow", "_SPS_IdHigh", "_SPS_PlayerIdLow", "_SPS_PlayerIdHigh" };
        private Camera sourceCamera;
        private Material resolverMaterial;
        private Material deformMaterial;
        private Renderer resolverRenderer;
        private Renderer deformRenderer;
        private Material reader;
        private bool armed, pending;
        private double armedAt;
        private string status = "Select a baked surface Renderer/material and a rendering non-VR Camera.";
        private Capture capture;
        private bool streamPng;
        private string pngPath = "Validation/sps-telemetry.png";
        private int pngSequence;

        [Serializable] public sealed class Capture
        {
            public string schema = "sensa.sps-gpu-model.v1";
            public string capturedUtc;
            public string cameraName;
            public string unityVersion;
            public string adapterRevision = "vrcfury-d048773de971881fb14c5f3b468e59ba2406a2dd";
            public string adapterType = "sps2-resolver";
            public int width, height;
            public bool valid;
            public string reason;
            public float worldLength;
            public float overrun;
            public Vector3 entryPosition, entryNormal;
            public Vector3[] centerline;
            public float[] firstSegmentStrength;
        }

        [MenuItem("Tools/Sensa/SPS GPU Model Probe (Experimental)")]
        public static void Open() => GetWindow<SensaGpuProbe>(SensaEditorLocalization.Text("Sensa GPU Probe"));

        private void OnEnable() { Camera.onPostRender += AfterCamera; EditorApplication.update += Tick; SceneView.duringSceneGui += DrawCapture; }
        private void OnDisable()
        {
            Camera.onPostRender -= AfterCamera; EditorApplication.update -= Tick;
            SceneView.duringSceneGui -= DrawCapture;
            armed = false;
            streamPng = false;
            if (reader != null) DestroyImmediate(reader);
        }
        private void DrawCapture(SceneView view)
        {
            if (capture == null || !capture.valid || capture.centerline == null) return;
            using (new Handles.DrawingScope(Color.cyan))
            {
                Handles.DrawAAPolyLine(3, capture.centerline);
                Handles.DrawLine(capture.entryPosition, capture.entryPosition + capture.entryNormal * .05f);
                Handles.Label(capture.centerline[0], SensaEditorLocalization.Text("Sensa GPU model snapshot · not a live mesh"));
            }
        }
        private void Tick()
        {
            if (armed && EditorApplication.timeSinceStartup - armedAt > 10)
            { DiscardSnapshot(SensaEditorLocalization.Text("Render timed out: enable the camera and keep the Game view rendering.")); Repaint(); }
        }

        private void OnGUI()
        {
            SensaEditorLocalization.DrawLanguageSelector();
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Editor experiment, not an uploadable avatar script. Reads an unblended SPS centerline, not the final mesh; no device output. Built-in pipeline and non-stereo camera only."), MessageType.Info);
            using (new EditorGUI.DisabledScope(armed || pending))
            {
                EditorGUI.BeginChangeCheck();
                sourceCamera = (Camera)EditorGUILayout.ObjectField(SensaEditorLocalization.Text("Source Camera"), sourceCamera, typeof(Camera), true);
                var previousSurface = deformRenderer;
                deformRenderer = (Renderer)EditorGUILayout.ObjectField(SensaEditorLocalization.Text("Surface Renderer"), deformRenderer, typeof(Renderer), true);
                if (deformRenderer != null && (deformRenderer != previousSurface || deformMaterial == null || !deformRenderer.sharedMaterials.Contains(deformMaterial)))
                    deformMaterial = deformRenderer.sharedMaterials.FirstOrDefault(m => m != null && m.HasProperty("_SPS_Overrun"));
                deformMaterial = (Material)EditorGUILayout.ObjectField(SensaEditorLocalization.Text("Baked Surface Material"), deformMaterial, typeof(Material), true);
                var rendererContacts = deformMaterial != null && UsesRendererContactData(deformMaterial.HasProperty);
                if (rendererContacts)
                    EditorGUILayout.HelpBox(SensaEditorLocalization.Text("SPS3 model snapshots use this Renderer's Contact buffers. The unblended centerline is not the final mesh or a producer-freshness signal."), MessageType.Info);
                else
                {
                    var previousResolver = resolverRenderer;
                    resolverRenderer = (Renderer)EditorGUILayout.ObjectField(SensaEditorLocalization.Text("Resolver Renderer"), resolverRenderer, typeof(Renderer), true);
                    if (resolverRenderer != null && (resolverRenderer != previousResolver || resolverMaterial == null || !resolverRenderer.sharedMaterials.Contains(resolverMaterial)))
                        resolverMaterial = resolverRenderer.sharedMaterials.FirstOrDefault(m => m != null && m.shader.name == "Hidden/VRCFury/SpsResolver");
                    resolverMaterial = (Material)EditorGUILayout.ObjectField(SensaEditorLocalization.Text("Baked Resolver Material"), resolverMaterial, typeof(Material), true);
                }
                if (EditorGUI.EndChangeCheck())
                {
                    capture = null;
                    status = SensaEditorLocalization.Text("Capture target changed; capture again.");
                    SceneView.RepaintAll();
                }
                if (GUILayout.Button(SensaEditorLocalization.Text("Check dependencies and capture next frame")))
                {
                    capture = null;
                    try
                    {
                        if (sourceCamera == null || deformMaterial == null)
                            throw new InvalidOperationException(SensaEditorLocalization.Text("Specify the source camera and baked surface material."));
                        if (GraphicsSettings.currentRenderPipeline != null || sourceCamera.stereoEnabled)
                            throw new InvalidOperationException(SensaEditorLocalization.Text("Only Built-in non-stereo Camera is supported; XR/URP are unverified."));
                        if (!SystemInfo.supportsAsyncGPUReadback || !SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.ARGBFloat))
                            throw new InvalidOperationException(SensaEditorLocalization.Text("GPU must support AsyncGPUReadback and ARGBFloat."));
                        var adapter = UsesRendererContactData(deformMaterial.HasProperty)
                            ? ModelAdapter.Sps3RendererContacts : ModelAdapter.Sps2Resolver;
                        var materialSlot = -1;
                        if (adapter == ModelAdapter.Sps3RendererContacts)
                        {
                            materialSlot = SurfaceMaterialSlot(deformMaterial, deformRenderer);
                            CheckSps3Dependencies();
                        }
                        else
                        {
                            if (resolverMaterial == null || resolverMaterial.shader == null || resolverMaterial.shader.name != "Hidden/VRCFury/SpsResolver")
                                throw new InvalidOperationException(SensaEditorLocalization.Text("Select BakedSpsPlug's SPS Resolver material, not its surface material."));
                            CheckDependencies();
                        }
                        if (reader != null) DestroyImmediate(reader);
                        reader = CreateReader(adapter);
                        if (adapter == ModelAdapter.Sps3RendererContacts)
                            CopySps3Material(reader, deformMaterial, SurfaceProperties(deformMaterial, deformRenderer, materialSlot));
                        else
                        {
                            foreach (var property in IdProperties)
                            {
                                if (!resolverMaterial.HasProperty(property)) throw new InvalidOperationException(SensaEditorLocalization.Text("Missing SPS property:") + property);
                                if (!deformMaterial.HasProperty(property) || ReadProperty(resolverMaterial, resolverRenderer, property) != ReadProperty(deformMaterial, deformRenderer, property))
                                    throw new InvalidOperationException(SensaEditorLocalization.Text("Surface and Resolver SPS identity mismatch:") + property);
                                reader.SetFloat(property, ReadProperty(resolverMaterial, resolverRenderer, property));
                            }
                            if (!deformMaterial.HasProperty("_SPS_Overrun")) throw new InvalidOperationException(SensaEditorLocalization.Text("Surface material lacks _SPS_Overrun."));
                            reader.SetFloat("_SPS_Overrun", ReadProperty(deformMaterial, deformRenderer, "_SPS_Overrun"));
                            if (reader.GetFloat("_SPS_Configured") < .5f) throw new InvalidOperationException(SensaEditorLocalization.Text("Material is not configured. Select generated materials in build preview/Play Mode."));
                        }
                        armedAdapter = adapter; armedRenderer = deformRenderer; armedMaterial = deformMaterial; armedMaterialSlot = materialSlot;
                        armed = true; armedAt = EditorApplication.timeSinceStartup;
                        status = SensaEditorLocalization.Text("Waiting for selected camera's next frame (10-second timeout)…");
                        EditorApplication.QueuePlayerLoopUpdate();
                    }
                    catch (Exception ex) { status = ex.Message; }
                }
            }
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text(status), capture != null && capture.valid ? MessageType.Info : MessageType.Warning);
            var stream = EditorGUILayout.Toggle(SensaEditorLocalization.Text("Continuously export experimental PNG"), streamPng);
            if(stream != streamPng) { streamPng=stream; if(!stream)armed=false; }
            pngPath = EditorGUILayout.TextField(SensaEditorLocalization.Text("PNG path"), pngPath);
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("PNG exports entry minus centerline root in world-axis metres for shader-osc-bridge.py. It does not encode the final mesh or native Contact update timing."),MessageType.Info);
            if (capture != null && capture.valid)
            {
                EditorGUILayout.LabelField(SensaEditorLocalization.Text("Model length (world meters)"), capture.worldLength.ToString("F4"));
                EditorGUILayout.Vector3Field(SensaEditorLocalization.Text("First path point"), capture.entryPosition);
                EditorGUILayout.Vector3Field(SensaEditorLocalization.Text("Path direction"), capture.entryNormal);
                EditorGUILayout.LabelField(SensaEditorLocalization.Text("Centerline samples"), SensaEditorLocalization.Text("33 points; Alpha is firstSegmentStrength"));
                EditorGUILayout.LabelField(SensaEditorLocalization.Text("Snapshot UTC"), capture.capturedUtc);
            }
            using (new EditorGUI.DisabledScope(capture == null || pending))
                if (GUILayout.Button(SensaEditorLocalization.Text("Export diagnostic JSON")))
                {
                    var path = EditorUtility.SaveFilePanel(SensaEditorLocalization.Text("Export GPU model sample"), "", "sensa-gpu-capture", "json");
                    if (!string.IsNullOrEmpty(path)) File.WriteAllText(path, JsonUtility.ToJson(capture, true));
                }
        }

        // Fixed SPS3 material ABI, distinct from the SPS2 Resolver identity properties.
        public static bool UsesRendererContactData(Func<string, bool> hasProperty) => hasProperty != null
            && hasProperty("_SPS_BakedLength") && hasProperty("_SPS_BakedRadius")
            && hasProperty("_SPS_OthersChannelTagCount") && hasProperty("_SPS_OthersLegacyTags")
            && !hasProperty("_SPS_Configured");

        public static int SurfaceMaterialSlot(Material material, Renderer renderer)
        {
            if (material == null || renderer == null)
                throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 requires the baked surface Renderer and its material."));
            var materials = renderer.sharedMaterials;
            var slot = Array.IndexOf(materials, material);
            if (slot < 0 || Array.LastIndexOf(materials, material) != slot)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Choose a surface material used in exactly one Renderer slot."));
            return slot;
        }

        public static bool SurfaceTargetMatches(Material material, Renderer renderer, int slot)
        {
            if (material == null || renderer == null || !renderer.enabled || !renderer.gameObject.activeInHierarchy) return false;
            var materials = renderer.sharedMaterials;
            return slot >= 0 && slot < materials.Length && materials[slot] == material
                && Array.IndexOf(materials, material) == slot && Array.LastIndexOf(materials, material) == slot;
        }

        public static MaterialPropertyBlock SurfaceProperties(Material material, Renderer renderer, int slot)
        {
            if (!SurfaceTargetMatches(material, renderer, slot))
                throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 capture target changed or is no longer active; capture again."));
            var block = new MaterialPropertyBlock();
            renderer.GetPropertyBlock(block, slot);
            // Unity's per-material block replaces the renderer-wide block, including missing entries.
            if (block.isEmpty) renderer.GetPropertyBlock(block);
            return block;
        }

        public static void ValidateContactProperties(MaterialPropertyBlock block)
        {
            if (block == null) throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 Renderer Contact data is unavailable."));
            var hasFrame = false;
            foreach (var channel in ContactChannels)
            {
                var transforms = block.GetMatrixArray("_VRChatContact_Transforms_" + channel);
                var data = block.GetVectorArray("_VRChatContact_Data_" + channel);
                var matrices = transforms == null ? 0 : transforms.Length;
                var vectors = data == null ? 0 : data.Length;
                if (matrices == 0 && vectors == 0) continue; // A disabled receive channel has no buffer.
                if (matrices != 9 || vectors != 9)
                    throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 Renderer Contact data has an unsupported buffer layout."));
                // Data is packed int32/uint32 bits, not numeric floats; preserve even NaN bit patterns.
                var count = BitConverter.ToInt32(BitConverter.GetBytes(data[8].y), 0);
                if (count < 0 || count > 8)
                    throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 Renderer Contact data has an invalid target count."));
                for (var index = 0; index <= count; index++)
                {
                    var matrix = transforms[index == count ? 8 : index];
                    for (var element = 0; element < 16; element++)
                        if (!Finite(matrix[element]))
                            throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 Renderer Contact transforms must be finite."));
                }
                var forward = transforms[8].GetColumn(2);
                hasFrame |= (double)forward.x * forward.x + (double)forward.y * forward.y + (double)forward.z * forward.z > 0;
            }
            if (!hasFrame) throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 Renderer Contact data is unavailable."));
        }

        public static void ValidateSps3Configuration(Func<string, float> read)
        {
            if (read == null) throw new ArgumentNullException(nameof(read));
            foreach (var property in Sps3Properties)
                if (!Finite(read(property))) throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 surface material contains a non-finite property:") + property);
            if (read("_SPS_Enabled") <= 0 || read("_SPS_BakedLength") <= 0 || read("_SPS_BakedRadius") <= 0)
                throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 surface material is disabled or has no valid baked dimensions."));
            // Built-in unity_4Light* data is per draw, not part of a Renderer property block.
            // Never use another object's light constants or silently omit active light contributions.
            if (read("_SPS_UseLegacyLights") > .5f)
                throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 model capture cannot reproduce Renderer-specific legacy lights. Disable the Plug's legacy-light option for this diagnostic, or use Sensa Shader Root Capture."));
        }

        private static void CopySps3Material(Material target, Material source, MaterialPropertyBlock properties)
        {
            target.CopyPropertiesFromMaterial(source);
            foreach (var property in Sps3Properties)
                if (!source.HasProperty(property)) throw new InvalidOperationException(SensaEditorLocalization.Text("Missing SPS property:") + property);
            float Read(string property) => properties.HasFloat(property) ? properties.GetFloat(property) : source.GetFloat(property);
            ValidateSps3Configuration(Read);
            foreach (var property in Sps3Properties) target.SetFloat(property, Read(property));
        }

        public static void CheckSps3Dependencies() => ValidateSps3DependencySources(
            File.ReadAllText(Package + "Sps3GpuDependencies.sha256.txt"),
            path => File.Exists("Packages/" + path) ? File.ReadAllText("Packages/" + path) : null);

        public static void ValidateSps3DependencySources(string manifest, Func<string, string> readSource)
        {
            if (manifest == null || readSource == null) throw new ArgumentNullException(manifest == null ? nameof(manifest) : nameof(readSource));
            var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var raw in manifest.Split('\n'))
            {
                var line = raw.Trim();
                if (line.Length == 0 || line.StartsWith("#")) continue;
                var parts = line.Split(new[] { ' ' }, 2, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length != 2 || parts[0].Length != 64 || parts[0].Any(character => !Uri.IsHexDigit(character)))
                    throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 dependency lock is malformed."));
                var path = parts[1];
                if ((!path.StartsWith("com.vrcfury.vrcfury/SPS/", StringComparison.Ordinal)
                        && path != "com.vrchat.base/ShaderLibrary/VRCContacts.cginc")
                    || path.Contains("..") || path.Contains("\\") || path.Any(char.IsControl) || !path.EndsWith(".cginc", StringComparison.Ordinal)
                    || !Sps3DependencyPaths.Contains(path, StringComparer.Ordinal) || !paths.Add(path))
                    throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 dependency path is unsupported:") + path);
                var text = readSource(path);
                if (text == null) throw new InvalidOperationException(SensaEditorLocalization.Text("Supported SPS3 shader file is not installed:") + path);
                using (var hash = SHA256.Create())
                {
                    var actual = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(text.Replace("\r\n", "\n")))).Replace("-", "").ToLowerInvariant();
                    if (actual != parts[0].ToLowerInvariant()) throw new InvalidOperationException(SensaEditorLocalization.Text("SPS shader version does not match this adapter:") + path + SensaEditorLocalization.Text(". Review the adapter; do not bypass the check."));
                }
            }
            if (!paths.SetEquals(Sps3DependencyPaths))
                throw new InvalidOperationException(SensaEditorLocalization.Text("SPS3 dependency lock must contain every required source file."));
        }

        public static void CheckDependencies()
        {
            // Normalize line endings so Git's CRLF conversion does not change compatibility checks.
            foreach (var line in File.ReadAllLines(Package + "SpsGpuDependencies.sha256.txt"))
            {
                if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#")) continue;
                var parts = line.Split(new[] { ' ' }, 2, StringSplitOptions.RemoveEmptyEntries);
                var path = "Packages/com.vrcfury.vrcfury/" + parts[1];
                if (!File.Exists(path)) throw new InvalidOperationException(SensaEditorLocalization.Text("Supported SPS2 shader file is not installed:") + path);
                using (var hash = SHA256.Create())
                {
                    var actual = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(File.ReadAllText(path).Replace("\r\n", "\n")))).Replace("-", "").ToLowerInvariant();
                    if (actual != parts[0]) throw new InvalidOperationException(SensaEditorLocalization.Text("SPS shader version does not match this adapter:") + path + SensaEditorLocalization.Text(". Review the adapter; do not bypass the check."));
                }
            }
        }

        public static float ReadProperty(Material material, Renderer renderer, string property)
        {
            if (renderer != null)
            {
                var block = new MaterialPropertyBlock();
                var index = Array.IndexOf(renderer.sharedMaterials, material);
                if (index >= 0)
                {
                    renderer.GetPropertyBlock(block, index);
                    // A per-material block replaces the renderer-wide block.
                    if (!block.isEmpty) return block.HasFloat(property) ? block.GetFloat(property) : material.GetFloat(property);
                }
                renderer.GetPropertyBlock(block);
                if (block.HasFloat(property)) return block.GetFloat(property);
            }
            return material.GetFloat(property);
        }

        private static Material CreateReader(ModelAdapter adapter)
        {
            var generated = adapter == ModelAdapter.Sps3RendererContacts ? Sps3Generated : Generated;
            var filename = adapter == ModelAdapter.Sps3RendererContacts ? "Sps3GpuProbe.shader.txt" : "SpsGpuProbe.shader.txt";
            Directory.CreateDirectory(Path.GetDirectoryName(generated));
            var template = File.ReadAllText(Package + filename);
            if (File.Exists(generated) && File.ReadAllText(generated) != template)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Generated path has different contents; back up and move it first:") + generated);
            if (!File.Exists(generated)) File.WriteAllText(generated, template);
            AssetDatabase.ImportAsset(generated, ImportAssetOptions.ForceSynchronousImport);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(generated);
            if (shader == null || !shader.isSupported || ShaderUtil.ShaderHasError(shader))
                throw new InvalidOperationException(SensaEditorLocalization.Text("GPU probe shader compilation failed. Check Unity Console; capture has not started."));
            return new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
        }

        private void DiscardSnapshot(string reason)
        {
            armed = false; streamPng = false; status = reason;
            capture = new Capture { valid = false, reason = reason,
                adapterType = armedAdapter == ModelAdapter.Sps3RendererContacts ? "sps3-renderer-contacts" : "sps2-resolver",
                adapterRevision = armedAdapter == ModelAdapter.Sps3RendererContacts
                    ? "vrcfury-sps3-59fa4fa0277c0f3eb7c73811d9b24bf73e2133f4" : "vrcfury-d048773de971881fb14c5f3b468e59ba2406a2dd" };
        }

        private void AfterCamera(Camera camera)
        {
            if (!armed || pending || camera != sourceCamera) return;
            armed = false;
            if (armedAdapter == ModelAdapter.Sps3RendererContacts
                ? !SurfaceTargetMatches(armedMaterial, armedRenderer, armedMaterialSlot) || !UsesRendererContactData(armedMaterial.HasProperty)
                : resolverMaterial == null || deformMaterial == null || IdProperties.Any(p =>
                    ReadProperty(resolverMaterial, resolverRenderer, p) != reader.GetFloat(p)
                    || ReadProperty(deformMaterial, deformRenderer, p) != reader.GetFloat(p)))
            { DiscardSnapshot(SensaEditorLocalization.Text("SPS identity changed while waiting; capture again.")); Repaint(); return; }
            if (camera.stereoEnabled || camera.pixelWidth < 64 || camera.pixelHeight < 64)
            { DiscardSnapshot(SensaEditorLocalization.Text("Capture camera is too small or has entered stereo mode.")); Repaint(); return; }
            var result = new Capture { capturedUtc = DateTime.UtcNow.ToString("O"), cameraName = camera.name,
                unityVersion = Application.unityVersion, width = camera.pixelWidth, height = camera.pixelHeight,
                overrun = reader.GetFloat("_SPS_Overrun"),
                adapterType = armedAdapter == ModelAdapter.Sps3RendererContacts ? "sps3-renderer-contacts" : "sps2-resolver",
                adapterRevision = armedAdapter == ModelAdapter.Sps3RendererContacts
                    ? "vrcfury-sps3-59fa4fa0277c0f3eb7c73811d9b24bf73e2133f4" : "vrcfury-d048773de971881fb14c5f3b468e59ba2406a2dd" };
            var target = new RenderTexture(36, 1, 0, RenderTextureFormat.ARGBFloat, RenderTextureReadWrite.Linear)
                { filterMode = FilterMode.Point, antiAliasing = 1, hideFlags = HideFlags.HideAndDontSave };
            var previous = RenderTexture.active;
            try
            {
                if (!target.Create()) throw new InvalidOperationException(SensaEditorLocalization.Text("Cannot create floating-point sample texture."));
                if (armedAdapter == ModelAdapter.Sps2Resolver)
                    reader.SetVector("_SensaSourceSize", new Vector4(camera.pixelWidth, camera.pixelHeight, 1f + 1f / camera.pixelWidth, 1f + 1f / camera.pixelHeight));
                if (armedAdapter == ModelAdapter.Sps3RendererContacts)
                {
                    var properties = SurfaceProperties(armedMaterial, armedRenderer, armedMaterialSlot);
                    ValidateContactProperties(properties);
                    CopySps3Material(reader, armedMaterial, properties);
                    result.overrun = reader.GetFloat("_SPS_Overrun");
                    var commands = new CommandBuffer { name = "Sensa SPS3 model snapshot" };
                    try
                    {
                        commands.SetRenderTarget(target);
                        commands.ClearRenderTarget(false, true, Color.clear);
                        commands.DrawProcedural(Matrix4x4.identity, reader, 0, MeshTopology.Triangles, 3, 1, properties);
                        Graphics.ExecuteCommandBuffer(commands);
                    }
                    finally { commands.Release(); }
                }
                else Graphics.Blit(Texture2D.blackTexture, target, reader);
                pending = true;
                AsyncGPUReadback.Request(target, 0, TextureFormat.RGBAFloat, request =>
                {
                    try
                    {
                        if (this == null) return;
                        if (request.hasError) { result.reason = "GPU readback failed"; }
                        else if (armedAdapter == ModelAdapter.Sps3RendererContacts
                            && (!SurfaceTargetMatches(armedMaterial, armedRenderer, armedMaterialSlot) || !UsesRendererContactData(armedMaterial.HasProperty)))
                        { result.reason = SensaEditorLocalization.Text("SPS3 capture target changed during GPU readback."); streamPng = false; }
                        else
                        {
                            if (armedAdapter == ModelAdapter.Sps3RendererContacts)
                            {
                                var current = SurfaceProperties(armedMaterial, armedRenderer, armedMaterialSlot);
                                ValidateSps3Configuration(property => current.HasFloat(property) ? current.GetFloat(property) : armedMaterial.GetFloat(property));
                            }
                            // Native Contact arrays may legitimately advance to the next frame while readback is pending.
                            Decode(request.GetData<Color>().ToArray(), result);
                        }
                        capture = result; status = result.reason; Repaint(); SceneView.RepaintAll();
                        if(streamPng)
                        {
                            try { ExportTelemetryPng(result,pngPath,++pngSequence); armed=true;armedAt=EditorApplication.timeSinceStartup; }
                            catch(Exception ex) { streamPng=false;status=ex.Message; }
                        }
                    }
                    catch (Exception ex)
                    { result.valid = false; result.reason = ex.Message; capture = result; streamPng = false; status = ex.Message; Repaint(); }
                    finally { pending = false; target.Release(); DestroyImmediate(target); }
                });
            }
            catch (Exception ex)
            { pending = false; streamPng = false; result.valid = false; result.reason = ex.Message; capture = result;
                target.Release(); DestroyImmediate(target); status = ex.Message; Repaint(); }
            finally { RenderTexture.active = previous; }
        }

        public static void Decode(Color[] pixels, Capture result)
        {
            result.valid = false; result.reason = "No valid SPS path or corrupt data";
            if (pixels == null || pixels.Length != 36 || pixels.Any(p => !Finite(p.r) || !Finite(p.g) || !Finite(p.b) || !Finite(p.a)
                || Mathf.Abs(p.r) > 1e6f || Mathf.Abs(p.g) > 1e6f || Mathf.Abs(p.b) > 1e6f)) return;
            var header = pixels[0];
            if (header.r != 1947 || header.g != 1 || header.b != 1 || header.a <= .001f || header.a >= 10) return;
            Vector3 Point(Color color) => new Vector3(color.r, color.g, color.b);
            var normal = Point(pixels[2]);
            if (Mathf.Abs(normal.magnitude - 1) > .01f) return;
            result.centerline = pixels.Skip(3).Select(Point).ToArray();
            result.firstSegmentStrength = pixels.Skip(3).Select(p => p.a).ToArray();
            if (result.firstSegmentStrength.Any(v => v < 0 || v > 1)) return;
            result.worldLength = header.a; result.entryPosition = Point(pixels[1]); result.entryNormal = normal;
            result.valid = true; result.reason = "GPU model captured; not final mesh or live device input.";
        }
        public static void ExportTelemetryPng(Capture sample,string path,int sequence)
        {
            var shader=Shader.Find("SensaLab/Telemetry");
            if(shader==null)throw new InvalidOperationException(SensaEditorLocalization.Text("Install the lab Telemetry shader before exporting PNG."));
            bool valid=sample!=null && sample.valid && sample.centerline!=null && sample.centerline.Length>0;
            var delta=valid?sample.entryPosition-sample.centerline[0]:Vector3.zero;
            valid=valid && Finite(delta.x) && Finite(delta.y) && Finite(delta.z) && Mathf.Max(Mathf.Abs(delta.x),Mathf.Abs(delta.y),Mathf.Abs(delta.z))<=1;
            var material=new Material(shader);material.SetFloat("_Sequence",sequence&65535);material.SetFloat("_Valid",valid?1:0);material.SetVector("_Sample",new Vector4(delta.x,delta.y,delta.z,0));
            var target=new RenderTexture(256,128,0,RenderTextureFormat.ARGB32,RenderTextureReadWrite.Linear);target.Create();
            var image=new Texture2D(256,128,TextureFormat.RGBA32,false,true);var previous=RenderTexture.active;
            try
            {
                Graphics.Blit(Texture2D.blackTexture,target,material);RenderTexture.active=target;image.ReadPixels(new Rect(0,0,256,128),0,0);image.Apply();
                path=Path.GetFullPath(path);Directory.CreateDirectory(Path.GetDirectoryName(path));File.WriteAllBytes(path+".tmp",image.EncodeToPNG());
                if(File.Exists(path))File.Replace(path+".tmp",path,null);else File.Move(path+".tmp",path);
            }
            finally {RenderTexture.active=previous;DestroyImmediate(material);DestroyImmediate(image);target.Release();DestroyImmediate(target);}
        }
        private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
