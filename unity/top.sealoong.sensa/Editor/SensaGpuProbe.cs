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
                if (paths.Length != 1) throw new InvalidOperationException("Expected exactly one SensaGpuProbe.cs in the project.");
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
        private string status = "选择已烘焙的 SPS Resolver 材质与正在渲染的非 VR Camera。";
        private Capture capture;

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
        public static void Open() => GetWindow<SensaGpuProbe>("Sensa GPU Probe");

        private void OnEnable() { Camera.onPostRender += AfterCamera; EditorApplication.update += Tick; SceneView.duringSceneGui += DrawCapture; }
        private void OnDisable()
        {
            Camera.onPostRender -= AfterCamera; EditorApplication.update -= Tick;
            SceneView.duringSceneGui -= DrawCapture;
            armed = false;
            if (reader != null) DestroyImmediate(reader);
        }
        private void DrawCapture(SceneView view)
        {
            if (capture == null || !capture.valid || capture.centerline == null) return;
            using (new Handles.DrawingScope(Color.cyan))
            {
                Handles.DrawAAPolyLine(3, capture.centerline);
                Handles.DrawLine(capture.entryPosition, capture.entryPosition + capture.entryNormal * .05f);
                Handles.Label(capture.centerline[0], "Sensa GPU 模型快照 · 非实时网格");
            }
        }
        private void Tick()
        {
            if (armed && EditorApplication.timeSinceStartup - armedAt > 10)
            { armed = false; status = "等待渲染超时：确认相机启用、Game 视图正在渲染。"; Repaint(); }
        }

        private void OnGUI()
        {
            EditorGUILayout.HelpBox("编辑器实验，不可作为头像脚本上传。读取 SPS 的未混合中心线路径；不是最终网格，也不生成设备输出。仅支持 Built-in、非立体相机。", MessageType.Info);
            using (new EditorGUI.DisabledScope(armed || pending))
            {
                EditorGUI.BeginChangeCheck();
                sourceCamera = (Camera)EditorGUILayout.ObjectField("Source Camera", sourceCamera, typeof(Camera), true);
                resolverRenderer = (Renderer)EditorGUILayout.ObjectField("Resolver Renderer", resolverRenderer, typeof(Renderer), true);
                deformRenderer = (Renderer)EditorGUILayout.ObjectField("Surface Renderer", deformRenderer, typeof(Renderer), true);
                if (resolverRenderer != null) resolverMaterial = resolverRenderer.sharedMaterials.FirstOrDefault(m => m != null && m.shader.name == "Hidden/VRCFury/SpsResolver");
                if (deformRenderer != null) deformMaterial = deformRenderer.sharedMaterials.FirstOrDefault(m => m != null && m.HasProperty("_SPS_Overrun"));
                resolverMaterial = (Material)EditorGUILayout.ObjectField("Baked Resolver Material", resolverMaterial, typeof(Material), true);
                deformMaterial = (Material)EditorGUILayout.ObjectField("Baked Surface Material", deformMaterial, typeof(Material), true);
                if (EditorGUI.EndChangeCheck()) { capture = null; status = "采集目标已变化，请重新采集。"; SceneView.RepaintAll(); }
                if (GUILayout.Button("检查依赖并采集下一帧"))
                {
                    capture = null;
                    try
                    {
                        if (sourceCamera == null || resolverMaterial == null || deformMaterial == null) throw new InvalidOperationException("请指定相机、已烘焙 Resolver 及表面材质。");
                        if (GraphicsSettings.currentRenderPipeline != null || sourceCamera.stereoEnabled)
                            throw new InvalidOperationException("仅支持 Built-in 非立体 Camera；暂不验证 XR/URP。");
                        if (!SystemInfo.supportsAsyncGPUReadback || !SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.ARGBFloat))
                            throw new InvalidOperationException("GPU 必须支持 AsyncGPUReadback 和 ARGBFloat。");
                        if (resolverMaterial.shader == null || resolverMaterial.shader.name != "Hidden/VRCFury/SpsResolver")
                            throw new InvalidOperationException("请选择 BakedSpsPlug 的 SPS Resolver 材质，而不是表面材质。");
                        CheckDependencies();
                        if (reader != null) DestroyImmediate(reader);
                        reader = CreateReader();
                        foreach (var property in IdProperties)
                        {
                            if (!resolverMaterial.HasProperty(property)) throw new InvalidOperationException("缺少 SPS 属性：" + property);
                            if (!deformMaterial.HasProperty(property) || ReadProperty(resolverMaterial, resolverRenderer, property) != ReadProperty(deformMaterial, deformRenderer, property))
                                throw new InvalidOperationException("表面与 Resolver 材质的 SPS 身份不一致：" + property);
                            reader.SetFloat(property, ReadProperty(resolverMaterial, resolverRenderer, property));
                        }
                        if (!deformMaterial.HasProperty("_SPS_Overrun")) throw new InvalidOperationException("表面材质缺少 _SPS_Overrun。");
                        reader.SetFloat("_SPS_Overrun", ReadProperty(deformMaterial, deformRenderer, "_SPS_Overrun"));
                        if (reader.GetFloat("_SPS_Configured") < .5f) throw new InvalidOperationException("材质尚未配置；请在构建预览/Play Mode 中选择生成后的材质。");
                        armed = true; armedAt = EditorApplication.timeSinceStartup;
                        status = "等待所选相机的下一帧（10 秒超时）…";
                        EditorApplication.QueuePlayerLoopUpdate();
                    }
                    catch (Exception ex) { status = ex.Message; }
                }
            }
            EditorGUILayout.HelpBox(status, capture != null && capture.valid ? MessageType.Info : MessageType.Warning);
            if (capture != null && capture.valid)
            {
                EditorGUILayout.LabelField("模型长度（世界米）", capture.worldLength.ToString("F4"));
                EditorGUILayout.Vector3Field("第一路径点", capture.entryPosition);
                EditorGUILayout.Vector3Field("路径方向", capture.entryNormal);
                EditorGUILayout.LabelField("中心线采样", "33 点；Alpha 为 firstSegmentStrength");
                EditorGUILayout.LabelField("快照时间 UTC", capture.capturedUtc);
            }
            using (new EditorGUI.DisabledScope(capture == null || pending))
                if (GUILayout.Button("导出诊断 JSON"))
                {
                    var path = EditorUtility.SaveFilePanel("Export GPU model sample", "", "sensa-gpu-capture", "json");
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
                if (!File.Exists(path)) throw new InvalidOperationException("未安装受支持的 SPS2 Shader 文件：" + path);
                using (var hash = SHA256.Create())
                {
                    var actual = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(File.ReadAllText(path).Replace("\r\n", "\n")))).Replace("-", "").ToLowerInvariant();
                    if (actual != parts[0]) throw new InvalidOperationException("SPS Shader 版本与实验适配器不匹配：" + path + "。需复核适配器，不能跳过检查。");
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
                throw new InvalidOperationException("生成路径已有不同内容；请先备份并移走 " + Generated);
            if (!File.Exists(Generated)) File.WriteAllText(Generated, template);
            AssetDatabase.ImportAsset(Generated, ImportAssetOptions.ForceSynchronousImport);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(Generated);
            if (shader == null || !shader.isSupported || ShaderUtil.ShaderHasError(shader))
                throw new InvalidOperationException("GPU 探针 Shader 编译失败，请检查 Unity Console；未开始采集。");
            return new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
        }

        private void AfterCamera(Camera camera)
        {
            if (!armed || pending || camera != sourceCamera) return;
            armed = false;
            if (resolverMaterial == null || deformMaterial == null || IdProperties.Any(p =>
                    ReadProperty(resolverMaterial, resolverRenderer, p) != reader.GetFloat(p)
                    || ReadProperty(deformMaterial, deformRenderer, p) != reader.GetFloat(p)))
            { status = "等待期间 SPS 身份发生变化，请重新采集。"; Repaint(); return; }
            if (camera.stereoEnabled || camera.pixelWidth < 64 || camera.pixelHeight < 64)
            { status = "采集相机尺寸不足或已进入立体模式。"; Repaint(); return; }
            var result = new Capture { capturedUtc = DateTime.UtcNow.ToString("O"), cameraName = camera.name,
                unityVersion = Application.unityVersion, width = camera.pixelWidth, height = camera.pixelHeight,
                overrun = reader.GetFloat("_SPS_Overrun") };
            var target = new RenderTexture(36, 1, 0, RenderTextureFormat.ARGBFloat, RenderTextureReadWrite.Linear)
                { filterMode = FilterMode.Point, antiAliasing = 1, hideFlags = HideFlags.HideAndDontSave };
            var previous = RenderTexture.active;
            try
            {
                if (!target.Create()) throw new InvalidOperationException("无法创建浮点采样纹理。");
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
            result.valid = false; result.reason = "无有效 SPS 路径或数据损坏";
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
            result.valid = true; result.reason = "已采集 GPU 模型；不是最终网格，也不是实时设备输入。";
        }
        private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
