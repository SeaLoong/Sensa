using System;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEditor;
using UnityEditor.SceneManagement;
using UdonSharp;
using UdonSharpEditor;
using VRC.SDK3.Dynamics.PhysBone.Components;
using VRC.Dynamics;

namespace SensaLab
{
    public static class LabPlayability
    {
        private const string Root="Assets/SensaLab/Generated";
        [Serializable] private class LayoutReport {public bool passed;public int stations;public float minButtonHeight,maxButtonHeight;public bool continuousFloor,clearStandingAreas;}
        [MenuItem("Tools/Sensa Lab/Make world walkable and reachable")]
        public static void Configure(){LabEditorLocalization.OpenScene(Root+"/SensaLab.unity");Apply();LabEditorLocalization.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene());AssetDatabase.SaveAssets();}
        public static void Apply()
        {
            string asset="Assets/SensaLab/Runtime/LabLocomotion.asset";
            if(AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(asset)==null){var program=ScriptableObject.CreateInstance<UdonSharpProgramAsset>();program.sourceCsScript=AssetDatabase.LoadAssetAtPath<MonoScript>("Assets/SensaLab/Runtime/LabLocomotion.cs");program.ScriptVersion=UdonSharpProgramVersion.CurrentVersion;AssetDatabase.CreateAsset(program,asset);}
            UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions{IsEditorBuild=true});
            var layout=GameObject.Find("Playability layout");if(layout==null)layout=new GameObject("Playability layout");
            var locomotion=layout.GetComponent<LabLocomotion>();if(locomotion==null)locomotion=UdonSharpUndo.AddComponent<LabLocomotion>(layout);UdonSharpEditorUtility.CopyProxyToUdon(locomotion);
            var floor=GameObject.Find("Floor");if(floor==null)throw new InvalidOperationException(LabEditorLocalization.Text("Lab floor missing"));floor.transform.position=new Vector3(0,-.1f,4);floor.transform.localScale=new Vector3(16,.2f,16);floor.GetComponent<Collider>().enabled=true;
            floor.GetComponent<Renderer>().sharedMaterial=ColorMaterial("Walkway",new Color(.78f,.78f,.78f));
            var caseFloor=GameObject.Find("Case area floor");if(caseFloor!=null){caseFloor.GetComponent<Collider>().enabled=false;caseFloor.GetComponent<Renderer>().enabled=false;}
            var spawn=GameObject.Find("Spawn");spawn.transform.position=new Vector3(0,.1f,-2.5f);spawn.transform.rotation=Quaternion.identity;
            Cube(layout.transform,"Boundary left",new Vector3(-8,.5f,4),new Vector3(.15f,1,16));Cube(layout.transform,"Boundary right",new Vector3(8,.5f,4),new Vector3(.15f,1,16));
            Cube(layout.transform,"Boundary front",new Vector3(0,.5f,12),new Vector3(16,1,.15f));Cube(layout.transform,"Boundary back",new Vector3(0,.5f,-4),new Vector3(16,1,.15f));
            Cube(layout.transform,"Jump practice 20cm",new Vector3(6,.1f,0),new Vector3(1,.2f,.7f));Cube(layout.transform,"Jump practice 40cm",new Vector3(6,.2f,1.2f),new Vector3(1,.4f,.7f));
            foreach(var station in UnityEngine.Object.FindObjectsOfType<PointCaseStation>()){
                var owner=station.transform.parent;
                Cube(owner,"Reachable console",new Vector3(0,-.55f,-.45f),new Vector3(1.15f,.9f,.32f));
                var board=station.status.GetComponentInParent<Canvas>();board.transform.localPosition=new Vector3(0,.6f,.35f);board.transform.localScale=Vector3.one*.00125f;
                var backing=owner.Find("Opaque board backing");backing.localPosition=board.transform.localPosition+Vector3.forward*.012f;backing.localScale=new Vector3(1.5f,.8125f,.01f);
                foreach(string name in new[]{"Reset case","Pause case","Toggle missing A3"}){
                    var button=owner.Find(name);if(button==null)throw new InvalidOperationException(LabEditorLocalization.Text("Case control missing: ")+name);
                    var pos=button.localPosition;pos.y=-.02f;pos.z=-.45f;button.localPosition=pos;button.localScale=Vector3.one*.14f;
                    var label=owner.Find(name+" label");if(label!=null)label.localPosition=pos+Vector3.up*.13f;
                }
            }
            foreach(string name in new[]{"Click to pause","Click: desktop output experiment","Click: camera-only rig (third cube)"}){var button=GameObject.Find(name);if(button!=null){var p=button.transform.position;p.y=1;button.transform.position=p;button.transform.localScale=Vector3.one*.16f;}}
            var status=GameObject.Find("Status Canvas");if(status!=null){status.transform.position=new Vector3(0,1.8f,3);status.transform.localScale=Vector3.one*.0009f;}
            var localBoard=GameObject.Find("Local probe board");if(localBoard!=null){localBoard.transform.localPosition=new Vector3(-.1f,.5f,.45f);localBoard.transform.localScale=Vector3.one*.0012f;}
            var local=GameObject.Find("Local bone and PB station");if(local!=null){var pb=local.GetComponentInChildren<VRCPhysBone>();pb.allowGrabbing=VRCPhysBoneBase.AdvancedBool.True;pb.allowCollision=VRCPhysBoneBase.AdvancedBool.False;pb.colliders.Clear();pb.radius=.04f;var station=local.GetComponent<LocalProbeStation>();if(station!=null&&station.target!=null)foreach(var mesh in station.target.GetComponentsInChildren<MeshRenderer>())mesh.transform.localScale=Vector3.one*.06f;}
            AddWelcome(layout.transform);
            Physics.SyncTransforms();
            var stations=UnityEngine.Object.FindObjectsOfType<PointCaseStation>();var buttons=stations.SelectMany(s=>new[]{s.transform,s.transform.parent.Find("Reset case"),s.transform.parent.Find("Toggle missing A3")}).ToArray();
            bool clear=true,ground=true;
            foreach(var station in stations){var point=station.transform.parent.position+new Vector3(0,-1,-1.05f);ground&=Physics.Raycast(point+Vector3.up*3,Vector3.down,out var hit,4)&&hit.collider==floor.GetComponent<Collider>();clear&=!Physics.CheckCapsule(point+Vector3.up*.35f,point+Vector3.up*1.5f,.25f);}
            var report=new LayoutReport{stations=stations.Length,minButtonHeight=buttons.Min(t=>t.position.y),maxButtonHeight=buttons.Max(t=>t.position.y),continuousFloor=ground,clearStandingAreas=clear};
            report.passed=stations.Length==11 && report.minButtonHeight>=.85f && report.maxButtonHeight<=1.15f && ground && clear;
            Directory.CreateDirectory("Validation");File.WriteAllText("Validation/playability-layout.json",JsonUtility.ToJson(report,true));
            if(!report.passed)throw new InvalidOperationException(LabEditorLocalization.Text("Playability layout validation failed; see Validation/playability-layout.json"));
        }
        private static Material ColorMaterial(string name,Color color)
        {
            string path=Root+"/"+name+".mat";
            var material=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(material==null){material=new Material(Shader.Find("Unlit/Color"));AssetDatabase.CreateAsset(material,path);}
            material.color=color;EditorUtility.SetDirty(material);return material;
        }
        private static void Cube(Transform parent,string name,Vector3 position,Vector3 scale)
        {
            var t=parent.Find(name);if(t==null){var go=GameObject.CreatePrimitive(PrimitiveType.Cube);go.name=name;t=go.transform;t.SetParent(parent,false);}
            t.localPosition=position;t.localScale=scale;
            t.GetComponent<Renderer>().sharedMaterial=name.StartsWith("Jump practice")
                ?ColorMaterial("JumpStep",new Color(.7f,.36f,.1f))
                :ColorMaterial("LabFurniture",new Color(.12f,.2f,.29f));
        }
        private static void AddWelcome(Transform parent)
        {
            Cube(parent,"Welcome backing",new Vector3(-2,1.45f,-.99f),new Vector3(1.7f,.85f,.01f));
            var backing=parent.Find("Welcome backing");UnityEngine.Object.DestroyImmediate(backing.GetComponent<Collider>());
            if(parent.Find("Welcome")!=null)return;
            var canvas=new GameObject("Welcome",typeof(RectTransform)).AddComponent<Canvas>();canvas.renderMode=RenderMode.WorldSpace;canvas.transform.SetParent(parent,false);canvas.transform.localPosition=new Vector3(-2,1.45f,-1);canvas.transform.localScale=Vector3.one*.0015f;((RectTransform)canvas.transform).sizeDelta=new Vector2(1100,550);
            var text=canvas.gameObject.AddComponent<Text>();text.font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");text.fontSize=32;text.text="SENSA TEST WORLD\nWalk / run / jump with your normal controls.\nForward: 11 numbered test benches.\nGrab a white ball; blue Reset, white Pause, orange Missing.\nRight: two low jump-practice blocks.\nAll experiments are local. No device output.";text.raycastTarget=false;
        }
    }
}
