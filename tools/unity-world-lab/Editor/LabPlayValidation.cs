using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using UnityBox.Sensa;

namespace SensaLab
{
    [InitializeOnLoad]
    public static class LabPlayValidation
    {
        private const string Key="SensaLab.PlayValidation";
        private static double started;
        [Serializable] private class LocalPointCapture { public string schema="sensa.point-lab.v1";public Vector3 position;public float[] samples;public bool grabbed;public float stretch; }
        private static string ReportDirectory => SessionState.GetBool(Key+"Offset",false)?"Validation/offset":"Validation";
        static LabPlayValidation() { EditorApplication.playModeStateChanged+=Changed;EditorApplication.update+=Tick; }
        [MenuItem("Tools/Sensa Lab/Run Play Mode validation (straight)")]
        public static void Run() => RunScenario(false);
        [MenuItem("Tools/Sensa Lab/Run Play Mode validation (offset and tilted)")]
        public static void RunOffset() => RunScenario(true);
        private static void RunScenario(bool offset) {
            SessionState.SetBool(Key+"Offset",offset);
            Directory.CreateDirectory(ReportDirectory);
            LabBuilder.AddLocalProbeStation();
            EditorSceneManager.OpenScene("Assets/SensaLab/Generated/SensaLab.unity");
            if(offset){var socket=GameObject.Find("SPS2 Socket - legacy enabled").transform;socket.position+=new Vector3(.03f,0,0);socket.rotation=Quaternion.Euler(0,25,0);}
            // Explicitly run the installed world baker on the in-memory test scene.
            // The saved authoring scene is not overwritten.
            var baker=AppDomain.CurrentDomain.GetAssemblies().Select(a=>a.GetType("VF.Features.BuildSps")).FirstOrDefault(t=>t!=null);
            if(baker==null)throw new InvalidOperationException("VRCFury world baker is unavailable");
            baker.GetMethod("Process").Invoke(null,new object[]{UnityEngine.SceneManagement.SceneManager.GetActiveScene()});
            Directory.CreateDirectory("Validation");
            File.WriteAllText(ReportDirectory+"/preplay-bake.txt",string.Join("\n",UnityEngine.Object.FindObjectsOfType<Renderer>().Select(r=>r.name+": "+string.Join(",",r.sharedMaterials.Where(m=>m!=null).Select(m=>m.shader.name)))));
            SessionState.SetBool(Key+"VrcfuryPreference",EditorPrefs.GetBool("com.vrcfury.playMode",true));
            SessionState.SetBool(Key+"VrcfuryPreferenceExists",EditorPrefs.HasKey("com.vrcfury.playMode"));
            EditorPrefs.SetBool("com.vrcfury.playMode",false); // Already baked; avoid a second cleanup/build pass.
            EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene(),"Assets/SensaLab/Generated/BakedPlayValidation.unity");
            SessionState.SetInt(Key,1);SessionState.SetBool(Key+"Passed",false);SessionState.SetFloat(Key+"Started",(float)EditorApplication.timeSinceStartup);
            EditorApplication.isPlaying=true;
        }
        private static void Changed(PlayModeStateChange state) {
            if(SessionState.GetInt(Key,0)==0)return;
            if(state==PlayModeStateChange.EnteredPlayMode){started=EditorApplication.timeSinceStartup;SessionState.SetInt(Key,2);}
            if(state==PlayModeStateChange.EnteredEditMode){RestorePreference();SessionState.SetInt(Key,0);if(Application.isBatchMode)EditorApplication.Exit(SessionState.GetBool(Key+"Passed",false)?0:1);}
        }
        private static void RestorePreference(){if(SessionState.GetBool(Key+"VrcfuryPreferenceExists",false))EditorPrefs.SetBool("com.vrcfury.playMode",SessionState.GetBool(Key+"VrcfuryPreference",true));else EditorPrefs.DeleteKey("com.vrcfury.playMode");}
        private static void Tick() {
            int stage=SessionState.GetInt(Key,0);if(stage==0)return;
            if(stage==1 && EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"Started",0)>120){RestorePreference();SessionState.SetInt(Key,0);File.WriteAllText("Validation/playmode-error.txt","Play Mode startup timed out");EditorApplication.Exit(1);return;}
            if(stage!=2 || EditorApplication.timeSinceStartup-started<12)return;
            SessionState.SetInt(Key,3);Directory.CreateDirectory("Validation");
            try {
                var status=GameObject.Find("Status").GetComponent<Text>().text;
                var renderers=UnityEngine.Object.FindObjectsOfType<Renderer>();
                var resolver=renderers.SelectMany(r=>r.sharedMaterials).FirstOrDefault(m=>m!=null && m.shader.name=="Hidden/VRCFury/SpsResolver");
                var moving=GameObject.Find("Moving Root").transform.position;
                var origin=GameObject.Find("Contact Reference").transform.position;
                string result="UTC: "+DateTime.UtcNow.ToString("O")+"\n"+status+"\nResolver exists: "+(resolver!=null)+"\nMarker moved: "+(Vector3.Distance(moving,origin)>.001f)
                    +"\nShaders: "+string.Join(", ",renderers.SelectMany(r=>r.sharedMaterials).Where(m=>m!=null).Select(m=>m.shader.name).Distinct());
                File.WriteAllText(ReportDirectory+"/playmode-results.txt",result);
                bool gpuModel=resolver!=null && CaptureModel(renderers);
                var probeBoard=GameObject.Find("Local probe status");
                bool localProbe=probeBoard!=null && probeBoard.GetComponent<Text>().text.Contains("A3=");
                if(probeBoard!=null)result+="\n"+probeBoard.GetComponent<Text>().text;
                if(localProbe){var station=GameObject.Find("Local bone and PB station").GetComponent<LocalProbeStation>();File.WriteAllText(ReportDirectory+"/local-point-capture.json",JsonUtility.ToJson(new LocalPointCapture{position=station.reference.InverseTransformPoint(station.target.position),samples=station.receivers.Select(r=>r.CalculateProximity(station.sender)).ToArray(),grabbed=station.bone.IsGrabbed,stretch=station.bone.Stretch},true));}
                result+="\nLocal PB station running: "+localProbe;
                result+="\nSPS GPU model valid: "+gpuModel;
                File.WriteAllText(ReportDirectory+"/playmode-results.txt",result);
                bool pass=status.Contains("CRC OK") && resolver!=null && gpuModel && localProbe && Vector3.Distance(moving,origin)>.001f;
                SessionState.SetBool(Key+"Passed",pass);
                File.WriteAllText(ReportDirectory+"/playmode-status.json","{\"passed\":"+(pass?"true":"false")+"}");
                Debug.Log("SENSA_PLAYMODE_VALIDATION "+pass);
            }catch(Exception ex){File.WriteAllText(ReportDirectory+"/playmode-error.txt",ex.ToString());SessionState.SetBool(Key+"Passed",false);}
            EditorApplication.isPlaying=false;
        }
        private static bool CaptureModel(Renderer[] renderers)
        {
            var resolverRenderer=renderers.First(r=>r.sharedMaterials.Any(m=>m!=null && m.shader.name=="Hidden/VRCFury/SpsResolver"));
            int index=Array.FindIndex(resolverRenderer.sharedMaterials,m=>m!=null && m.shader.name=="Hidden/VRCFury/SpsResolver");
            var source=resolverRenderer.sharedMaterials[index];
            var shader=AssetDatabase.LoadAssetAtPath<Shader>("Assets/SensaGpuDiagnostics/SpsGpuProbe.shader");var reader=new Material(shader);
            var identifiers=new[]{"_SPS_Configured","_SPS_IdLow","_SPS_IdHigh","_SPS_PlayerIdLow","_SPS_PlayerIdHigh"};
            string props="";foreach(var name in identifiers){float value=SensaGpuProbe.ReadProperty(source,resolverRenderer,name);reader.SetFloat(name,value);props+=name+"="+value+"\n";}
            // This test fixture explicitly enables overrun on its surface material.
            reader.SetFloat("_SPS_Overrun",1);
            File.WriteAllText(ReportDirectory+"/resolver-properties.txt",props);
            var camera=new GameObject("SPS validation camera").AddComponent<Camera>();camera.transform.position=new Vector3(-.8f,1.4f,1);camera.transform.LookAt(new Vector3(-.8f,1.1f,2.1f));camera.nearClipPlane=.01f;
            var sceneTarget=new RenderTexture(1280,720,24);sceneTarget.Create();camera.targetTexture=sceneTarget;
            var data=new RenderTexture(36,1,0,RenderTextureFormat.ARGBFloat,RenderTextureReadWrite.Linear);data.Create();var tex=new Texture2D(36,1,TextureFormat.RGBAFloat,false,true);var previous=RenderTexture.active;
            try {
                camera.Render();reader.SetVector("_SensaSourceSize",new Vector4(1280,720,1,1));Graphics.Blit(Texture2D.blackTexture,data,reader);
                RenderTexture.active=data;tex.ReadPixels(new Rect(0,0,36,1),0,0);tex.Apply();
                var capture=new SensaGpuProbe.Capture{capturedUtc=DateTime.UtcNow.ToString("O"),cameraName=camera.name,unityVersion=Application.unityVersion,width=1280,height=720,overrun=1};
                SensaGpuProbe.Decode(tex.GetPixels(),capture);File.WriteAllText(ReportDirectory+"/sps-model-capture.json",JsonUtility.ToJson(capture,true));
                var preview=new Texture2D(1280,720,TextureFormat.RGB24,false);RenderTexture.active=sceneTarget;preview.ReadPixels(new Rect(0,0,1280,720),0,0);preview.Apply();File.WriteAllBytes(ReportDirectory+"/sps-playmode.png",preview.EncodeToPNG());UnityEngine.Object.DestroyImmediate(preview);
                return capture.valid;
            }finally{RenderTexture.active=previous;UnityEngine.Object.DestroyImmediate(camera.gameObject);UnityEngine.Object.DestroyImmediate(reader);UnityEngine.Object.DestroyImmediate(tex);sceneTarget.Release();data.Release();UnityEngine.Object.DestroyImmediate(sceneTarget);UnityEngine.Object.DestroyImmediate(data);}
        }
    }
}
