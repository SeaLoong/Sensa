using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDKBase;
using UnityBox.Sensa;

namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class QuickStartStation : UdonSharpBehaviour
    {
        public GameObject depthSender;
        public GameObject activeSender;
        public Transform pickup;
        public Text status;
        public float requested;
        public bool running;
        public bool manual;
        private float deadline;
        private Vector3 home;
        private Quaternion homeRotation;

        void Start() { home = pickup.position; homeRotation = pickup.rotation; Stop(); }
        public void Zero() { Select(0); }
        public void Quarter() { Select(.25f); }
        public void Half() { Select(.5f); }
        public void ThreeQuarters() { Select(.75f); }
        public void Full() { Select(1); }
        void Select(float value) { requested = value; manual = false; Begin(); }
        public void Touch() { manual = true; Begin(); }
        void Begin()
        {
            // A new selection explicitly grants a short local test session.
            running = true; deadline = Time.time + 60;
        }
        public void Stop()
        {
            running = false; depthSender.SetActive(false); activeSender.SetActive(false);
            status.text = "START HERE - AVATAR / OSC / OSR\nSTOPPED: expected Active = 0\n1. Upload avatar with Quick Start World Receiver\n2. Sensa: import Quick Start preset, save mappings\n3. Apply OSC input; first check preview without outputs\n4. Select 0 / 25 / 50 / 75 / 100%, or TOUCH\nTOUCH: bring your RIGHT wrist toward the cyan ball\nDesktop: click steps. VR: steps or hand proximity\nSTOP / leaving this area / 60 seconds closes gate\nExpected values here are NOT acknowledgements.";
        }
        public void ResetBall()
        {
            Stop(); var item = pickup.GetComponent<VRC_Pickup>(); if (item != null) item.Drop();
            var body = pickup.GetComponent<Rigidbody>(); body.velocity = Vector3.zero; body.angularVelocity = Vector3.zero;
            pickup.SetPositionAndRotation(home, homeRotation);
        }
        public override void OnAvatarChanged(VRCPlayerApi player) { if (player != null && player.isLocal) Stop(); }
        void LateUpdate()
        {
            if (!running) return;
            var player = Networking.LocalPlayer;
            if (!Utilities.IsValid(player) || Time.time >= deadline || Vector3.Distance(player.GetPosition(), transform.position) > 3f) { Stop(); return; }
            var hand = player.GetBonePosition(HumanBodyBones.RightHand);
            float height = player.GetAvatarEyeHeightAsMeters();
            if (hand == Vector3.zero || height < .1f || height > 5f) { Stop(); return; }
            float radius = height * SensaQuickStartProtocol.RadiusPerEyeHeight;
            activeSender.transform.position = hand;
            if (manual) depthSender.transform.position = pickup.position;
            else depthSender.transform.position = hand + Vector3.forward * (radius * (1 - requested) + SensaQuickStartProtocol.SenderRadius);
            depthSender.SetActive(true); activeSender.SetActive(true);
            float expected = manual ? Mathf.Clamp01(1 - Mathf.Max(0, Vector3.Distance(hand, pickup.position) - SensaQuickStartProtocol.SenderRadius) / radius) : requested;
            status.text = "START HERE - " + (manual ? "TOUCH / RIGHT WRIST" : "STEP TEST")
                + "\nExpected Depth: " + (expected * 100).ToString("F0") + "%  / Active: 1"
                + "\nRadius: " + radius.ToString("F3") + " m (avatar height adjusted)"
                + "\nAuto stop in " + Mathf.CeilToInt(deadline - Time.time) + " seconds"
                + "\nSensa preset: Quick Start / test world to my avatar"
                + "\nOSC: Sensa/QuickStart/{Depth,Active}"
                + "\nCheck ACTUAL received values in Sensa; world cannot read OSC."
                + "\nIf values differ: check avatar component / contacts / OSC."
                + "\nLogical 100% uses your configured output range, not full travel."
                + "\nSTOP closes the gate; it does not park or power off hardware.";
        }
    }
}
