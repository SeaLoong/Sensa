using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityBox.Sensa;
using UdonSharpEditor;
using VRC.Dynamics;
using VRC.SDK3.Dynamics.Contact.Components;

namespace SensaLab
{
    [InitializeOnLoad]
    public static class FunctionalValidation
    {
        const string Key="Sensa.FunctionalRun";
        static double started;
        static int stage;
        static List<Row> rows=new List<Row>();
        [Serializable] public class Row {public string name,preset,text;public bool passed;public float maxContactError,nativeLength,nativeProximity,axialDepth,radialDepth;}
        [Serializable] class Report {public bool passed;public Row[] rows;public string[] unverified={"Real VR hand grabbing", "Avatar OSC from VRChat", "HMD invisibility and client screen-capture latency"};}
        static FunctionalValidation(){EditorApplication.playModeStateChanged+=Changed;EditorApplication.update+=Tick;}
        [MenuItem("Tools/Sensa Lab/Validate capability world in Play Mode")]
        public static void Run()
        {
            Directory.CreateDirectory("Validation/functional");EditorSceneManager.OpenScene(FunctionalLab.Scene);
            SessionState.SetBool(Key+"passed",false);
            LabEncoderMaterials.Prepare();
            LabMaterialValidation.Capture("Validation/functional");
            var type=AppDomain.CurrentDomain.GetAssemblies().Select(a=>a.GetType("VF.Features.BuildSps")).First(t=>t!=null);
            type.GetMethod("Process").Invoke(null,new object[]{UnityEngine.SceneManagement.SceneManager.GetActiveScene()});
            SessionState.SetBool(Key+"hadPref",EditorPrefs.HasKey("com.vrcfury.playMode"));SessionState.SetBool(Key+"pref",EditorPrefs.GetBool("com.vrcfury.playMode",true));EditorPrefs.SetBool("com.vrcfury.playMode",false);
            EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene(),FunctionalLab.Root+"/BakedValidation.unity");
            SessionState.SetInt(Key,1);SessionState.SetFloat(Key+"started",(float)EditorApplication.timeSinceStartup);EditorApplication.isPlaying=true;
        }
        static void Changed(PlayModeStateChange state)
        {
            if(SessionState.GetInt(Key,0)==0)return;
            if(state==PlayModeStateChange.EnteredPlayMode){started=EditorApplication.timeSinceStartup;stage=0;rows=new List<Row>();SessionState.SetInt(Key,2);}
            if(state==PlayModeStateChange.EnteredEditMode){RestorePreference();SessionState.SetInt(Key,0);bool materials=LabMaterialValidation.Finish();if(Application.isBatchMode)EditorApplication.Exit(SessionState.GetBool(Key+"passed",false)&&materials?0:1);}
        }
        static void RestorePreference(){if(SessionState.GetBool(Key+"hadPref",false))EditorPrefs.SetBool("com.vrcfury.playMode",SessionState.GetBool(Key+"pref",true));else EditorPrefs.DeleteKey("com.vrcfury.playMode");}
        static void Tick()
        {
            if(SessionState.GetInt(Key,0)==1 && EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"started",0)>120)
            {
                RestorePreference();SessionState.SetInt(Key,0);SessionState.SetBool(Key+"passed",false);
                File.WriteAllText("Validation/functional/error.txt","Play Mode startup timed out; check Udon compilation errors in the Unity log.");
                if(Application.isBatchMode)EditorApplication.Exit(1);return;
            }
            if(SessionState.GetInt(Key,0)!=2)return;
            double elapsed=EditorApplication.timeSinceStartup-started;
            if(elapsed<4+stage*3)return;
            var stations=UnityEngine.Object.FindObjectsOfType<CapabilityStation>().OrderBy(s=>s.mode).ToArray();
            try
            {
                foreach(var s in stations)
                {
                    if(stage>0 && (s.mode==1||s.mode==2||s.mode==5))continue;
                    var runtime=UdonSharpEditorUtility.GetBackingUdonBehaviour(s);
                    float Read(string name)=>(float)runtime.GetProgramVariable(name);
                    var row=new Row{name=s.title,preset=stage==0?"outside/rest":stage==1?"near":"offset",text=s.status.text,maxContactError=Read("contactError"),nativeLength=Read("nativeLength"),nativeProximity=Read("nativeProximity"),axialDepth=Read("axialDepth"),radialDepth=Read("radialDepth")};
                    row.passed=row.maxContactError<.0001f && !string.IsNullOrEmpty(row.text);
                    if(s.bone!=null)row.passed&=s.bone.allowGrabbing==VRCPhysBoneBase.AdvancedBool.True && s.bone.allowCollision==VRCPhysBoneBase.AdvancedBool.False && s.bone.colliders.Count==0 && s.bone.radius>0 && s.bone.GetComponentsInChildren<Collider>().Length==0;
                    if(s.mode==1)row.passed&=s.GetComponentsInChildren<VRCContactReceiver>().Length==0;
                    if(s.mode==3 || s.mode==4 || s.mode==6){row.passed&=Mathf.Abs(row.nativeLength-.2f)<.002f;if(stage==1)row.passed&=Mathf.Abs(row.axialDepth-.4f)<.001f && Mathf.Abs(row.radialDepth-.4f)<.001f && Mathf.Abs(row.nativeProximity+.08f)<.002f;if(stage==2)row.passed&=Mathf.Abs(row.radialDepth-.32918f)<.001f;}
                    rows.Add(row);
                    if(stage<2)runtime.SendCustomEvent(stage==0?"Near":"Offset");
                }
                InteractiveValidation.Step(stage);
                stage++;
                if(stage<3)return;
                LabMaterialValidation.CheckRuntime();
                CaptureGpu(stations.Single(s=>s.mode==6));
                ExportTexture(stations.Single(s=>s.mode==5).encoded,"Validation/functional/synthetic-telemetry.png");
                var transport=stations.Single(s=>s.mode==5);
                var program=UdonSharpEditorUtility.GetBackingUdonBehaviour(transport);
                program.SendCustomEvent("Corrupt");
                try {Graphics.Blit(Texture2D.blackTexture,transport.encoded,(Material)program.GetProgramVariable("runtimeEncoder"));ExportTexture(transport.encoded,"Validation/functional/corrupt-telemetry.png");}
                finally {program.SendCustomEvent("Corrupt");}
                var report=new Report{passed=stations.Length==7 && rows.All(r=>r.passed) && InteractiveValidation.Passed,rows=rows.ToArray()};
                File.WriteAllText("Validation/functional/results.json",JsonUtility.ToJson(report,true));SessionState.SetBool(Key+"passed",report.passed);
            }
            catch(Exception ex){File.WriteAllText("Validation/functional/error.txt",ex.ToString());SessionState.SetBool(Key+"passed",false);}
            SessionState.SetInt(Key,3);EditorApplication.isPlaying=false;
        }
        static void ExportTexture(RenderTexture target,string path)
        {
            var previous=RenderTexture.active;var image=new Texture2D(target.width,target.height,TextureFormat.RGBA32,false,true);
            try{RenderTexture.active=target;image.ReadPixels(new Rect(0,0,target.width,target.height),0,0);image.Apply();File.WriteAllBytes(path,image.EncodeToPNG());}
            finally{RenderTexture.active=previous;UnityEngine.Object.DestroyImmediate(image);}
        }
        static void CaptureGpu(CapabilityStation station)
        {
            var renderer=station.GetComponentsInChildren<Renderer>(true).First(r=>r.sharedMaterials.Any(m=>m!=null&&m.shader.name=="Hidden/VRCFury/SpsResolver"));
            var resolver=renderer.sharedMaterials.First(m=>m!=null&&m.shader.name=="Hidden/VRCFury/SpsResolver");
            SensaGpuProbe.CheckDependencies();
            var reader=(Material)typeof(SensaGpuProbe).GetMethod("CreateReader",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,null);
            foreach(var name in new[]{"_SPS_Configured","_SPS_IdLow","_SPS_IdHigh","_SPS_PlayerIdLow","_SPS_PlayerIdHigh"})reader.SetFloat(name,SensaGpuProbe.ReadProperty(resolver,renderer,name));reader.SetFloat("_SPS_Overrun",1);
            var camera=new GameObject("SPS model capture camera").AddComponent<Camera>();camera.transform.position=station.transform.position+new Vector3(-.5f,.4f,-1.2f);camera.transform.LookAt(station.transform.position+Vector3.forward*.15f);camera.nearClipPlane=.01f;
            var view=new RenderTexture(1600,1000,24);view.Create();camera.targetTexture=view;
            var data=new RenderTexture(36,1,0,RenderTextureFormat.ARGBFloat,RenderTextureReadWrite.Linear);data.Create();var texture=new Texture2D(36,1,TextureFormat.RGBAFloat,false,true);var previous=RenderTexture.active;
            try
            {
                camera.Render();reader.SetVector("_SensaSourceSize",new Vector4(1600,1000,1,1));Graphics.Blit(Texture2D.blackTexture,data,reader);RenderTexture.active=data;texture.ReadPixels(new Rect(0,0,36,1),0,0);texture.Apply();
                var capture=new SensaGpuProbe.Capture{capturedUtc=DateTime.UtcNow.ToString("O"),cameraName=camera.name,width=1600,height=1000,unityVersion=Application.unityVersion,overrun=1};SensaGpuProbe.Decode(texture.GetPixels(),capture);
                File.WriteAllText("Validation/functional/sps-gpu.json",JsonUtility.ToJson(capture,true));if(!capture.valid)throw new InvalidOperationException(LabEditorLocalization.Text("Actual SPS GPU model capture is invalid."));
                SensaGpuProbe.ExportTelemetryPng(capture,"Validation/functional/sps-telemetry.png",101);
                SensaGpuProbe.ExportTelemetryPng(capture,"Validation/functional/sps-telemetry-next.png",102);
                SensaGpuProbe.ExportTelemetryPng(capture,"Validation/functional/sps-recovery-first.png",103);
                SensaGpuProbe.ExportTelemetryPng(capture,"Validation/functional/sps-recovery-next.png",104);
                ExportTexture(view,"Validation/functional/sps-scene.png");
                camera.transform.position=new Vector3(0,12,-5);camera.transform.LookAt(new Vector3(0,1,7));camera.fieldOfView=70;camera.Render();ExportTexture(view,"Validation/functional/overview.png");
                camera.transform.position=new Vector3(-4,1.8f,6.1f);camera.transform.LookAt(new Vector3(-4,1.65f,8.25f));camera.fieldOfView=65;camera.Render();ExportTexture(view,"Validation/functional/native-sps-detail.png");
                camera.transform.position=new Vector3(-6.3f,1.9f,-3.6f);camera.transform.LookAt(new Vector3(-5.6f,1.3f,-.5f));camera.fieldOfView=50;camera.Render();ExportTexture(view,"Validation/interaction/native-avatar-zone.png");
                camera.transform.position=new Vector3(-3.7f,1.3f,2.5f);camera.transform.LookAt(new Vector3(-4,1,3));camera.fieldOfView=65;camera.Render();ExportTexture(view,"Validation/interaction/probe-colors.png");
            }
            finally{RenderTexture.active=previous;UnityEngine.Object.DestroyImmediate(reader);UnityEngine.Object.DestroyImmediate(texture);UnityEngine.Object.DestroyImmediate(camera.gameObject);view.Release();data.Release();UnityEngine.Object.DestroyImmediate(view);UnityEngine.Object.DestroyImmediate(data);}
        }
    }
}
