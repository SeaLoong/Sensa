using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityBox.Sensa;
using nadena.dev.modular_avatar.core;
using VRC.Dynamics;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Avatars.ScriptableObjects;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;
using VRC.SDKBase.Editor.BuildPipeline;

namespace SensaAvatarLab
{
    public static class AvatarCapabilities
    {
        const string Root="Assets/SensaAvatarLab/Capabilities";
        public static readonly string[] Cases={"Contact","PB","PBContact","SPS","SPSContact","Shader","SPSShader"};
        [Serializable] class Row {public string name;public bool passed,selfSpsTagsMatch,shaderFaultAnimationVerified;public int contacts,sensaReceivers,pbHandles;public string[] parameters,contactParameters;}
        [Serializable] class Report {public bool passed;public Row[] cases;}
        [Serializable] class ShaderBundleReport {public bool passed,crcParameterLocal,sourceHasFaultProperty,outputDefaultsOff;public int cameras;public string bundle;}
        static Transform Child(Transform parent,string name,Vector3 position){var t=new GameObject(name).transform;t.SetParent(parent,false);t.localPosition=position;return t;}
        static Type Type(string name)=>AppDomain.CurrentDomain.GetAssemblies().Select(a=>a.GetType(name)).First(t=>t!=null);
        static void Field(Component c,string key,object value)=>c.GetType().GetField(key).SetValue(c,value);
        [MenuItem("Tools/Sensa Avatar Lab/Create capability matrix")]
        public static void Create()
        {
            Directory.CreateDirectory(Root);AssetDatabase.Refresh();
            foreach(var name in Cases)
            {
                string path=Root+"/"+name+".unity";if(File.Exists(path))throw new InvalidOperationException(AvatarLabLocalization.Text("Refusing to replace ")+path);
                var scene=EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects,NewSceneMode.Single);
                var avatar=(GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Amatousagi/Chocolat/Chocolat.prefab"));avatar.name="Sensa Capability "+name;
                avatar.GetComponent<VRC.Core.PipelineManager>().blueprintId="";
                var bench=Child(avatar.GetComponent<Animator>().GetBoneTransform(HumanBodyBones.Hips),"Lab fixture",Vector3.zero);bench.position=new Vector3(0,.9f,.35f);bench.rotation=Quaternion.identity;
                Transform stimulus=null;
                bool sps=name=="SPS"||name=="SPSContact"||name=="SPSShader";
                if(name=="Contact")
                {
                    stimulus=Child(bench,"Moving contact point",Vector3.forward*.1f);Visual(stimulus,"Contact grip",Vector3.zero,Vector3.one*.04f);
                    var probe=bench.gameObject.AddComponent<SensaPointProbe>();probe.reference=bench;probe.target=stimulus;probe.instanceName="LabContact";
                }
                if(name=="PB")
                {
                    var root=Child(bench,"PB only",Vector3.zero);var joint=Child(root,"Joint",Vector3.forward*.05f);var grip=Child(joint,"Grip",Vector3.forward*.05f);
                    var pb=root.gameObject.AddComponent<VRCPhysBone>();pb.rootTransform=root;pb.radius=.03f;pb.pull=.2f;pb.maxStretch=.5f;pb.grabMovement=1;pb.parameter="Sensa/Lab/PB";
                    pb.allowGrabbing=VRCPhysBoneBase.AdvancedBool.True;pb.allowCollision=VRCPhysBoneBase.AdvancedBool.False;pb.allowPosing=VRCPhysBoneBase.AdvancedBool.False;pb.colliders.Clear();pb.ignoreTransforms.Add(Visual(grip,"PB grip",Vector3.zero,Vector3.one*.06f));
                    SensaSensorUtility.Parameter(bench.gameObject,pb.parameter+"_IsGrabbed",ParameterSyncType.Bool);SensaSensorUtility.Parameter(bench.gameObject,pb.parameter+"_Stretch");
                }
                if(name=="PBContact")
                {
                    var probe=bench.gameObject.AddComponent<SensaPointProbe>();probe.reference=bench;probe.createGrabHandle=true;probe.instanceName="LabCombined";
                }
                if(sps)
                {
                    var plug=Child(bench,"Fixture Plug",Vector3.zero);
                    var mesh=GameObject.CreatePrimitive(PrimitiveType.Cylinder);mesh.name="20cm SPS surface";mesh.transform.SetParent(plug,false);mesh.transform.localPosition=Vector3.forward*.1f;mesh.transform.localRotation=Quaternion.Euler(90,0,0);mesh.transform.localScale=new Vector3(.03f,.1f,.03f);UnityEngine.Object.DestroyImmediate(mesh.GetComponent<Collider>());
                    var material=new Material(Shader.Find("Standard")){color=Color.cyan};AssetDatabase.CreateAsset(material,Root+"/"+name+".mat");mesh.GetComponent<Renderer>().sharedMaterial=material;
                    var p=plug.gameObject.AddComponent(Type(SensaSpsAdapter.PlugType));Field(p,"name","FixturePlug");Field(p,"autoRenderer",false);Field(p,"configureTpsMesh",new List<Renderer>{mesh.GetComponent<Renderer>()});Field(p,"autoPosition",false);Field(p,"autoLength",false);Field(p,"autoRadius",false);Field(p,"length",.2f);Field(p,"radius",.015f);Field(p,"unitsInMeters",true);Field(p,"spsAutorig",false);
                    Field(p,"useHipAvoidance",false); // Deliberately permit same-avatar fixture measurements.
                    stimulus=Child(bench,"Fixture Socket",Vector3.forward*.24f);var socket=stimulus.gameObject.AddComponent(Type(SensaSpsAdapter.SocketType));Field(socket,"name","FixtureSocket");
                    Visual(stimulus,"Socket marker",Vector3.zero,new Vector3(.09f,.09f,.006f));
                    if(name=="SPSContact")
                    {
                        var setup=avatar.AddComponent<SensaAutoSetup>();setup.groupName="Fixture";setup.discoverAll=false;setup.selectedTargets=new List<GameObject>{plug.gameObject,stimulus.gameObject};setup.arrayPolicy=SensaArrayPolicy.Exclusive;setup.socketRootTracking=true;setup.localPlugTipTracking=true;setup.localReferenceSocket=stimulus.gameObject;
                    }
                    if(name=="SPSShader")
                    {
                        var camera=new GameObject("Editor SPS capture camera (not uploaded)").AddComponent<Camera>();camera.transform.position=new Vector3(-.45f,1.2f,-.6f);camera.transform.LookAt(bench.position+Vector3.forward*.15f);camera.nearClipPlane=.01f;
                        var rt=new RenderTexture(1024,512,24);AssetDatabase.CreateAsset(rt,Root+"/SpsEditorCamera.renderTexture");camera.targetTexture=rt;
                    }
                }
                if(stimulus!=null)FixtureMenu(avatar,bench.gameObject,stimulus,sps,name);
                if(sps)OgbMenu(avatar,name);
                if(name=="Shader"){CreateShaderRig(avatar,bench);AddShaderFaultControl(avatar);}
                var emulator=AssetDatabase.LoadAssetAtPath<GameObject>("Packages/vrchat.blackstartx.gesture-manager/GestureManager.prefab");if(emulator!=null)PrefabUtility.InstantiatePrefab(emulator);
                EditorSceneManager.SaveScene(scene,path);
            }
            AvatarLabLocalization.SaveAssets();EditorSceneManager.OpenScene(Root+"/Contact.unity");
        }
        static void OgbMenu(GameObject avatar,string name)
        {
            if(avatar.transform.Find("Lab OSC enable")!=null)return;
            string path=Root+"/"+name+"OgbMenu.asset";var menu=AssetDatabase.LoadAssetAtPath<VRCExpressionsMenu>(path);
            if(menu==null){menu=ScriptableObject.CreateInstance<VRCExpressionsMenu>();menu.controls.Add(new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text("Enable SPS OSC (local)"),type=VRCExpressionsMenu.Control.ControlType.Toggle,parameter=new VRCExpressionsMenu.Control.Parameter{name="OGB_ENABLED"},value=1});AssetDatabase.CreateAsset(menu,path);}
            var host=Child(avatar.transform,"Lab OSC enable",Vector3.zero);host.gameObject.AddComponent<ModularAvatarMenuInstaller>().menuToAppend=menu;
        }
        public static void UpgradeOgbMenus()
        {
            foreach(var name in new[]{"SPS","SPSContact","SPSShader"}){var scene=EditorSceneManager.OpenScene(Root+"/"+name+".unity");var avatar=UnityEngine.Object.FindObjectOfType<VRCAvatarDescriptor>().gameObject;OgbMenu(avatar,name);foreach(var plug in avatar.GetComponentsInChildren<Component>(true).Where(c=>c!=null&&c.GetType().FullName==SensaSpsAdapter.PlugType))Field(plug,"useHipAvoidance",false);EditorSceneManager.SaveScene(scene);}
            foreach(var name in AvatarLab.Variants){var scene=EditorSceneManager.OpenScene(AvatarLab.Root+"/"+name+".unity");OgbMenu(UnityEngine.Object.FindObjectOfType<VRCAvatarDescriptor>().gameObject,name);EditorSceneManager.SaveScene(scene);}
            AvatarLabLocalization.SaveAssets();
        }
        static Transform Visual(Transform parent,string name,Vector3 position,Vector3 scale)
        {
            var go=GameObject.CreatePrimitive(PrimitiveType.Sphere);go.name=name;go.transform.SetParent(parent,false);go.transform.localPosition=position;go.transform.localScale=scale;UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());return go.transform;
        }
        static void FixtureMenu(GameObject avatar,GameObject host,Transform target,bool sps,string name)
        {
            var controller=AnimatorController.CreateAnimatorControllerAtPath(Root+"/"+name+"Fixture.controller");const string parameter="Sensa/Lab/Fixture";controller.AddParameter(parameter,AnimatorControllerParameterType.Int);
            SensaSensorUtility.Parameter(host,parameter,ParameterSyncType.Int);
            var menu=ScriptableObject.CreateInstance<VRCExpressionsMenu>();menu.name="Lab fixture";AssetDatabase.CreateAsset(menu,Root+"/"+name+"Menu.asset");
            var values=sps?new[]{new Vector3(0,0,.24f),new Vector3(0,0,.12f),new Vector3(.06f,0,.12f),new Vector3(0,0,.4f)}:new[]{new Vector3(0,0,.1f),new Vector3(0,0,.05f),new Vector3(.06f,0,.1f),new Vector3(0,0,.6f)};
            string[] labels={sps?"Outside / learn length":"Baseline","Near","Offset","Far outside"};
            for(int i=0;i<4;i++)
            {
                var clip=new AnimationClip{name=labels[i]};string targetPath=AnimationUtility.CalculateTransformPath(target,avatar.transform);
                for(int axis=0;axis<3;axis++)clip.SetCurve(targetPath,typeof(Transform),"m_LocalPosition."+"xyz"[axis],AnimationCurve.Constant(0,1,values[i][axis]));
                AssetDatabase.CreateAsset(clip,Root+"/"+name+"_"+i+".anim");var state=controller.layers[0].stateMachine.AddState(labels[i]);state.motion=clip;state.writeDefaultValues=false;
                if(i==0)controller.layers[0].stateMachine.defaultState=state;
                var transition=controller.layers[0].stateMachine.AddAnyStateTransition(state);transition.hasExitTime=false;transition.duration=0;transition.canTransitionToSelf=false;transition.AddCondition(AnimatorConditionMode.Equals,i,parameter);
                menu.controls.Add(new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text(labels[i]),type=VRCExpressionsMenu.Control.ControlType.Toggle,parameter=new VRCExpressionsMenu.Control.Parameter{name=parameter},value=i});
            }
            var merge=host.AddComponent<ModularAvatarMergeAnimator>();merge.animator=controller;merge.layerType=VRCAvatarDescriptor.AnimLayerType.FX;merge.pathMode=MergeAnimatorPathMode.Absolute;merge.matchAvatarWriteDefaults=false;
            host.AddComponent<ModularAvatarMenuInstaller>().menuToAppend=menu;
        }
        static void CreateShaderRig(GameObject avatar,Transform bench)
        {
            var rig=Child(bench,"Experimental desktop code output",Vector3.zero).gameObject;
            var rt=new RenderTexture(256,128,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.Linear){filterMode=FilterMode.Point,antiAliasing=1};AssetDatabase.CreateAsset(rt,Root+"/ShaderCode.renderTexture");
            var material=new Material(Shader.Find("SensaLab/Telemetry"));material.SetFloat("_AutoSequence",1);material.SetFloat("_CameraOnly",1);material.SetVector("_Sample",new Vector4(.25f,-.5f,.75f,0));AssetDatabase.CreateAsset(material,Root+"/ShaderCode.mat");
            var camera=Child(rig.transform,"Code camera",Vector3.zero).gameObject.AddComponent<Camera>();camera.orthographic=true;camera.orthographicSize=.5f;camera.nearClipPlane=.01f;camera.farClipPlane=.731f;camera.cullingMask=1<<22;camera.targetTexture=rt;camera.stereoTargetEye=StereoTargetEyeMask.None;
            var card=GameObject.CreatePrimitive(PrimitiveType.Quad);card.name="Synthetic calibration code";card.transform.SetParent(camera.transform,false);card.transform.localPosition=Vector3.forward*.2f;card.transform.localScale=new Vector3(2,1,1);card.layer=22;UnityEngine.Object.DestroyImmediate(card.GetComponent<Collider>());card.GetComponent<Renderer>().sharedMaterial=material;
            var presenter=Child(rig.transform,"Desktop camera",Vector3.right*10).gameObject.AddComponent<Camera>();presenter.orthographic=true;presenter.orthographicSize=.5f;presenter.nearClipPlane=.01f;presenter.farClipPlane=.731f;presenter.cullingMask=1<<23;presenter.depth=100;presenter.clearFlags=CameraClearFlags.Depth;presenter.rect=new Rect(0,0,.25f,.25f);presenter.stereoTargetEye=StereoTargetEyeMask.None;
            var screen=GameObject.CreatePrimitive(PrimitiveType.Quad);screen.transform.SetParent(presenter.transform,false);screen.transform.localPosition=Vector3.forward*.2f;screen.transform.localScale=new Vector3(2,1,1);screen.layer=23;UnityEngine.Object.DestroyImmediate(screen.GetComponent<Collider>());
            var output=new Material(Shader.Find("SensaLab/TextureOutput")){mainTexture=rt};AssetDatabase.CreateAsset(output,Root+"/ShaderDesktop.mat");screen.GetComponent<Renderer>().sharedMaterial=output;
            SensaSelectionAnimator.Build(avatar,bench.gameObject,"Shader",new[]{rig},new[]{"Synthetic code (not SPS data)"});
        }
        static void AddShaderFaultControl(GameObject avatar)
        {
            if(avatar.transform.Find("Shader fault controls")!=null)return;
            var renderer=avatar.GetComponentsInChildren<MeshRenderer>(true).Single(r=>r.name=="Synthetic calibration code");
            var host=Child(avatar.transform,"Shader fault controls",Vector3.zero).gameObject;
            const string parameter="Sensa/Lab/CorruptCrc";
            SensaSensorUtility.Parameter(host,parameter,ParameterSyncType.Bool);
            var controller=AnimatorController.CreateAnimatorControllerAtPath(Root+"/ShaderFault.controller");controller.AddParameter(parameter,AnimatorControllerParameterType.Bool);
            for(int i=0;i<2;i++)
            {
                var clip=new AnimationClip{name=i==0?"Valid CRC":"Corrupt CRC"};
                clip.SetCurve(AnimationUtility.CalculateTransformPath(renderer.transform,avatar.transform),typeof(MeshRenderer),"material._CorruptCrc",AnimationCurve.Constant(0,1,i));AssetDatabase.CreateAsset(clip,Root+"/ShaderFault"+i+".anim");
                var state=controller.layers[0].stateMachine.AddState(clip.name);state.motion=clip;state.writeDefaultValues=false;if(i==0)controller.layers[0].stateMachine.defaultState=state;
                var transition=controller.layers[0].stateMachine.AddAnyStateTransition(state);transition.hasExitTime=false;transition.duration=0;transition.canTransitionToSelf=false;transition.AddCondition(i==0?AnimatorConditionMode.IfNot:AnimatorConditionMode.If,0,parameter);
            }
            var merge=host.AddComponent<ModularAvatarMergeAnimator>();merge.animator=controller;merge.layerType=VRCAvatarDescriptor.AnimLayerType.FX;merge.pathMode=MergeAnimatorPathMode.Absolute;merge.matchAvatarWriteDefaults=false;
            var menu=ScriptableObject.CreateInstance<VRCExpressionsMenu>();menu.controls.Add(new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text("Corrupt shader CRC"),type=VRCExpressionsMenu.Control.ControlType.Toggle,parameter=new VRCExpressionsMenu.Control.Parameter{name=parameter},value=1});AssetDatabase.CreateAsset(menu,Root+"/ShaderFaultMenu.asset");host.AddComponent<ModularAvatarMenuInstaller>().menuToAppend=menu;
        }
        public static void UpgradeShaderFaultControl()
        {
            var scene=EditorSceneManager.OpenScene(Root+"/Shader.unity");AddShaderFaultControl(UnityEngine.Object.FindObjectOfType<VRCAvatarDescriptor>().gameObject);EditorSceneManager.SaveScene(scene);AvatarLabLocalization.SaveAssets();
        }
        [MenuItem("Tools/Sensa Avatar Lab/Inspect Shader SDK bundle")]
        public static void InspectShaderBundle()
        {
            const string path="Builds/Sensa-Chocolat-Shader.vrca";
            var bundle=AssetBundle.LoadFromFile(path);if(bundle==null)throw new InvalidOperationException(AvatarLabLocalization.Text("Build the Shader SDK bundle first."));
            try
            {
                var avatar=bundle.LoadAllAssets<GameObject>().Single(g=>g.GetComponent<VRCAvatarDescriptor>()!=null);
                var parameters=avatar.GetComponent<VRCAvatarDescriptor>().expressionParameters.parameters;
                var report=new ShaderBundleReport{bundle=path,cameras=avatar.GetComponentsInChildren<Camera>(true).Length,
                    crcParameterLocal=parameters.Any(p=>p.name=="Sensa/Lab/CorruptCrc"&&!p.networkSynced&&p.defaultValue==0),
                    outputDefaultsOff=parameters.Any(p=>p.name=="Sensa/Select/Shader"&&p.defaultValue==0),
                    sourceHasFaultProperty=avatar.GetComponentsInChildren<Renderer>(true).SelectMany(r=>r.sharedMaterials).Any(m=>m!=null&&m.shader.name=="SensaLab/Telemetry"&&m.HasProperty("_CorruptCrc"))};
                report.passed=report.cameras==2&&report.crcParameterLocal&&report.outputDefaultsOff&&report.sourceHasFaultProperty;
                File.WriteAllText("Validation/sdk-shader-contents.json",JsonUtility.ToJson(report,true));
                if(!report.passed)throw new InvalidOperationException(AvatarLabLocalization.Text("Shader SDK bundle contents failed validation."));
            }
            finally {bundle.Unload(true);}
        }
        [MenuItem("Tools/Sensa Avatar Lab/Validate capability matrix")]
        public static void Validate()
        {
            AvatarLab.PrepareTests();var rows=new List<Row>();
            foreach(var name in Cases)
            {
                EditorSceneManager.OpenScene(Root+"/"+name+".unity");var source=UnityEngine.Object.FindObjectOfType<VRCAvatarDescriptor>().gameObject;var clone=UnityEngine.Object.Instantiate(source);clone.name=source.name+"(Clone)";source.SetActive(false);
                try
                {
                    if(!VRCBuildPipelineCallbacks.OnPreprocessAvatar(clone))throw new InvalidOperationException(AvatarLabLocalization.Text("Build callbacks rejected ")+name);
                    var receivers=clone.GetComponentsInChildren<VRCContactReceiver>(true);var senders=clone.GetComponentsInChildren<VRCContactSender>(true);
                    var handles=clone.GetComponentsInChildren<VRCPhysBone>(true).Where(b=>b.parameter!=null&&b.parameter.StartsWith("Sensa/")).ToArray();
                    var parameters=clone.GetComponent<VRCAvatarDescriptor>().expressionParameters.parameters.Select(p=>p.name).ToArray();
                    var row=new Row{name=name,contacts=receivers.Length+senders.Length,sensaReceivers=receivers.Count(r=>r.parameter!=null&&r.parameter.StartsWith("Sensa/")),pbHandles=handles.Length,parameters=parameters,contactParameters=receivers.Select(r=>r.parameter).Where(p=>!string.IsNullOrEmpty(p)).Distinct().ToArray()};
                    row.passed=row.contacts<=256 && handles.All(b=>b.allowGrabbing==VRCPhysBoneBase.AdvancedBool.True&&b.allowCollision==VRCPhysBoneBase.AdvancedBool.False&&b.colliders.Count==0&&b.radius>0&&b.GetComponentsInChildren<Collider>().Length==0);
                    if(name.StartsWith("SPS")) {row.selfSpsTagsMatch=receivers.Any(r=>r.parameter!=null&&r.parameter.EndsWith("/PenSelfNewRoot")&&r.allowSelf&&senders.Any(s=>s.collisionTags.Intersect(r.collisionTags).Any()));row.passed&=row.selfSpsTagsMatch;}
                    if(name=="Contact")row.passed&=row.sensaReceivers==4&&handles.Length==0;
                    if(name=="PB")row.passed&=row.sensaReceivers==0&&handles.Length==1;
                    if(name=="PBContact")row.passed&=row.sensaReceivers==4&&handles.Length==1;
                    if(name=="SPS"||name=="SPSShader")row.passed&=row.sensaReceivers==0 && clone.GetComponentsInChildren<Renderer>(true).Any(r=>r.sharedMaterials.Any(m=>m!=null&&m.shader.name=="Hidden/VRCFury/SpsResolver"));
                    if(name=="SPSContact")row.passed&=row.sensaReceivers==12;
                    if(name=="Shader")
                    {
                        var clips=clone.GetComponent<VRCAvatarDescriptor>().baseAnimationLayers.Where(l=>l.animatorController!=null).SelectMany(l=>l.animatorController.animationClips).Distinct();
                        var values=clips.SelectMany(clip=>AnimationUtility.GetCurveBindings(clip).Where(b=>b.propertyName=="material._CorruptCrc" && clone.transform.Find(b.path)!=null).SelectMany(b=>AnimationUtility.GetEditorCurve(clip,b).keys.Select(k=>k.value))).ToArray();
                        row.shaderFaultAnimationVerified=values.Contains(0f)&&values.Contains(1f);
                        row.passed&=clone.GetComponentsInChildren<Camera>(true).Length==2 && row.sensaReceivers==0 && parameters.Contains("Sensa/Lab/CorruptCrc") && row.shaderFaultAnimationVerified;
                    }
                    rows.Add(row);
                }
                finally{UnityEngine.Object.DestroyImmediate(clone);source.SetActive(true);}
            }
            Directory.CreateDirectory("Validation");var report=new Report{passed=rows.All(r=>r.passed),cases=rows.ToArray()};File.WriteAllText("Validation/capability-matrix.json",JsonUtility.ToJson(report,true));
            if(!report.passed)throw new InvalidOperationException(AvatarLabLocalization.Text("Capability matrix failed."));
            EditorSceneManager.OpenScene(Root+"/Contact.unity");
        }
    }
}
