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
        #include "SensaTelemetryQr.cginc"
        float _SensaProducerId, _SensaCameraFar, _VRChatMirrorMode, _VRChatCameraMode;
        struct app { float4 vertex:POSITION; };
        struct v2g { float4 vertex:SV_POSITION; float3 root:TEXCOORD0; };
        struct g2f { float4 vertex:SV_POSITION; float2 uv:TEXCOORD0;
            nointerpolation uint4 qr0:TEXCOORD1; nointerpolation uint4 qr1:TEXCOORD2;
            nointerpolation uint4 qr2:TEXCOORD3; nointerpolation uint4 qr3:TEXCOORD4;
            nointerpolation uint4 qr4:TEXCOORD5; nointerpolation uint4 qr5:TEXCOORD6;
            nointerpolation uint4 qr6:TEXCOORD7; nointerpolation uint4 qr7:TEXCOORD8;
            nointerpolation uint4 qr8:TEXCOORD9; };
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
            // Route the native code to its dedicated orthographic capture camera.
            // 将原生编码送到该测量组专用的正交捕获相机。
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
            uint qrWords[36];
            SensaQrEncode(bytes, qrWords);
            float2 corners[4]={float2(0,0),float2(0,1),float2(1,0),float2(1,1)};
            for(uint corner=0;corner<4;corner++) {
                g2f output;output.vertex=float4(corners[corner]*2-1,0,1);
                output.uv=corners[corner];
                output.qr0=uint4(qrWords[0],qrWords[1],qrWords[2],qrWords[3]);
                output.qr1=uint4(qrWords[4],qrWords[5],qrWords[6],qrWords[7]);
                output.qr2=uint4(qrWords[8],qrWords[9],qrWords[10],qrWords[11]);
                output.qr3=uint4(qrWords[12],qrWords[13],qrWords[14],qrWords[15]);
                output.qr4=uint4(qrWords[16],qrWords[17],qrWords[18],qrWords[19]);
                output.qr5=uint4(qrWords[20],qrWords[21],qrWords[22],qrWords[23]);
                output.qr6=uint4(qrWords[24],qrWords[25],qrWords[26],qrWords[27]);
                output.qr7=uint4(qrWords[28],qrWords[29],qrWords[30],qrWords[31]);
                output.qr8=uint4(qrWords[32],qrWords[33],qrWords[34],qrWords[35]);
                stream.Append(output);
            }
            stream.RestartStrip();
        }
        float4 frag(g2f input):SV_Target {
            // Preserve square physical modules in any desktop viewport. The eight
            // white modules on each edge include a four-module standard quiet zone
            // and four extra modules for a shifting capture rectangle.
            float aspect=abs(UNITY_MATRIX_P._m11/UNITY_MATRIX_P._m00);
            float2 uv=(input.uv-.5)*float2(max(aspect,1),max(1/aspect,1))+.5;
            if(any(uv<0) || any(uv>=1)) return float4(1,1,1,1);
            uint column=min((uint)(uv.x*49),48u),row=min((uint)((1-uv.y)*49),48u);
            if(column<8u || column>=41u || row<8u || row>=41u) return float4(1,1,1,1);
            uint bit=(row-8u)*33u+column-8u,wordIndex=bit/32u;
            uint group=wordIndex/4u;
            uint4 words=group==0u?input.qr0:group==1u?input.qr1:group==2u?input.qr2:
                group==3u?input.qr3:group==4u?input.qr4:group==5u?input.qr5:
                group==6u?input.qr6:group==7u?input.qr7:input.qr8;
            uint dark=(words[wordIndex%4u]>>(bit%32u))&1u;
            float light=1u-dark;
            return float4(light,light,light,1);
        }
        ENDCG
    }}
    Fallback Off
}
