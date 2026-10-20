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
using VRC.SDK3.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using com.vrcfury.udon;

namespace SensaLab
{
    public static class InteractiveLab
    {
        const string Root = "Assets/SensaLab/Interaction";
        static readonly string[] Colors = { "#E85D75", "#54B7FF", "#77D970", "#FFC857", "#C792EA", "#54DED2", "#FF975C", "#E6E6E6" };
        public static Color ProbeColor(int index) { ColorUtility.TryParseHtmlString(Colors[index % 8], out var color); return color; }
        static Transform Child(Transform parent,string name,Vector3 position)
        { var child=new GameObject(name).transform;child.SetParent(parent,false);child.localPosition=position;return child; }
        static Material Material(string name,Color color)
        {
            string path=Root+"/"+name+".mat";var material=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(material==null){material=new Material(Shader.Find("Unlit/Color"));AssetDatabase.CreateAsset(material,path);}
            material.color=color;EditorUtility.SetDirty(material);return material;
        }
        static void Label(Transform parent,string name,Vector3 position,string value,Color color,float size=.012f)
        {
            var node=parent.Find(name)??Child(parent,name,position);node.localPosition=position;
            var text=node.GetComponent<TextMesh>();if(text==null)text=node.gameObject.AddComponent<TextMesh>();text.text=value;text.color=color;text.fontSize=48;text.characterSize=size;text.anchor=TextAnchor.MiddleCenter;
        }
        public static void Mark(VRCContactReceiver receiver,int index,int count=4)
        {
            var parent=receiver.transform;var node=parent.Find("Probe display");
            if(node==null){var go=GameObject.CreatePrimitive(PrimitiveType.Sphere);go.name="Probe display";go.transform.SetParent(parent,false);UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());node=go.transform;}
            node.localPosition=receiver.position;node.localScale=Vector3.one*.016f;
            node.GetComponent<Renderer>().sharedMaterial=Material("Probe"+(index+1),ProbeColor(index));
            Label(parent,"Probe label",receiver.position+Vector3.up*.023f,(count==8?"C":"P")+(index+1),ProbeColor(index),.007f);
        }
        [MenuItem("Tools/Sensa Lab/Upgrade interactive targets and probe labels")]
        public static void Upgrade()
        {
            Directory.CreateDirectory(Root);AssetDatabase.Refresh();
            foreach(var name in new[]{"LabPlacement","LabPlacementButton"})
            {
                string path="Assets/SensaLab/Runtime/"+name+".asset";
                if(AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(path)==null){var p=ScriptableObject.CreateInstance<UdonSharpProgramAsset>();p.sourceCsScript=AssetDatabase.LoadAssetAtPath<MonoScript>("Assets/SensaLab/Runtime/"+name+".cs");p.ScriptVersion=UdonSharpProgramVersion.CurrentVersion;AssetDatabase.CreateAsset(p,path);}
            }
            UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions{IsEditorBuild=true});
            var scene=LabEditorLocalization.OpenScene(FunctionalLab.Scene);
            foreach(var station in UnityEngine.Object.FindObjectsOfType<CapabilityStation>())
            {
                for(int i=0;i<station.receivers.Length;i++)Mark(station.receivers[i],i);
                if(station.mode==5)continue;
                var carrier=station.transform.Find("Movable fixture");
                if(carrier==null)
                {
                    carrier=Child(station.transform,"Movable fixture",Vector3.zero);
                    foreach(var name in new[]{"Target","PB root","Contact marker","A0","A1","A2","A3","SPS Plug","SPS Socket"})
                    {var part=station.transform.Find(name);if(part!=null)part.SetParent(carrier,true);}
                }
                station.reference=carrier;UdonSharpEditorUtility.CopyProxyToUdon(station);
                AddPlacement(station.transform,carrier,"Fixture placement",new Vector3(0,-.08f,-1.05f),
                    "Move the whole measurement fixture. Probe centers and target share this reference.");
            }
            if(GameObject.Find("08 MY AVATAR SPS")==null)BuildSpsArea();
            var spsBoard=GameObject.Find("08 MY AVATAR SPS").transform.Find("Your avatar SPS instructions").GetComponent<Text>();spsBoard.text=spsBoard.text.Replace("Probe P1..P8","Probe P1-P4 / C1-C8");
            foreach(var placement in GameObject.Find("08 MY AVATAR SPS").GetComponentsInChildren<LabPlacement>())
            {var collider=placement.target.GetComponent<SphereCollider>();if(collider!=null)collider.isTrigger=true;}
            var quick=UnityEngine.Object.FindObjectOfType<QuickStartStation>();
            if(quick!=null)AddPlacement(quick.transform,quick.pickup,"TEST BALL controls",new Vector3(1.3f,.8f,-.45f),"TOUCH mode: move the ball to your right wrist. This only places the ball; it does not enable input.");
            foreach(var placement in UnityEngine.Object.FindObjectsOfType<LabPlacement>())PositionPanel(placement.transform);
            for(int i=0;i<4;i++){var color=ProbeColor(i);Material("Control"+i,new Color(color.r*.45f,color.g*.45f,color.b*.45f));}
            LabEncoderMaterials.Prepare();LabEditorLocalization.SaveScene(scene);
            scene=LabEditorLocalization.OpenScene("Assets/SensaLab/Generated/SensaLab.unity");
            foreach(var station in UnityEngine.Object.FindObjectsOfType<PointCaseStation>())
            {
                station.caseName=station.caseName.Replace("A3","P4");station.expectation=station.expectation.Replace("A3","P4");
                foreach(var text in station.transform.parent.GetComponentsInChildren<Text>(true))text.text=text.text.Replace("Missing A3","Missing P4").Replace("MISSING A3","MISSING P4");
                for(int i=0;i<station.receivers.Length;i++)
                {
                    Mark(station.receivers[i],i);
                    if(station.sampleBars!=null&&station.sampleBars.Length>i)station.sampleBars[i].color=ProbeColor(i);
                    var label=station.status.GetComponentInParent<Canvas>().transform.Find("Lane label "+i);
                    if(label!=null){label.GetComponent<Text>().text="P"+(i+1);label.GetComponent<Text>().color=ProbeColor(i);}
                }
                UdonSharpEditorUtility.CopyProxyToUdon(station);
            }
            foreach(var station in UnityEngine.Object.FindObjectsOfType<LocalProbeStation>())for(int i=0;i<station.receivers.Length;i++)Mark(station.receivers[i],i);
            foreach(var station in UnityEngine.Object.FindObjectsOfType<LabController>())for(int i=0;i<station.receivers.Length;i++)Mark(station.receivers[i],i,station.receivers.Length);
            LabEncoderMaterials.Prepare();LabEditorLocalization.SaveScene(scene);AssetDatabase.SaveAssets();LabEditorLocalization.OpenScene(FunctionalLab.Scene);
        }
        static void AddPlacement(Transform host,Transform target,string name,Vector3 position,string instructions)
        {
            var existing=host.Find(name);if(existing!=null){existing.localPosition=position;PositionPanel(existing);return;}
            var panel=Child(host,name,position);
            var placement=UdonSharpUndo.AddComponent<LabPlacement>(panel.gameObject);placement.target=target;placement.title=name;placement.instructions=instructions;
            placement.status=FunctionalLab.Board(panel,"Placement instructions",new Vector3(0,.28f,.15f),name+"\nLEFT / RIGHT: hand | PLACE: world | HOME: reset\n"+instructions);
            placement.status.fontSize=35;placement.status.transform.localScale=Vector3.one*.0006f;
            var backing=panel.Find("Placement instructions backing");backing.localScale=new Vector3(.84f,.456f,.01f);
            string[] actions={"LeftHand","RightHand","Place","Home"};string[] names={"LEFT","RIGHT","PLACE","HOME"};
            for(int i=0;i<4;i++)
            {
                var button=GameObject.CreatePrimitive(PrimitiveType.Cube);button.name=names[i];button.transform.SetParent(panel,false);button.transform.localPosition=new Vector3((i-1.5f)*.23f,0,0);button.transform.localScale=new Vector3(.20f,.10f,.09f);
                var color=ProbeColor(i);button.GetComponent<Renderer>().sharedMaterial=Material("Control"+i,new Color(color.r*.45f,color.g*.45f,color.b*.45f));
                var action=UdonSharpUndo.AddComponent<LabPlacementButton>(button);action.placement=placement;action.action=actions[i];UdonSharpEditorUtility.CopyProxyToUdon(action);
                Label(panel,names[i]+" label",button.transform.localPosition+new Vector3(0,.085f,-.06f),names[i],Color.white);
            }
            UdonSharpEditorUtility.CopyProxyToUdon(placement);
            PositionPanel(panel);
        }
        static void PositionPanel(Transform panel)
        {
            var text=panel.Find("Placement instructions");if(text!=null){text.localPosition=new Vector3(0,.42f,1.5f);text.GetComponent<Text>().fontSize=44;}
            var backing=panel.Find("Placement instructions backing");if(backing!=null)backing.localPosition=new Vector3(0,.42f,1.512f);
        }
        static Type Type(string name)=>AppDomain.CurrentDomain.GetAssemblies().Select(a=>a.GetType(name)).First(t=>t!=null);
        static void Field(Component component,string name,object value)=>component.GetType().GetField(name).SetValue(component,value);
        static void Pickup(Transform target,float radius)
        {
            var collider=target.gameObject.AddComponent<SphereCollider>();collider.radius=radius;collider.isTrigger=true;
            var body=target.gameObject.AddComponent<Rigidbody>();body.useGravity=false;body.drag=8;body.angularDrag=8;
            target.gameObject.AddComponent<VRCPickup>();
        }
        static void BuildSpsArea()
        {
            var root=new GameObject("08 MY AVATAR SPS").transform;root.position=new Vector3(-5.6f,0,-.8f);
            var plug=Child(root,"World SPS Plug",new Vector3(-.95f,1,0));
            var mesh=GameObject.CreatePrimitive(PrimitiveType.Cylinder);mesh.name="20 cm plug";mesh.transform.SetParent(plug,false);mesh.transform.localPosition=Vector3.forward*.1f;mesh.transform.localRotation=Quaternion.Euler(90,0,0);mesh.transform.localScale=new Vector3(.03f,.1f,.03f);UnityEngine.Object.DestroyImmediate(mesh.GetComponent<Collider>());
            var surface=new Material(Shader.Find("Standard")){color=ProbeColor(3)};AssetDatabase.CreateAsset(surface,Root+"/NativePlug.mat");mesh.GetComponent<Renderer>().sharedMaterial=surface;
            var p=plug.gameObject.AddComponent(Type("VF.Component.VRCFuryHapticPlug"));Field(p,"autoRenderer",false);Field(p,"configureTpsMesh",new List<Renderer>{mesh.GetComponent<Renderer>()});Field(p,"autoPosition",false);Field(p,"autoLength",false);Field(p,"autoRadius",false);Field(p,"length",.2f);Field(p,"radius",.015f);Field(p,"unitsInMeters",true);Field(p,"spsAutorig",false);Pickup(plug,.08f);
            Label(plug,"Identity",new Vector3(0,.12f,.08f),"WORLD PLUG\n20 cm / tip +Z",ProbeColor(3));
            var socket=Child(root,"World SPS Socket",new Vector3(.95f,1,0));socket.gameObject.AddComponent(Type("VF.Component.VRCFuryHapticSocket"));UdonSharpUndo.AddComponent<SpsSocketUdonSupport>(socket.gameObject);Pickup(socket,.08f);
            for(int i=0;i<4;i++)
            {
                var edge=GameObject.CreatePrimitive(PrimitiveType.Cube);edge.name="Socket entry frame";edge.transform.SetParent(socket,false);edge.transform.localPosition=new Vector3(i<2?(i==0?-.055f:.055f):0,i>=2?(i==2?-.055f:.055f):0,0);edge.transform.localScale=i<2?new Vector3(.006f,.11f,.006f):new Vector3(.11f,.006f,.006f);UnityEngine.Object.DestroyImmediate(edge.GetComponent<Collider>());edge.GetComponent<Renderer>().sharedMaterial=Material("SocketEntry",ProbeColor(1));
            }
            Label(socket,"Identity",Vector3.up*.12f,"WORLD SOCKET\nentry plane / +Z",ProbeColor(1));
            AddPlacement(root,plug,"PLUG controls",new Vector3(-.95f,.75f,-.55f),"Use with your avatar SOCKET. Enable SPS OSC. Watch actual OGB values in Sensa.");
            AddPlacement(root,socket,"SOCKET controls",new Vector3(.95f,.75f,-.55f),"Use with your avatar PLUG. Pickup or LEFT/RIGHT, PLACE to leave here.");
            var board=FunctionalLab.Board(root,"Your avatar SPS instructions",new Vector3(0,2,.4f),
                "NATIVE SPS - TRY YOUR OWN AVATAR\nAmber: world plug -> your avatar socket\nBlue frame: world socket -> your avatar plug\nOpen avatar SPS / OGB_ENABLED, then use the matching preset.\nStart separated to learn length. Aligned 10 cm / 20 cm is ~50%.\nMove sideways to see radial-depth error. World contacts may reach both Self/Others.\nWorld labels are geometry hints, NOT OSC acknowledgements.\nCheck actual received OGB parameters in Sensa. HOME resets props.\nProbe P1..P8 elsewhere are sensor inputs, NOT output axes.");board.fontSize=38;
        }
    }
}
