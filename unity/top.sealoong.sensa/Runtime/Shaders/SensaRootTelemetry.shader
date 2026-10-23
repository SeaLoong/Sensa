// Three native skinned points measure the root and its local X/Z basis together.
// 三点原生蒙皮在一个 triangle primitive 中提供根点和 X/Z 基向量。
Shader "Hidden/Sensa/NativeRootTelemetry"
{
    Properties { _SensaProducerId("Explicit producer ID", Float)=0 _SensaCameraFar("Capture camera signature",Float)=0 }
    SubShader { Tags { "Queue"="Overlay+100" "VRCFallback"="Hidden" } Pass {
        Cull Off ZWrite Off ZTest Always Blend Off
        CGPROGRAM
        #pragma target 4.0
        #pragma vertex vert
        #pragma geometry geom
        #pragma fragment frag
        #pragma exclude_renderers metal
        #include "UnityCG.cginc"
        float _SensaProducerId, _SensaCameraFar, _VRChatMirrorMode, _VRChatCameraMode;
        struct app { float4 vertex:POSITION; };
        struct v2g { float4 vertex:SV_POSITION; float3 root:TEXCOORD0; };
        struct g2f { float4 vertex:SV_POSITION; float2 uv:TEXCOORD0;
            nointerpolation uint4 packet0:TEXCOORD1; nointerpolation uint4 packet1:TEXCOORD2; };
        v2g vert(app input) { v2g output; output.vertex=float4(0,0,0,1); output.root=input.vertex.xyz; return output; }
        bool basisValid(float3 right, float3 forward) {
            float rightLength=length(right), forwardLength=length(forward);
            return all(isfinite(right)) && all(isfinite(forward))
                && all(abs(right)<=8) && all(abs(forward)<=8)
                && rightLength>0.000001 && forwardLength>0.000001
                && length(cross(right,forward))>rightLength*forwardLength*0.0001;
        }
        [maxvertexcount(4)]
        void geom(triangle v2g input[3], inout TriangleStream<g2f> stream) {
            // This is a routing guard, not an authenticated VRChat camera identity.
            // 仅为渲染路由条件，不是经过认证的 VRChat 相机身份。
            if(unity_OrthoParams.w<.5 || abs(_ProjectionParams.z-_SensaCameraFar)>.000001 || _VRChatMirrorMode!=0 || _VRChatCameraMode!=0) return;
            #if defined(USING_STEREO_MATRICES)
                return;
            #endif
            float3 center=float3(0,1,0);
            float3 normalized=(input[0].root-center)/2;
            float3 right=(input[1].root-input[0].root)/.1;
            float3 forward=(input[2].root-input[0].root)/.1;
            float3 worldX=mul((float3x3)unity_ObjectToWorld,float3(1,0,0));
            float3 worldY=mul((float3x3)unity_ObjectToWorld,float3(0,1,0));
            float3 worldZ=mul((float3x3)unity_ObjectToWorld,float3(0,0,1));
            float3 scales=float3(length(worldX),length(worldY),length(worldZ));
            float avatarScale=scales.x;
            bool validScale=all(isfinite(scales)) && avatarScale>0 && avatarScale<=8
                && all(abs(scales-avatarScale)<=avatarScale*0.0001)
                && abs(dot(worldX,worldY))<=avatarScale*avatarScale*0.0001
                && abs(dot(worldX,worldZ))<=avatarScale*avatarScale*0.0001
                && abs(dot(worldY,worldZ))<=avatarScale*avatarScale*0.0001
                && dot(cross(worldX,worldY),worldZ)>0;
            uint producer=(uint)round(_SensaProducerId);
            uint3 p=(uint3)round(saturate((all(isfinite(normalized))?normalized:float3(0,0,0))*.5+.5)*65535);
            int3 qRight=(int3)round(clamp(all(isfinite(right))?right:float3(0,0,0),-8,8)/8*32767);
            int3 qForward=(int3)round(clamp(all(isfinite(forward))?forward:float3(0,0,0),-8,8)/8*32767);
            uint qScale=(uint)round(saturate(isfinite(avatarScale)?avatarScale/8:0)*65535);
            bool valid=producer>0u && producer<65536u && all(isfinite(normalized)) && all(abs(normalized)<=1)
                && basisValid(right,forward) && basisValid((float3)qRight/32767*8,(float3)qForward/32767*8)
                && validScale && qScale>0u;
            uint bytes[32];
            uint sequence=(uint)floor(_Time.y*60)&65535u;
            bytes[0]=83;bytes[1]=78;bytes[2]=1;bytes[3]=valid?3u:2u;
            bytes[4]=sequence&255u;bytes[5]=sequence>>8;
            bytes[6]=p.x&255u;bytes[7]=p.x>>8;bytes[8]=p.y&255u;bytes[9]=p.y>>8;
            bytes[10]=p.z&255u;bytes[11]=p.z>>8;bytes[12]=producer&255u;bytes[13]=producer>>8;
            for(uint axis=0;axis<3;axis++) {
                uint r=(uint)qRight[axis]&65535u, f=(uint)qForward[axis]&65535u;
                bytes[14+axis*2]=r&255u;bytes[15+axis*2]=r>>8;
                bytes[20+axis*2]=f&255u;bytes[21+axis*2]=f>>8;
            }
            bytes[26]=qScale&255u;bytes[27]=qScale>>8;
            uint crc=0xFFFFFFFFu;
            for(uint i=0;i<28;i++) {
                crc^=bytes[i];
                for(uint bit=0;bit<8;bit++) crc=(crc>>1)^((crc&1u)!=0u?0xEDB88320u:0u);
            }
            crc^=0xFFFFFFFFu;
            bytes[28]=crc&255u;bytes[29]=(crc>>8)&255u;bytes[30]=(crc>>16)&255u;bytes[31]=crc>>24;
            uint4 packet0=uint4(0,0,0,0),packet1=uint4(0,0,0,0);
            for(uint word=0;word<8;word++) {
                uint offset=word*4;
                uint value=bytes[offset]|(bytes[offset+1]<<8)|(bytes[offset+2]<<16)|(bytes[offset+3]<<24);
                if(word<4) packet0[word]=value; else packet1[word-4]=value;
            }
            float2 corners[4]={float2(0,0),float2(0,1),float2(1,0),float2(1,1)};
            for(uint corner=0;corner<4;corner++) {
                g2f output;output.vertex=float4(corners[corner]*2-1,0,1);
                output.uv=corners[corner];output.packet0=packet0;output.packet1=packet1;stream.Append(output);
            }
            stream.RestartStrip();
        }
        float4 frag(g2f input):SV_Target {
            // White quiet modules leave capture-shift room. Inner edge bands align
            // three spatially dispersed copies; CRC32 rejects inconsistent packets.
            uint column=min((uint)(input.uv.x*40),39u),row=min((uint)(input.uv.y*32),31u);
            uint value;
            if(column<2u || column>=38u || row<2u || row>=30u) value=1u;
            else if(row<4u) value=((0xD3A69C57u>>((column+28u)&31u))&1u)^(row-2u);
            else if(row>=28u) value=((0x69C57D3Au>>((column+28u)&31u))&1u)^(row-28u);
            else if(column<4u) value=((0xA5D36Bu>>(row-4u))&1u)^(column-2u);
            else if(column>=36u) value=((0x6E29C7u>>(row-4u))&1u)^(column-36u);
            else {
                uint bank=(row-4u)/8u,bit=(row-4u)%8u;
                uint byteIndex=((column-4u)+bank*11u)%32u;
                uint wordIndex=(byteIndex&15u)>>2;
                uint word=byteIndex<16u?input.packet0[wordIndex]:input.packet1[wordIndex];
                value=(word>>((byteIndex&3u)*8u+bit))&1u;
            }
            return float4(value.xxx,1);
        }
        ENDCG
    }}
    Fallback Off
}
