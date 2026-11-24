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
using UnityBox.Sensa;

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
            ConfigurePresetRoutes(GameObject.Find("08 MY AVATAR SPS").transform);
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
        [MenuItem("Tools/Sensa Lab/Update preset test routes")]
        public static void UpdatePresetRoutes()
        {
            UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync();
            if (UdonSharpProgramAsset.AnyUdonSharpScriptHasError()) throw new InvalidOperationException("UdonSharp compilation failed.");
            var scene = LabEditorLocalization.OpenScene(FunctionalLab.Scene);
            ConfigurePresetRoutes(GameObject.Find("08 MY AVATAR SPS").transform);
            LabEditorLocalization.SaveScene(scene);
            AssetDatabase.SaveAssets();
            ValidatePresetRoutes();
        }

        static readonly string[] AxisActions = { "CaptureCenter", "Center", "Depth", "Surge", "Sway", "Roll", "Yaw", "Pitch" };
        static readonly string[] AxisLabels = { "CAPTURE", "CENTER", "Z / L0", "Y / L1", "X / L2", "ROLL / R0", "YAW / R1", "PITCH / R2" };

        static void ConfigureAxisControls(Transform area)
        {
            var placement = area.Find("PLUG controls").GetComponent<LabPlacement>();
            var panel = area.Find("Axis controls") ?? Child(area, "Axis controls", new Vector3(-.95f, .55f, -.85f));
            for (int i = 0; i < AxisActions.Length; i++)
            {
                var node = panel.Find(AxisActions[i]);
                if (node == null)
                {
                    node = GameObject.CreatePrimitive(PrimitiveType.Cube).transform;
                    node.name = AxisActions[i];
                    node.SetParent(panel, false);
                }
                node.localPosition = new Vector3((i % 4 - 1.5f) * .26f, 0, -(i / 4) * .24f);
                node.localScale = new Vector3(.23f, .09f, .10f);
                node.GetComponent<Renderer>().sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>(Root + "/Control" + i % 4 + ".mat");
                var button = node.GetComponent<LabPlacementButton>() ?? UdonSharpUndo.AddComponent<LabPlacementButton>(node.gameObject);
                button.placement = placement;
                button.action = AxisActions[i];
                UdonSharpEditorUtility.CopyProxyToUdon(button);
                Label(panel, AxisActions[i] + " label", node.localPosition + new Vector3(0, .07f, -.05f), AxisLabels[i], Color.white, .007f);
            }
        }

        static void ConfigurePresetRoutes(Transform area)
        {
            foreach (var station in UnityEngine.Object.FindObjectsOfType<CapabilityStation>())
                LabPointCases.AlignReceivers(station.receivers);
            var quick = UnityEngine.Object.FindObjectOfType<QuickStartStation>();
            if (quick != null) quick.status.text = quick.status.text.Replace("In Sensa import Quick Start preset; apply OSC input.", "Load osc-l0. Set Depth to Sensa/QuickStart/Depth and add Active as GateEnable.");
            var boardText = area.Find("Your avatar SPS instructions").GetComponent<Text>();
            boardText.text = LabEditorLocalization.Original(boardText).Replace("Open avatar SPS / OGB_ENABLED, then use the matching preset.",
                "Enable SPS and the avatar SPS OSC toggle, then load the preset.").Replace("Start separated to learn length. Aligned 10 cm / 20 cm is ~50%.",
                "At the band the plug is halfway in. SPS3 DepthOthers reports proximity.");
            var plug = area.Find("World SPS Plug");
            var markers = plug.Find("Preset markers") ?? Child(plug, "Preset markers", Vector3.zero);
            var offsets = new[] { Vector3.zero, Vector3.forward * .20f, Vector3.right * .03f };
            for (int i = 0; i < SensaPoseProtocol.Markers.Length; i++)
            {
                string marker = SensaPoseProtocol.Markers[i];
                var node = markers.Find(marker) ?? Child(markers, marker, offsets[i]);
                node.localPosition = offsets[i];
                var sender = node.GetComponent<VRCContactSender>() ?? node.gameObject.AddComponent<VRCContactSender>();
                sender.radius = SensaPoseProtocol.MarkerRadius;
                sender.collisionTags = new List<string> { SensaPoseProtocol.Tag("LabPair", marker) };
                if (marker == "Tip") sender.collisionTags.Add("SensaLabContact");
            }
            if (markers.Find("Tip/Marker light") == null)
            {
                var light = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                light.name = "Marker light";
                light.transform.SetParent(markers.Find("Tip"), false);
                light.transform.localScale = Vector3.one * .018f;
                UnityEngine.Object.DestroyImmediate(light.GetComponent<Collider>());
                light.GetComponent<Renderer>().sharedMaterial = Material("PresetSwitch", ProbeColor(4));
            }
            if (markers.Find("Midpoint band") == null)
            {
                var band = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                band.name = "Midpoint band";
                band.transform.SetParent(markers, false);
                band.transform.localPosition = Vector3.forward * .10f;
                band.transform.localRotation = Quaternion.Euler(90, 0, 0);
                band.transform.localScale = new Vector3(.035f, .003f, .035f);
                UnityEngine.Object.DestroyImmediate(band.GetComponent<Collider>());
                band.GetComponent<Renderer>().sharedMaterial = Material("PresetSwitch", ProbeColor(4));
            }
            markers.gameObject.SetActive(false);
            var button = area.Find("Extra marker switch");
            if (button == null)
            {
                button = GameObject.CreatePrimitive(PrimitiveType.Cube).transform;
                button.name = "Extra marker switch";
                button.SetParent(area, false);
                button.localPosition = new Vector3(0, .8f, -.55f);
                button.localScale = new Vector3(.32f, .12f, .1f);
                button.GetComponent<Renderer>().sharedMaterial = Material("PresetSwitch", ProbeColor(4));
            }
            var toggle = button.GetComponent<LabToggle>() ?? UdonSharpUndo.AddComponent<LabToggle>(button.gameObject);
            toggle.target = markers.gameObject;
            UdonSharpEditorUtility.CopyProxyToUdon(toggle);
            Label(area, "Extra marker label", button.localPosition + Vector3.up * .12f, "EXTRA MARKERS", Color.white, .009f);
            ConfigureAxisControls(area);
            const string title = "Preset routes";
            string instructions = "ONE PLUG / THREE RECEIVER SETUPS\n"
                + "SPS: sps-limited / ogb-depth. Approach on axis, then move sideways at the same depth.\n"
                + "EXTRA MARKERS adds a tip Contact and three LabPair pose markers.\n"
                + "Contact: match SensaLabContact on your Avatar receiver (SDK 3.10.6+).\n"
                + "Try native-contact-axial, then native-contact-separation. Compare sideways motion.\n"
                + "Pose: select a FullFlow socket. Load pose-aligned-depth and select its actual path.\n"
                + "Move through the opening, then out to the side. Check validity in Sensa.\n"
                + "PresetBench: align the shaft midpoint to the frame, tip inward. CAPTURE, then CENTER between axes.\n"
                + "Press the same axis twice for + / -. native-contact-xyz | pose-osr2 | pose-six-axis\n"
                + "Avatar Root steps: self-four-anchor-xyz | self-contact-xyz. Use Home to end the plug test.";
            var board = area.Find(title);
            var text = board == null ? FunctionalLab.Board(area, title, new Vector3(0, 1f, .4f), instructions) : board.GetComponent<Text>();
            text.text = instructions;
            text.fontSize = 30;
        }

        [Serializable] class PresetRouteReport
        {
            public string unity, poseChannel, tipTag;
            public int contactReceivers, axisButtons, verifiedAxisStops;
            public float tipDistanceMeters, sideOffsetMeters;
            public bool extraMarkersInitiallyOff;
        }

        // Exercise the same UdonSharp proxy methods as the buttons on an isolated Transform in EditMode.
        static int ValidateAxisStops()
        {
            var target = new GameObject("EditMode plug");
            var placement = target.AddComponent<LabPlacement>();
            try
            {
                placement.target = target.transform;
                var basis = Quaternion.Euler(13, 41, 8);
                var origin = new Vector3(3, 1, -2);
                target.transform.SetPositionAndRotation(origin, basis);
                placement.CaptureCenter();
                var pivot = origin + basis * Vector3.forward * .10f;
                var apply = typeof(LabPlacement).GetMethod("ApplyAxis", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
                var shifts = new[] { Vector3.forward * .04f, Vector3.up * .02f, Vector3.right * .02f, Vector3.zero, Vector3.zero, Vector3.zero };
                var angles = new[] { Vector3.zero, Vector3.zero, Vector3.zero, Vector3.forward * 15, Vector3.up * 15, Vector3.left * 15 };
                for (int i = 0; i < shifts.Length; i++)
                {
                    placement.Center();
                    apply.Invoke(placement, new object[] { 1f });
                    if (Vector3.Distance(target.transform.position, origin) > .00001f || Quaternion.Angle(target.transform.rotation, basis) > .1f)
                        throw new InvalidOperationException("Plug did not return to its captured center.");
                    foreach (int sign in new[] { 1, -1 })
                    {
                        typeof(LabPlacement).GetMethod(AxisActions[i + 2]).Invoke(placement, null);
                        apply.Invoke(placement, new object[] { 1f });
                        var center = target.transform.TransformPoint(Vector3.forward * .10f);
                        if (Vector3.Distance(center, pivot + basis * (sign * shifts[i])) > .00001f ||
                            Quaternion.Angle(target.transform.rotation, basis * Quaternion.Euler(sign * angles[i])) > .1f)
                            throw new InvalidOperationException("Incorrect plug displacement: " + AxisActions[i + 2]);
                    }
                }
                return shifts.Length * 2;
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(target);
            }
        }

        [Serializable] class PresetBakeReport
        {
            public string worldsSdk, vrcFury;
            public bool nativePlug, nativeSocket, pairedMarkers;
        }

        [MenuItem("Tools/Sensa Lab/Validate baked preset routes")]
        public static void ValidateBakedPresetRoutes()
        {
            UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync();
            if (UdonSharpProgramAsset.AnyUdonSharpScriptHasError()) throw new InvalidOperationException("UdonSharp compilation failed.");
            ValidatePresetRoutes();
            var area = GameObject.Find("08 MY AVATAR SPS").transform;
            var scratch = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            try
            {
                Transform Clone(string name)
                {
                    var copy = UnityEngine.Object.Instantiate(area.Find(name).gameObject);
                    UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(copy, scratch);
                    return copy.transform;
                }
                var plug = Clone("World SPS Plug");
                var socket = Clone("World SPS Socket");
                Type("VF.Features.BuildSps").GetMethod("Process").Invoke(null, new object[] { scratch });
                var markers = plug.Find("Preset markers");
                if (!InteractiveValidation.HasPlugContacts(plug) || !InteractiveValidation.HasSocketContacts(socket) ||
                    markers == null || markers.gameObject.activeSelf || SensaPoseProtocol.Markers.Any(marker =>
                        !markers.Find(marker).GetComponent<VRCContactSender>().collisionTags.Contains(SensaPoseProtocol.Tag("LabPair", marker))) ||
                    !markers.Find("Tip").GetComponent<VRCContactSender>().collisionTags.Contains("SensaLabContact"))
                    throw new InvalidOperationException("Native SPS contacts or paired markers missing after world bake.");
                File.WriteAllText("Validation/interaction/preset-bake.json", JsonUtility.ToJson(new PresetBakeReport {
                    worldsSdk = UnityEditor.PackageManager.PackageInfo.FindForAssetPath("Packages/com.vrchat.worlds/package.json").version,
                    vrcFury = UnityEditor.PackageManager.PackageInfo.FindForAssetPath("Packages/com.vrcfury.vrcfury/package.json").version,
                    nativePlug = true, nativeSocket = true, pairedMarkers = true
                }, true));
                Debug.Log("SENSA_PRESET_WORLD_BAKE_VALIDATED");
            }
            finally { EditorSceneManager.CloseScene(scratch, true); }
        }

        public static void ValidatePresetRoutes()
        {
            var scene = LabEditorLocalization.OpenScene(FunctionalLab.Scene);
            var area = scene.GetRootGameObjects().Single(root => root.name == "08 MY AVATAR SPS").transform;
            var markers = area.Find("World SPS Plug/Preset markers");
            var toggle = area.Find("Extra marker switch").GetComponent<LabToggle>();
            if (markers.gameObject.activeSelf || toggle.target != markers.gameObject ||
                markers.GetComponentsInChildren<VRCContactSender>(true).Length != 3)
                throw new InvalidOperationException("Check the shared plug marker switch and sender count.");
            foreach (string marker in SensaPoseProtocol.Markers)
            {
                var sender = markers.Find(marker).GetComponent<VRCContactSender>();
                var offset = marker == "Tip" ? Vector3.forward * .20f : marker == "Side" ? Vector3.right * .03f : Vector3.zero;
                if (!sender.collisionTags.Contains(SensaPoseProtocol.Tag("LabPair", marker)) ||
                    sender.collisionTags.Contains("SensaLabContact") != (marker == "Tip") ||
                    sender.radius != SensaPoseProtocol.MarkerRadius || Vector3.Distance(sender.transform.localPosition, offset) > .00001f)
                    throw new InvalidOperationException("Check shared plug geometry and tags: " + marker);
            }
            var receivers = scene.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<CapabilityStation>())
                .SelectMany(station => station.receivers).ToArray();
            if (receivers.Length != 12 || receivers.Any(receiver => receiver.radius != SensaPoseProtocol.ReceiverRadius))
                throw new InvalidOperationException("Check the three four-receiver capability stations.");
            var controls = area.Find("Axis controls").GetComponentsInChildren<LabPlacementButton>();
            if (controls.Length != AxisActions.Length || AxisActions.Any(action => !controls.Any(button =>
                button.action == action && button.placement.target == markers.parent &&
                typeof(LabPlacement).GetMethod(action, System.Type.EmptyTypes) != null)))
                throw new InvalidOperationException("Check the calibrated plug controls.");
            Directory.CreateDirectory("Validation/interaction");
            File.WriteAllText("Validation/interaction/preset-routes.json", JsonUtility.ToJson(new PresetRouteReport {
                unity = Application.unityVersion, contactReceivers = receivers.Length, axisButtons = controls.Length, verifiedAxisStops = ValidateAxisStops(),
                poseChannel = "LabPair", tipTag = "SensaLabContact", tipDistanceMeters = markers.Find("Tip").localPosition.z,
                sideOffsetMeters = markers.Find("Side").localPosition.x, extraMarkersInitiallyOff = !markers.gameObject.activeSelf
            }, true));
            Debug.Log("SENSA_PRESET_ROUTES_VALIDATED");
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
                "NATIVE SPS - TRY YOUR OWN AVATAR\nAmber: world plug -> your avatar socket\nBlue frame: world socket -> your avatar plug\nEnable SPS and the avatar SPS OSC toggle, then load the preset.\nAt the band the plug is halfway in. SPS3 DepthOthers reports proximity.\nMove sideways to see radial-depth error. World contacts may reach both Self/Others.\nWorld labels are geometry hints, NOT OSC acknowledgements.\nCheck actual received OGB parameters in Sensa. HOME resets props.\nProbe P1..P8 elsewhere are sensor inputs, NOT output axes.");board.fontSize=38;
        }
    }
}
