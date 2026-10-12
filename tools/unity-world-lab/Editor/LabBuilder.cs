using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using UdonSharpEditor;
using UdonSharp;
using VRC.SDK3.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;
using UnityEngine.Animations;
using VRC.Dynamics;
using UnityBox.Sensa;

namespace SensaLab
{
    public static class LabBuilder
    {
        private const string Root = "Assets/SensaLab/Generated";
        [MenuItem("Tools/Sensa Lab/Add local bone and PB station")]
        public static void AddLocalProbeStation()
        {
            var scene=EditorSceneManager.OpenScene(Root+"/SensaLab.unity");
            var existing=scene.GetRootGameObjects().FirstOrDefault(g=>g.name=="Local bone and PB station");
            if(existing!=null){var existingStation=existing.GetComponent<LocalProbeStation>();if(existingStation==null||existingStation.target==null||existingStation.bone==null)throw new InvalidOperationException("Existing station has incomplete references.");foreach(var renderer in existingStation.target.GetComponentsInChildren<Renderer>(true))if(renderer.transform!=existingStation.target&&!existingStation.bone.ignoreTransforms.Contains(renderer.transform))existingStation.bone.ignoreTransforms.Add(renderer.transform);EditorSceneManager.SaveScene(scene);return;}
            string path="Assets/SensaLab/Runtime/LocalProbeStation.asset";
            if(AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(path)==null){var program=ScriptableObject.CreateInstance<UdonSharpProgramAsset>();program.sourceCsScript=AssetDatabase.LoadAssetAtPath<MonoScript>("Assets/SensaLab/Runtime/LocalProbeStation.cs");program.ScriptVersion=UdonSharpProgramVersion.CurrentVersion;AssetDatabase.CreateAsset(program,path);}
            UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions{IsEditorBuild=true});
            var origin=new GameObject("Local bone and PB station").transform;origin.position=new Vector3(-1.5f,1.1f,.5f);
            Transform Child(Transform parent,string name,Vector3 position){var node=new GameObject(name).transform;node.SetParent(parent,false);node.localPosition=position;return node;}
            var root=Child(origin,"HandleRoot",Vector3.zero);var joint=Child(root,"Joint",Vector3.forward*.05f);var grip=Child(joint,"Grip",Vector3.forward*.05f);
            var pb=root.gameObject.AddComponent<VRCPhysBone>();pb.rootTransform=root;pb.radius=.025f;pb.pull=.2f;pb.spring=0;pb.maxStretch=.5f;pb.grabMovement=1;pb.allowPosing=VRCPhysBoneBase.AdvancedBool.False;
            var visual=GameObject.CreatePrimitive(PrimitiveType.Sphere);visual.transform.SetParent(grip,false);visual.transform.localScale=Vector3.one*.04f;UnityEngine.Object.DestroyImmediate(visual.GetComponent<Collider>());pb.ignoreTransforms.Add(visual.transform);
            var point=Child(origin,"TrackedPoint",Vector3.forward*.1f);var follow=point.gameObject.AddComponent<PositionConstraint>();follow.AddSource(new ConstraintSource{sourceTransform=grip,weight=1});follow.locked=true;follow.constraintActive=true;
            var sender=point.gameObject.AddComponent<VRCContactSender>();sender.radius=.001f;sender.collisionTags=new List<string>{"SensaLabPoint"};
            var receivers=new List<VRCContactReceiver>();
            for(int i=0;i<8;i++){var node=Child(origin,"A"+i,new Vector3(SensaPoseProtocol.AnchorX(i),SensaPoseProtocol.AnchorY(i),SensaPoseProtocol.AnchorZ(i)));var receiver=node.gameObject.AddComponent<VRCContactReceiver>();receiver.radius=SensaPoseProtocol.ReceiverRadius;receiver.collisionTags=new List<string>{"SensaLabPoint"};receivers.Add(receiver);}
            var canvas=new GameObject("Local probe board",typeof(RectTransform)).AddComponent<Canvas>();canvas.renderMode=RenderMode.WorldSpace;canvas.transform.SetParent(origin,false);canvas.transform.localPosition=new Vector3(-.5f,.8f,.5f);canvas.transform.localScale=Vector3.one*.002f;((RectTransform)canvas.transform).sizeDelta=new Vector2(1000,650);
            var text=new GameObject("Local probe status",typeof(RectTransform)).AddComponent<Text>();text.transform.SetParent(canvas.transform,false);text.rectTransform.anchorMin=Vector2.zero;text.rectTransform.anchorMax=Vector2.one;text.rectTransform.offsetMin=Vector2.zero;text.rectTransform.offsetMax=Vector2.zero;text.font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");text.fontSize=32;text.text="LOCAL BONE / PB PROBE\nEnter Play Mode / ClientSim.\nGrab the small sphere to compare\nlocal coordinates and Contact values.";
            var station=UdonSharpUndo.AddComponent<LocalProbeStation>(origin.gameObject);station.reference=origin;station.target=grip;station.sender=sender;station.receivers=receivers.ToArray();station.bone=pb;station.status=text;UdonSharpEditorUtility.CopyProxyToUdon(station);
            EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        }
        [MenuItem("Tools/Sensa Lab/Export camera-only prototype")]
        public static void ExportCameraPrototype()
        {
            Directory.CreateDirectory("Exports");
            AssetDatabase.ExportPackage(new[]{Root+"/CameraOnlyPrototype.prefab","Assets/SensaLab/CAMERA-PROTOTYPE.md"},"Exports/Sensa-CameraOnly-Experimental.unitypackage",ExportPackageOptions.IncludeDependencies);
        }
        [MenuItem("Tools/Sensa Lab/Add camera-only test station")]
        public static void AddCameraStation()
        {
            var scene=EditorSceneManager.OpenScene(Root+"/SensaLab.unity");
            if(scene.GetRootGameObjects().Any(g=>g.name=="Camera-only test station"))throw new InvalidOperationException("Camera station already exists.");
            UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions{IsEditorBuild=true});
            var rig=(GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(Root+"/CameraOnlyPrototype.prefab"));rig.name="Camera-only test station";rig.transform.position=new Vector3(3,1,3);
            var button=GameObject.CreatePrimitive(PrimitiveType.Cube);button.name="Click: camera-only rig (third cube)";button.transform.position=new Vector3(1,.65f,1.5f);button.transform.localScale=Vector3.one*.2f;
            var toggle=UdonSharpUndo.AddComponent<LabToggle>(button);toggle.target=rig;UdonSharpEditorUtility.CopyProxyToUdon(toggle);
            var text=GameObject.Find("Status").GetComponent<Text>();text.fontSize=36;text.text+="\nThird cube: camera-only rig. Do not enable both output experiments together.";
            EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        }
        [MenuItem("Tools/Sensa Lab/Create camera-only prototype prefab")]
        public static void CreateCameraPrototype()
        {
            var path=Root+"/CameraOnlyPrototype.prefab";
            if(File.Exists(path)) throw new InvalidOperationException("Camera prototype already exists.");
            var root=new GameObject("CameraOnlyPrototype - enable locally for testing");
            try {
                var rt=new RenderTexture(256,128,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.Linear){filterMode=FilterMode.Point,antiAliasing=1};AssetDatabase.CreateAsset(rt,Root+"/CameraOnlyData.renderTexture");
                var data=new Material(Shader.Find("SensaLab/Telemetry"));data.SetFloat("_AutoSequence",1);data.SetFloat("_CameraOnly",1);AssetDatabase.CreateAsset(data,Root+"/CameraOnlyPattern.mat");
                var camera=new GameObject("Private capture camera").AddComponent<Camera>();camera.transform.SetParent(root.transform,false);camera.orthographic=true;camera.orthographicSize=.5f;camera.nearClipPlane=.01f;camera.farClipPlane=.731f;camera.cullingMask=1<<22;camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=Color.black;camera.targetTexture=rt;camera.depth=-100;camera.stereoTargetEye=StereoTargetEyeMask.None;
                var card=GameObject.CreatePrimitive(PrimitiveType.Quad);card.name="Synthetic telemetry - not SPS data";card.transform.SetParent(camera.transform,false);card.transform.localPosition=new Vector3(0,0,.2f);card.transform.localScale=new Vector3(2,1,1);card.layer=22;UnityEngine.Object.DestroyImmediate(card.GetComponent<Collider>());card.GetComponent<Renderer>().sharedMaterial=data;
                var output=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(Root+"/DesktopOutputExperiment.prefab"),root.transform);output.name="Desktop presenter";output.SetActive(true);
                // Keep the presenter outside the private camera's world-space frustum to prevent recursion.
                output.transform.localPosition=new Vector3(10,0,0);
                var material=new Material(Shader.Find("SensaLab/TextureOutput")){mainTexture=rt};AssetDatabase.CreateAsset(material,Root+"/CameraOnlyOutput.mat");output.GetComponentInChildren<Renderer>().sharedMaterial=material;
                root.SetActive(false);PrefabUtility.SaveAsPrefabAsset(root,path);AssetDatabase.SaveAssets();Debug.Log("SENSA_CAMERA_PROTOTYPE_CREATED");
            }finally{UnityEngine.Object.DestroyImmediate(root);}
        }
        [MenuItem("Tools/Sensa Lab/Generate test world")]
        public static void Generate()
        {
            if(!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())return;
            Directory.CreateDirectory(Root);
            foreach (var scriptName in new[] { "LabController", "LabToggle" }) {
                var path="Assets/SensaLab/Runtime/"+scriptName+".asset";
                if(AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(path)!=null) continue;
                var program=ScriptableObject.CreateInstance<UdonSharpProgramAsset>();
                program.ScriptVersion=UdonSharpProgramVersion.CurrentVersion;
                program.sourceCsScript=AssetDatabase.LoadAssetAtPath<MonoScript>("Assets/SensaLab/Runtime/"+scriptName+".cs");
                AssetDatabase.CreateAsset(program,path);
            }
            AssetDatabase.SaveAssets();
            UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions { IsEditorBuild = true });
            if (File.Exists(Root + "/SensaLab.unity")) throw new InvalidOperationException("Scene already exists; preserve it or move it before regenerating.");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var descriptor = new GameObject("World Descriptor").AddComponent<VRCSceneDescriptor>();
            var spawn = new GameObject("Spawn").transform; spawn.position = new Vector3(0, .1f, -2);
            descriptor.spawns = new[] { spawn };
            var floor = GameObject.CreatePrimitive(PrimitiveType.Cube); floor.name = "Floor"; floor.transform.position = new Vector3(0,-.1f,2); floor.transform.localScale = new Vector3(10,.2f,10);
            var light = new GameObject("Light").AddComponent<Light>(); light.type = LightType.Directional; light.transform.rotation = Quaternion.Euler(40,-30,0);
            RenderSettings.ambientLight = Color.gray;
            var camera = new GameObject("Editor Reference Camera").AddComponent<Camera>(); camera.transform.position = new Vector3(0,1.7f,-2); camera.transform.LookAt(new Vector3(0,1.2f,2)); camera.tag="MainCamera";
            descriptor.ReferenceCamera = camera.gameObject;

            var origin = new GameObject("Contact Reference").transform; origin.position = new Vector3(0,1.1f,2);
            var mover = GameObject.CreatePrimitive(PrimitiveType.Sphere); mover.name = "Moving Root"; mover.transform.position = origin.position; mover.transform.localScale = Vector3.one * .02f;
            UnityEngine.Object.DestroyImmediate(mover.GetComponent<Collider>());
            var sender = mover.AddComponent<VRCContactSender>(); sender.radius = .5f; sender.collisionTags = new List<string> { "TPS_Pen_Root" };
            var receivers = new List<VRCContactReceiver>();
            for (int i=0; i<8; i++) {
                var node = new GameObject("Root A" + i); node.transform.SetParent(origin,false);
                node.transform.localPosition = new Vector3(SensaPoseProtocol.AnchorX(i),SensaPoseProtocol.AnchorY(i),SensaPoseProtocol.AnchorZ(i));
                var r=node.AddComponent<VRCContactReceiver>(); r.radius=SensaPoseProtocol.ReceiverRadius; r.receiverType=ContactReceiver.ReceiverType.Proximity;
                r.collisionTags=new List<string>{"TPS_Pen_Root"}; receivers.Add(r);
            }
            // Three-marker native Contact assets for an avatar wearing the paired receiver rig.
            var pair = new GameObject("Paired Pose Sender / Pair01").transform; pair.position = new Vector3(.6f,1.1f,2);
            var markerPositions = new[] {Vector3.zero, new Vector3(0,0,.15f),new Vector3(.03f,0,0)};
            for(int i=0;i<3;i++) {
                var node=new GameObject(SensaPoseProtocol.Markers[i]);node.transform.SetParent(pair,false);node.transform.localPosition=markerPositions[i];
                var s=node.AddComponent<VRCContactSender>();s.radius=.001f;s.collisionTags=new List<string>{SensaPoseProtocol.Tag("Pair01",SensaPoseProtocol.Markers[i])};
            }
            PrefabUtility.SaveAsPrefabAsset(pair.gameObject,Root+"/PairedSenders.prefab");

            var telemetry = new Material(Shader.Find("SensaLab/Telemetry")); AssetDatabase.CreateAsset(telemetry,Root+"/Telemetry.mat");
            var rt = new RenderTexture(256,128,0,RenderTextureFormat.ARGB32,RenderTextureReadWrite.Linear){name="Telemetry256x128",filterMode=FilterMode.Point,antiAliasing=1};
            AssetDatabase.CreateAsset(rt,Root+"/Telemetry.renderTexture");
            var panel=GameObject.CreatePrimitive(PrimitiveType.Quad);panel.name="Visible telemetry preview";panel.transform.position=new Vector3(1.4f,1.5f,2);panel.transform.localScale=new Vector3(1,.5f,1);
            var preview = new Material(Shader.Find("Unlit/Texture")){mainTexture=rt}; AssetDatabase.CreateAsset(preview,Root+"/Preview.mat"); panel.GetComponent<Renderer>().sharedMaterial=preview;

            var desktop = new GameObject("EXPERIMENT Desktop Output - OFF by default");
            var outCamera=desktop.AddComponent<Camera>();outCamera.orthographic=true;outCamera.orthographicSize=.5f;outCamera.nearClipPlane=.01f;outCamera.farClipPlane=.731f;
            outCamera.clearFlags=CameraClearFlags.Depth;outCamera.depth=100;outCamera.stereoTargetEye=StereoTargetEyeMask.None;outCamera.rect=new Rect(0,0,.25f,.125f);outCamera.cullingMask=1<<22;
            var output=GameObject.CreatePrimitive(PrimitiveType.Quad);output.name="Fixed output quad";output.layer=22;output.transform.SetParent(desktop.transform,false);output.transform.localPosition=new Vector3(0,0,.2f);
            var outputMat=new Material(Shader.Find("SensaLab/TextureOutput")){mainTexture=rt};AssetDatabase.CreateAsset(outputMat,Root+"/Output.mat");output.GetComponent<Renderer>().sharedMaterial=outputMat;
            UnityEngine.Object.DestroyImmediate(output.GetComponent<Collider>());desktop.SetActive(false);
            PrefabUtility.SaveAsPrefabAsset(desktop,Root+"/DesktopOutputExperiment.prefab");

            var canvas=new GameObject("Status Canvas",typeof(RectTransform)).AddComponent<Canvas>();canvas.renderMode=RenderMode.WorldSpace;
            canvas.transform.position=new Vector3(0,2.2f,2.5f);canvas.transform.localScale=Vector3.one*.002f;((RectTransform)canvas.transform).sizeDelta=new Vector2(2000,650);
            var status=new GameObject("Status",typeof(RectTransform)).AddComponent<Text>();status.transform.SetParent(canvas.transform,false);
            status.rectTransform.anchorMin=Vector2.zero;status.rectTransform.anchorMax=Vector2.one;status.rectTransform.offsetMin=Vector2.zero;status.rectTransform.offsetMax=Vector2.zero;
            status.font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");status.fontSize=30;status.alignment=TextAnchor.UpperLeft;status.text="SENSA LAB\nEnter Play Mode / ClientSim for live telemetry.\nLeft cube: pause motion. Right cube: desktop output (experimental).\nLeft: SPS2 station. Center: 8 Contact receivers. Right: telemetry preview.\nNo physical device outputs are configured.";
            var block=GameObject.CreatePrimitive(PrimitiveType.Cube);block.name="Click to pause";block.transform.position=new Vector3(0,.65f,1.5f);block.transform.localScale=Vector3.one*.2f;
            var controller=UdonSharpUndo.AddComponent<LabController>(block);
            controller.mover=mover.transform;controller.origin=origin;controller.sender=sender;controller.receivers=receivers.ToArray();controller.status=status;controller.telemetry=telemetry;controller.telemetryTexture=rt;controller.desktopOutput=desktop;
            UdonSharpEditorUtility.CopyProxyToUdon(controller);
            var toggleBlock=GameObject.CreatePrimitive(PrimitiveType.Cube);toggleBlock.name="Click: desktop output experiment";toggleBlock.transform.position=new Vector3(.5f,.65f,1.5f);toggleBlock.transform.localScale=Vector3.one*.2f;
            var toggle=UdonSharpUndo.AddComponent<LabToggle>(toggleBlock);toggle.controller=controller;UdonSharpEditorUtility.CopyProxyToUdon(toggle);
            CreateSpsStation();
            EditorSceneManager.SaveScene(scene,Root+"/SensaLab.unity");
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(Root+"/SensaLab.unity",true)};
            AssetDatabase.SaveAssets();
            if(!File.Exists(Root+"/CameraOnlyPrototype.prefab"))CreateCameraPrototype();
            AddCameraStation();
            AddLocalProbeStation();
            Debug.Log("SENSA_LAB_GENERATED");
        }
        private static Type FindType(string name) => AppDomain.CurrentDomain.GetAssemblies().Select(a=>a.GetType(name)).FirstOrDefault(t=>t!=null);
        private static void Field(Component component,string name,object value) => component.GetType().GetField(name).SetValue(component,value);
        private static void CreateSpsStation()
        {
            var plugType=FindType("VF.Component.VRCFuryHapticPlug");var socketType=FindType("VF.Component.VRCFuryHapticSocket");
            if(plugType==null || socketType==null) throw new InvalidOperationException("Install official VRCFury with world support.");
            var plug=new GameObject("SPS2 Plug - build preview to bake");plug.transform.position=new Vector3(-.8f,1.1f,2);
            var mesh=GameObject.CreatePrimitive(PrimitiveType.Cylinder);mesh.transform.SetParent(plug.transform,false);mesh.transform.localPosition=new Vector3(0,0,.1f);mesh.transform.localRotation=Quaternion.Euler(90,0,0);mesh.transform.localScale=new Vector3(.03f,.1f,.03f);UnityEngine.Object.DestroyImmediate(mesh.GetComponent<Collider>());
            var material=new Material(Shader.Find("Standard")){color=new Color(.1f,.6f,.9f)};AssetDatabase.CreateAsset(material,Root+"/SpsSurface.mat");mesh.GetComponent<Renderer>().sharedMaterial=material;
            var p=plug.AddComponent(plugType);Field(p,"autoRenderer",false);Field(p,"configureTpsMesh",new List<Renderer>{mesh.GetComponent<Renderer>()});Field(p,"autoPosition",false);Field(p,"autoLength",false);Field(p,"autoRadius",false);Field(p,"length",.2f);Field(p,"radius",.015f);Field(p,"unitsInMeters",true);Field(p,"spsAutorig",false);
            var socket=new GameObject("SPS2 Socket - legacy enabled");socket.transform.position=plug.transform.position+new Vector3(0,0,.12f);socket.AddComponent(socketType);
        }
    }
}
