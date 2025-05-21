// App.tsx or App.jsx
import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Box, OrbitControls, OrthographicCamera } from "@react-three/drei";

function Editor() {
  return (
    <div style={{ width: window.innerWidth, height: window.innerHeight }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        orthographic
      >
        <color attach="background" args={[1, 1, 1]} /> // White background
        {/* Lights */}
        <ambientLight intensity={1} />
        <directionalLight position={[1, 1, 1]} intensity={10} />
        <directionalLight position={[-1, -1, -1]} intensity={10} />
        {/* Camera */}
        <OrthographicCamera
          makeDefault
          position={[0, 20, 0]}
          zoom={150}
          near={0.001}
          far={2000}
        />
        {/* Controls */}
        <OrbitControls
          makeDefault
          enableZoom
          enablePan={true}
          enableRotate={false}
          enableDamping={false}
          rotateSpeed={0.5}
          zoomToCursor
          zoomSpeed={1}
          minZoom={10}
          maxZoom={1500}
          onStart={() => {
            document.body.style.cursor = "grabbing";
          }}
          onEnd={() => {
            document.body.style.cursor = "auto";
          }}
          autoRotate
        />
        <Suspense fallback={null}>
          <Box args={[1, 1, 1]}>
            <meshStandardMaterial attach="material" color="orange" />
          </Box>
        </Suspense>
      </Canvas>
    </div>
  );
}

export default Editor;
