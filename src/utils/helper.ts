import * as THREE from 'three';


const pointer = new THREE.Vector2();

export const handleMousePoint = (event: any, gl: any) => {
    pointer.x = (event.clientX / gl.domElement.clientWidth) * 2 - 1;
    pointer.y = -(event.clientY / gl.domElement.clientHeight) * 2 + 1;
    return pointer;
  }