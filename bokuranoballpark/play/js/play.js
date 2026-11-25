// 打席(バッティング)とマウンド(投げる)。
// 投手の体・投球の動き(CMU のモーションキャプチャ)・球の物理・当たりの計算は「打者一人称野球」(2026-10-13)のものをそのまま使う。
import * as THREE from 'three';
import { solvePitch, pitchSpin, sampleTraj, sampleVel, timeAtZ, PLATE_FRONT_Z } from './physics.js';
import { PITCH_TYPES } from './pitches.js';
import { BallView } from './ball.js';
import { Batter, computeContact, isBarrel, SWING_TIME, CONTACT_Z } from './batter.js';
import { loadPitcherAsset, PitcherRig } from './pitcher.js';
import { loadMocap, MocapPlayer, blendMocap, signPose } from './mocap.js';
import { MOUND_TOP, RUBBER_FRONT_Z } from './stadium.js';
import { predict, samplePath, pathDuration } from './ballsim.js';
import { Person, KIT } from './figures.js';
import { Athlete, motionEvent } from './athletes.js';
import { rand, randn, clamp } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ZONE = { x0: -0.2526, x1: 0.2526, y0: 0.50, y1: 1.07 };
const inZone = (x, y) => x >= ZONE.x0 && x <= ZONE.x1 && y >= ZONE.y0 && y <= ZONE.y1;
const CAM = { pos: V(0, 1.32, 1.9), look: V(0, -0.25, -10), fov: 38 };
const MIX = [['FF', 0.42], ['SL', 0.2], ['FS', 0.12], ['CH', 0.12], ['CU', 0.1], ['FC', 0.04]];
const PLAIN = { en: '', jersey: '#e9ebef', accent: '#1f3557', cap: '#1f3557', pants: '#e9ebef', pipe: '#1f3557', logo: '#1f3557', text: '#e9ebef', sock: '#1f3557' };
const SLOW = 0.85;   // 投球中の時間の進み(少しゆっくり)

export class Play {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.mode = null;
    this.ball = new BallView(this.scene);
    this.batter = new Batter(this.scene);
    this.batter.setSide(ctx.params.get('side') === 'L' ? 'L' : 'R');
    this.batter.setCameraBase(CAM.pos, CAM.look);
    this.batter.group.visible = false;
    this.catcher = new Athlete(KIT.home, { mitt: true, mask: true, number: '2' });
    this.catcher.root.position.set(0, 0, 0.78); this.catcher.root.rotation.y = 0; this.catcher.set('crouch');
    this.catcher.root.visible = false;
    this.scene.add(this.catcher.root);
    // ストライクゾーンの枠(うすく)
    const zg = new THREE.BufferGeometry().setFromPoints([V(ZONE.x0, ZONE.y0, PLATE_FRONT_Z), V(ZONE.x1, ZONE.y0, PLATE_FRONT_Z), V(ZONE.x1, ZONE.y1, PLATE_FRONT_Z), V(ZONE.x0, ZONE.y1, PLATE_FRONT_Z), V(ZONE.x0, ZONE.y0, PLATE_FRONT_Z)]);
    this.zone = new THREE.Line(zg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
    this.zone.visible = false; this.scene.add(this.zone);
    // 狙いの小さな輪(PC)
    this.aimMark = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.055, 28), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.7, depthTest: false }));
    this.aimMark.visible = false; this.aimMark.renderOrder = 5; this.scene.add(this.aimMark);
    this.aim = V(0, 0.8, CONTACT_Z);
    this.stats = { pitches: 0, swings: 0, hits: 0, hr: 0, best: 0, bestEv: 0 };
    this.mstats = { n: 0, strikes: 0, best: 0 };
    this.world = ctx.world;
    this.rig = null;
    this.ready = this.loadPitcher();
  }
  async loadPitcher() {
    try {
      const [gltf, mocap] = await Promise.all([loadPitcherAsset(), loadMocap().catch(() => null)]);
      this.rig = new PitcherRig(gltf);
      this.rig.root.position.set(0, MOUND_TOP, RUBBER_FRONT_Z);
      this.rig.setHand(1); this.rig.dress(PLAIN, '', ''); this.rig.setHeight(1.84);
      this.rig.root.visible = false;
      this.scene.add(this.rig.root);
      if (mocap) {
        const clip = mocap.A[1];
        this.player = new MocapPlayer(clip, { slot: 'three', tempo: 1, kick: 0.62, stride: 1.12 });
        this.setP = this.player.sample(0);
        this.signP = signPose(this.setP);
        this.rig.applyMocap(this.setP);
      }
    } catch (e) { console.warn('投手の読み込みに失敗', e); }
  }

  // ------------------------------------------------------------ 打席
  async enterBat() {
    const c = this.ctx;
    await this.ready;
    c.setMode('bat');
    this.mode = 'bat';
    try { document.exitPointerLock(); } catch (e) { /* */ }
    document.body.classList.add('aim');
    c.setCamOverride(true);
    const cam = c.camera;
    cam.fov = CAM.fov; cam.updateProjectionMatrix();
    cam.position.copy(CAM.pos); cam.lookAt(CAM.look);
    this.camLook = CAM.look.clone();
    if (this.rig) this.rig.root.visible = true;
    this.batter.group.visible = true; this.batter.reset();
    this.zone.visible = true; this.aimMark.visible = !c.IS_TOUCH;
    c.el('exitMode').textContent = '打席を出る'; c.el('exitMode').classList.remove('hide'); c.el('panel').classList.add('min');
    c.el('jump').classList.add('hide'); c.el('stick').classList.add('hide');
    this.state = 'wait'; this.t = 0; this.wait = 1.6;
    this.ball.show(false);
    c.toast('打席に立ちました', c.IS_TOUCH ? '球が来たら画面をタップして振る' : '球が来たらクリックして振る');
    this.hud();
  }
  aimFromScreen(cx, cy) {
    const cam = this.ctx.camera;
    const rc = new THREE.Raycaster();
    rc.setFromCamera({ x: (cx / innerWidth) * 2 - 1, y: -(cy / innerHeight) * 2 + 1 }, cam);
    const t = (CONTACT_Z - rc.ray.origin.z) / rc.ray.direction.z;
    const p = rc.ray.origin.clone().addScaledVector(rc.ray.direction, t);
    p.x = clamp(p.x, -0.75, 0.75); p.y = clamp(p.y, 0.15, 1.6); p.z = CONTACT_Z;
    return p;
  }
  onPointer(cx, cy, kind, button) {
    if (this.mode === 'bat') {
      if (kind === 'move') { this.aim.copy(this.aimFromScreen(cx, cy)); return; }
      if (kind === 'down') { this.aim.copy(this.aimFromScreen(cx, cy)); this.swing(this.aim); }
      return;
    }
    if (this.mode === 'pitch') {
      if (kind === 'down') { if (!this.flight) { this.charging = true; this.charge = 0; } }
      if (kind === 'up' && this.charging) { this.charging = false; this.throwPitch(this.charge); }
    }
  }
  preparePitch() {
    let r = rand(), type = 'FF';
    for (const [k, w] of MIX) { if ((r -= w) <= 0) { type = k; break; } }
    const T = PITCH_TYPES[type];
    const kmh = 136 + T.dv + randn() * 2.5;   // 高校生の投手: 直球 130〜140 km/h
    const strike = rand() < 0.62;
    const target = strike ? [(-0.2 + rand() * 0.4), 0.58 + rand() * 0.42] : [(rand() < 0.5 ? -1 : 1) * (0.3 + rand() * 0.2), 0.35 + rand() * 0.9];
    let rel = V(-0.55, 1.85, -16.9);
    if (this.rig && this.player) {
      const Prel = this.player.sample(this.player.tRelease);
      this.rig.applyMocap(Prel);
      this.rig.root.updateMatrixWorld(true);
      rel = this.rig.ballWorld(V());
    }
    const spinFn = (dir) => pitchSpin(dir, T.rpm, T.eff, T.mv, 1);
    const sol = solvePitch(rel.toArray(), kmh / 3.6, spinFn, target);
    const p = { type, kmh, tr: sol.tr, w: sol.w };
    p.tPlate = timeAtZ(sol.tr, PLATE_FRONT_Z);
    p.tContact = timeAtZ(sol.tr, CONTACT_Z);
    p.tMitt = timeAtZ(sol.tr, 0.75) || p.tPlate + 0.04;
    p.plate = sampleTraj(sol.tr, p.tPlate, [0, 0, 0]);
    p.strike = inZone(p.plate[0], p.plate[1]);
    this.pitch = p;
    this.swingRec = null; this.contact = null; this.resolved = false;
    this.ball.setSpin(sol.w);
  }
  swing(aim) {
    if (this.state !== 'delivery' && this.state !== 'flight') return;
    if (this.swingRec) return;
    const relT = this.t - this.tRelease;
    if (relT < -0.25) return;
    const p = this.pitch;
    this.swingRec = { tap: relT, aim: aim.clone() };
    this.batter.startSwing(aim);
    this.stats.swings++;
    const timing = relT + SWING_TIME - p.tContact;
    const at = sampleTraj(p.tr, p.tContact, [0, 0, 0]);
    const vv = sampleVel(p.tr, p.tContact, [0, 0, 0]);
    const side = this.batter.side;
    const inside = side === 'L' ? at[0] / 0.25 : -at[0] / 0.25;
    const c = computeContact(timing, { x: at[0], y: at[1] }, aim, Math.hypot(...vv), { diff: 'normal', assist: 0.5, side, inside: clamp(inside, -1, 1) * 0.5 });
    c.tAt = p.tContact + timing * 0.45;
    this.contact = c;
  }
  onContact() {
    const c = this.contact, p = this.pitch;
    const at = sampleTraj(p.tr, c.tAt, [0, 0, 0]);
    this.batter.snapContact(V(...at));
    if (c.foulTip) { this.ctx.sound.hit('tip'); this.call('ファウルチップ'); this.after(1.2); return; }
    const la = c.la * Math.PI / 180, sp = c.spray * Math.PI / 180;
    const v = V(c.ev * Math.cos(la) * Math.sin(sp), c.ev * Math.sin(la), -c.ev * Math.cos(la) * Math.cos(sp));
    const vd = v.clone().normalize();
    const back = new THREE.Vector3().crossVectors(vd, V(0, 1, 0)).normalize().multiplyScalar(c.backRpm * Math.PI / 30);
    back.y += c.sideRpm * Math.PI / 30;
    const path = predict(this.world, V(...at), v, back, 10, { Cd: 0.36, clScale: 1.0, dt: 1 / 240 });
    this.batted = { path, t: 0, c };
    this.ball.setSpin(back.toArray());
    const evk = c.ev * 3.6;
    const kind = c.sweet ? 'barrel' : Math.abs(c.along) > 0.12 ? (c.along > 0 ? 'end' : 'jam') : 'solid';
    this.ctx.sound.hit(kind, Math.min(1, evk / 170));
    // 結果: 最初に当たった所で決める
    const fh = path.firstHit ? path.firstHit.p : path.end;
    const ang = Math.atan2(fh.x, -fh.z) * 180 / Math.PI;
    const r = Math.hypot(fh.x, fh.z);
    const fd = this.ctx.fenceDist(ang);
    let label;
    const fair = Math.abs(ang) <= 45.5;
    if (fair && r > fd + 0.5 && fh.y > 0.3) label = 'ホームラン';
    else if (fair && path.firstHit && path.firstHit.wall && Math.abs(r - fd) < 2.5) label = 'フェンス直撃';
    else if (!fair) label = 'ファウル';
    else label = c.la < 10 ? 'ゴロ' : c.la < 24 ? 'ライナー' : c.la > 55 ? 'ポップフライ' : 'フライ';
    // 飛距離(地面の高さまで伸ばした水平距離)
    let dist = r;
    if (label === 'ホームラン') {
      const flat = predict({ bvh: null, surfaceAt: () => 's', groundY: () => 0 }, V(...at), v, back, 10, { Cd: 0.36, clScale: 1.0, dt: 1 / 120 });
      dist = Math.hypot(flat.firstHit ? flat.firstHit.p.x : flat.end.x, flat.firstHit ? flat.firstHit.p.z : flat.end.z);
    }
    this.batted.label = label; this.batted.dist = dist; this.batted.ev = evk; this.batted.la = c.la; this.batted.tLand = path.firstHit ? path.firstHit.t : pathDuration(path);
    if (label === 'ホームラン') { this.stats.hr++; this.ctx.sound.crowd('hr', 1); }
    else if (c.la > 20 && evk > 140 && fair) this.ctx.sound.crowd('ooh', 0.8);
    if (fair && label !== 'ゴロ' || evk > 150) this.stats.hits += fair ? 1 : 0;
    this.stats.best = Math.max(this.stats.best, label === 'ホームラン' ? dist : 0);
    this.stats.bestEv = Math.max(this.stats.bestEv, evk);
    this.state = 'batted'; this.t = 0;
    this.ball.clearTrail();
  }
  call(text, sub) { this.ctx.toast(text, sub, { ms: 1100 }); }
  after(w) { this.state = 'after'; this.t = 0; this.afterWait = w; this.hud(); }
  hud() {
    const s = this.stats;
    if (this.mode === 'bat') this.ctx.hud(`<div class="m">打席</div><div class="d">球数 ${s.pitches} ・ 振った ${s.swings}</div><div class="d">本塁打 ${s.hr}${s.best ? ` ・ 最長 ${Math.round(s.best)} m` : ''}</div><div class="d">最速の打球 ${Math.round(s.bestEv)} km/h</div>`);
    if (this.mode === 'pitch') { const m = this.mstats; this.ctx.hud(`<div class="m">マウンド</div><div class="d">投げた ${m.n} ・ ストライク ${m.strikes}</div><div class="d">最速 ${Math.round(m.best)} km/h</div>`); }
  }
  updateBat(dt) {
    const c = this.ctx;
    const sdt = (this.state === 'delivery' || this.state === 'flight') ? dt * SLOW : dt;
    this.t += sdt;
    const cam = c.camera;
    this.batter.update(sdt);
    this.aimMark.position.copy(this.aim); this.aimMark.lookAt(cam.position);
    if (this.state === 'wait') {
      if (this.rig && this.setP) {
        const u = clamp((this.t - (this.wait - 0.9)) / 0.65, 0, 1);
        const P = u <= 0 ? this.signP : u >= 1 ? this.setP : blendMocap(this.signP, this.setP, u * u * (3 - 2 * u));
        this.rig.applyMocap(P);
      }
      if (this.t >= this.wait) {
        this.preparePitch();
        this.state = 'delivery'; this.t = 0;
        this.tRelease = this.player ? this.player.tRelease : 0.3;
        this.ball.show(false);
      }
    } else if (this.state === 'delivery' || this.state === 'flight') {
      if (this.rig && this.player) this.rig.applyMocap(this.player.sample(Math.min(this.t, this.player.tEnd - 0.01)));
      const bt = this.t - this.tRelease;
      const p = this.pitch;
      if (this.state === 'delivery') {
        if (this.rig) this.rig.ballWorld(this.ball.mesh.position);
        if (bt >= 0) { this.state = 'flight'; this.ball.show(true); this.ball.clearTrail(); this.stats.pitches++; }
      } else {
        if (this.contact && this.contact.contact && bt >= this.contact.tAt && !this.resolved) { this.resolved = true; this.onContact(); return; }
        const pos = sampleTraj(p.tr, Math.max(0, bt), [0, 0, 0]);
        if (pos[2] > 0.35) this.ball.show(false);
        this.ball.update(V(...pos), sdt, cam, 0.028, 0.32);
        if (bt >= p.tMitt && !this.resolved) {
          this.resolved = true;
          c.sound.mitt();
          const kmh = Math.round(p.kmh);
          if (this.swingRec) this.call('空振り', `${PITCH_TYPES[p.type].name} ${kmh} km/h`);
          else this.call(p.strike ? 'ストライク' : 'ボール', `${PITCH_TYPES[p.type].name} ${kmh} km/h`);
          this.after(1.3);
        }
      }
    } else if (this.state === 'batted') {
      const b = this.batted;
      b.t += dt;
      const pos = samplePath(b.path, b.t, V());
      this.ball.update(pos, dt, cam, 0.04, 0.6);
      // 11/20 持ち主「球場を歩くモードではボールを追わない・画面を自動で動かさない」: 打球を目で追う・寄るのはやめた(カメラは打席の向きのまま)
      if (!b.shown && b.t >= Math.min(b.tLand, 7)) {
        b.shown = true;
        const sub = `打球 ${Math.round(b.ev)} km/h ・ 角度 ${Math.round(b.la)}° ・ ${Math.round(b.dist)} m`;
        c.toast(b.label, sub, { big: b.label === 'ホームラン', ms: 2600 });
        this.hud();
      }
      if (b.t > Math.min(pathDuration(b.path), b.tLand + 2.2) + 0.2) { this.after(0.6); }
    } else if (this.state === 'after') {
      if (this.t > this.afterWait) {
        this.ball.show(false); this.batter.reset();
        cam.fov = CAM.fov; cam.updateProjectionMatrix(); cam.position.copy(CAM.pos); cam.lookAt(CAM.look); this.camLook.copy(CAM.look);
        this.state = 'wait'; this.t = 0; this.wait = 1.4 + rand() * 0.6;
        this.hud();
      }
    }
  }

  // ------------------------------------------------------------ マウンド
  async enterMound() {
    const c = this.ctx;
    await this.ready;
    c.setMode('pitch');
    this.mode = 'pitch';
    c.placeAt(0, -18.75, 0, 0, 0.9, 5);
    c.camera.fov = 46; c.camera.updateProjectionMatrix();   // 18 m 先の捕手が見えるように少し寄る
    c.player.pitch = -0.04;
    this.catcher.root.visible = true; this.catcher.root.position.set(0, 0, 0.78); this.catcher.set('crouch');
    this.zone.visible = true;
    c.el('exitMode').textContent = 'マウンドを降りる'; c.el('exitMode').classList.remove('hide'); c.el('panel').classList.add('min');
    if (c.IS_TOUCH) { c.el('throwBtn').classList.remove('hide'); c.el('jump').classList.add('hide'); c.el('stick').classList.add('hide'); }
    c.el('charge').classList.remove('hide');
    this.flight = null; this.charging = false; this.charge = 0;
    c.toast('マウンドに立ちました', c.IS_TOUCH ? '「投げる」を長押しして放す。狙いは画面の中心' : '右クリックを長押しして放す。狙いは画面の中心');
    this.hud();
  }
  throwPitch(charge) {
    const c = this.ctx;
    const cam = c.camera;
    const kmh = 95 + 45 * clamp(charge, 0, 1);   // 最速 140 km/h(高校生)
    const right = V(1, 0, 0).applyQuaternion(cam.quaternion);
    const rel = cam.position.clone().addScaledVector(right, 0.42).add(V(0, 0.2, 0)).addScaledVector(V(0, 0, 1), 1.4);
    // 狙い: 画面の中心の先が本塁の前の面と交わる所
    const dir = V(0, 0, -1).applyQuaternion(cam.quaternion);
    let target;
    if (dir.z > 0.05) {
      const t = (PLATE_FRONT_Z - cam.position.z) / dir.z;
      const q = cam.position.clone().addScaledVector(dir, t);
      target = [clamp(q.x, -1.5, 1.5), clamp(q.y, 0.05, 2.4)];
    } else target = [0, 0.8];
    // 遅い球ほど狙いからぶれる幅は小さく、速いほど大きく
    const spread = 0.04 + 0.1 * charge * charge;
    target[0] += randn() * spread; target[1] += randn() * spread;
    const T = PITCH_TYPES.FF;
    const sol = solvePitch(rel.toArray(), kmh / 3.6, (d) => pitchSpin(d, 2000 + 400 * charge, 0.95, 30, 1), target);
    const tMitt = timeAtZ(sol.tr, 0.75);
    const plate = sampleTraj(sol.tr, timeAtZ(sol.tr, PLATE_FRONT_Z) || 0.5, [0, 0, 0]);
    this.flight = { tr: sol.tr, t: 0, tMitt: tMitt || 0.6, plate, kmh };
    this.ball.setSpin(sol.w);
    this.ball.show(true); this.ball.clearTrail();
    c.el('charge').firstElementChild.style.width = '0%';
  }
  updatePitch(dt) {
    const c = this.ctx;
    if (this.charging) { this.charge = Math.min(1, this.charge + dt / 1.1); c.el('charge').firstElementChild.style.width = Math.round(this.charge * 100) + '%'; }
    const f = this.flight;
    const C = this.catcher;
    if (!f) { C.root.position.x = 0; C.set('crouch'); return; }
    f.t += dt;
    const pos = sampleTraj(f.tr, Math.min(f.t, f.tMitt), [0, 0, 0]);
    this.ball.update(V(...pos), dt, c.camera, 0.024, 0.3);
    // 捕手がミットを球の来る所へ
    const k = clamp((f.t - (f.tMitt - 0.35)) / 0.3, 0, 1);
    C.root.position.x = THREE.MathUtils.lerp(0, clamp(f.plate[0] + 0.2, -0.9, 0.9), k);
    // 捕球: 動きの「捕る」(0.2 秒)がミットに入る時刻に合うように
    const rt = f.t - (f.tMitt - (motionEvent('catcher_receive', 'catch') ?? 0.2));
    if (rt > 0) C.set('receive', { t: rt }); else C.set('crouch');
    if (f.t >= f.tMitt && !f.done) {
      f.done = true;
      const ok = inZone(f.plate[0], f.plate[1]);
      const wild = Math.abs(f.plate[0]) > 1.0 || f.plate[1] < 0.1 || f.plate[1] > 2.0;
      if (!wild) c.sound.mitt();
      this.mstats.n++; if (ok) this.mstats.strikes++; this.mstats.best = Math.max(this.mstats.best, f.kmh);
      c.toast(wild ? '暴投' : ok ? 'ストライク' : 'ボール', `${Math.round(f.kmh)} km/h`, { ms: 1300 });
      this.lastThrow = { kmh: f.kmh, strike: ok, wild, plate: f.plate.slice() };
      this.hud();
    }
    if (f.t > f.tMitt + 1.0) { this.flight = null; this.ball.show(false); }
  }

  // ------------------------------------------------------------ 共通
  update(dt) {
    if (this.mode === 'bat') this.updateBat(dt);
    else if (this.mode === 'pitch') this.updatePitch(dt);
  }
  idle() {}
  exit(silent) {
    const c = this.ctx;
    const was = this.mode;
    this.mode = null;
    document.body.classList.remove('aim');
    c.setCamOverride(false);
    c.camera.fov = 70; c.camera.updateProjectionMatrix();
    if (this.rig) this.rig.root.visible = false;
    this.batter.group.visible = false; this.zone.visible = false; this.aimMark.visible = false;
    this.catcher.root.visible = false; this.ball.show(false);
    c.el('exitMode').classList.add('hide'); c.el('throwBtn').classList.add('hide'); c.el('charge').classList.add('hide');
    if (c.IS_TOUCH) { c.el('jump').classList.remove('hide'); c.el('stick').classList.remove('hide'); }
    c.hud(null);
    if (c.mode === 'bat' || c.mode === 'pitch') c.setMode('walk');
    if (!silent && was === 'bat') c.placeAt(-1.3, 1.2, 0, -60, 1.5, 5);
    if (!silent && was === 'pitch') c.placeAt(0, -17.2, 0, 0, 1.0, 5);
    if (!silent && !c.IS_TOUCH) c.lockPointer();
  }
}
