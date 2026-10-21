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
        [Serializable] private class Report { public string schema="sensa.point-cases.v1"; public string unity; public bool passed, interactiveConfigured; public int buttonCount; public CaseResult[] cases; }
        [MenuItem("Tools/Sensa Lab/Add point geometry cases")]
        public static void AddCases()
        {
            var scene=LabEditorLocalization.OpenScene(Root+"/SensaLab.unity");
            foreach(var script in new[]{"PointCaseStation","PointCaseButton"}){
                string programPath="Assets/SensaLab/Runtime/"+script+".asset";
                if(AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(programPath)==null){var program=ScriptableObject.CreateInstance<UdonSharpProgramAsset>();program.sourceCsScript=AssetDatabase.LoadAssetAtPath<MonoScript>("Assets/SensaLab/Runtime/"+script+".cs");program.ScriptVersion=UdonSharpProgramVersion.CurrentVersion;AssetDatabase.CreateAsset(program,programPath);}
            }
            UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions{IsEditorBuild=true});
            var existing=scene.GetRootGameObjects().FirstOrDefault(g=>g.name=="Sensa point geometry cases");
            if(existing!=null){EnsurePresentation(existing);LabPlayability.Apply();LabEditorLocalization.SaveScene(scene);AssetDatabase.SaveAssets();return;}
            var parent=new GameObject("Sensa point geometry cases");
            string[] names={"01 Front","02 Behind","03 Lateral","04 No contact","05 Saturated","06 Wrong radius","07 Scale x2","08 Rotated frame","09 Missing P4","10 Beyond fit volume","11 Origin"};
            var positions=new[]{new Vector3(.02f,-.03f,.1f),new Vector3(.02f,.01f,-.1f),new Vector3(.13f,-.05f,.08f),Vector3.forward*(SensaPoseProtocol.ReceiverRadius*1.5f),Vector3.one*-SensaPoseProtocol.AnchorHalfSpan,Vector3.forward*.1f,Vector3.forward*.1f,new Vector3(.02f,.03f,.1f),Vector3.forward*.1f,Vector3.forward*(SensaPoseProtocol.PositionRadius+.02f),Vector3.zero};
            bool[] valid={true,true,true,false,false,false,true,true,false,false,true};
            string[] hints={"Valid: forward point","Valid: negative Z is observable","Valid: lateral offset","Invalid: no complete contact volume","Invalid: receiver value reaches 1","Invalid: sender radius is 40 mm, not 1 mm","Valid: uniform scaling preserves local XYZ","Valid: coordinates belong to rotated reference","Invalid: probe P4 explicitly omitted (fault injection)","Invalid: beyond the shared local fit radius","Valid: point at reference origin"};
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
                    var receiver=corner.AddComponent<VRCContactReceiver>();receiver.radius=SensaPoseProtocol.ReceiverRadius;receiver.collisionTags=new List<string>{"SensaLabCase"+i};receivers[lane]=receiver;
                }
                var canvas=new GameObject("Case board",typeof(RectTransform)).AddComponent<Canvas>();canvas.renderMode=RenderMode.WorldSpace;canvas.transform.SetParent(node.transform,false);canvas.transform.localPosition=new Vector3(0,.75f,.3f);canvas.transform.localScale=Vector3.one*.0018f;((RectTransform)canvas.transform).sizeDelta=new Vector2(1200,650);
                var text=new GameObject("Case status",typeof(RectTransform)).AddComponent<Text>();text.transform.SetParent(canvas.transform,false);text.rectTransform.anchorMin=Vector2.zero;text.rectTransform.anchorMax=Vector2.one;text.rectTransform.offsetMin=Vector2.zero;text.rectTransform.offsetMax=Vector2.zero;text.font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");text.fontSize=30;text.text=names[i]+"\n"+hints[i]+"\nEnter Play Mode for native SDK samples.";
                var button=GameObject.CreatePrimitive(PrimitiveType.Cube);button.name="Pause case";button.transform.SetParent(node.transform,false);button.transform.localPosition=Vector3.down*.25f;button.transform.localScale=Vector3.one*.15f;
                var station=UdonSharpUndo.AddComponent<PointCaseStation>(button);station.caseName=names[i];station.expectation=hints[i];station.reference=frame;station.sender=sender;station.receivers=receivers;station.status=text;station.missingLane=i==8?3:-1;station.expectedValid=valid[i];UdonSharpEditorUtility.CopyProxyToUdon(station);
            }
            EnsurePresentation(parent);LabPlayability.Apply();LabEditorLocalization.SaveScene(scene);AssetDatabase.SaveAssets();
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
            foreach(var station in parent.GetComponentsInChildren<PointCaseStation>())EnsureInteraction(station,material);
        }
        private static void EnsureInteraction(PointCaseStation station,Material boardMaterial)
        {
            var marker=station.sender.gameObject;
            var collider=marker.GetComponent<SphereCollider>();if(collider==null)collider=marker.AddComponent<SphereCollider>();collider.radius=.04f;
            var body=marker.GetComponent<Rigidbody>();if(body==null)body=marker.AddComponent<Rigidbody>();body.useGravity=false;body.drag=8;body.angularDrag=8;
            station.targetBody=body;station.pickup=marker.GetComponent<VRC.SDK3.Components.VRCPickup>();if(station.pickup==null)station.pickup=marker.AddComponent<VRC.SDK3.Components.VRCPickup>();
            foreach(var mesh in marker.GetComponentsInChildren<MeshRenderer>())if(mesh.transform!=marker.transform)mesh.transform.localScale=Vector3.one*.08f;
            var canvas=station.status.GetComponentInParent<Canvas>();
            if(station.sampleBars==null || station.sampleBars.Length!=4){
                station.sampleBars=new Image[4];
                for(int lane=0;lane<4;lane++){
                    var label=new GameObject("Lane label "+lane,typeof(RectTransform)).AddComponent<Text>();label.transform.SetParent(canvas.transform,false);label.font=station.status.font;label.fontSize=26;label.text="P"+(lane+1);label.color=InteractiveLab.ProbeColor(lane);
                    label.rectTransform.anchorMin=label.rectTransform.anchorMax=new Vector2(0,1);label.rectTransform.pivot=new Vector2(0,1);label.rectTransform.anchoredPosition=new Vector2(28,-405-lane*45);label.rectTransform.sizeDelta=new Vector2(100,36);
                    var background=new GameObject("Lane background "+lane,typeof(RectTransform)).AddComponent<Image>();background.transform.SetParent(canvas.transform,false);background.color=new Color(.12f,.2f,.3f);background.raycastTarget=false;
                    background.rectTransform.anchorMin=background.rectTransform.anchorMax=new Vector2(0,1);background.rectTransform.pivot=new Vector2(0,1);background.rectTransform.anchoredPosition=new Vector2(140,-413-lane*45);background.rectTransform.sizeDelta=new Vector2(650,14);
                    var bar=new GameObject("Lane value "+lane,typeof(RectTransform)).AddComponent<Image>();bar.transform.SetParent(background.transform,false);bar.color=Color.cyan;bar.raycastTarget=false;bar.rectTransform.anchorMin=bar.rectTransform.anchorMax=new Vector2(0,1);bar.rectTransform.pivot=new Vector2(0,1);bar.rectTransform.anchoredPosition=Vector2.zero;bar.rectTransform.sizeDelta=new Vector2(0,14);station.sampleBars[lane]=bar;
                    var anchor=station.receivers[lane].transform;
                    if(anchor.Find("Visible anchor")==null){var sphere=GameObject.CreatePrimitive(PrimitiveType.Sphere);sphere.name="Visible anchor";sphere.transform.SetParent(anchor,false);sphere.transform.localScale=Vector3.one*.012f;UnityEngine.Object.DestroyImmediate(sphere.GetComponent<Collider>());}
                }
            }
            if(station.positionLine==null){var line=new GameObject("Position vector");line.transform.SetParent(station.reference,false);station.positionLine=line.AddComponent<LineRenderer>();station.positionLine.positionCount=2;station.positionLine.startWidth=station.positionLine.endWidth=.003f;station.positionLine.sharedMaterial=AssetDatabase.GetBuiltinExtraResource<Material>("Default-Line.mat");}
            foreach(bool missing in new[]{false,true}){
                string name=missing?"Toggle missing A3":"Reset case";var owner=station.transform.parent;
                var existing=owner.Find(name);GameObject button;
                if(existing==null){button=GameObject.CreatePrimitive(PrimitiveType.Cube);button.name=name;button.transform.SetParent(owner,false);button.transform.localPosition=new Vector3(missing?.25f:-.25f,-.25f,0);button.transform.localScale=Vector3.one*.15f;
                    var control=UdonSharpUndo.AddComponent<PointCaseButton>(button);control.station=station;control.toggleMissing=missing;UdonSharpEditorUtility.CopyProxyToUdon(control);}
                else button=existing.gameObject;
                string path=Root+(missing?"/MissingButton.mat":"/ResetButton.mat");var material=AssetDatabase.LoadAssetAtPath<Material>(path);
                if(material==null){material=new Material(Shader.Find("Unlit/Color"));material.color=missing?new Color(.9f,.4f,.05f):new Color(.05f,.4f,.9f);AssetDatabase.CreateAsset(material,path);}
                button.GetComponent<Renderer>().sharedMaterial=material;
                LabelButton(button,missing?"MISSING P4":"RESET",station.status.font);
            }
            LabelButton(station.gameObject,"PAUSE",station.status.font);
            UdonSharpEditorUtility.CopyProxyToUdon(station);
        }
        private static void LabelButton(GameObject button,string title,Font font)
        {
            if(button.transform.parent.Find(button.name+" label")!=null)return;
            var canvas=new GameObject(button.name+" label",typeof(RectTransform)).AddComponent<Canvas>();canvas.renderMode=RenderMode.WorldSpace;canvas.transform.SetParent(button.transform.parent,false);canvas.transform.localPosition=button.transform.localPosition+Vector3.up*.13f;canvas.transform.localScale=Vector3.one*.001f;((RectTransform)canvas.transform).sizeDelta=new Vector2(240,55);
            var text=canvas.gameObject.AddComponent<Text>();text.font=font;text.fontSize=30;text.alignment=TextAnchor.MiddleCenter;text.text=title;text.raycastTarget=false;
        }
        [MenuItem("Tools/Sensa Lab/Validate point geometry cases")]
        public static void Run()
        {
            AddCases();var stations=UnityEngine.Object.FindObjectsOfType<PointCaseStation>().OrderBy(s=>s.caseName).ToArray();
            if(stations.Length!=11)throw new InvalidOperationException(LabEditorLocalization.Text("Expected eleven point case stations."));
            var go=new GameObject("Editor case contact manager");var manager=go.AddComponent<VRC.Dynamics.ContactManager>();manager.Awake();
            try{
                foreach(var station in stations){station.sender.InitShape();manager.AddContact(station.sender);foreach(var receiver in station.receivers){receiver.InitShape();manager.AddContact(receiver);}}
                manager.collision.UpdateAndSchedule(.016f,true).Complete();
                var cases=stations.Select(station=>{station.Refresh();return new CaseResult{name=station.caseName,position=station.reference.InverseTransformPoint(station.sender.transform.position),samples=station.samples.ToArray(),expectedValid=station.expectedValid,actualValid=station.decodedValid,residual=station.residual};}).ToArray();
                var buttons=UnityEngine.Object.FindObjectsOfType<PointCaseButton>();
                bool configured=stations.All(s=>s.pickup!=null && s.targetBody!=null && s.sender.GetComponent<SphereCollider>()!=null && s.sampleBars.Length==4 && s.positionLine!=null) && buttons.Length==22 && buttons.All(b=>b.station!=null);
                bool passed=cases.All(c=>c.expectedValid==c.actualValid) && configured;Directory.CreateDirectory("Validation");File.WriteAllText("Validation/point-cases.json",JsonUtility.ToJson(new Report{unity=Application.unityVersion,passed=passed,cases=cases,interactiveConfigured=configured,buttonCount=buttons.Length},true));
                CaptureCases();
                Debug.Log("SENSA_POINT_CASES "+passed);if(Application.isBatchMode)EditorApplication.Exit(passed?0:1);
            }finally{UnityEngine.Object.DestroyImmediate(go);}
        }
        private static void CaptureCases()
        {
            var go=new GameObject("Case report camera");var camera=go.AddComponent<Camera>();camera.transform.position=new Vector3(0,7,-1);camera.transform.LookAt(new Vector3(0,1,6));camera.fieldOfView=66;
            var target=new RenderTexture(1600,1000,24);target.Create();camera.targetTexture=target;var read=new Texture2D(1600,1000,TextureFormat.RGB24,false);var previous=RenderTexture.active;
            try{camera.Render();RenderTexture.active=target;read.ReadPixels(new Rect(0,0,1600,1000),0,0);read.Apply();File.WriteAllBytes("Validation/point-cases-world.png",read.EncodeToPNG());
                camera.transform.position=new Vector3(-3.6f,1.8f,2.3f);camera.transform.LookAt(new Vector3(-3.6f,1.5f,4.3f));camera.fieldOfView=60;camera.Render();RenderTexture.active=target;read.ReadPixels(new Rect(0,0,1600,1000),0,0);read.Apply();File.WriteAllBytes("Validation/point-case-detail.png",read.EncodeToPNG());}
            finally{RenderTexture.active=previous;UnityEngine.Object.DestroyImmediate(go);UnityEngine.Object.DestroyImmediate(read);target.Release();UnityEngine.Object.DestroyImmediate(target);}
        }
    }
}
