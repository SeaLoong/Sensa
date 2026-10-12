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
using VRC.Dynamics;
using UnityBox.Sensa;

namespace SensaLab
{
    public static class LabBuilder
    {
        private const string Root = "Assets/SensaLab/Generated";
        [MenuItem("Tools/Sensa Lab/Generate test world")]
        public static void Generate()
        {
            Directory.CreateDirectory(Root);
            foreach (var scriptName in new[] { "LabController", "LabToggle" }) {
                var path="Assets/SensaLab/Runtime/"+scriptName+".asset";
                if(AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(path)!=null) continue;
                var program=ScriptableObject.CreateInstance<UdonSharpProgramAsset>();
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
