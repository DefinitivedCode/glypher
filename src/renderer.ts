import type { Atlas } from './glyphs';

/*
 * One instanced draw call renders every glyph. Hover glow, push, click ripples, the light sweep,
 * ambient drift and glyph swapping are all computed in the vertex shader from a handful of uniforms,
 * so the CPU does no per-glyph work per frame.
 */
const VS = `#version 300 es
precision highp float; precision highp int;
layout(location=0) in vec4 aG;   // home glyph, previous home glyph, tone, previous tone
layout(location=1) in vec3 aCol; // per-cell colour; r < 0 means "use base colour"
uniform vec2 uRes, uCell, uOff, uGrid, uAtlas, uSweep; uniform int uCols;
uniform float uWave, uTime, uTile, uDpr, uCount, uAtlasCols, uTilePx, uDrift, uMorph, uRadius, uPush, uHover;
uniform vec3 uTrail[12]; uniform vec4 uRip[4]; uniform vec3 uBase;
out vec2 vA, vB, vH; out vec3 vM; out vec3 vCol; out float vTone;

float h1(uint a){ a^=a>>16; a*=0x7feb352du; a^=a>>15; a*=0x846ca68bu; a^=a>>16; return float(a)*(1.0/4294967296.0); }
float h2(uint a, uint b){ return h1(a*747796405u + b*2891336453u + 1013904223u); }
vec2 tileUV(float g, vec2 c){ return (vec2(mod(g,uAtlasCols), floor(g/uAtlasCols)) + c) * uTilePx / uAtlas; }

void main(){
  uint id = uint(gl_InstanceID);
  vec2 cell = vec2(float(gl_InstanceID % uCols), float(gl_InstanceID / uCols));
  vec2 c = floor((uOff + cell*uCell)*uDpr + 0.5)/uDpr;
  float heat = 0.; vec2 push = vec2(0.);

  if (uHover > .5) for (int i=0;i<12;i++){
    vec3 t = uTrail[i]; if (t.z < 0.) continue;
    vec2 d = c - t.xy; float dist = length(d);
    if (dist < uRadius){ float q = 1.-dist/uRadius, k = q*q*(3.-2.*q)*exp(-t.z*3.5);
      heat = max(heat,k); if (i == 0) push += d/(dist+.2*uRadius)*k*10.*uPush; }
  }
  for (int r=0;r<4;r++){
    vec4 rp = uRip[r]; if (rp.w < .5) continue;
    vec2 d = c - rp.xy; float dist = length(d), e = (dist-rp.z*1100.)/110., w = exp(-e*e)*max(0.,1.-rp.z/2.4);
    heat = max(heat,w*.95); push += d/max(dist,.1)*w*12.;
  }
  if (uSweep.y > .5){ float e = (c.x+c.y*.6-uSweep.x)/110.; heat = max(heat, exp(-e*e)*.8); }

  float mixM = clamp((uMorph - length(cell/uGrid-.5)*2.2*uWave)/.8, 0., 1.);
  float gA, gB, mb;
  if (uDrift > .5){
    float p = 6.+10.*h2(id,3u), tt = uTime + h2(id,5u)*p, ep = floor(tt/p);
    gA = floor(h2(id,uint(ep)+100u)*uCount); gB = floor(h2(id,uint(ep)+101u)*uCount); mb = smoothstep(0.,.25,tt-ep*p);
  } else { gA = aG.y; gB = aG.x; mb = mixM; }
  float he = floor(uTime*mix(2.,14.,heat) + h2(id,9u)*8.);
  float gH = floor(h2(id,uint(he)+500000u)*uCount);

  vec2 corner = vec2(float(gl_VertexID&1), float(gl_VertexID>>1));
  vec2 p = c + push + (corner-.5)*uTile;
  gl_Position = vec4(p.x/uRes.x*2.-1., 1.-p.y/uRes.y*2., 0., 1.);
  vA = tileUV(gA,corner); vB = tileUV(gB,corner); vH = tileUV(gH,corner);
  vM = vec3(mb, smoothstep(.05,.25,heat), heat);
  vTone = mix(aG.w, aG.z, mixM); vCol = aCol.r < 0. ? uBase : aCol;
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 vA, vB, vH; in vec3 vM; in vec3 vCol; in float vTone;
uniform sampler2D uTex; uniform vec3 uHi; out vec4 o;
void main(){
  float a = mix(texture(uTex,vA).a, texture(uTex,vB).a, vM.x);
  a = mix(a, texture(uTex,vH).a, vM.y);
  float al = (vTone + (1.-vTone)*vM.z*.9)*a;
  o = vec4(mix(vCol, uHi, vM.z*.85)*al, al);
}`;

export interface Frame {
  time: number; cols: number; rows: number; cw: number; ch: number; offX: number; offY: number;
  drift: boolean; morph: number; radius: number; push: boolean; hover: boolean;
  wave: number; trail: Float32Array; rip: Float32Array; sweep: [number, number];
  base: [number, number, number]; hi: [number, number, number];
}

export class Renderer {
  gl: WebGL2RenderingContext; prog: WebGLProgram; buf: WebGLBuffer; tex: WebGLTexture;
  count = 0; glyphCount = 1; atlas!: Atlas; dpr = 1; W = 1; H = 1;
  private loc = new Map<string, WebGLUniformLocation | null>();

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader error');
      return s;
    };
    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(this.prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.prog) || 'link error');
    gl.bindVertexArray(gl.createVertexArray());
    this.buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 28, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 16); gl.vertexAttribDivisor(1, 1);
    this.tex = gl.createTexture()!;
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog);
  }

  private u(name: string) {
    if (!this.loc.has(name)) this.loc.set(name, this.gl.getUniformLocation(this.prog, name));
    return this.loc.get(name)!;
  }

  resize(W: number, H: number, dpr: number) {
    this.W = W; this.H = H; this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setAtlas(a: Atlas) {
    const gl = this.gl; this.atlas = a; this.glyphCount = a.glyphs.length;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.canvas);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  }

  setInstances(data: Float32Array, n: number) {
    const gl = this.gl; this.count = n;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  }

  draw(f: Frame) {
    const gl = this.gl, a = this.atlas; if (!a || !this.count) return;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(this.u('uRes'), this.W, this.H); gl.uniform2f(this.u('uCell'), f.cw, f.ch);
    gl.uniform2f(this.u('uOff'), f.offX, f.offY); gl.uniform2f(this.u('uGrid'), f.cols, f.rows);
    gl.uniform2f(this.u('uAtlas'), a.canvas.width, a.canvas.height); gl.uniform2f(this.u('uSweep'), f.sweep[0], f.sweep[1]);
    gl.uniform1i(this.u('uCols'), f.cols); gl.uniform1i(this.u('uTex'), 0);
    gl.uniform1f(this.u('uTime'), f.time); gl.uniform1f(this.u('uTile'), a.tileCss); gl.uniform1f(this.u('uDpr'), this.dpr);
    gl.uniform1f(this.u('uCount'), this.glyphCount); gl.uniform1f(this.u('uAtlasCols'), a.cols); gl.uniform1f(this.u('uTilePx'), a.tilePx);
    gl.uniform1f(this.u('uWave'), f.wave); gl.uniform1f(this.u('uDrift'), f.drift ? 1 : 0); gl.uniform1f(this.u('uMorph'), f.morph); gl.uniform1f(this.u('uRadius'), f.radius);
    gl.uniform1f(this.u('uPush'), f.push ? 1 : 0); gl.uniform1f(this.u('uHover'), f.hover ? 1 : 0);
    gl.uniform3fv(this.u('uTrail[0]'), f.trail); gl.uniform4fv(this.u('uRip[0]'), f.rip);
    gl.uniform3f(this.u('uBase'), ...f.base); gl.uniform3f(this.u('uHi'), ...f.hi);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
  }
}
