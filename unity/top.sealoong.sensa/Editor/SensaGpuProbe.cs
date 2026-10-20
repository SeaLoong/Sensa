using System;
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
        private static readonly string[] IdProperties = { "_SPS_Configured", "_SPS_IdLow", "_SPS_IdHigh", "_SPS_PlayerIdLow", "_SPS_PlayerIdHigh" };
        private Camera sourceCamera;
        private Material resolverMaterial;
        private Material deformMaterial;
        private Renderer resolverRenderer;
        private Renderer deformRenderer;
        private Material reader;
        private bool armed, pending;
        private double armedAt;
        private string status = "Select a baked SPS Resolver material and a rendering non-VR Camera.";
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
            { armed = false; status = SensaEditorLocalization.Text("Render timed out: enable the camera and keep the Game view rendering."); Repaint(); }
        }

        private void OnGUI()
        {
            SensaEditorLocalization.DrawLanguageSelector();
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Editor experiment, not an uploadable avatar script. Reads an unblended SPS centerline, not the final mesh; no device output. Built-in pipeline and non-stereo camera only."), MessageType.Info);
            using (new EditorGUI.DisabledScope(armed || pending))
            {
                EditorGUI.BeginChangeCheck();
                sourceCamera = (Camera)EditorGUILayout.ObjectField(SensaEditorLocalization.Text("Source Camera"), sourceCamera, typeof(Camera), true);
                resolverRenderer = (Renderer)EditorGUILayout.ObjectField(SensaEditorLocalization.Text("Resolver Renderer"), resolverRenderer, typeof(Renderer), true);
                deformRenderer = (Renderer)EditorGUILayout.ObjectField(SensaEditorLocalization.Text("Surface Renderer"), deformRenderer, typeof(Renderer), true);
                if (resolverRenderer != null) resolverMaterial = resolverRenderer.sharedMaterials.FirstOrDefault(m => m != null && m.shader.name == "Hidden/VRCFury/SpsResolver");
                if (deformRenderer != null) deformMaterial = deformRenderer.sharedMaterials.FirstOrDefault(m => m != null && m.HasProperty("_SPS_Overrun"));
                resolverMaterial = (Material)EditorGUILayout.ObjectField(SensaEditorLocalization.Text("Baked Resolver Material"), resolverMaterial, typeof(Material), true);
                deformMaterial = (Material)EditorGUILayout.ObjectField(SensaEditorLocalization.Text("Baked Surface Material"), deformMaterial, typeof(Material), true);
                if (EditorGUI.EndChangeCheck()) { capture = null; status = SensaEditorLocalization.Text("Capture target changed; capture again."); SceneView.RepaintAll(); }
                if (GUILayout.Button(SensaEditorLocalization.Text("Check dependencies and capture next frame")))
                {
                    capture = null;
                    try
                    {
                        if (sourceCamera == null || resolverMaterial == null || deformMaterial == null) throw new InvalidOperationException(SensaEditorLocalization.Text("Specify camera, baked Resolver and surface material."));
                        if (GraphicsSettings.currentRenderPipeline != null || sourceCamera.stereoEnabled)
                            throw new InvalidOperationException(SensaEditorLocalization.Text("Only Built-in non-stereo Camera is supported; XR/URP are unverified."));
                        if (!SystemInfo.supportsAsyncGPUReadback || !SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.ARGBFloat))
                            throw new InvalidOperationException(SensaEditorLocalization.Text("GPU must support AsyncGPUReadback and ARGBFloat."));
                        if (resolverMaterial.shader == null || resolverMaterial.shader.name != "Hidden/VRCFury/SpsResolver")
                            throw new InvalidOperationException(SensaEditorLocalization.Text("Select BakedSpsPlug's SPS Resolver material, not its surface material."));
                        CheckDependencies();
                        if (reader != null) DestroyImmediate(reader);
                        reader = CreateReader();
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
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Requires the lab's SensaLab/Telemetry shader. Enable then capture. PNG encodes entry minus centerline root in world-axis meters, not full stroke. shader-osc-bridge.py can forward diagnostic OSC. Editor only."),MessageType.Info);
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

        private static Material CreateReader()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Generated));
            var template = File.ReadAllText(Package + "SpsGpuProbe.shader.txt");
            if (File.Exists(Generated) && File.ReadAllText(Generated) != template)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Generated path has different contents; back up and move it first:") + Generated);
            if (!File.Exists(Generated)) File.WriteAllText(Generated, template);
            AssetDatabase.ImportAsset(Generated, ImportAssetOptions.ForceSynchronousImport);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(Generated);
            if (shader == null || !shader.isSupported || ShaderUtil.ShaderHasError(shader))
                throw new InvalidOperationException(SensaEditorLocalization.Text("GPU probe shader compilation failed. Check Unity Console; capture has not started."));
            return new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
        }

        private void AfterCamera(Camera camera)
        {
            if (!armed || pending || camera != sourceCamera) return;
            armed = false;
            if (resolverMaterial == null || deformMaterial == null || IdProperties.Any(p =>
                    ReadProperty(resolverMaterial, resolverRenderer, p) != reader.GetFloat(p)
                    || ReadProperty(deformMaterial, deformRenderer, p) != reader.GetFloat(p)))
            { status = SensaEditorLocalization.Text("SPS identity changed while waiting; capture again."); Repaint(); return; }
            if (camera.stereoEnabled || camera.pixelWidth < 64 || camera.pixelHeight < 64)
            { status = SensaEditorLocalization.Text("Capture camera is too small or has entered stereo mode."); Repaint(); return; }
            var result = new Capture { capturedUtc = DateTime.UtcNow.ToString("O"), cameraName = camera.name,
                unityVersion = Application.unityVersion, width = camera.pixelWidth, height = camera.pixelHeight,
                overrun = reader.GetFloat("_SPS_Overrun") };
            var target = new RenderTexture(36, 1, 0, RenderTextureFormat.ARGBFloat, RenderTextureReadWrite.Linear)
                { filterMode = FilterMode.Point, antiAliasing = 1, hideFlags = HideFlags.HideAndDontSave };
            var previous = RenderTexture.active;
            try
            {
                if (!target.Create()) throw new InvalidOperationException(SensaEditorLocalization.Text("Cannot create floating-point sample texture."));
                reader.SetVector("_SensaSourceSize", new Vector4(camera.pixelWidth, camera.pixelHeight, 1f + 1f / camera.pixelWidth, 1f + 1f / camera.pixelHeight));
                Graphics.Blit(Texture2D.blackTexture, target, reader);
                pending = true;
                AsyncGPUReadback.Request(target, 0, TextureFormat.RGBAFloat, request =>
                {
                    try
                    {
                        if (this == null) return;
                        if (request.hasError) { result.reason = "GPU readback failed"; }
                        else Decode(request.GetData<Color>().ToArray(), result);
                        capture = result; status = result.reason; Repaint(); SceneView.RepaintAll();
                        if(streamPng)
                        {
                            try { ExportTelemetryPng(result,pngPath,++pngSequence); armed=true;armedAt=EditorApplication.timeSinceStartup; }
                            catch(Exception ex) { streamPng=false;status=ex.Message; }
                        }
                    }
                    finally { pending = false; target.Release(); DestroyImmediate(target); }
                });
            }
            catch (Exception ex)
            { pending = false; target.Release(); DestroyImmediate(target); status = ex.Message; Repaint(); }
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
