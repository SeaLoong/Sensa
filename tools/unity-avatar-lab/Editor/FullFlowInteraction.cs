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
using VRC.SDK3.Dynamics.Constraint.Components;

namespace SensaAvatarLab
{
    public static class FullFlowInteraction
    {
        const string Root="Assets/SensaAvatarLab/Interaction";
        const string Hints="Sensa/Lab/ShowMarkers";
        static readonly string[] Colors={"#E85D75","#54B7FF","#77D970","#FFC857","#C792EA","#54DED2","#FF975C","#E6E6E6"};
        static Transform Child(Transform parent,string name,Vector3 pos)
        {var t=new GameObject(name).transform;t.SetParent(parent,false);t.localPosition=pos;return t;}
        static Color ColorFor(int index){ColorUtility.TryParseHtmlString(Colors[index%8],out var value);return value;}
        static Material Mat(int index)
        {
            string path=Root+"/Marker"+index+".mat";var material=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(material==null){material=new Material(Shader.Find("Unlit/Color")){color=ColorFor(index)};AssetDatabase.CreateAsset(material,path);}return material;
        }
        static void Sphere(Transform parent,string name,Vector3 position,int color,float size)
        {var go=GameObject.CreatePrimitive(PrimitiveType.Sphere);go.name=name;go.transform.SetParent(parent,false);go.transform.localPosition=position;go.transform.localScale=Vector3.one*size;UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());go.GetComponent<Renderer>().sharedMaterial=Mat(color);}
        static void Text(Transform parent,string value,Vector3 position,int color,float size=.007f)
        {var text=Child(parent,"Label "+value.Replace("\n"," "),position).gameObject.AddComponent<TextMesh>();text.text=AvatarLabLocalization.Label(value);text.fontSize=48;text.characterSize=size;text.anchor=TextAnchor.MiddleCenter;text.color=ColorFor(color);}
        [MenuItem("Tools/Sensa Avatar Lab/Upgrade FullFlow hand and world controls")]
        public static void Upgrade()
        {
            AvatarLab.PrepareTests();Directory.CreateDirectory(Root);AssetDatabase.Refresh();
            var scene=EditorSceneManager.OpenScene(FullFlowAvatar.Scene);var avatar=UnityEngine.Object.FindObjectOfType<VRCAvatarDescriptor>().gameObject;
            if(avatar.transform.Find("Sensa Test Controls")!=null){RepairMenus(avatar);EnsurePlugGuides(avatar);EnsureGuideLayouts(avatar);BakeLabels(avatar);AvatarLabLocalization.SaveAssets();EditorSceneManager.SaveScene(scene);return;}
            var host=Child(avatar.transform,"Sensa Test Controls",Vector3.zero).gameObject;
            var controller=AnimatorController.CreateAnimatorControllerAtPath(Root+"/Placement.controller");controller.RemoveLayer(0);
            var rootMenu=ScriptableObject.CreateInstance<VRCExpressionsMenu>();rootMenu.name="Sensa test props";AssetDatabase.CreateAsset(rootMenu,Root+"/PropsMenu.asset");
            var markerGroups=new List<GameObject>();
            var setup=avatar.GetComponent<SensaAutoSetup>();var targets=SensaAutoBuilder.Targets(setup,avatar).Where(c=>c.GetType().FullName==SensaSpsAdapter.SocketType).ToArray();
            foreach(var target in targets)
            {
                string id=target.name.Contains("Palm")?"Palm":"Forearm";
                Placement(avatar,host,controller,rootMenu,target.transform,id,id+" Socket");
                var placement=SensaSpsAdapter.Read(target);var hints=Child(target.transform,"Sensa visible guides",placement.position);hints.localRotation=placement.rotation;
                Guides(hints,id+" SOCKET\nentry / +Z",8);markerGroups.Add(hints.gameObject);
                // Replace the old anonymous frame with the labelled guide.
                foreach(var renderer in target.GetComponentsInChildren<Renderer>(true).Where(r=>!r.transform.IsChildOf(hints)))renderer.enabled=false;
            }
            foreach(var probe in avatar.GetComponentsInChildren<SensaPointProbe>(true))
            {
                Placement(avatar,host,controller,rootMenu,probe.transform,"PB","PB handle");
                var hints=Child(probe.transform,"Sensa visible guides",Vector3.zero);Guides(hints,"PB HANDLE\nreference / grab the ball",4);markerGroups.Add(hints.gameObject);
            }
            var shader=avatar.GetComponent<Animator>().GetBoneTransform(HumanBodyBones.Hips).Find("Lab fixture");
            if(shader!=null){Placement(avatar,host,controller,rootMenu,shader,"Shader","Shader rig");var hints=Child(shader,"Sensa visible guides",Vector3.zero);Text(hints,"SHADER (TEST)",Vector3.up*.1f,4,.005f);Sphere(hints,"Reference",Vector3.zero,4,.025f);markerGroups.Add(hints.gameObject);}
            // The original lollipop already has LeftHand / RightHand / Fixed controls; link the same menu here.
            var original=avatar.GetComponentsInChildren<ModularAvatarMenuInstaller>(true).Select(i=>i.menuToAppend).FirstOrDefault(m=>m!=null&&m.controls.Any(c=>c.name=="SPS_Lollipop"));
            if(original!=null){var item=original.controls.First(c=>c.name=="SPS_Lollipop");rootMenu.controls.Add(new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text("Plug / Lollipop"),type=VRCExpressionsMenu.Control.ControlType.SubMenu,subMenu=item.subMenu});}
            else
            {
                MovePropMenu(avatar,rootMenu);
            }
            SensaSensorUtility.Parameter(host,Hints,ParameterSyncType.Bool);
            var configs=host.GetComponent<ModularAvatarParameters>().parameters;int hintIndex=configs.FindIndex(p=>p.nameOrPrefix==Hints);var hintConfig=configs[hintIndex];hintConfig.defaultValue=1;configs[hintIndex]=hintConfig;
            controller.AddParameter(Hints,AnimatorControllerParameterType.Bool);var parameter=controller.parameters;parameter.Single(p=>p.name==Hints).defaultBool=true;controller.parameters=parameter;
            var machine=new AnimatorStateMachine{name="Marker visibility"};AssetDatabase.AddObjectToAsset(machine,controller);controller.layers=controller.layers.Concat(new[]{new AnimatorControllerLayer{name="Marker visibility",stateMachine=machine,defaultWeight=1}}).ToArray();
            for(int value=0;value<2;value++)
            {
                var clip=new AnimationClip{name=value==0?"Hide guides":"Show guides"};
                foreach(var group in markerGroups)clip.SetCurve(AnimationUtility.CalculateTransformPath(group.transform,avatar.transform),typeof(GameObject),"m_IsActive",AnimationCurve.Constant(0,1,value));
                AssetDatabase.AddObjectToAsset(clip,controller);var state=machine.AddState(clip.name);state.motion=clip;state.writeDefaultValues=false;if(value==1)machine.defaultState=state;
                var transition=machine.AddAnyStateTransition(state);transition.duration=0;transition.hasExitTime=false;transition.canTransitionToSelf=false;transition.AddCondition(value==1?AnimatorConditionMode.If:AnimatorConditionMode.IfNot,0,Hints);
            }
            rootMenu.controls.Add(new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text("Visible labels / probes"),type=VRCExpressionsMenu.Control.ControlType.Toggle,parameter=new VRCExpressionsMenu.Control.Parameter{name=Hints},value=1});
            var menu=ScriptableObject.CreateInstance<VRCExpressionsMenu>();menu.controls.Add(new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text("Sensa Test Props"),type=VRCExpressionsMenu.Control.ControlType.SubMenu,subMenu=rootMenu});AssetDatabase.CreateAsset(menu,Root+"/Installer.asset");host.AddComponent<ModularAvatarMenuInstaller>().menuToAppend=menu;
            var merge=host.AddComponent<ModularAvatarMergeAnimator>();merge.animator=controller;merge.layerType=VRCAvatarDescriptor.AnimLayerType.FX;merge.pathMode=MergeAnimatorPathMode.Absolute;merge.matchAvatarWriteDefaults=false;
            RepairMenus(avatar);EnsurePlugGuides(avatar);EnsureGuideLayouts(avatar);BakeLabels(avatar);AvatarLabLocalization.SaveAssets();EditorSceneManager.SaveScene(scene);
        }
        static bool IsGuide(Transform node) {for(var p=node.parent;p!=null;p=p.parent)if(p.name=="Sensa visible guides")return true;return false;}
        static void EnsureGuideLayouts(GameObject avatar)
        {
            var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(Root+"/Placement.controller");if(controller.layers.Any(l=>l.name=="Probe layout"))return;
            var setup=avatar.GetComponent<SensaAutoSetup>();var measured=SensaAutoBuilder.Targets(setup,avatar).Where(c=>SensaAutoBuilder.HasMeasurement(setup,c)).ToArray();
            int plugSlot=Array.FindIndex(measured,c=>c.GetType().FullName==SensaSpsAdapter.PlugType)+1;
            var cubes=new List<Transform>();var points=new List<Transform>();
            void PointGuide(Transform parent,string title)
            {
                var group=Child(parent,"Compact probes",Vector3.zero);points.Add(group);
                for(int i=0;i<4;i++){int a=SensaPoseProtocol.PointAnchorIndex(i);var pos=new Vector3(SensaPoseProtocol.AnchorX(a),SensaPoseProtocol.AnchorY(a),SensaPoseProtocol.AnchorZ(a));Sphere(group,"Probe P"+(i+1),pos,i,.012f);Text(group,"P"+(i+1),pos+Vector3.up*(pos.z<0?-.02f:.02f),i,.0035f);}
                Text(group,title,Vector3.up*.10f,7,.0035f);group.gameObject.SetActive(false);
            }
            foreach(var socket in measured.Where(c=>c.GetType().FullName==SensaSpsAdapter.SocketType))
            {
                var hints=socket.transform.Find("Sensa visible guides");var cube=Child(hints,"Cube probes",Vector3.zero);cubes.Add(cube);
                for(int i=0;i<8;i++)
                {
                    var marker=hints.Find("Probe P"+(i+1));marker.SetParent(cube,false);marker.name="Probe C"+(i+1);
                    var oldLabel=hints.Find("Label P"+(i+1));if(oldLabel!=null)UnityEngine.Object.DestroyImmediate(oldLabel.gameObject);
                    var pos=marker.localPosition;Text(cube,"C"+(i+1),pos+Vector3.up*(pos.z<0?-.02f:.02f),i,.0035f);
                }
                if(socket.gameObject==setup.localReferenceSocket)PointGuide(hints,"POINT REFERENCE");
            }
            var plug=measured.Single(c=>c.GetType().FullName==SensaSpsAdapter.PlugType);var carrier=avatar.transform.Find("Sensa Plug guide carrier");
            carrier.localScale=Vector3.one*(plug.transform.lossyScale.x/avatar.transform.lossyScale.x);
            PointGuide(carrier.Find("Sensa visible guides"),"PLUG HANDLE");
            string selector="Sensa/Select/"+setup.groupName;if(!controller.parameters.Any(p=>p.name==selector))controller.AddParameter(selector,AnimatorControllerParameterType.Int);
            var machine=new AnimatorStateMachine{name="Probe layout"};AssetDatabase.AddObjectToAsset(machine,controller);controller.layers=controller.layers.Concat(new[]{new AnimatorControllerLayer{name="Probe layout",stateMachine=machine,defaultWeight=1}}).ToArray();
            for(int mode=0;mode<2;mode++)
            {
                var clip=new AnimationClip{name=mode==0?"Cube probe guides":"Compact probe guides"};
                foreach(var group in cubes)clip.SetCurve(AnimationUtility.CalculateTransformPath(group,avatar.transform),typeof(GameObject),"m_IsActive",AnimationCurve.Constant(0,1,mode==0?1:0));
                foreach(var group in points)clip.SetCurve(AnimationUtility.CalculateTransformPath(group,avatar.transform),typeof(GameObject),"m_IsActive",AnimationCurve.Constant(0,1,mode));
                AssetDatabase.AddObjectToAsset(clip,controller);var state=machine.AddState(clip.name);state.motion=clip;state.writeDefaultValues=false;if(mode==0)machine.defaultState=state;
                var transition=machine.AddAnyStateTransition(state);transition.duration=0;transition.hasExitTime=false;transition.canTransitionToSelf=false;transition.AddCondition(mode==0?AnimatorConditionMode.NotEqual:AnimatorConditionMode.Equals,plugSlot,selector);
            }
            foreach(var asset in AssetDatabase.LoadAllAssetsAtPath(Root+"/Placement.controller"))EditorUtility.SetDirty(asset);
        }
        static void RepairMenus(GameObject avatar)
        {
            var rootMenu=AssetDatabase.LoadAssetAtPath<VRCExpressionsMenu>(Root+"/PropsMenu.asset");rootMenu.controls.Clear();
            string[] ids={"Palm","Forearm","PB","Shader"};string[] titles={"Palm Socket","Forearm Socket","PB handle","Shader rig"};string[] states={"Home / reset","Left hand","Right hand","Place in world"};
            var setup=avatar.GetComponent<SensaAutoSetup>();var measured=SensaAutoBuilder.Targets(setup,avatar).Where(c=>SensaAutoBuilder.HasMeasurement(setup,c)).ToArray();
            VRCExpressionsMenu.Control Toggle(string title,string parameter,float value)=>new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text(title),type=VRCExpressionsMenu.Control.ControlType.Toggle,parameter=new VRCExpressionsMenu.Control.Parameter{name=parameter},value=value};
            for(int i=0;i<ids.Length;i++)
            {
                var menu=AssetDatabase.LoadAssetAtPath<VRCExpressionsMenu>(Root+"/"+ids[i]+"Menu.asset");menu.controls.Clear();
                for(int value=0;value<4;value++)menu.controls.Add(new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text(states[value]),type=VRCExpressionsMenu.Control.ControlType.Toggle,parameter=new VRCExpressionsMenu.Control.Parameter{name="Sensa/Lab/Place/"+ids[i]},value=value});
                if(i<2){int index=Array.FindIndex(measured,c=>c.name.Contains(ids[i]));if(index>=0)menu.controls.Add(Toggle("Measure this socket","Sensa/Select/"+setup.groupName,index+1));}
                if(i==3){menu.controls.Add(Toggle("Code output (synthetic)","Sensa/Select/Shader",1));menu.controls.Add(Toggle("Corrupt CRC (test)","Sensa/Lab/CorruptCrc",1));}
                EditorUtility.SetDirty(menu);rootMenu.controls.Add(new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text(titles[i]),type=VRCExpressionsMenu.Control.ControlType.SubMenu,subMenu=menu});
            }
            rootMenu.controls.Add(new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text("Visible labels / probes"),type=VRCExpressionsMenu.Control.ControlType.Toggle,parameter=new VRCExpressionsMenu.Control.Parameter{name=Hints},value=1});
            rootMenu.controls.Add(Toggle("SPS OSC","OGB_ENABLED",1));
            int plugIndex=Array.FindIndex(measured,c=>c.GetType().FullName==SensaSpsAdapter.PlugType);if(plugIndex>=0)rootMenu.controls.Add(Toggle("Measure plug","Sensa/Select/"+setup.groupName,plugIndex+1));
            EditorUtility.SetDirty(rootMenu);MovePropMenu(avatar,rootMenu);
            foreach(var asset in AssetDatabase.LoadAllAssetsAtPath(Root+"/Placement.controller"))EditorUtility.SetDirty(asset);
        }
        static void EnsurePlugGuides(GameObject avatar)
        {
            if(avatar.transform.Find("Sensa Plug guide carrier")!=null)return;
            var plug=SensaAutoBuilder.Targets(avatar.GetComponent<SensaAutoSetup>(),avatar).Single(c=>c.GetType().FullName==SensaSpsAdapter.PlugType);
            var placement=SensaSpsAdapter.Read(plug);var carrier=Child(avatar.transform,"Sensa Plug guide carrier",Vector3.zero);
            carrier.position=plug.transform.TransformPoint(placement.position);carrier.rotation=plug.transform.rotation*placement.rotation;
            var constraint=carrier.gameObject.AddComponent<VRCParentConstraint>();constraint.Sources.Add(new VRCConstraintSource(plug.transform,1,placement.position,placement.rotation.eulerAngles));constraint.IsActive=true;constraint.Locked=true;
            var hints=Child(carrier,"Sensa visible guides",Vector3.zero);
            Sphere(hints,"Root marker",Vector3.zero,0,.014f);Text(hints,"ROOT",Vector3.down*.025f,0,.005f);
            Sphere(hints,"Tip marker",Vector3.forward*placement.length,1,.014f);Text(hints,"TIP",Vector3.forward*placement.length+Vector3.up*.02f,1,.005f);
            Sphere(hints,"Side marker",Vector3.right*.03f,2,.012f);Text(hints,"SIDE",new Vector3(.045f,.025f,0),2,.005f);
            var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(Root+"/Placement.controller");
            foreach(var clip in controller.animationClips.Where(c=>c.name=="Show guides"||c.name=="Hide guides"))
                clip.SetCurve(AnimationUtility.CalculateTransformPath(hints,avatar.transform),typeof(GameObject),"m_IsActive",AnimationCurve.Constant(0,1,clip.name=="Show guides"?1:0));
        }
        static void BakeLabels(GameObject avatar)
        {
            var labels=avatar.GetComponentsInChildren<TextMesh>(true).Where(t=>IsGuide(t.transform)).ToArray();if(labels.Length==0)return;
            var font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var characters=labels.SelectMany(label=>label.text).Concat(Enumerable.Range(32,95).Select(i=>(char)i)).Distinct().ToArray();
            font.RequestCharactersInTexture(new string(characters),48,FontStyle.Normal);
            foreach(var label in labels) {
                if(label.text.Any(character=>!char.IsWhiteSpace(character)&&!font.GetCharacterInfo(character,out _,48))) {
                    label.text=AvatarLabLocalization.OriginalLabel(label.text);
                    Debug.LogWarning("Lab label font has missing glyphs; using the stable English label. / 实验标签字体缺少字形，使用稳定英文标签。");
                }
            }
            characters=labels.SelectMany(label=>label.text).Concat(Enumerable.Range(32,95).Select(i=>(char)i)).Distinct().ToArray();
            font.RequestCharactersInTexture(new string(characters),48,FontStyle.Normal);
            // Imports can repack the editor's dynamic font atlas. Snapshot UVs before importing anything.
            var glyphs=new Dictionary<char,CharacterInfo>();foreach(char c in characters){if(font.GetCharacterInfo(c,out var glyph,48))glyphs[c]=glyph;}
            float lineHeight=font.lineHeight;
            string atlasPath=AssetDatabase.GenerateUniqueAssetPath(Root+"/LabelAtlas.png");
            var source=font.material.mainTexture;var rt=RenderTexture.GetTemporary(source.width,source.height,0,RenderTextureFormat.ARGB32);
            var previous=RenderTexture.active;var image=new Texture2D(source.width,source.height,TextureFormat.RGBA32,false);
            try{Graphics.Blit(source,rt);RenderTexture.active=rt;image.ReadPixels(new Rect(0,0,rt.width,rt.height),0,0);image.Apply();File.WriteAllBytes(atlasPath,image.EncodeToPNG());}
            finally{RenderTexture.active=previous;RenderTexture.ReleaseTemporary(rt);UnityEngine.Object.DestroyImmediate(image);}
            AssetDatabase.ImportAsset(atlasPath);var importer=(TextureImporter)AssetImporter.GetAtPath(atlasPath);importer.alphaIsTransparency=true;importer.mipmapEnabled=true;importer.textureCompression=TextureImporterCompression.Uncompressed;importer.SaveAndReimport();
            var material=new Material(Shader.Find("SensaLab/ProbeLabel")){name="Baked label font",mainTexture=AssetDatabase.LoadAssetAtPath<Texture2D>(atlasPath)};AssetDatabase.CreateAsset(material,AssetDatabase.GenerateUniqueAssetPath(Root+"/BakedLabels.mat"));
            for(int labelIndex=0;labelIndex<labels.Length;labelIndex++)
            {
                var text=labels[labelIndex];var vertices=new List<Vector3>();var uv=new List<Vector2>();var triangles=new List<int>();var colors=new List<Color>();
                var lines=text.text.Split('\n');float scale=text.characterSize*.1f;
                for(int line=0;line<lines.Length;line++)
                {
                    float width=0;foreach(char c in lines[line])if(glyphs.TryGetValue(c,out var glyph))width+=glyph.advance;
                    float x=-width*.5f,y=-line*lineHeight;
                    foreach(char c in lines[line])
                    {
                        if(!glyphs.TryGetValue(c,out var glyph))continue;
                        if(glyph.maxX!=glyph.minX&&glyph.maxY!=glyph.minY)
                        {
                            int start=vertices.Count;
                            vertices.Add(new Vector3(x+glyph.minX,y+glyph.minY,0)*scale);vertices.Add(new Vector3(x+glyph.minX,y+glyph.maxY,0)*scale);
                            vertices.Add(new Vector3(x+glyph.maxX,y+glyph.maxY,0)*scale);vertices.Add(new Vector3(x+glyph.maxX,y+glyph.minY,0)*scale);
                            uv.AddRange(new[]{glyph.uvBottomLeft,glyph.uvTopLeft,glyph.uvTopRight,glyph.uvBottomRight});triangles.AddRange(new[]{start,start+1,start+2,start,start+2,start+3});colors.AddRange(new[]{text.color,text.color,text.color,text.color});
                        }
                        x+=glyph.advance;
                    }
                }
                var mesh=new Mesh{name="Baked label "+labelIndex};mesh.SetVertices(vertices);mesh.RecalculateBounds();var center=mesh.bounds.center;
                vertices=vertices.Select(v=>v-center).ToList();int count=vertices.Count;
                // Separate back-facing geometry keeps labels readable from both sides, without mirrored text.
                vertices.AddRange(vertices.Select(v=>new Vector3(-v.x,v.y,v.z+.0001f)).ToArray());
                uv.AddRange(uv.ToArray());colors.AddRange(colors.ToArray());triangles.AddRange(triangles.Select(i=>i+count).ToArray());
                mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetTriangles(triangles,0);mesh.SetColors(colors);mesh.RecalculateBounds();mesh.RecalculateNormals();AssetDatabase.CreateAsset(mesh,AssetDatabase.GenerateUniqueAssetPath(Root+"/Label"+labelIndex+".asset"));
                var go=text.gameObject;UnityEngine.Object.DestroyImmediate(text);var filter=go.AddComponent<MeshFilter>();filter.sharedMesh=mesh;go.GetComponent<MeshRenderer>().sharedMaterial=material;
            }
            AvatarLabLocalization.SaveAssets();
        }
        [MenuItem("Tools/Sensa Avatar Lab/Rebake FullFlow marker labels")]
        public static void RebakeLabels()
        {
            AvatarLab.PrepareTests();var scene=EditorSceneManager.OpenScene(FullFlowAvatar.Scene);var avatar=UnityEngine.Object.FindObjectOfType<VRCAvatarDescriptor>().gameObject;
            foreach(var filter in avatar.GetComponentsInChildren<MeshFilter>(true).Where(f=>IsGuide(f.transform)&&f.name.StartsWith("Label ")))
            {
                string value=filter.name.Substring(6);var color=filter.sharedMesh.colors.Length>0?filter.sharedMesh.colors[0]:Color.white;
                bool probe=value.Length==2&&(value[0]=='P'||value[0]=='C');
                if(value.StartsWith("Palm SOCKET"))value="PALM SOCKET";
                if(value.StartsWith("Forearm SOCKET"))value="FOREARM SOCKET";
                if(value.StartsWith("PB HANDLE"))value="PB HANDLE";
                if(value.StartsWith("SHADER"))value="SHADER (TEST)";
                var go=filter.gameObject;
                if(probe){var center=go.transform.parent.Find("Probe "+value);if(center!=null)go.transform.localPosition=center.localPosition+Vector3.up*(center.localPosition.z<0?-.02f:.02f);}
                UnityEngine.Object.DestroyImmediate(filter);var text=go.AddComponent<TextMesh>();text.text=AvatarLabLocalization.Label(value);text.color=color;text.fontSize=48;text.characterSize=.0035f;text.anchor=TextAnchor.MiddleCenter;go.name="Label "+value;
            }
            BakeLabels(avatar);EditorSceneManager.SaveScene(scene);FullFlowAvatar.Validate();
        }
        static void MovePropMenu(GameObject avatar,VRCExpressionsMenu menu)
        {
            var installer=avatar.GetComponentsInChildren<ModularAvatarMenuInstaller>(true).FirstOrDefault(i=>i.menuToAppend==null&&i.GetComponentsInChildren<ModularAvatarMenuItem>(true).Any(item=>item.Control.parameter!=null&&item.Control.parameter.name!=null&&item.Control.parameter.name.StartsWith("SPS_Lollipop/")));
            if(installer!=null)installer.installTargetMenu=menu;
        }
        public static bool InspectBindings(GameObject avatar,out int targetCount)
        {
            // Runtime bundles may strip editor curve data. Exercise the actual Animator instead.
            targetCount=0;var instance=UnityEngine.Object.Instantiate(avatar);instance.name="Sensa placement validation";instance.SetActive(true);
            try
            {
                var animator=instance.GetComponent<Animator>();animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;
                foreach(var layer in instance.GetComponent<VRCAvatarDescriptor>().baseAnimationLayers)
                {
                    if(layer.animatorController==null)continue;animator.runtimeAnimatorController=layer.animatorController;animator.Rebind();
                    if(!animator.parameters.Any(p=>p.name=="Sensa/Lab/Place/Palm"))continue;
                    var targets=instance.GetComponentsInChildren<VRCParentConstraint>(true).Where(c=>c.Sources.Count==3).ToArray();
                    targetCount=targets.Length;if(targetCount!=4)return false;
                    foreach(string id in new[]{"Palm","Forearm","PB","Shader"})
                    {
                        string name="Sensa/Lab/Place/"+id;
                        animator.SetInteger(name,1);animator.Update(.1f);animator.Update(.1f);
                        if(targets.Any(c=>!c.isActiveAndEnabled||!c.IsActive))return false;
                        var matches=targets.Where(c=>!c.FreezeToWorld&&c.Sources[1].Weight>.99f).ToArray();if(matches.Length!=1)return false;
                        var target=matches[0];animator.SetInteger(name,3);animator.Update(.1f);animator.Update(.1f);if(!target.FreezeToWorld)return false;
                        animator.SetInteger(name,2);animator.Update(.1f);animator.Update(.1f);if(target.FreezeToWorld||target.Sources[2].Weight<.99f)return false;
                        animator.SetInteger(name,0);animator.Update(.1f);animator.Update(.1f);if(target.FreezeToWorld||target.Sources[0].Weight<.99f)return false;
                    }
                    var cubes=instance.GetComponentsInChildren<Transform>(true).Where(t=>t.name=="Cube probes").ToArray();
                    var compact=instance.GetComponentsInChildren<Transform>(true).Where(t=>t.name=="Compact probes").ToArray();
                    if(cubes.Length!=2||compact.Length!=2)return false;
                    animator.SetInteger("Sensa/Select/Lab",3);animator.Update(.1f);animator.Update(.1f);
                    if(cubes.Any(t=>t.gameObject.activeSelf)||compact.Any(t=>!t.gameObject.activeSelf))return false;
                    animator.SetInteger("Sensa/Select/Lab",0);animator.Update(.1f);animator.Update(.1f);
                    if(cubes.Any(t=>!t.gameObject.activeSelf)||compact.Any(t=>t.gameObject.activeSelf))return false;
                    return true;
                }
                return false;
            }
            finally{UnityEngine.Object.DestroyImmediate(instance);}
        }
        static void Placement(GameObject avatar,GameObject host,AnimatorController controller,VRCExpressionsMenu rootMenu,Transform target,string id,string label)
        {
            var animator=avatar.GetComponent<Animator>();
            var home=Child(target.parent,"Sensa home "+id,target.localPosition);home.localRotation=target.localRotation;
            Transform Anchor(HumanBodyBones bone,string side)
            {var hand=animator.GetBoneTransform(bone);var anchor=Child(hand,"Sensa "+id+" "+side,Vector3.zero);anchor.position=hand.position+avatar.transform.forward*.12f;anchor.rotation=avatar.transform.rotation;return anchor;}
            var left=Anchor(HumanBodyBones.LeftHand,"left");var right=Anchor(HumanBodyBones.RightHand,"right");
            var constraint=target.gameObject.AddComponent<VRCParentConstraint>();constraint.Sources.Add(new VRCConstraintSource(home,1,Vector3.zero,Vector3.zero));constraint.Sources.Add(new VRCConstraintSource(left,0,Vector3.zero,Vector3.zero));constraint.Sources.Add(new VRCConstraintSource(right,0,Vector3.zero,Vector3.zero));constraint.IsActive=true;constraint.Locked=true;
            string parameter="Sensa/Lab/Place/"+id;SensaSensorUtility.Parameter(host,parameter,ParameterSyncType.Int);controller.AddParameter(parameter,AnimatorControllerParameterType.Int);
            var machine=new AnimatorStateMachine{name=label};AssetDatabase.AddObjectToAsset(machine,controller);controller.layers=controller.layers.Concat(new[]{new AnimatorControllerLayer{name=label,stateMachine=machine,defaultWeight=1}}).ToArray();
            var menu=ScriptableObject.CreateInstance<VRCExpressionsMenu>();menu.name=label;AssetDatabase.CreateAsset(menu,Root+"/"+id+"Menu.asset");
            rootMenu.controls.Add(new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text(label),type=VRCExpressionsMenu.Control.ControlType.SubMenu,subMenu=menu});
            string[] labels={"Home / reset","Left hand","Right hand","Place in world"};string path=AnimationUtility.CalculateTransformPath(target,avatar.transform);
            for(int mode=0;mode<4;mode++)
            {
                var clip=new AnimationClip{name=id+" "+labels[mode]};clip.SetCurve(path,typeof(VRCParentConstraint),"FreezeToWorld",AnimationCurve.Constant(0,1,mode==3?1:0));
                // Frozen mode keeps the last source weights; it must not jump to another attachment first.
                if(mode!=3)for(int source=0;source<3;source++)clip.SetCurve(path,typeof(VRCParentConstraint),"Sources.source"+source+".Weight",AnimationCurve.Constant(0,1,mode==source?1:0));
                AssetDatabase.AddObjectToAsset(clip,controller);var state=machine.AddState(labels[mode]);state.motion=clip;state.writeDefaultValues=false;if(mode==0)machine.defaultState=state;
                var transition=machine.AddAnyStateTransition(state);transition.duration=0;transition.hasExitTime=false;transition.canTransitionToSelf=false;transition.AddCondition(AnimatorConditionMode.Equals,mode,parameter);
                menu.controls.Add(new VRCExpressionsMenu.Control{name=AvatarLabLocalization.Text(labels[mode]),type=VRCExpressionsMenu.Control.ControlType.Toggle,parameter=new VRCExpressionsMenu.Control.Parameter{name=parameter},value=mode});
            }
        }
        static void Guides(Transform parent,string title,int count)
        {
            for(int i=0;i<count;i++)
            {
                int anchor=count==4?SensaPoseProtocol.PointAnchorIndex(i):i;
                var point=new Vector3(SensaPoseProtocol.AnchorX(anchor),SensaPoseProtocol.AnchorY(anchor),SensaPoseProtocol.AnchorZ(anchor));
                Sphere(parent,"Probe P"+(i+1),point,i,.012f);Text(parent,"P"+(i+1),point+Vector3.up*(point.z<0?-.02f:.02f),i,.0035f);
            }
            Text(parent,title.Split('\n')[0].ToUpperInvariant(),new Vector3(0,.14f,0),7,.0035f);
            var line=Child(parent,"Entry axis +Z",Vector3.zero).gameObject.AddComponent<LineRenderer>();line.useWorldSpace=false;line.positionCount=2;line.SetPositions(new[]{Vector3.zero,Vector3.forward*.12f});line.startWidth=.004f;line.endWidth=.001f;line.sharedMaterial=Mat(3);
            Sphere(parent,"Origin",Vector3.zero,7,.018f);Text(parent,"+Z",Vector3.forward*.13f,3,.005f);
        }
    }
}
