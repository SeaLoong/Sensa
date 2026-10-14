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
using VRC.Dynamics;
using VRC.SDK3.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;
using com.vrcfury.udon;
using UnityBox.Sensa;

namespace SensaLab
{
    public static class FunctionalLab
    {
        public const string Root="Assets/SensaLab/Functional";
        public const string Scene=Root+"/FunctionalLab.unity";
        public static readonly string[] Titles={"01 CONTACT ONLY","02 PB ONLY","03 PB + CONTACT","04 NATIVE SPS","05 SPS + PB + CONTACT","06 SHADER TRANSPORT","07 SPS SHADER MODEL"};
        [MenuItem("Tools/Sensa Lab/Create capability test world")]
        public static void Create()
        {
            if(File.Exists(Scene))throw new InvalidOperationException("Preserve existing edits before creating the capability world again.");
            Directory.CreateDirectory(Root);AssetDatabase.Refresh();
            foreach(var name in new[]{"CapabilityStation","CapabilityButton","LabLocomotion"})
            {
                var path="Assets/SensaLab/Runtime/"+name+".asset";
                if(AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(path)==null){var program=ScriptableObject.CreateInstance<UdonSharpProgramAsset>();program.sourceCsScript=AssetDatabase.LoadAssetAtPath<MonoScript>("Assets/SensaLab/Runtime/"+name+".cs");program.ScriptVersion=UdonSharpProgramVersion.CurrentVersion;AssetDatabase.CreateAsset(program,path);}
            }
            UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions{IsEditorBuild=true});
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var descriptor=new GameObject("World Descriptor").AddComponent<VRCSceneDescriptor>();
            var spawn=new GameObject("Spawn").transform;spawn.position=new Vector3(0,.1f,-2);descriptor.spawns=new[]{spawn};
            UdonSharpUndo.AddComponent<LabLocomotion>(new GameObject("Locomotion"));
            Cube(null,"Floor",new Vector3(0,-.1f,7),new Vector3(16,.2f,22),new Color(.78f,.78f,.78f),true);
            var light=new GameObject("Sun").AddComponent<Light>();light.type=LightType.Directional;light.transform.rotation=Quaternion.Euler(40,-30,0);RenderSettings.ambientLight=Color.gray;
            var camera=new GameObject("Reference camera").AddComponent<Camera>();camera.transform.position=new Vector3(0,1.6f,-2);camera.transform.LookAt(new Vector3(0,1.4f,3));descriptor.ReferenceCamera=camera.gameObject;
            var positions=new[]{new Vector3(-4,1,3),new Vector3(0,1,3),new Vector3(4,1,3),new Vector3(-4,1,8),new Vector3(4,1,8),new Vector3(-4,1,13),new Vector3(4,1,13)};
            for(int mode=0;mode<Titles.Length;mode++)BuildStation(mode,positions[mode]);
            Board(null,"Welcome",new Vector3(-1.5f,1.5f,0),"SENSA CAPABILITY LAB\nFront: Contact | PB | PB + Contact\nMiddle: native SPS | SPS + PB + Contact\nBack: synthetic Shader transport | actual SPS GPU model\nBlue=Rest  Green=Near  Orange=Offset  Red=Outside\nPB: grab handles; collisions disabled.\nSee Assets/SensaLab/CAPABILITIES.md for expected output.");
            EditorSceneManager.SaveScene(scene,Scene);AssetDatabase.SaveAssets();
            InteractiveLab.Upgrade();
        }
        static Transform Child(Transform parent,string name,Vector3 local){var t=new GameObject(name).transform;t.SetParent(parent,false);t.localPosition=local;return t;}
        static Type Type(string name)=>AppDomain.CurrentDomain.GetAssemblies().Select(a=>a.GetType(name)).First(t=>t!=null);
        static void Field(Component c,string name,object value)=>c.GetType().GetField(name).SetValue(c,value);
        static VRCPhysBone Handle(Transform reference,out Transform target)
        {
            var root=Child(reference,"PB root",Vector3.zero);var joint=Child(root,"Joint",Vector3.forward*.05f);target=Child(joint,"Grip",Vector3.forward*.05f);
            var bone=root.gameObject.AddComponent<VRCPhysBone>();bone.rootTransform=root;bone.radius=.03f;bone.pull=.2f;bone.maxStretch=.5f;bone.grabMovement=1;
            bone.allowGrabbing=VRCPhysBoneBase.AdvancedBool.True;bone.allowPosing=VRCPhysBoneBase.AdvancedBool.False;bone.allowCollision=VRCPhysBoneBase.AdvancedBool.False;bone.colliders.Clear();
            var sphere=GameObject.CreatePrimitive(PrimitiveType.Sphere);sphere.name="Grab this PB sphere";sphere.transform.SetParent(target,false);sphere.transform.localScale=Vector3.one*.06f;UnityEngine.Object.DestroyImmediate(sphere.GetComponent<Collider>());bone.ignoreTransforms.Add(sphere.transform);
            return bone;
        }
        static void BuildStation(int mode,Vector3 position)
        {
            var root=new GameObject(Titles[mode]);root.transform.position=position;
            var station=UdonSharpUndo.AddComponent<CapabilityStation>(root);station.mode=mode;station.title=Titles[mode];station.reference=root.transform;
            bool hasPb=mode==1||mode==2||mode==4;
            Transform target;
            if(hasPb)station.bone=Handle(root.transform,out target);
            else target=Child(root.transform,"Target",Vector3.forward*.1f);
            station.target=target;
            if(mode==0)
            {
                var ball=GameObject.CreatePrimitive(PrimitiveType.Sphere);ball.name="Pickup target";ball.transform.SetParent(target,false);ball.transform.localScale=Vector3.one*.06f;
                UnityEngine.Object.DestroyImmediate(ball.GetComponent<Collider>());
                var collider=target.gameObject.AddComponent<SphereCollider>();collider.radius=.04f;collider.isTrigger=true;
                var body=target.gameObject.AddComponent<Rigidbody>();body.useGravity=false;body.drag=8;
                target.gameObject.AddComponent<VRCPickup>();
            }
            if(mode==0||mode==2||mode==4)
            {
                var tracked=Child(root.transform,"Contact marker",Vector3.forward*.1f);station.sender=tracked.gameObject.AddComponent<VRCContactSender>();station.sender.radius=.001f;
                station.sender.collisionTags=new List<string>{"SensaCapability"+mode};station.receivers=new VRCContactReceiver[4];
                for(int i=0;i<4;i++){int a=SensaPoseProtocol.PointAnchorIndex(i);var t=Child(root.transform,"A"+i,new Vector3(SensaPoseProtocol.AnchorX(a),SensaPoseProtocol.AnchorY(a),SensaPoseProtocol.AnchorZ(a)));var r=t.gameObject.AddComponent<VRCContactReceiver>();r.radius=.35f;r.receiverType=ContactReceiver.ReceiverType.Proximity;r.collisionTags=new List<string>{"SensaCapability"+mode};station.receivers[i]=r;}
            }
            else station.receivers=new VRCContactReceiver[0];
            if(mode==3||mode==4||mode==6)
            {
                var plug=Child(hasPb?target:root.transform,"SPS Plug",Vector3.zero);station.plug=plug;
                if(hasPb)station.bone.ignoreTransforms.Add(plug);
                var mesh=GameObject.CreatePrimitive(PrimitiveType.Cylinder);mesh.name="SPS 20cm surface";mesh.transform.SetParent(plug,false);mesh.transform.localPosition=Vector3.forward*.1f;mesh.transform.localRotation=Quaternion.Euler(90,0,0);mesh.transform.localScale=new Vector3(.03f,.1f,.03f);UnityEngine.Object.DestroyImmediate(mesh.GetComponent<Collider>());
                var material=new Material(Shader.Find("Standard")){color=new Color(.1f,.7f,.9f)};AssetDatabase.CreateAsset(material,Root+"/SpsSurface"+mode+".mat");mesh.GetComponent<Renderer>().sharedMaterial=material;
                var p=plug.gameObject.AddComponent(Type("VF.Component.VRCFuryHapticPlug"));Field(p,"autoRenderer",false);Field(p,"configureTpsMesh",new List<Renderer>{mesh.GetComponent<Renderer>()});Field(p,"autoPosition",false);Field(p,"autoLength",false);Field(p,"autoRadius",false);Field(p,"length",.2f);Field(p,"radius",.015f);Field(p,"unitsInMeters",true);Field(p,"spsAutorig",false);
                var socket=Child(root.transform,"SPS Socket",Vector3.forward*.24f);socket.position=plug.TransformPoint(Vector3.forward*.24f);station.socket=socket;socket.gameObject.AddComponent(Type("VF.Component.VRCFuryHapticSocket"));station.sps=UdonSharpUndo.AddComponent<SpsSocketUdonSupport>(socket.gameObject);
                ConfigureSpsReaders(station);
                Cube(socket,"Visible entry",Vector3.zero,new Vector3(.09f,.09f,.006f),Color.cyan,false);
                if(!hasPb)station.target=Child(plug,"Known tip",Vector3.forward*.2f);
            }
            if(mode==5)
            {
                station.encoder=new Material(Shader.Find("SensaLab/Telemetry"));AssetDatabase.CreateAsset(station.encoder,Root+"/Transport.mat");
                station.encoded=new RenderTexture(256,128,0,RenderTextureFormat.ARGB32,RenderTextureReadWrite.Linear){filterMode=FilterMode.Point,antiAliasing=1};AssetDatabase.CreateAsset(station.encoded,Root+"/Transport.renderTexture");
                var card=GameObject.CreatePrimitive(PrimitiveType.Quad);card.name="Visible code grid";card.transform.SetParent(root.transform,false);card.transform.localPosition=new Vector3(0,-.1f,.05f);card.transform.localScale=new Vector3(1,.5f,1);UnityEngine.Object.DestroyImmediate(card.GetComponent<Collider>());
                var display=new Material(Shader.Find("Unlit/Texture")){mainTexture=station.encoded};AssetDatabase.CreateAsset(display,Root+"/TransportDisplay.mat");card.GetComponent<Renderer>().sharedMaterial=display;
                var prefab=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/SensaLab/Generated/DesktopOutputExperiment.prefab");
                var output=(GameObject)PrefabUtility.InstantiatePrefab(prefab,root.transform);output.name="Fixed desktop code region";
                var m=new Material(Shader.Find("SensaLab/TextureOutput")){mainTexture=station.encoded};AssetDatabase.CreateAsset(m,Root+"/DesktopTransport.mat");output.GetComponentInChildren<Renderer>().sharedMaterial=m;output.SetActive(false);station.output=output;
            }
            station.status=Board(root.transform,"Status",new Vector3(0,.85f,.65f),Titles[mode]+"\nEnter Play Mode for actual and expected readings.");
            string[] actions={"Rest","Near","Offset","Outside","Freeze","ToggleOutput","Corrupt"};
            for(int i=0;i<actions.Length;i++)
            {
                if(i>=5&&mode!=5)continue;
                if((mode==1||mode==2||mode==5)&&i<4)continue;
                var button=Cube(root.transform,actions[i],new Vector3((i-2.5f)*.22f,-.05f,-.55f),Vector3.one*.12f,Color.HSVToRGB(i/6f,.7f,.8f),true);
                var action=UdonSharpUndo.AddComponent<CapabilityButton>(button);action.station=station;action.action=actions[i];UdonSharpEditorUtility.CopyProxyToUdon(action);
                var label=Child(root.transform,actions[i]+" label",button.transform.localPosition+Vector3.up*.13f).gameObject.AddComponent<TextMesh>();label.text=actions[i];label.fontSize=36;label.characterSize=.015f;label.anchor=TextAnchor.MiddleCenter;
            }
            UdonSharpEditorUtility.CopyProxyToUdon(station);
        }
        static void ConfigureSpsReaders(CapabilityStation station)
        {
            VRCContactReceiver Receiver(string name,string tag)
            {
                var node=station.socket.Find(name);if(node==null)node=Child(station.socket,name,Vector3.zero);
                var receiver=node.GetComponent<VRCContactReceiver>()??node.gameObject.AddComponent<VRCContactReceiver>();receiver.radius=3;receiver.receiverType=ContactReceiver.ReceiverType.Proximity;receiver.collisionTags=new List<string>{tag};return receiver;
            }
            station.spsRootReceiver=Receiver("Known pair root reader","TPS_Pen_Root");station.spsLengthReceiver=Receiver("Known pair length reader","TPS_Pen_Penetrating");
        }
        public static void Upgrade()
        {
            EditorSceneManager.OpenScene(Scene);
            foreach(var station in UnityEngine.Object.FindObjectsOfType<CapabilityStation>())if(station.socket!=null){ConfigureSpsReaders(station);station.socket.position=station.plug.TransformPoint(Vector3.forward*.24f);UdonSharpEditorUtility.CopyProxyToUdon(station);}
            foreach(var station in UnityEngine.Object.FindObjectsOfType<CapabilityStation>())if(station.mode==1||station.mode==2||station.mode==5)foreach(var name in new[]{"Rest","Near","Offset","Outside"}){var t=station.transform.Find(name);if(t!=null)t.gameObject.SetActive(false);t=station.transform.Find(name+" label");if(t!=null)t.gameObject.SetActive(false);}
            var transport=UnityEngine.Object.FindObjectsOfType<CapabilityStation>().Single(s=>s.mode==5);
            if(transport.transform.Find("Corrupt")==null)
            {
                var button=Cube(transport.transform,"Corrupt",new Vector3(.77f,-.05f,-.55f),Vector3.one*.12f,Color.red,true);
                var action=UdonSharpUndo.AddComponent<CapabilityButton>(button);action.station=transport;action.action="Corrupt";UdonSharpEditorUtility.CopyProxyToUdon(action);
                var label=Child(transport.transform,"Corrupt label",button.transform.localPosition+Vector3.up*.13f).gameObject.AddComponent<TextMesh>();label.text="Corrupt";label.fontSize=36;label.characterSize=.015f;label.anchor=TextAnchor.MiddleCenter;
            }
            EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene());AssetDatabase.SaveAssets();
        }
        public static void FinalizeLayouts()
        {
            Upgrade();LabPlayability.Configure();EditorSceneManager.OpenScene(Scene);
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(Scene,true),new EditorBuildSettingsScene("Assets/SensaLab/Generated/SensaLab.unity",false)};
        }
        static GameObject Cube(Transform parent,string name,Vector3 position,Vector3 scale,Color color,bool collider)
        {
            var go=GameObject.CreatePrimitive(PrimitiveType.Cube);go.name=name;go.transform.SetParent(parent,false);go.transform.localPosition=position;go.transform.localScale=scale;
            if(!collider)UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());
            var material=new Material(Shader.Find("Unlit/Color")){color=color};AssetDatabase.CreateAsset(material,AssetDatabase.GenerateUniqueAssetPath(Root+"/"+name.Replace(" ","_")+".mat"));go.GetComponent<Renderer>().sharedMaterial=material;return go;
        }
        public static Text Board(Transform parent,string name,Vector3 position,string value)
        {
            var canvas=new GameObject(name,typeof(RectTransform)).AddComponent<Canvas>();canvas.renderMode=RenderMode.WorldSpace;canvas.transform.SetParent(parent,false);canvas.transform.localPosition=position;canvas.transform.localScale=Vector3.one*.0013f;((RectTransform)canvas.transform).sizeDelta=new Vector2(1400,760);
            Cube(parent,name+" backing",position+Vector3.forward*.012f,new Vector3(1.82f,.988f,.01f),new Color(.02f,.04f,.07f),false);
            var text=canvas.gameObject.AddComponent<Text>();text.font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");text.fontSize=32;text.text=value;text.raycastTarget=false;return text;
        }
    }
}
