// 球場を選ぶ画面(11/18 持ち主「球場がわかる画像で、目で見て選べるように。読み込みは最後の決定ボタンから」)
// 動き: カードを押すと光って見本(大きな絵・1 行の説明・時間帯)が替わるだけ。読み込みもタイトルへの戻りもしない。
//   「この球場で始める」を押した時だけ onDecide(id, time) を呼ぶ(呼んだ側が読み込み・ショップへ)。戻るは onBack(1 つ前の画面へ)。
// 見た目は stadium_picker.css(UI v5 の素材が来たらそこだけ差し替える)。球場の一覧は stadiums.js。
import { STADIUMS } from './stadiums.js';

const LOCK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2h.5A1.5 1.5 0 0 1 13.5 8.5v5A1.5 1.5 0 0 1 12 15H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 7h.5Zm1.6 0h3.8V5a1.9 1.9 0 0 0-3.8 0v2Z" fill="currentColor"/></svg>';
const kindOf = (s) => (s.roof ? '開閉式' : s.indoor ? '屋根' : '屋外');
const timesOf = (s) => (s.indoor ? [['day', '昼'], ['night', '試合の照明']] : [['day', '昼'], ['night', 'ナイター']]);

export class StadiumPicker {
  // o: { current: 今読んでいる球場, isLocked(id) → 鍵がかかっているか, onDecide(id, time), onBack(), goLabel }
  constructor(o) {
    this.o = o;
    this.sel = o.current || 'koshien';
    this.time = 'day';
    const el = document.createElement('section');
    el.id = 'stadiumScreen'; el.className = 'screen hide';
    el.innerHTML = `
      <div class="bgArt"></div>
      <div class="sheet stPick">
        <div class="head"><button class="back stBack" aria-label="戻る">戻る</button><h2>球場を選ぶ</h2></div>
        <div class="stBody">
          <div class="stPreview">
            <div class="stBig"><img alt=""></div>
            <div class="stInfo"><b class="stBigName"></b><span class="stBigTags"></span><p class="stDesc"></p></div>
            <div class="seg stTime" role="group" aria-label="時間帯"></div>
          </div>
          <div class="stGrid" role="listbox" aria-label="球場"></div>
        </div>
        <button class="go stGo">この球場で始める</button>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    const grid = el.querySelector('.stGrid');
    for (const s of STADIUMS) {
      const b = document.createElement('button');
      b.className = 'stCard'; b.dataset.id = s.id; b.setAttribute('role', 'option');
      b.innerHTML = `<span class="stImg"><img src="img/stadium_thumbs/${s.id}.jpg" alt="" loading="lazy"></span>
        <span class="stName">${s.name}</span>
        <span class="stTags"><i>${kindOf(s)}</i>${s.paid ? `<i class="stLock" title="課金の球場">${LOCK_SVG}</i>` : '<i class="stFree">無料</i>'}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.pick(s.id); });
      grid.appendChild(b);
    }
    el.querySelector('.stBack').addEventListener('click', (e) => { e.stopPropagation(); this.o.onBack && this.o.onBack(); });
    el.querySelector('.stGo').addEventListener('click', (e) => { e.stopPropagation(); this.o.onDecide && this.o.onDecide(this.sel, this.time); });
  }
  open(id, time) {
    if (id) this.sel = id;
    if (time) this.time = time;
    this.pick(this.sel);
  }
  pick(id) {
    const s = STADIUMS.find((x) => x.id === id) || STADIUMS[0];
    this.sel = s.id;
    const locked = this.o.isLocked ? this.o.isLocked(s.id) : false;
    this.el.querySelectorAll('.stCard').forEach((b) => { const on = b.dataset.id === s.id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.classList.toggle('locked', !!(this.o.isLocked && this.o.isLocked(b.dataset.id))); });
    const img = this.el.querySelector('.stBig img'); img.src = `img/stadium_thumbs/${s.id}.jpg`;
    this.el.querySelector('.stBigName').textContent = s.name;
    this.el.querySelector('.stBigTags').innerHTML = `<i>${kindOf(s)}</i>${s.paid ? `<i class="stLock">${LOCK_SVG}</i>` : '<i class="stFree">無料</i>'}`;
    this.el.querySelector('.stDesc').textContent = s.desc || '';
    // 時間帯(屋根の球場は「昼 / 試合の照明」)
    const ts = timesOf(s); if (!ts.some((t) => t[0] === this.time)) this.time = 'day';   // 11/20 夕方は無くした(前に選んだ夕方は昼)
    const seg = this.el.querySelector('.stTime'); seg.innerHTML = '';
    for (const [v, label] of ts) {
      const b = document.createElement('button'); b.dataset.v = v; b.textContent = label; b.classList.toggle('on', v === this.time);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.time = v; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
      seg.appendChild(b);
    }
    const go = this.el.querySelector('.stGo');
    go.classList.toggle('locked', locked);
    go.textContent = locked ? 'この球場を開く' : 'この球場で始める';
    // 縦長では見本が並びの上にあるので、選んだら見本が見える所まで戻す(横長は見本が横に止まっている)
    if (!matchMedia('(min-aspect-ratio: 4/3)').matches) { const body = this.el.querySelector('.stBody'); if (body && body.scrollTo) body.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
}
