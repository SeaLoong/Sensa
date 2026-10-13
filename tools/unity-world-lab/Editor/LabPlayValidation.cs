using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using UnityBox.Sensa;
using VRC.SDKBase;

namespace SensaLab
{
    [InitializeOnLoad]
    public static class LabPlayValidation
    {
        private const string Key="SensaLab.PlayValidation";
        private static double started;
        private static int movementStage;
        private static Vector3 walkStart;
        private static float walked, jumpBase, jumpPeak;
        private static SyntheticInput testInput;
        private static VRC.SDK3.ClientSim.ClientSimPlayerController testedController;
        private static VRC.SDK3.ClientSim.IClientSimInput originalInput;
        private class SyntheticInput : VRC.SDK3.ClientSim.ClientSimInputBase { public float forward;public override float GetMovementHorizontal()=>0;public override float GetMovementVertical()=>forward;public override float GetLookHorizontal()=>0;public override float GetLookVertical()=>0;public override float GetPickupRotateUpDown()=>0;public override float GetPickupRotateLeftRight()=>0;public override float GetPickupRotateCwCcw()=>0;public override float GetPickupManipulateDistance()=>0; }
        [Serializable] private class LocomotionReport { public bool passed;public float walkSpeed,runSpeed,jumpImpulse,walkedDistance,jumpHeight; public string inputDebug; }
        private static string inputDebug;
        [Serializable] private class LocalPointCapture { public string schema="sensa.point-lab.v1";public Vector3 position;public float[] samples;public bool grabbed;public float stretch; }
        [Serializable] private class CaseBoards { public bool passed, controlsPassed; public string[] boards; }
        private static string ReportDirectory => SessionState.GetBool(Key+"Offset",false)?"Validation/offset":"Validation";
        static LabPlayValidation() { EditorApplication.playModeStateChanged+=Changed;EditorApplication.update+=Tick; }
        [MenuItem("Tools/Sensa Lab/Run Play Mode validation (straight)")]
        public static void Run() => RunScenario(false);
        [MenuItem("Tools/Sensa Lab/Run Play Mode validation (offset and tilted)")]
        public static void RunOffset() => RunScenario(true);
        private static void RunScenario(bool offset) {
            SessionState.SetBool(Key+"Offset",offset);
            Directory.CreateDirectory(ReportDirectory);
            LabBuilder.AddLocalProbeStation();
            LabPointCases.AddCases();
            EditorSceneManager.OpenScene("Assets/SensaLab/Generated/SensaLab.unity");
            if(offset){var socket=GameObject.Find("SPS2 Socket - legacy enabled").transform;socket.position+=new Vector3(.03f,0,0);socket.rotation=Quaternion.Euler(0,25,0);}
            // Explicitly run the installed world baker on the in-memory test scene.
            // The saved authoring scene is not overwritten.
            var baker=AppDomain.CurrentDomain.GetAssemblies().Select(a=>a.GetType("VF.Features.BuildSps")).FirstOrDefault(t=>t!=null);
            if(baker==null)throw new InvalidOperationException("VRCFury world baker is unavailable");
            baker.GetMethod("Process").Invoke(null,new object[]{UnityEngine.SceneManagement.SceneManager.GetActiveScene()});
            Directory.CreateDirectory("Validation");
            File.WriteAllText(ReportDirectory+"/preplay-bake.txt",string.Join("\n",UnityEngine.Object.FindObjectsOfType<Renderer>().Select(r=>r.name+": "+string.Join(",",r.sharedMaterials.Where(m=>m!=null).Select(m=>m.shader.name)))));
            SessionState.SetBool(Key+"VrcfuryPreference",EditorPrefs.GetBool("com.vrcfury.playMode",true));
            SessionState.SetBool(Key+"VrcfuryPreferenceExists",EditorPrefs.HasKey("com.vrcfury.playMode"));
            EditorPrefs.SetBool("com.vrcfury.playMode",false); // Already baked; avoid a second cleanup/build pass.
            EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene(),"Assets/SensaLab/Generated/BakedPlayValidation.unity");
            SessionState.SetInt(Key,1);SessionState.SetBool(Key+"Passed",false);SessionState.SetFloat(Key+"Started",(float)EditorApplication.timeSinceStartup);
            EditorApplication.isPlaying=true;
        }
        private static void Changed(PlayModeStateChange state) {
            if(SessionState.GetInt(Key,0)==0)return;
            if(state==PlayModeStateChange.EnteredPlayMode){started=EditorApplication.timeSinceStartup;movementStage=0;walked=jumpBase=jumpPeak=0;testInput=null;testedController=null;originalInput=null;SessionState.SetInt(Key,2);}
            if(state==PlayModeStateChange.EnteredEditMode){RestorePreference();SessionState.SetInt(Key,0);if(Application.isBatchMode)EditorApplication.Exit(SessionState.GetBool(Key+"Passed",false)?0:1);}
        }
        private static void RestorePreference(){if(SessionState.GetBool(Key+"VrcfuryPreferenceExists",false))EditorPrefs.SetBool("com.vrcfury.playMode",SessionState.GetBool(Key+"VrcfuryPreference",true));else EditorPrefs.DeleteKey("com.vrcfury.playMode");}
        private static void Tick() {
            int stage=SessionState.GetInt(Key,0);if(stage==0)return;
            if(stage==1 && EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"Started",0)>120){RestorePreference();SessionState.SetInt(Key,0);File.WriteAllText("Validation/playmode-error.txt","Play Mode startup timed out");EditorApplication.Exit(1);return;}
            if(stage==2)ExerciseLocomotion(EditorApplication.timeSinceStartup-started);
            if(stage!=2 || EditorApplication.timeSinceStartup-started<12)return;
            SessionState.SetInt(Key,3);Directory.CreateDirectory("Validation");
            try {
                var status=GameObject.Find("Status").GetComponent<Text>().text;
                var renderers=UnityEngine.Object.FindObjectsOfType<Renderer>();
                var resolver=renderers.SelectMany(r=>r.sharedMaterials).FirstOrDefault(m=>m!=null && m.shader.name=="Hidden/VRCFury/SpsResolver");
                var moving=GameObject.Find("Moving Root").transform.position;
                var origin=GameObject.Find("Contact Reference").transform.position;
                string result="UTC: "+DateTime.UtcNow.ToString("O")+"\n"+status+"\nResolver exists: "+(resolver!=null)+"\nMarker moved: "+(Vector3.Distance(moving,origin)>.001f)
                    +"\nShaders: "+string.Join(", ",renderers.SelectMany(r=>r.sharedMaterials).Where(m=>m!=null).Select(m=>m.shader.name).Distinct());
                File.WriteAllText(ReportDirectory+"/playmode-results.txt",result);
                bool gpuModel=resolver!=null && CaptureModel(renderers);
                var probeBoard=GameObject.Find("Local probe status");
                bool localProbe=probeBoard!=null && probeBoard.GetComponent<Text>().text.Contains("A3=");
                if(probeBoard!=null)result+="\n"+probeBoard.GetComponent<Text>().text;
                if(localProbe){var station=GameObject.Find("Local bone and PB station").GetComponent<LocalProbeStation>();File.WriteAllText(ReportDirectory+"/local-point-capture.json",JsonUtility.ToJson(new LocalPointCapture{position=station.reference.InverseTransformPoint(station.target.position),samples=station.receivers.Select(r=>r.CalculateProximity(station.sender)).ToArray(),grabbed=station.bone.IsGrabbed,stretch=station.bone.Stretch},true));}
                result+="\nLocal PB station running: "+localProbe;
                result+="\nSPS GPU model valid: "+gpuModel;
                var caseBoards=UnityEngine.Object.FindObjectsOfType<PointCaseStation>().OrderBy(s=>s.caseName).Select(s=>s.status.text).ToArray();
                bool casesPassed=caseBoards.Length==11 && caseBoards.All(s=>s.Contains("EXPECTED RESULT"));
                var firstCase=UnityEngine.Object.FindObjectsOfType<PointCaseStation>().OrderBy(s=>s.caseName).First();
                var program=UdonSharpEditor.UdonSharpEditorUtility.GetBackingUdonBehaviour(firstCase);
                program.SendCustomEvent("ToggleMissing");program.SendCustomEvent("Refresh");
                bool missingWorked=firstCase.status.text.Contains("MISSING") && firstCase.status.text.Contains("INVALID") && firstCase.sampleBars[3].rectTransform.sizeDelta.x==0;
                program.SendCustomEvent("ResetCase");program.SendCustomEvent("Refresh");
                bool resetWorked=firstCase.status.text.Contains("EXPECTED RESULT") && firstCase.sampleBars[3].rectTransform.sizeDelta.x>0;
                program.SendCustomEvent("TogglePause");bool pauseWorked=firstCase.status.text.Contains("PAUSED");program.SendCustomEvent("TogglePause");
                bool controlsPassed=missingWorked && resetWorked && pauseWorked && firstCase.status.text.Contains("EXPECTED RESULT");
                casesPassed=casesPassed && controlsPassed;
                File.WriteAllText(ReportDirectory+"/point-cases-playmode.json",JsonUtility.ToJson(new CaseBoards{passed=casesPassed,controlsPassed=controlsPassed,boards=caseBoards},true));
                result+="\nPoint case boards: "+caseBoards.Length+", passed: "+casesPassed;
                File.WriteAllText(ReportDirectory+"/playmode-results.txt",result);
                var player=Networking.LocalPlayer;
                var locomotion=new LocomotionReport{walkSpeed=player.GetWalkSpeed(),runSpeed=player.GetRunSpeed(),jumpImpulse=player.GetJumpImpulse(),walkedDistance=walked,jumpHeight=jumpPeak-jumpBase,inputDebug=inputDebug};
                locomotion.passed=locomotion.walkSpeed>=2 && locomotion.runSpeed>=4 && locomotion.jumpImpulse>=3 && walked>.1f && locomotion.jumpHeight>.1f;
                File.WriteAllText(ReportDirectory+"/locomotion-playmode.json",JsonUtility.ToJson(locomotion,true));
                bool pass=status.Contains("CRC OK") && resolver!=null && gpuModel && localProbe && casesPassed && locomotion.passed && Vector3.Distance(moving,origin)>.001f;
                SessionState.SetBool(Key+"Passed",pass);
                File.WriteAllText(ReportDirectory+"/playmode-status.json","{\"passed\":"+(pass?"true":"false")+"}");
                Debug.Log("SENSA_PLAYMODE_VALIDATION "+pass);
            }catch(Exception ex){File.WriteAllText(ReportDirectory+"/playmode-error.txt",ex.ToString());SessionState.SetBool(Key+"Passed",false);}
            EditorApplication.isPlaying=false;
        }
        private static void ExerciseLocomotion(double elapsed)
        {
            var player=Networking.LocalPlayer;if(player==null)return;
            const System.Reflection.BindingFlags flags=System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic;
            if(movementStage==0 && elapsed>=3){
                testedController=Resources.FindObjectsOfTypeAll<VRC.SDK3.ClientSim.ClientSimPlayerController>().FirstOrDefault(c=>!EditorUtility.IsPersistent(c) && c.gameObject.scene.IsValid() && c.gameObject.activeInHierarchy);
                if(testedController==null){inputDebug="ClientSim controller unavailable";movementStage=5;return;}
                // ClientSim opens its menu in batch mode; use the SDK action to release movement.
                var menu=Resources.FindObjectsOfTypeAll<VRC.SDK3.ClientSim.ClientSimMenu>().FirstOrDefault(c=>!EditorUtility.IsPersistent(c) && c.gameObject.scene.IsValid());
                if(menu!=null)menu.CloseMenu();
                var field=typeof(VRC.SDK3.ClientSim.ClientSimPlayerController).GetField("_input",flags);
                originalInput=(VRC.SDK3.ClientSim.IClientSimInput)field.GetValue(testedController);
                testedController.Dispose();testInput=new SyntheticInput();field.SetValue(testedController,testInput);
                typeof(VRC.SDK3.ClientSim.ClientSimPlayerController).GetMethod("Subscribe",flags).Invoke(testedController,null);
                walkStart=player.GetPosition();testInput.forward=1;inputDebug="controller="+testedController.name+", enabled="+testedController.enabled+", active="+testedController.gameObject.activeInHierarchy+", position="+testedController.transform.position+", api="+player.GetPosition()+", menu="+typeof(VRC.SDK3.ClientSim.ClientSimPlayerController).GetField("_menuIsOpen",flags).GetValue(testedController)+", dead="+typeof(VRC.SDK3.ClientSim.ClientSimPlayerController).GetField("_isDead",flags).GetValue(testedController)+", grounded="+testedController.GetComponent<CharacterController>().isGrounded;movementStage=1;
            }
            if(movementStage==1 && elapsed>=4){walked=Vector3.Distance(walkStart,player.GetPosition());inputDebug+=" | end="+testedController.transform.position+", prevInput="+typeof(VRC.SDK3.ClientSim.ClientSimPlayerController).GetField("_prevInput",flags).GetValue(testedController)+", timeScale="+Time.timeScale;testInput.forward=0;movementStage=2;}
            if(movementStage==2 && elapsed>=6){jumpBase=jumpPeak=player.GetPosition().y;testInput.SendJumpEvent(true,VRC.Udon.Common.HandType.LEFT);movementStage=3;}
            if(movementStage==3)jumpPeak=Mathf.Max(jumpPeak,player.GetPosition().y);
            if(movementStage==3 && elapsed>=9){
                testedController.Dispose();typeof(VRC.SDK3.ClientSim.ClientSimPlayerController).GetField("_input",flags).SetValue(testedController,originalInput);
                typeof(VRC.SDK3.ClientSim.ClientSimPlayerController).GetMethod("Subscribe",flags).Invoke(testedController,null);testInput.Dispose();movementStage=4;
            }
        }
        private static bool CaptureModel(Renderer[] renderers)
        {
            var resolverRenderer=renderers.First(r=>r.sharedMaterials.Any(m=>m!=null && m.shader.name=="Hidden/VRCFury/SpsResolver"));
            int index=Array.FindIndex(resolverRenderer.sharedMaterials,m=>m!=null && m.shader.name=="Hidden/VRCFury/SpsResolver");
            var source=resolverRenderer.sharedMaterials[index];
            var shader=AssetDatabase.LoadAssetAtPath<Shader>("Assets/SensaGpuDiagnostics/SpsGpuProbe.shader");var reader=new Material(shader);
            var identifiers=new[]{"_SPS_Configured","_SPS_IdLow","_SPS_IdHigh","_SPS_PlayerIdLow","_SPS_PlayerIdHigh"};
            string props="";foreach(var name in identifiers){float value=SensaGpuProbe.ReadProperty(source,resolverRenderer,name);reader.SetFloat(name,value);props+=name+"="+value+"\n";}
            // This test fixture explicitly enables overrun on its surface material.
            reader.SetFloat("_SPS_Overrun",1);
            File.WriteAllText(ReportDirectory+"/resolver-properties.txt",props);
            var camera=new GameObject("SPS validation camera").AddComponent<Camera>();camera.transform.position=new Vector3(-.8f,1.4f,1);camera.transform.LookAt(new Vector3(-.8f,1.1f,2.1f));camera.nearClipPlane=.01f;
            var sceneTarget=new RenderTexture(1280,720,24);sceneTarget.Create();camera.targetTexture=sceneTarget;
            var data=new RenderTexture(36,1,0,RenderTextureFormat.ARGBFloat,RenderTextureReadWrite.Linear);data.Create();var tex=new Texture2D(36,1,TextureFormat.RGBAFloat,false,true);var previous=RenderTexture.active;
            try {
                camera.Render();reader.SetVector("_SensaSourceSize",new Vector4(1280,720,1,1));Graphics.Blit(Texture2D.blackTexture,data,reader);
                RenderTexture.active=data;tex.ReadPixels(new Rect(0,0,36,1),0,0);tex.Apply();
                var capture=new SensaGpuProbe.Capture{capturedUtc=DateTime.UtcNow.ToString("O"),cameraName=camera.name,unityVersion=Application.unityVersion,width=1280,height=720,overrun=1};
                SensaGpuProbe.Decode(tex.GetPixels(),capture);File.WriteAllText(ReportDirectory+"/sps-model-capture.json",JsonUtility.ToJson(capture,true));
                var preview=new Texture2D(1280,720,TextureFormat.RGB24,false);RenderTexture.active=sceneTarget;preview.ReadPixels(new Rect(0,0,1280,720),0,0);preview.Apply();File.WriteAllBytes(ReportDirectory+"/sps-playmode.png",preview.EncodeToPNG());UnityEngine.Object.DestroyImmediate(preview);
                return capture.valid;
            }finally{RenderTexture.active=previous;UnityEngine.Object.DestroyImmediate(camera.gameObject);UnityEngine.Object.DestroyImmediate(reader);UnityEngine.Object.DestroyImmediate(tex);sceneTarget.Release();data.Release();UnityEngine.Object.DestroyImmediate(sceneTarget);UnityEngine.Object.DestroyImmediate(data);}
        }
    }
}
