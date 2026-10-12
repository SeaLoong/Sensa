using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using VRC.SDK3.Dynamics.Contact.Components;
using UnityBox.Sensa;

namespace SensaLab
{
    public static class LabValidation
    {
        [Serializable] private class Report { public string unity, gpu, utc; public string[] passed; public string[] failed; public string[] unverified; }
        private static readonly List<string> passed=new List<string>(), failed=new List<string>();
        private static void Check(bool value,string name) { (value?passed:failed).Add(name); }
        [MenuItem("Tools/Sensa Lab/Run editor GPU validation")]
        public static void Run()
        {
            passed.Clear();failed.Clear();Directory.CreateDirectory("Validation");
            try {
                EditorSceneManager.OpenScene("Assets/SensaLab/Generated/SensaLab.unity");
                foreach(var name in new[]{"SensaLab/Telemetry","SensaLab/TextureOutput"}) {
                    var shader=Shader.Find(name);Check(shader!=null && shader.isSupported && !ShaderUtil.ShaderHasError(shader),name+" supported");
                }
                TestTelemetry(); TestCameraOutput(); TestContacts(); TestGpuAdapter();
                CaptureScene();
            } catch(Exception ex) {failed.Add(ex.ToString());}
            var report=new Report { unity=Application.unityVersion,gpu=SystemInfo.graphicsDeviceName,utc=DateTime.UtcNow.ToString("O"),passed=passed.ToArray(),failed=failed.ToArray(),
                unverified=new[]{"VRChat client avatar camera filtering / HMD invisibility", "Spout or window capture timing", "Actual SPS resolver deformation runtime", "Remote-player Contact/OSC integration", "Physical hardware intentionally not connected"} };
            File.WriteAllText("Validation/editor-results.json",JsonUtility.ToJson(report,true));
            Debug.Log("SENSA_LAB_VALIDATION passed="+passed.Count+" failed="+failed.Count);
            if(Application.isBatchMode) EditorApplication.Exit(failed.Count==0?0:1);
        }
        private static Color32[] Render(Material material,int width,int height,string png=null) {
            var rt=new RenderTexture(width,height,0,RenderTextureFormat.ARGB32,RenderTextureReadWrite.Linear);rt.Create();
            var read=new Texture2D(width,height,TextureFormat.RGBA32,false,true);var previous=RenderTexture.active;
            try {Graphics.Blit(Texture2D.blackTexture,rt,material);RenderTexture.active=rt;read.ReadPixels(new Rect(0,0,width,height),0,0);read.Apply();
                if(png!=null) File.WriteAllBytes(png,read.EncodeToPNG());return read.GetPixels32();}
            finally {RenderTexture.active=previous;rt.Release();UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(read);}
        }
        private static byte[] Decode(Color32[] pixels,int width,int height) {
            var bytes=new byte[16];for(int x=0;x<16;x++)for(int y=0;y<8;y++) if(pixels[(y*height/8+height/16)*width+x*width/16+width/32].r>127)bytes[x]|=(byte)(1<<y);
            if(Valid(bytes)) return bytes;
            var flipped=new byte[16];for(int x=0;x<16;x++)for(int y=0;y<8;y++)flipped[x]|=(byte)(((bytes[x]>>y)&1)<<(7-y));
            return Valid(flipped)?flipped:bytes;
        }
        private static bool Valid(byte[] b) {
            int crc=65535;for(int i=0;i<14;i++){crc^=b[i]<<8;for(int j=0;j<8;j++)crc=((crc<<1)^((crc&32768)!=0?4129:0))&65535;}
            return b[0]==83 && b[1]==78 && b[2]==1 && b[3]==1 && crc==(b[14]|b[15]<<8);
        }
        private static void TestTelemetry() {
            var material=new Material(Shader.Find("SensaLab/Telemetry"));
            try {
                foreach(int sequence in new[]{0,1,255,256,65535}) {
                    material.SetFloat("_Sequence",sequence);material.SetVector("_Sample",new Vector4(.25f,-.5f,.75f,0));
                    var bytes=Decode(Render(material,256,128,sequence==256?"Validation/telemetry.png":null),256,128);
                    Check(Valid(bytes) && (bytes[4]|bytes[5]<<8)==sequence,"GPU packet sequence "+sequence);
                    var x=(bytes[6]|bytes[7]<<8)/65535f*2-1;Check(Mathf.Abs(x-.25f)<.00004f,"GPU XYZ quantization "+sequence);
                    bytes[6]^=1;Check(!Valid(bytes),"CRC rejects corruption "+sequence);
                }
                var scaled=Decode(Render(material,512,256),512,256);Check(Valid(scaled),"Integer-resolution scaling");
            }finally{UnityEngine.Object.DestroyImmediate(material);}
        }
        private static void TestContacts() {
            var sender=GameObject.Find("Moving Root").GetComponent<VRCContactSender>();
            var receivers=GameObject.Find("Contact Reference").GetComponentsInChildren<VRCContactReceiver>();
            Check(receivers.Length==8,"Eight native Contact receivers");
            var managerObject=new GameObject("Editor-only Contact test manager");var manager=managerObject.AddComponent<VRC.Dynamics.ContactManager>();manager.Awake();
            sender.InitShape();manager.AddContact(sender);
            foreach(var receiver in receivers){receiver.InitShape();manager.AddContact(receiver);}
            manager.collision.UpdateAndSchedule(.016f,true).Complete();
            try {
            foreach(var receiver in receivers) {
                var expected=1-Mathf.Max(0,Vector3.Distance(receiver.transform.position,sender.transform.position)-.01f)/.35f;
                var actual=receiver.CalculateProximity(sender);
                Check(Mathf.Abs(actual-expected)<.0001f,"SDK proximity "+receiver.name);
            }
            } finally {UnityEngine.Object.DestroyImmediate(managerObject);}
            Check(GameObject.Find("Paired Pose Sender / Pair01").GetComponentsInChildren<VRCContactSender>().Length==3,"Three paired native markers");
        }
        private static void TestCameraOutput() {
            var telemetry=AssetDatabase.LoadAssetAtPath<Material>("Assets/SensaLab/Generated/Telemetry.mat");
            var source=AssetDatabase.LoadAssetAtPath<RenderTexture>("Assets/SensaLab/Generated/Telemetry.renderTexture");
            source.Create();telemetry.SetFloat("_Sequence",12345);Graphics.Blit(Texture2D.blackTexture,source,telemetry);
            var rig=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/SensaLab/Generated/DesktopOutputExperiment.prefab"));
            var camera=rig.GetComponent<Camera>();camera.rect=new Rect(0,0,1,1);camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=Color.black;
            var target=new RenderTexture(256,128,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.Linear);target.Create();camera.targetTexture=target;
            var read=new Texture2D(256,128,TextureFormat.RGBA32,false,true);var previous=RenderTexture.active;
            try {
                rig.SetActive(true);
                foreach(var yaw in new[]{0,45,90,180,270}) {
                    rig.transform.rotation=Quaternion.Euler(10,yaw,0);camera.Render();RenderTexture.active=target;read.ReadPixels(new Rect(0,0,256,128),0,0);read.Apply();
                    var bytes=Decode(read.GetPixels32(),256,128);Check(Valid(bytes) && (bytes[4]|bytes[5]<<8)==12345,"Fixed camera output yaw "+yaw);
                }
                File.WriteAllBytes("Validation/camera-output.png",read.EncodeToPNG());
                Shader.SetGlobalFloat("_VRChatMirrorMode",1);camera.Render();RenderTexture.active=target;read.ReadPixels(new Rect(0,0,256,128),0,0);read.Apply();
                Check(!Valid(Decode(read.GetPixels32(),256,128)),"Mirror-mode output suppressed (simulated shader global)");
            }finally {Shader.SetGlobalFloat("_VRChatMirrorMode",0);RenderTexture.active=previous;UnityEngine.Object.DestroyImmediate(rig);UnityEngine.Object.DestroyImmediate(read);target.Release();UnityEngine.Object.DestroyImmediate(target);}
        }
        private static void TestGpuAdapter() {
            SensaGpuProbe.CheckDependencies();
            Directory.CreateDirectory("Assets/SensaGpuDiagnostics");
            File.Copy("Assets/SensaLab/Editor/SpsGpuProbe.shader.txt","Assets/SensaGpuDiagnostics/SpsGpuProbe.shader",true);
            AssetDatabase.ImportAsset("Assets/SensaGpuDiagnostics/SpsGpuProbe.shader",ImportAssetOptions.ForceSynchronousImport);
            var shader=AssetDatabase.LoadAssetAtPath<Shader>("Assets/SensaGpuDiagnostics/SpsGpuProbe.shader");
            var mat=new Material(shader);var rt=new RenderTexture(36,1,0,RenderTextureFormat.ARGBFloat,RenderTextureReadWrite.Linear);rt.Create();
            var tex=new Texture2D(36,1,TextureFormat.RGBAFloat,false,true);var previous=RenderTexture.active;
            try {
                mat.SetVector("_SensaSourceSize",new Vector4(1280,720,1,1));Graphics.Blit(Texture2D.blackTexture,rt,mat);
                RenderTexture.active=rt;tex.ReadPixels(new Rect(0,0,36,1),0,0);tex.Apply();
                var result=new SensaGpuProbe.Capture();SensaGpuProbe.Decode(tex.GetPixels(),result);
                Check(!ShaderUtil.ShaderHasError(shader),"SPS adapter Shader compilation");Check(!result.valid,"SPS adapter rejects absent resolver");
                foreach(var message in ShaderUtil.GetShaderMessages(shader)) if(message.severity.ToString()=="Error") failed.Add(message.message);
            }finally{RenderTexture.active=previous;UnityEngine.Object.DestroyImmediate(mat);UnityEngine.Object.DestroyImmediate(tex);rt.Release();UnityEngine.Object.DestroyImmediate(rt);}
        }
        private static void CaptureScene() {
            var camera=GameObject.Find("Editor Reference Camera").GetComponent<Camera>();var rt=new RenderTexture(1280,720,24);rt.Create();var previous=RenderTexture.active;var old=camera.targetTexture;
            var tex=new Texture2D(1280,720,TextureFormat.RGB24,false);
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;tex.ReadPixels(new Rect(0,0,1280,720),0,0);tex.Apply();File.WriteAllBytes("Validation/world-preview.png",tex.EncodeToPNG());}
            finally{camera.targetTexture=old;RenderTexture.active=previous;rt.Release();UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(tex);}
        }
    }
}
