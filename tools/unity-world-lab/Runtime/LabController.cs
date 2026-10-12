using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDK3.Rendering;
using VRC.SDKBase;
using VRC.SDK3.Dynamics.Contact.Components;

namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class LabController : UdonSharpBehaviour
    {
        public Transform mover;
        public Transform origin;
        public VRCContactReceiver[] receivers;
        public VRCContactSender sender;
        public Text status;
        public Material telemetry;
        public RenderTexture telemetryTexture;
        public GameObject desktopOutput;
        private bool paused;
        private bool pending;
        private float clock;
        private int sequence;
        private int decodedSequence;
        private int maximumReadbackLag;
        private Color32[] pixels = new Color32[256 * 128];
        private string readback = "Waiting for GPU readback";

        public override void Interact() { paused = !paused; }
        public void ToggleDesktop() { desktopOutput.SetActive(!desktopOutput.activeSelf); }
        public override void OnAsyncGpuReadbackComplete(VRCAsyncGPUReadbackRequest request)
        {
            pending = false;
            if (request.hasError || !request.TryGetData(pixels)) { readback = "GPU readback failed"; return; }
            // Decode all bytes, validate CRC before interpreting any value.
            int[] bytes = new int[16];
            for (int x = 0; x < 16; x++) for (int y = 0; y < 8; y++)
                if (pixels[(y * 16 + 8) * 256 + x * 16 + 8].r > 127) bytes[x] |= 1 << y;
            int crc = 65535;
            for (int i = 0; i < 14; i++) {
                crc ^= bytes[i] << 8;
                for (int j = 0; j < 8; j++) crc = ((crc << 1) ^ ((crc & 32768) != 0 ? 4129 : 0)) & 65535;
            }
            bool valid = bytes[0] == 83 && bytes[1] == 78 && bytes[2] == 1 && bytes[3] == 1 && crc == (bytes[14] | bytes[15] << 8);
            if(valid){decodedSequence=bytes[4] | bytes[5] << 8;maximumReadbackLag=Mathf.Max(maximumReadbackLag,(sequence-decodedSequence)&65535);}
            readback = valid ? "CRC OK, frame " + decodedSequence : "INVALID packet (orientation/CRC)";
        }
        private void Update()
        {
            if (!paused) clock += Time.deltaTime;
            mover.position = origin.TransformPoint(new Vector3(.035f * Mathf.Sin(clock), .015f * Mathf.Sin(clock * .7f), .12f * Mathf.Sin(clock * .5f)));
            mover.localRotation = Quaternion.Euler(15 * Mathf.Sin(clock), 25 * Mathf.Sin(clock * .4f), 0);
            sequence = (sequence + 1) & 65535;
            telemetry.SetFloat("_Sequence", sequence);
            Vector3 local = origin.InverseTransformPoint(mover.position);
            telemetry.SetVector("_Sample", new Vector4(local.x, local.y, local.z, 0));
            VRCGraphics.Blit(null, telemetryTexture, telemetry);
            if (!pending && sequence % 6 == 0) { pending = true; VRCAsyncGPUReadback.Request(telemetryTexture, 0, this); }
            string values = "";
            for (int i = 0; i < receivers.Length; i++) values += "A" + i + ": " + receivers[i].CalculateProximity(sender).ToString("F3") + (i % 4 == 3 ? "\n" : "   ");
            status.text = "SENSA LAB / WORLD\nClick block: pause motion\n" + readback + "\nDecoded age: " + ((sequence-decodedSequence)&65535) + " frames; max callback lag: " + maximumReadbackLag + "\nRoot local: " + local.ToString("F3") + "\n" + values
                + "\nWorld readback is not an avatar OSC bridge.\nDesktop-only output is OFF by default; headset validation required.";
        }
    }
}
