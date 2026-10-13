import binascii
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('bridge',Path(__file__).resolve().parents[2]/'scripts/shader-osc-bridge.py')
bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)

def fixture():
    data=bytearray(b'SN\x01\x01\x00\x01')
    for value in (.25,-.5,.75):data.extend(round((value+1)/2*65535).to_bytes(2,'little'))
    data.extend(b'\0\0');data.extend(binascii.crc_hqx(data,0xffff).to_bytes(2,'little'))
    return [(255,255,255) if data[x//16]&(1<<(7-y//16)) else (0,0,0) for y in range(128) for x in range(256)]

class ShaderBridgeTests(unittest.TestCase):
    def test_real_packet_layout_and_vertical_orientation(self):
        image=fixture();result=bridge.decode_pixels(image,256,128)
        self.assertEqual(result['frame'],256)
        for actual,expected in zip(result['xyz'],(.25,-.5,.75)):self.assertAlmostEqual(actual,expected,delta=.00004)
        flipped=[p for y in reversed(range(128)) for p in image[y*256:(y+1)*256]]
        self.assertEqual(bridge.decode_pixels(flipped,256,128),result)
        stretched=[pixel for pixel in image for _ in range(2)]
        self.assertEqual(bridge.decode_pixels(stretched,512,128),result)
    def test_corrupted_or_blended_grid_is_rejected(self):
        image=fixture()
        for y in range(16):
            for x in range(96,112):image[y*256+x]=tuple(255-v for v in image[y*256+x])
        with self.assertRaises(ValueError):bridge.decode_pixels(image,256,128)
        image=fixture();image[8*256+8]=(128,128,128)
        with self.assertRaises(ValueError):bridge.decode_pixels(image,256,128)
    def test_frozen_reordered_and_initial_frames_cannot_claim_freshness(self):
        f=bridge.Freshness(.35)
        self.assertFalse(f.accept({'frame':65535},0))
        self.assertFalse(f.accept({'frame':65535},.1))
        self.assertTrue(f.accept({'frame':0},.2))
        self.assertFalse(f.accept({'frame':65534},.3))
        self.assertFalse(f.accept({'frame':0},.6))
        self.assertTrue(f.accept({'frame':1},.7))
    def test_invalid_output_has_only_a_zero_gate(self):
        packet=bridge.osc_bundle(None,False)
        self.assertIn(b'Sensa/Lab/Shader/Valid',packet)
        self.assertNotIn(b'Sensa/Lab/Shader/X',packet)
        self.assertTrue(packet.endswith(b'\0\0\0\0'))

if __name__=='__main__':unittest.main()
