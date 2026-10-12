using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEditor;
using UnityEditor.SceneManagement;
using UdonSharp;
using UdonSharpEditor;
using VRC.SDK3.Dynamics.Contact.Components;
using UnityBox.Sensa;

namespace SensaLab
{
    public static class LabPointCases
    {
        private const string Root="Assets/SensaLab/Generated";
        [Serializable] private class CaseResult { public string name; public Vector3 position; public float[] samples; public bool expectedValid, actualValid; public float residual; }
        [Serializable] private class Report { public string schema="sensa.point-cases.v1"; public string unity; public bool passed; public CaseResult[] cases; }
        [MenuItem("Tools/Sensa Lab/Add point geometry cases")]
        public static void AddCases()
        {
            var scene=EditorSceneManager.OpenScene(Root+"/SensaLab.unity");
            var existing=scene.GetRootGameObjects().FirstOrDefault(g=>g.name=="Sensa point geometry cases");
            if(existing!=null){EnsurePresentation(existing);EditorSceneManager.SaveScene(scene);return;}
            string programPath="Assets/SensaLab/Runtime/PointCaseStation.asset";
            if(AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(programPath)==null){var program=ScriptableObject.CreateInstance<UdonSharpProgramAsset>();program.sourceCsScript=AssetDatabase.LoadAssetAtPath<MonoScript>("Assets/SensaLab/Runtime/PointCaseStation.cs");program.ScriptVersion=UdonSharpProgramVersion.CurrentVersion;AssetDatabase.CreateAsset(program,programPath);}
            UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions{IsEditorBuild=true});
            var parent=new GameObject("Sensa point geometry cases");
            string[] names={"01 Front","02 Behind","03 Lateral","04 No contact","05 Saturated","06 Wrong radius","07 Scale x2","08 Rotated frame","09 Missing A3","10 Beyond fit volume","11 Origin"};
            var positions=new[]{new Vector3(.02f,-.03f,.1f),new Vector3(.02f,.01f,-.1f),new Vector3(.13f,-.05f,.08f),Vector3.forward*.6f,Vector3.one*-.06f,Vector3.forward*.1f,Vector3.forward*.1f,new Vector3(.02f,.03f,.1f),Vector3.forward*.1f,Vector3.forward*.26f,Vector3.zero};
            bool[] valid={true,true,true,false,false,false,true,true,false,false,true};
            string[] hints={"Valid: forward point","Valid: negative Z is observable","Valid: lateral offset","Invalid: no complete contact volume","Invalid: receiver value reaches 1","Invalid: sender radius is 40 mm, not 1 mm","Valid: uniform scaling preserves local XYZ","Valid: coordinates belong to rotated reference","Invalid: A3 explicitly omitted (fault injection)","Invalid: beyond 0.245 local m fit limit","Valid: point at reference origin"};
            for(int i=0;i<names.Length;i++){
                var node=new GameObject(names[i]);node.transform.SetParent(parent.transform,false);node.transform.localPosition=new Vector3(-3.6f+(i%4)*2.4f,1,4+(i/4)*2.3f);
                var frame=new GameObject("Reference").transform;frame.SetParent(node.transform,false);
                if(i==6)frame.localScale=Vector3.one*2;
                if(i==7)frame.localRotation=Quaternion.Euler(15,35,10);
                var marker=GameObject.CreatePrimitive(PrimitiveType.Sphere);marker.name="Sender";marker.transform.SetParent(frame,false);marker.transform.localPosition=positions[i];UnityEngine.Object.DestroyImmediate(marker.GetComponent<Collider>());
                // The visible sphere is a child so its display scale cannot alter the contact radius.
                var visual=GameObject.CreatePrimitive(PrimitiveType.Sphere);visual.transform.SetParent(marker.transform,false);visual.transform.localScale=Vector3.one*.025f;UnityEngine.Object.DestroyImmediate(visual.GetComponent<Collider>());UnityEngine.Object.DestroyImmediate(marker.GetComponent<MeshRenderer>());UnityEngine.Object.DestroyImmediate(marker.GetComponent<MeshFilter>());
                var sender=marker.AddComponent<VRCContactSender>();sender.radius=i==5?.04f:.001f;sender.collisionTags=new List<string>{"SensaLabCase"+i};
                var receivers=new VRCContactReceiver[4];
                for(int lane=0;lane<4;lane++){
                    int a=SensaPoseProtocol.PointAnchorIndex(lane);var corner=new GameObject("A"+lane);corner.transform.SetParent(frame,false);corner.transform.localPosition=new Vector3(SensaPoseProtocol.AnchorX(a),SensaPoseProtocol.AnchorY(a),SensaPoseProtocol.AnchorZ(a));
                    var receiver=corner.AddComponent<VRCContactReceiver>();receiver.radius=.35f;receiver.collisionTags=new List<string>{"SensaLabCase"+i};receivers[lane]=receiver;
                }
                var canvas=new GameObject("Case board",typeof(RectTransform)).AddComponent<Canvas>();canvas.renderMode=RenderMode.WorldSpace;canvas.transform.SetParent(node.transform,false);canvas.transform.localPosition=new Vector3(0,.75f,.3f);canvas.transform.localScale=Vector3.one*.0018f;((RectTransform)canvas.transform).sizeDelta=new Vector2(1200,650);
                var text=new GameObject("Case status",typeof(RectTransform)).AddComponent<Text>();text.transform.SetParent(canvas.transform,false);text.rectTransform.anchorMin=Vector2.zero;text.rectTransform.anchorMax=Vector2.one;text.rectTransform.offsetMin=Vector2.zero;text.rectTransform.offsetMax=Vector2.zero;text.font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");text.fontSize=30;text.text=names[i]+"\n"+hints[i]+"\nEnter Play Mode for native SDK samples.";
                var button=GameObject.CreatePrimitive(PrimitiveType.Cube);button.name="Pause case";button.transform.SetParent(node.transform,false);button.transform.localPosition=Vector3.down*.25f;button.transform.localScale=Vector3.one*.15f;
                var station=UdonSharpUndo.AddComponent<PointCaseStation>(button);station.caseName=names[i];station.expectation=hints[i];station.reference=frame;station.sender=sender;station.receivers=receivers;station.status=text;station.missingLane=i==8?3:-1;station.expectedValid=valid[i];UdonSharpEditorUtility.CopyProxyToUdon(station);
            }
            EnsurePresentation(parent);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        }
        private static void EnsurePresentation(GameObject parent)
        {
            if(parent.transform.Find("Case area floor")==null){var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.name="Case area floor";floor.transform.SetParent(parent.transform,false);floor.transform.localPosition=new Vector3(0,-.1f,6);floor.transform.localScale=new Vector3(13,.1f,9);}
            string materialPath=Root+"/CaseBoard.mat";var material=AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            if(material==null){material=new Material(Shader.Find("Unlit/Color"));material.color=new Color(.025f,.055f,.09f,1);AssetDatabase.CreateAsset(material,materialPath);}
            foreach(var canvas in parent.GetComponentsInChildren<Canvas>()){
                if(canvas.GetComponent<Image>()!=null)canvas.GetComponent<Image>().enabled=false;
                if(canvas.transform.parent.Find("Opaque board backing")==null){var panel=GameObject.CreatePrimitive(PrimitiveType.Cube);panel.name="Opaque board backing";panel.transform.SetParent(canvas.transform.parent,false);panel.transform.localPosition=canvas.transform.localPosition+Vector3.forward*.012f;panel.transform.localScale=new Vector3(2.16f,1.17f,.01f);UnityEngine.Object.DestroyImmediate(panel.GetComponent<Collider>());panel.GetComponent<Renderer>().sharedMaterial=material;}
            }
        }
        [MenuItem("Tools/Sensa Lab/Validate point geometry cases")]
        public static void Run()
        {
            AddCases();var stations=UnityEngine.Object.FindObjectsOfType<PointCaseStation>().OrderBy(s=>s.caseName).ToArray();
            if(stations.Length!=11)throw new InvalidOperationException("Expected eleven point case stations.");
            var go=new GameObject("Editor case contact manager");var manager=go.AddComponent<VRC.Dynamics.ContactManager>();manager.Awake();
            try{
                foreach(var station in stations){station.sender.InitShape();manager.AddContact(station.sender);foreach(var receiver in station.receivers){receiver.InitShape();manager.AddContact(receiver);}}
                manager.collision.UpdateAndSchedule(.016f,true).Complete();
                var cases=stations.Select(station=>{station.Refresh();return new CaseResult{name=station.caseName,position=station.reference.InverseTransformPoint(station.sender.transform.position),samples=station.samples.ToArray(),expectedValid=station.expectedValid,actualValid=station.decodedValid,residual=station.residual};}).ToArray();
                bool passed=cases.All(c=>c.expectedValid==c.actualValid);Directory.CreateDirectory("Validation");File.WriteAllText("Validation/point-cases.json",JsonUtility.ToJson(new Report{unity=Application.unityVersion,passed=passed,cases=cases},true));
                CaptureCases();
                Debug.Log("SENSA_POINT_CASES "+passed);if(Application.isBatchMode)EditorApplication.Exit(passed?0:1);
            }finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        private static void CaptureCases()
        {
            var go=new GameObject("Case report camera");var camera=go.AddComponent<Camera>();camera.transform.position=new Vector3(0,7,-1);camera.transform.LookAt(new Vector3(0,1,6));camera.fieldOfView=66;
            var target=new RenderTexture(1600,1000,24);target.Create();camera.targetTexture=target;var read=new Texture2D(1600,1000,TextureFormat.RGB24,false);var previous=RenderTexture.active;
            try{camera.Render();RenderTexture.active=target;read.ReadPixels(new Rect(0,0,1600,1000),0,0);read.Apply();File.WriteAllBytes("Validation/point-cases-world.png",read.EncodeToPNG());
                camera.transform.position=new Vector3(-3.6f,1.8f,2.3f);camera.transform.LookAt(new Vector3(-3.6f,1.7f,4.3f));camera.fieldOfView=50;camera.Render();RenderTexture.active=target;read.ReadPixels(new Rect(0,0,1600,1000),0,0);read.Apply();File.WriteAllBytes("Validation/point-case-detail.png",read.EncodeToPNG());}
            finally{RenderTexture.active=previous;UnityEngine.Object.DestroyImmediate(go);UnityEngine.Object.DestroyImmediate(read);target.Release();UnityEngine.Object.DestroyImmediate(target);}
        }
    }
}
