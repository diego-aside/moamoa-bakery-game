/* 모아모아베이커리: 오늘의 빵집 — 코어 루프·미니 동작·채점·저장·날짜 시드
 * 빌드 없는 순수 JS. 메뉴·대사 데이터는 data.js 에서만 읽는다.
 * 구성: 1) 저장 2) 소리 3) 그림(SVG) 4) 화면 도우미 5) 화면들 6) 미니 동작 7) 시작
 */
(function () {
  'use strict';

  var D = window.MOAMOA_DATA;
  var app = document.getElementById('app');
  var KEY = 'moamoa-save-v1';
  var RUN_LEN = 3;            // 하루 손님 수
  var STAMP_GOAL = 7;         // 일주일 단골 배지에 필요한 스탬프

  /* ───────── 1) 저장 ───────── */
  function defSave() {
    return { v: 1, dayNo: 1, stars: 0, heart: 0, dex: {}, stamps: [], runsToday: {}, run: null,
      lastDay: null, noticeSeen: false, settings: { sound: true, xmas: null } };
  }
  function loadSave() {
    var base = defSave();
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        var merged = Object.assign(base, o);
        merged.settings = Object.assign(defSave().settings, o.settings || {});
        return merged;
      }
    } catch (e) { /* 저장소를 못 쓰면 이번 접속 동안만 기억한다 */ }
    return base;
  }
  var save = loadSave();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 무시 */ } }

  /* ───────── 날짜 시드 ───────── */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return dateStr(new Date()); }
  function tomorrowStr() { var d = new Date(); d.setDate(d.getDate() + 1); return dateStr(d); }
  function dayLabel() {
    var d = new Date(), w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + w + '요일';
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function openBreads() { return D.BREADS.filter(function (b) { return b.open; }); }
  function breadById(id) { return D.BREADS.filter(function (b) { return b.id === id; })[0]; }
  function custById(id) { return D.CUSTOMERS.filter(function (c) { return c.id === id; })[0]; }
  function breadOn(ds) { var o = openBreads(); return o[hash(ds + 'bread') % o.length]; }
  function todayBread() { return breadOn(todayStr()); }
  function xmasOn() {
    if (save.settings.xmas !== null) return save.settings.xmas;
    var m = new Date().getMonth() + 1;
    return m === 11 || m === 12 || m === 1;
  }

  /* ───────── 2) 소리 (직접 합성한 효과음, 외부 파일 없음) ───────── */
  var AC = window.AudioContext || window.webkitAudioContext, actx = null;
  function ac() {
    if (!actx && AC) { try { actx = new AC(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') { actx.resume(); }
    return actx;
  }
  function tone(f, dur, type, vol, delay) {
    if (!save.settings.sound) return;
    var c = ac(); if (!c) return;
    var t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, cut) {
    if (!save.settings.sound) return;
    var c = ac(); if (!c) return;
    var n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n); }
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = cut || 800; g.gain.value = vol || 0.2;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start();
  }
  var SFX = {
    tap: function () { tone(520, 0.08, 'triangle', 0.12); },
    hello: function () { tone(784, 0.25, 'sine', 0.18); tone(988, 0.35, 'sine', 0.18, 0.15); },
    knead: function () { noise(0.14, 0.35, 380); },
    ding: function () { tone(1318, 1.0, 'sine', 0.25); tone(1976, 0.8, 'sine', 0.1); },
    sizzle: function () { noise(0.22, 0.07, 3200); },
    wrong: function () { tone(190, 0.2, 'square', 0.07); },
    star: function () { tone(660, 0.15, 'triangle', 0.15); tone(880, 0.15, 'triangle', 0.15, 0.12); tone(1100, 0.3, 'triangle', 0.15, 0.24); }
  };

  /* ───────── 3) 그림 (CSS·인라인 SVG만 사용) ───────── */
  function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
  function mix(c1, c2, t) {
    var a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    var r = lerp(a >> 16, b >> 16, t), g = lerp((a >> 8) & 255, (b >> 8) & 255, t), bl = lerp(a & 255, b & 255, t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function toneColor(t) { return t < 0.575 ? mix('#EFE3B0', '#B5783A', t / 0.575) : mix('#B5783A', '#5E3418', (t - 0.575) / 0.425); }

  // 빵 그림 안쪽(120x80 좌표). 새 art 종류는 여기에 추가한다.
  function breadInner(kind, tone) {
    var c = toneColor(tone), dark = mix('#B5783A', '#3E200C', 0.5);
    if (kind === 'saltbread') {
      return '<path d="M10 54 Q8 30 40 28 Q72 20 102 34 Q114 42 108 56 Q98 68 60 66 Q22 68 10 54Z" fill="' + c + '" stroke="' + dark + '" stroke-width="2"/>' +
        '<path d="M30 34 Q36 50 30 64 M52 28 Q58 48 52 66 M76 28 Q82 48 76 66" stroke="' + dark + '" stroke-width="2" fill="none" opacity=".5"/>' +
        '<circle cx="40" cy="40" r="1.6" fill="#fff"/><circle cx="66" cy="38" r="1.6" fill="#fff"/><circle cx="88" cy="44" r="1.6" fill="#fff"/><circle cx="58" cy="52" r="1.6" fill="#fff"/>';
    }
    if (kind === 'loaf') {
      return '<path d="M18 40 Q16 12 42 16 Q60 8 80 16 Q104 12 102 40 L102 64 Q102 70 94 70 L26 70 Q18 70 18 64Z" fill="' + c + '" stroke="' + dark + '" stroke-width="2"/>' +
        '<path d="M32 26 Q60 20 90 26" stroke="#fff" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>';
    }
    return '<ellipse cx="60" cy="44" rx="42" ry="24" fill="' + c + '" stroke="' + dark + '" stroke-width="2"/>' +
      '<path d="M34 36 Q60 26 86 36" stroke="#fff" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>';
  }
  function breadSvg(kind, tone, w, h) {
    return '<svg viewBox="0 0 120 80" width="' + (w || 84) + '" height="' + (h || 56) + '" aria-hidden="true">' + breadInner(kind, tone == null ? 0.575 : tone) + '</svg>';
  }

  // 손님 그림: 몸통·팔·다리가 있고, 아이와 온 손님은 옆에 선 아이까지 그린다
  function avatar(c, mood, h) {
    var L = c.look, m, hasKid = L.extra === 'child', VW = hasKid ? 192 : 140, VH = 236;
    if (mood >= 3) { m = '<path d="M-11 -3 Q0 12 11 -3Z" fill="#7a2f2f"/>'; }
    else if (mood === 2) { m = '<path d="M-9 0 Q0 9 9 0" stroke="#7a2f2f" stroke-width="3" fill="none" stroke-linecap="round"/>'; }
    else { m = '<path d="M-7 3 Q0 -1 7 3" stroke="#7a2f2f" stroke-width="3" fill="none" stroke-linecap="round"/>'; }
    var hair = '';
    if (L.hairStyle === 'bun') {
      hair = '<circle cx="70" cy="26" r="15" fill="' + L.hair + '"/><path d="M34 70 Q32 30 70 32 Q108 30 106 70 Q98 50 70 48 Q42 50 34 70Z" fill="' + L.hair + '"/>';
    } else if (L.hairStyle === 'ponytail') {
      hair = '<path d="M34 70 Q32 30 70 32 Q108 30 106 70 Q98 48 70 46 Q42 48 34 70Z" fill="' + L.hair + '"/><ellipse cx="112" cy="84" rx="10" ry="22" fill="' + L.hair + '"/>';
    } else if (L.hairStyle === 'beanie') {
      hair = '<path d="M32 62 Q30 18 70 20 Q110 18 108 62Z" fill="#345433"/><rect x="30" y="56" width="80" height="12" rx="6" fill="#2B4A2A"/><circle cx="70" cy="16" r="8" fill="#E6DA9C"/>';
    } else {
      hair = '<path d="M34 66 Q30 28 70 30 Q110 28 106 66 Q100 44 70 44 Q40 44 34 66Z" fill="' + L.hair + '"/>';
    }
    var extra = '';
    if (L.extra === 'glasses') { extra = '<circle cx="58" cy="72" r="9" fill="none" stroke="#202022" stroke-width="2"/><circle cx="82" cy="72" r="9" fill="none" stroke="#202022" stroke-width="2"/><path d="M67 72 L73 72" stroke="#202022" stroke-width="2"/>'; }
    if (L.extra === 'bag') { extra = '<path d="M44 112 L98 190" stroke="#202022" stroke-width="7"/><rect x="88" y="168" width="34" height="30" rx="6" fill="#202022"/>'; }
    if (L.extra === 'phones') { extra = '<path d="M36 76 Q36 36 70 36 Q104 36 104 76" stroke="#202022" stroke-width="5" fill="none"/><rect x="28" y="68" width="12" height="22" rx="6" fill="#202022"/><rect x="100" y="68" width="12" height="22" rx="6" fill="#202022"/>'; }
    var legs = '<rect x="46" y="196" width="20" height="34" rx="8" fill="#4a3f38"/><rect x="74" y="196" width="20" height="34" rx="8" fill="#4a3f38"/><ellipse cx="54" cy="231" rx="17" ry="6" fill="#202022"/><ellipse cx="86" cy="231" rx="17" ry="6" fill="#202022"/>';
    var body = '<rect x="26" y="106" width="88" height="100" rx="34" fill="' + L.cloth + '"/><rect x="60" y="96" width="20" height="18" fill="' + L.skin + '"/>';
    // 팔: 오른팔은 아이와 온 손님일 때 아이 손을 잡으러 뻗는다
    var rx2 = hasKid ? 140 : 118, ry2 = hasKid ? 180 : 184;
    var arms = '<path d="M32 124 L22 182" stroke="' + L.cloth + '" stroke-width="17" stroke-linecap="round"/><circle cx="22" cy="186" r="8" fill="' + L.skin + '"/>' +
      '<path d="M108 124 L' + rx2 + ' ' + ry2 + '" stroke="' + L.cloth + '" stroke-width="17" stroke-linecap="round"/><circle cx="' + rx2 + '" cy="' + (ry2 + 4) + '" r="8" fill="' + L.skin + '"/>';
    var face = '<circle cx="70" cy="72" r="36" fill="' + L.skin + '"/>';
    var eyes = '<circle cx="58" cy="72" r="3.5" fill="#202022"/><circle cx="82" cy="72" r="3.5" fill="#202022"/><circle cx="50" cy="82" r="5" fill="#E58E7A" opacity=".5"/><circle cx="90" cy="82" r="5" fill="#E58E7A" opacity=".5"/><g transform="translate(70 88)">' + m + '</g>';
    var kid = '';
    if (hasKid) {
      kid = '<rect x="150" y="204" width="10" height="26" rx="4" fill="#4a3f38"/><rect x="164" y="204" width="10" height="26" rx="4" fill="#4a3f38"/><ellipse cx="155" cy="231" rx="11" ry="5" fill="#202022"/><ellipse cx="169" cy="231" rx="11" ry="5" fill="#202022"/>' +
        '<rect x="144" y="162" width="36" height="52" rx="14" fill="#F2C94C"/><path d="M146 176 L140 184" stroke="#F2C94C" stroke-width="10" stroke-linecap="round"/><circle cx="139" cy="186" r="6" fill="' + L.skin + '"/>' +
        '<circle cx="162" cy="142" r="20" fill="' + L.skin + '"/><path d="M142 140 Q162 114 182 140 Q162 130 142 140Z" fill="#5A3B2A"/><circle cx="155" cy="145" r="2.4" fill="#202022"/><circle cx="169" cy="145" r="2.4" fill="#202022"/><path d="M156 153 Q162 158 168 153" stroke="#7a2f2f" stroke-width="2" fill="none" stroke-linecap="round"/>';
    }
    var order;
    if (L.hairStyle === 'beanie') { order = legs + body + arms + face + eyes + hair + extra; }
    else if (L.extra === 'bag') { order = legs + body + extra + arms + hair + face + eyes + hair; }
    else { order = legs + body + arms + hair + face + eyes + hair + extra; }
    // 머리카락 뒤쪽(쪽머리·꽁지)이 얼굴 뒤로 가도록 한 번 더 그린다
    return '<svg viewBox="0 0 ' + VW + ' ' + VH + '" height="' + (h || 230) + '" width="' + Math.round((h || 230) * VW / VH) + '" role="img" aria-label="' + c.name + '">' + order + kid + '</svg>';
  }

  var GLOW = '<defs><radialGradient id="glow"><stop offset="0" stop-color="#FFE9B0" stop-opacity=".6"/><stop offset="1" stop-color="#FFE9B0" stop-opacity="0"/></radialGradient></defs>';
  function wrapScene(inner) { return '<svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + GLOW + inner + '</svg>'; }
  function photoOr(key, fallback) { return D.PHOTOS[key] ? '<img src="' + D.PHOTOS[key] + '" alt="">' : fallback; }

  // 선반 위 작은 빵: 모양(i % 3)과 굽기 정도를 달리 그린다
  function miniBread(cx, base, i, tone) {
    var c = toneColor(tone), d = '#6b4222', k = i % 3;
    if (k === 0) {
      return '<path d="M' + (cx - 17) + ' ' + base + ' Q' + (cx - 19) + ' ' + (base - 15) + ' ' + cx + ' ' + (base - 16) + ' Q' + (cx + 19) + ' ' + (base - 15) + ' ' + (cx + 17) + ' ' + base + 'Z" fill="' + c + '" stroke="' + d + '" stroke-width="1.5"/>' +
        '<path d="M' + (cx - 7) + ' ' + (base - 11) + ' q7 -4 14 0" stroke="#fff" stroke-opacity=".4" stroke-width="2" fill="none"/>';
    }
    if (k === 1) {
      return '<circle cx="' + cx + '" cy="' + (base - 11) + '" r="11.5" fill="' + c + '" stroke="' + d + '" stroke-width="1.5"/>' +
        '<path d="M' + (cx - 6) + ' ' + (base - 15) + ' q5 -4 10 -1" stroke="#fff" stroke-opacity=".4" stroke-width="2" fill="none"/>';
    }
    return '<rect x="' + (cx - 15) + '" y="' + (base - 20) + '" width="30" height="20" rx="8" fill="' + c + '" stroke="' + d + '" stroke-width="1.5"/>' +
      '<path d="M' + (cx - 6) + ' ' + (base - 18) + ' l-2 14 M' + (cx + 4) + ' ' + (base - 18) + ' l-2 14" stroke="' + d + '" stroke-opacity=".45" stroke-width="1.5" fill="none"/>';
  }
  // 선반: 빵 줄 + 선반 판 + 판 앞면에 붙은 이름표
  function shelfRow(x, y, n, step, label, tones) {
    var s = '<rect x="' + x + '" y="' + y + '" width="' + (n * step + 8) + '" height="16" rx="3" fill="#92643E"/><rect x="' + x + '" y="' + y + '" width="' + (n * step + 8) + '" height="3" fill="#B08457"/>';
    for (var i = 0; i < n; i++) { s += miniBread(x + 4 + step / 2 + i * step, y, i, tones[i % tones.length]); }
    s += '<rect x="' + (x + 6) + '" y="' + (y + 4) + '" width="' + (label.length * 9 + 12) + '" height="11" rx="2" fill="#F4F4F2"/><text x="' + (x + 12) + '" y="' + (y + 13) + '" font-size="9" font-weight="700" fill="#202022">' + label + '</text>';
    return s;
  }
  function floorWood(y) {
    var s = '<rect y="' + y + '" width="390" height="' + (844 - y) + '" fill="#B08457"/><rect y="' + (y - 12) + '" width="390" height="12" fill="#7d5434"/><rect y="' + (y - 12) + '" width="390" height="3" fill="#E6DA9C" opacity=".35"/>';
    for (var r = 0, yy = y + 34; yy < 844; r++, yy += 34) {
      s += '<rect y="' + yy + '" width="390" height="2" fill="#92643E" opacity=".55"/>';
      for (var xx = (r % 2) * 60 + 30; xx < 390; xx += 120) { s += '<rect x="' + xx + '" y="' + (yy - 34) + '" width="2" height="34" fill="#92643E" opacity=".45"/>'; }
    }
    return s;
  }
  function plant(x, base) {
    return '<path d="M' + (x - 16) + ' ' + (base - 30) + ' H' + (x + 16) + ' L' + (x + 12) + ' ' + base + ' H' + (x - 12) + 'Z" fill="#92643E"/>' +
      '<circle cx="' + x + '" cy="' + (base - 52) + '" r="18" fill="#345433"/><circle cx="' + (x - 14) + '" cy="' + (base - 42) + '" r="12" fill="#3f6a3d"/><circle cx="' + (x + 14) + '" cy="' + (base - 44) + '" r="13" fill="#2B4A2A"/>';
  }
  // 크리스마스 장식: 구석에 두는 작은 트리 (s 는 크기 배율, 바닥에 놓일 y 를 base 로 준다)
  function tree(x, base, s) {
    return '<g transform="translate(' + x + ' ' + (base - 74 * s) + ') scale(' + s + ')"><rect x="-5" y="60" width="10" height="14" fill="#6b4a2a"/>' +
      '<path d="M0 0 L26 34 L-26 34Z M0 22 L34 58 L-34 58Z" fill="#345433"/>' +
      '<circle cx="-10" cy="40" r="3" fill="#E6DA9C"/><circle cx="12" cy="30" r="3" fill="#D9674F"/><circle cx="6" cy="50" r="3" fill="#E6DA9C"/><circle cx="-16" cy="52" r="3" fill="#D9674F"/>' +
      '<path d="M0 -8 l3 6 6 1 -5 4 1 6 -5 -3 -5 3 1 -6 -5 -4 6 -1Z" fill="#E6DA9C"/></g>';
  }
  function windowArt(x, y, w, h) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="6" fill="#DDEBE8" stroke="#92643E" stroke-width="6"/>' +
      '<rect x="' + (x + w / 2 - 2) + '" y="' + y + '" width="4" height="' + h + '" fill="#92643E"/><rect x="' + x + '" y="' + (y + h / 2 - 2) + '" width="' + w + '" height="4" fill="#92643E"/>' +
      '<rect x="' + (x + w * 0.3) + '" y="' + (y + h * 0.5) + '" width="8" height="' + (h * 0.5 - 4) + '" fill="#6b4a2a"/><circle cx="' + (x + w * 0.3 + 4) + '" cy="' + (y + h * 0.36) + '" r="30" fill="#345433"/><circle cx="' + (x + w * 0.3 - 20) + '" cy="' + (y + h * 0.56) + '" r="18" fill="#3f6a3d"/><circle cx="' + (x + w * 0.3 + 28) + '" cy="' + (y + h * 0.52) + '" r="20" fill="#2B4A2A"/>' +
      '<rect x="' + (x - 8) + '" y="' + (y + h) + '" width="' + (w + 16) + '" height="12" rx="3" fill="#92643E"/>';
  }
  var SHELF_TONES = [0.5, 0.62, 0.42, 0.7, 0.56, 0.46];

  // 타이틀: 차양·우드 바닥·화분. 가운데는 간판 자리라 비워 둔다.
  function sceneTitle() {
    var s = '<rect width="390" height="604" fill="#D9C5B0"/>';
    for (var i = 0; i < 13; i++) { s += '<rect x="' + (i * 30) + '" y="0" width="30" height="34" fill="' + (i % 2 ? '#F4F4F2' : '#E6DA9C') + '"/><circle cx="' + (i * 30 + 15) + '" cy="34" r="15" fill="' + (i % 2 ? '#F4F4F2' : '#E6DA9C') + '"/>'; }
    s += floorWood(604) + plant(40, 592) + '<circle cx="195" cy="300" r="240" fill="url(#glow)" opacity=".6"/>';
    s += xmasOn() ? tree(344, 596, 0.8) : plant(350, 592);
    return wrapScene(s);
  }
  // 매장 홈: UI 가 없는 가운데 구역(진열장·창·강아지 인형·버섯 램프)과 우드 바닥, 구석 트리(옵션)
  function sceneHome() {
    var s = '<rect width="390" height="604" fill="#D9C5B0"/><rect width="390" height="44" fill="#E6DA9C" opacity=".5"/>' + floorWood(604) +
      windowArt(214, 360, 160, 150) +
      '<rect x="18" y="360" width="172" height="200" rx="8" fill="#fff" fill-opacity=".4" stroke="#2B7A71" stroke-width="4"/>' +
      shelfRow(28, 450, 4, 40, '쌀소금빵', SHELF_TONES) + shelfRow(28, 538, 4, 40, '쌀식빵', SHELF_TONES.slice(2)) +
      '<rect x="18" y="560" width="172" height="44" rx="4" fill="#92643E"/><rect x="26" y="568" width="156" height="28" rx="3" fill="#7d5434"/>' +
      // 진열장 위 강아지 인형(일반 강아지 인형)
      '<rect x="62" y="342" width="44" height="18" rx="4" fill="#92643E"/><circle cx="84" cy="324" r="17" fill="#E3CDB0"/><ellipse cx="68" cy="316" rx="6" ry="12" fill="#8a6a4a"/><ellipse cx="100" cy="316" rx="6" ry="12" fill="#8a6a4a"/><circle cx="78" cy="322" r="2.4" fill="#202022"/><circle cx="90" cy="322" r="2.4" fill="#202022"/><ellipse cx="84" cy="330" rx="4" ry="3" fill="#202022"/>' +
      // 창턱 버섯 램프
      '<rect x="224" y="494" width="6" height="28" fill="#EAE7E1"/><path d="M208 496 Q227 466 246 496Z" fill="#E6DA9C"/><circle cx="227" cy="488" r="34" fill="url(#glow)"/>' +
      '<circle cx="195" cy="40" r="260" fill="url(#glow)" opacity=".5"/>';
    s += xmasOn() ? tree(350, 598, 0.62) : plant(350, 598);
    return wrapScene(s);
  }
  // 주문: 손님 뒤 벽에는 창과 선반만, 진열장은 카운터 위, 아래는 우드 카운터
  function sceneOrder() {
    var ob = openBreads(), n1 = ob[0] ? ob[0].name : '쌀소금빵', n2 = ob[1] ? ob[1].name : '쌀식빵';
    var s = '<rect width="390" height="560" fill="#D9C5B0"/><rect width="390" height="40" fill="#E6DA9C" opacity=".5"/>' +
      windowArt(18, 236, 84, 130) +
      '<rect x="296" y="318" width="78" height="8" rx="3" fill="#92643E"/><rect x="310" y="290" width="22" height="28" rx="5" fill="#EAE7E1" stroke="#92643E" stroke-width="2"/><circle cx="352" cy="298" r="14" fill="#345433"/><circle cx="342" cy="304" r="9" fill="#3f6a3d"/>' +
      '<rect x="10" y="440" width="370" height="124" rx="8" fill="#fff" fill-opacity=".4" stroke="#2B7A71" stroke-width="4"/>' +
      shelfRow(24, 492, 5, 44, n1, SHELF_TONES) + shelfRow(24, 548, 5, 44, n2, SHELF_TONES.slice(1)) +
      '<rect x="0" y="560" width="390" height="284" fill="#92643E"/><rect x="0" y="560" width="390" height="18" fill="#7d5434"/><rect x="0" y="560" width="390" height="4" fill="#B08457" opacity=".7"/>';
    for (var x = 60; x < 390; x += 90) { s += '<rect x="' + x + '" y="578" width="3" height="266" fill="#7d5434" opacity=".55"/>'; }
    s += '<circle cx="195" cy="30" r="240" fill="url(#glow)" opacity=".5"/>';
    return wrapScene(s);
  }
  // 굽기·제작: 서브웨이 타일 + 간접조명 + 스테인리스 작업대. 벽은 비워 UI 가 읽히게 한다.
  function sceneBake() {
    var s = '<defs><pattern id="tile" width="48" height="24" patternUnits="userSpaceOnUse"><rect width="48" height="24" fill="#F4F4F2"/><path d="M0 0H48M0 12H48M0 0V12M24 12V24" stroke="#D9D6CF" stroke-width="2" fill="none"/></pattern>' +
      '<linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E4E6E8"/><stop offset="1" stop-color="#B9BEC2"/></linearGradient></defs>' +
      '<rect width="390" height="520" fill="url(#tile)"/><rect width="390" height="30" fill="#E6DA9C" opacity=".6"/>' +
      '<rect x="0" y="470" width="390" height="50" fill="#EAE7E1" opacity=".7"/>' +
      '<rect x="0" y="520" width="390" height="324" fill="url(#steel)"/><rect x="0" y="514" width="390" height="10" fill="#9AA0A5"/><rect x="0" y="524" width="390" height="3" fill="#fff" opacity=".6"/>' +
      '<circle cx="195" cy="40" r="260" fill="url(#glow)" opacity=".6"/>';
    return wrapScene(s);
  }
  function sceneSoft() {
    return wrapScene('<rect width="390" height="844" fill="#D9C5B0"/><circle cx="60" cy="90" r="120" fill="#E6DA9C" opacity=".45"/><circle cx="350" cy="720" r="160" fill="#EAE7E1" opacity=".55"/><circle cx="330" cy="200" r="60" fill="#B5783A" opacity=".12"/>');
  }

  // 잠긴 빵 실루엣(카테고리별 회색 그림)
  function silhouette(cat) {
    var g = '#B9B3A6', inner;
    if (cat === 'salt') { inner = '<path d="M10 54 Q8 30 40 28 Q72 20 102 34 Q114 42 108 56 Q98 68 60 66 Q22 68 10 54Z" fill="' + g + '"/>'; }
    else if (cat === 'loaf') { inner = '<path d="M18 40 Q16 12 42 16 Q60 8 80 16 Q104 12 102 40 L102 64 Q102 70 94 70 L26 70 Q18 70 18 64Z" fill="' + g + '"/>'; }
    else if (cat === 'filled') { inner = '<ellipse cx="60" cy="44" rx="48" ry="16" fill="' + g + '"/><path d="M16 44 Q60 30 104 44" stroke="#fff" stroke-opacity=".55" stroke-width="3" fill="none"/>'; }
    else if (cat === 'baked') { inner = '<rect x="22" y="26" width="76" height="40" rx="8" fill="' + g + '"/><circle cx="46" cy="40" r="4" fill="#fff" fill-opacity=".5"/><circle cx="72" cy="46" r="4" fill="#fff" fill-opacity=".5"/>'; }
    else { inner = '<path d="M14 64 L60 18 L106 64Z" fill="' + g + '"/><path d="M14 64 H106" stroke="#fff" stroke-opacity=".55" stroke-width="3"/>'; }
    return '<svg viewBox="0 0 120 80" width="72" height="48" aria-hidden="true">' + inner + '</svg>';
  }

  /* ───────── 4) 화면 도우미 ───────── */
  var cleanup = null;
  function render(scene, ui, bind) {
    if (cleanup) { cleanup(); cleanup = null; }
    app.innerHTML = '<div class="scene">' + scene + '</div><div class="ui">' + ui + '</div>';
    if (bind) { bind(app); }
  }
  function $(sel, root) { return (root || app).querySelector(sel); }
  function on(sel, fn, root) {
    Array.prototype.forEach.call((root || app).querySelectorAll(sel), function (n) { n.addEventListener('click', function (e) { SFX.tap(); fn(n, e); }); });
  }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; app.appendChild(t);
    setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 1800);
  }
  function modal(html, bind) {
    var m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="panel" role="dialog">' + html + '</div>'; app.appendChild(m);
    function close() { if (m.parentNode) { m.parentNode.removeChild(m); } }
    if (bind) { bind(m, close); }
    return close;
  }
  function shake(node) {
    if (node.animate) { node.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(0)' }], { duration: 320 }); }
  }
  function starsHtml(n) { return '<span class="stars" aria-label="별 ' + n + '개">' + [1, 2, 3].map(function (i) { return i <= n ? '★' : '<span class="off">★</span>'; }).join('') + '</span>'; }
  function soundBtn() { return '<button class="icon-btn" data-act="snd" aria-label="소리 켜기·끄기">' + (save.settings.sound ? '🔊' : '🔇') + '</button>'; }
  function bindSound() {
    on('[data-act="snd"]', function (n) { save.settings.sound = !save.settings.sound; persist(); n.textContent = save.settings.sound ? '🔊' : '🔇'; });
  }
  function heartInfo() {
    var T = D.TITLES, i = 0, h = save.heart;
    for (var k = 0; k < T.length; k++) { if (h >= T[k].need) { i = k; } }
    var next = T[i + 1], frac = next ? (h - T[i].need) / (next.need - T[i].need) : 1;
    return { title: T[i].name, frac: Math.max(0.06, Math.min(1, frac)), next: next ? next.name : null, left: next ? next.need - h : 0, now: h };
  }
  // 게이지가 비어 보여도 고장처럼 안 보이게 지금 수치와 다음 칭호까지 남은 수치를 함께 적는다
  function heartHtml() {
    var h = heartInfo();
    return '<div class="small"><b>단골 마음 ' + h.now + '</b> · ' + h.title + (h.next ? ' · 다음 칭호 ‘' + h.next + '’까지 ' + h.left : ' · 가장 높은 칭호예요') + '</div><div class="gauge heart"><i style="transform:scaleX(' + h.frac + ')"></i></div>';
  }
  function runResumable() { return save.run && save.run.idx < save.run.queue.length; }
  // 재료 카드의 종류 태그: 고르기 전에도 어떤 재료인지 짐작할 수 있게 한다 (오답 재료도 같은 톤으로)
  var INGR_TAG = { rice: '빵의 바탕', sbutter: '고소한 맛', milk: '촉촉한 재료', yeast: '부풀리는 재료', basil: '향긋한 허브', chestnut: '달콤한 열매' };

  /* ───────── 5) 화면들 ───────── */
  function showTitle() {
    render(photoOr('scene-title', sceneTitle()),
      '<div class="topbar"><span></span>' + soundBtn() + '</div>' +
      '<div class="title-box plate"><h1>' + D.TEXT.gameTitle + '</h1><p>' + D.TEXT.gameSub + '</p></div>' +
      '<div class="spacer"></div>' +
      '<div class="sign"><div class="sign-art">' + breadSvg('saltbread', 0.575, 150, 100) + '</div><div class="sign-name">' + D.STORE.name + '</div></div>' +
      '<div class="spacer"></div>' +
      '<div class="stack">' + (runResumable() ? '<button class="btn green block" data-act="resume">이어서 하기</button>' : '') +
      '<button class="btn block" data-act="open">빵집 열기</button>' +
      '<button class="btn sub block" data-act="settings">설정·안내</button></div>',
      function () {
        bindSound();
        on('[data-act="resume"]', function () { noticeThen(function () { showOrder(); }); });
        on('[data-act="open"]', function () { noticeThen(showHome); });
        on('[data-act="settings"]', function () { showSettings(showTitle); });
      });
  }
  // 첫 진입 때 '실제 레시피가 아니에요' 안내
  function noticeThen(next) {
    if (save.noticeSeen) { next(); return; }
    modal('<h3>시작하기 전에</h3><p style="margin:0">' + D.TEXT.notice + '</p><p class="small" style="margin:0">' + D.TEXT.allergy + '</p><button class="btn block" data-act="ok">알겠어요</button>',
      function (m, close) {
        on('[data-act="ok"]', function () { save.noticeSeen = true; persist(); close(); next(); }, m);
      });
  }

  function showHome() {
    var tb = todayBread(), q = buildQueue(), tc = custById(q[q.length - 1].c), date = todayStr();
    var stampDone = save.stamps.indexOf(date) >= 0;
    render(photoOr('scene-home', sceneHome()),
      '<div class="topbar"><span class="chip">🍞 ' + D.STORE.name + '</span><div class="row">' + soundBtn() + '</div></div>' +
      '<div class="panel" style="margin-top:8px">' + heartHtml() + '</div>' +
      '<div class="panel" style="margin-top:8px"><div class="row" style="align-items:center">' +
      '<div class="center">' + breadSvg(tb.art, 0.575, 84, 56) + '</div>' +
      '<div style="flex:2"><div class="small">오늘의 빵 · ' + dayLabel() + '</div><b>' + tb.name + '</b>' +
      '<div class="small">오늘의 단골 손님 · <b>' + tc.name + '</b></div>' +
      '<div class="small">스탬프 ' + Math.min(save.stamps.length, STAMP_GOAL) + '/' + STAMP_GOAL + (stampDone ? ' · 오늘 도장 완료' : '') + (save.stamps.length >= STAMP_GOAL ? ' · 일주일 단골 배지' : '') + '</div></div></div>' +
      '<div class="small" style="margin-top:4px">' + D.TEXT.deviceDate + '</div></div>' +
      '<div class="spacer"></div>' +
      '<div class="stack">' + (runResumable()
        ? '<button class="btn green block" data-act="resume">이어서 하기 (손님 ' + (save.run.idx + 1) + '번째)</button>'
        : '<button class="btn block" data-act="start">Day ' + save.dayNo + ' 시작하기</button>') +
      '<div class="row"><button class="btn sub" data-act="dex">📖 빵 도감</button><button class="btn sub" data-act="settings">⚙ 설정·안내</button></div></div>',
      function () {
        bindSound();
        on('[data-act="start"]', showDayStart);
        on('[data-act="resume"]', function () { showOrder(); });
        on('[data-act="dex"]', function () { showDex(showHome); });
        on('[data-act="settings"]', function () { showSettings(showHome); });
      });
  }

  // Day 소개: 실제로 오는 손님 순서(큐)를 그대로 보여준다. 첫 손님이 주문 화면의 첫 손님과 같다.
  function showDayStart() {
    var tb = todayBread(), q = buildQueue(), first = custById(q[0].c), fb = breadById(q[0].b);
    render(sceneSoft(),
      '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">←</button><span></span></div>' +
      '<div class="spacer"></div>' +
      '<div class="panel center"><h2>Day ' + save.dayNo + '</h2><div class="small">' + dayLabel() + '</div>' +
      '<div class="row" style="align-items:center;justify-content:center;margin-top:8px"><div style="flex:none">' + avatar(first, 2, 200) + '</div>' +
      '<div style="flex:1;text-align:left"><div class="small">첫 손님</div><b>' + first.name + '</b><div class="small">' + fb.name + '을(를) 찾아요</div>' +
      '<div class="small" style="margin-top:10px">오늘의 빵</div><div>' + breadSvg(tb.art, 0.575, 96, 64) + '</div><b>' + tb.name + '</b></div></div>' +
      '<div class="small" style="margin-top:8px">오늘 찾아올 손님</div>' +
      '<div class="row" style="justify-content:center;gap:6px">' + q.map(function (e, i) {
        var c = custById(e.c);
        return '<div class="center" style="flex:1"><div>' + avatar(c, 2, 84) + '</div><div class="small">' + (i + 1) + '. ' + (e.closer ? '단골 손님' : c.name) + '</div></div>';
      }).join('') + '</div>' +
      '<p class="small" style="margin:8px 0 0">오늘의 빵을 별 3개로 만들면 스탬프를 한 개 받아요. 손님은 ' + RUN_LEN + '명이 와요.</p></div>' +
      '<div class="spacer"></div><button class="btn block" data-act="open">문 열기</button>',
      function () {
        on('[data-act="back"]', showHome);
        on('[data-act="open"]', function () { SFX.hello(); startRun(); showOrder(); });
      });
  }

  // 오늘 손님 큐: 앞 손님들은 힌트 있음, 마지막은 오늘의 단골 손님(힌트 없음)
  function buildQueue() {
    var date = todayStr(), open = openBreads(), runs = save.runsToday[date] || 0;
    var closer = D.CUSTOMERS[(hash(date + 'cust') + runs) % D.CUSTOMERS.length];
    var closerBread = open[(hash(date + 'bread') + runs) % open.length];
    var others = D.CUSTOMERS.filter(function (c) { return c.id !== closer.id; });
    var shift = save.dayNo % others.length, q = [];
    for (var i = 0; i < RUN_LEN - 1; i++) {
      q.push({ c: others[(shift + i) % others.length].id, b: open[(save.dayNo + i) % open.length].id, hint: true, closer: false });
    }
    q.push({ c: closer.id, b: closerBread.id, hint: false, closer: true });
    return q;
  }
  function startRun() {
    save.run = { n: save.dayNo, date: todayStr(), queue: buildQueue(), idx: 0, results: [] };
    persist();
  }

  var cur = null;
  function showOrder() {
    var run = save.run; if (!run) { showHome(); return; }
    var qi = run.queue[run.idx], c = custById(qi.c), b = breadById(qi.b);
    cur = { c: c, b: b, q: qi, pickMiss: 0, ingWrong: 0, sc: {}, ai: 0, applied: false };
    var wish = b.wish[hash(run.date + b.id + c.id + run.idx) % b.wish.length];
    render(photoOr('scene-order', sceneOrder()),
      '<div class="topbar"><span class="chip">손님 ' + (run.idx + 1) + '/' + RUN_LEN + (qi.closer ? ' · 단골 손님' : '') + '</span>' + soundBtn() + '</div>' +
      '<div class="bubble" style="margin-top:10px"><div class="small">' + c.greet + '</div><div id="orderTxt">' + c.order.replace('{wish}', wish) + '</div>' +
      (qi.hint ? '<div class="hintline">힌트: ' + b.hint + '</div>' : '') + '</div>' +
      '<div class="customer-wrap" style="margin-top:14px">' + avatar(c, 2, 220) + '</div>' +
      '<div class="spacer"></div>' +
      '<div class="small center" style="color:#202022;font-weight:700;margin-bottom:4px">메뉴판에서 알맞은 빵을 골라 주세요</div>' +
      '<div class="menu-board">' + openBreads().map(function (x) {
        return '<button class="menu-card" data-b="' + x.id + '">' + breadSvg(x.art, 0.575, 84, 56) + '<span>' + x.name + '</span><span class="d">' + x.desc + '</span></button>';
      }).join('') + '</div>',
      function () {
        bindSound(); SFX.hello();
        on('[data-b]', function (n) {
          if (n.getAttribute('data-b') === b.id) {
            toast('좋아요! 재료를 골라 볼까요?'); SFX.star();
            setTimeout(showIngredients, 700);
          } else {
            SFX.wrong(); shake(n); cur.pickMiss++;
            if (cur.pickMiss === 1) { $('#orderTxt').textContent = '다시 골라볼까요?'; }
            else { toast('주문하신 빵은 “' + b.name + '”이에요. 함께 만들어 봐요!'); cur.ingWrong++; setTimeout(showIngredients, 1100); }
          }
        });
      });
  }

  function stepbar(active) {
    var names = { ing: '재료', knead: '반죽', shape: '성형', bake: '굽기' }, keys = ['ing'].concat(cur.b.actions), ai = keys.indexOf(active);
    return '<div class="stepbar">' + keys.map(function (k, i) { return '<span class="step ' + (i < ai ? 'done' : i === ai ? 'now' : '') + '">' + (i < ai ? '✔ ' : '') + names[k] + '</span>'; }).join('') + '</div>';
  }

  function showIngredients() {
    var b = cur.b, need = b.ingredients.length;
    var cards = b.ingredients.map(function (x) { return { x: x, ok: true }; }).concat([{ x: b.decoy, ok: false }])
      .sort(function (p, q) { return hash(b.id + p.x.id) - hash(b.id + q.x.id); });
    var got = 0;
    render(photoOr('scene-bake', sceneBake()),
      '<div class="topbar"><span class="chip">' + b.name + '</span>' + soundBtn() + '</div>' + stepbar('ing') +
      '<div class="panel" style="margin-top:8px"><b>재료 카드를 골라 주세요</b><div class="small">이 빵에 어울리는 재료만 골라요. 카드를 누르면 이유가 보여요.</div></div>' +
      '<div class="cards" style="margin-top:10px">' + cards.map(function (c) {
        return '<button class="icard" data-i="' + c.x.id + '" data-ok="' + (c.ok ? 1 : 0) + '"><span class="ic">' + c.x.icon + '</span><span class="n">' + c.x.name + '</span>' +
          '<span class="tag">' + (INGR_TAG[c.x.id] || '재료') + '</span><span class="w">' + c.x.why + '</span></button>';
      }).join('') + '</div>' +
      '<div class="say panel" id="say" style="margin-top:8px;padding:8px">재료 ' + need + '장을 골라 주세요</div>' +
      '<div class="spacer"></div><button class="btn block" id="next" disabled>다음</button>',
      function () {
        bindSound();
        on('.icard', function (n) {
          if (n.classList.contains('picked')) { return; }
          if (n.getAttribute('data-ok') === '1') {
            n.classList.add('picked'); got++; SFX.star();
            $('#say').textContent = got >= need ? '좋아요, 재료가 다 모였어요!' : '좋아요! ' + (need - got) + '장 더 골라 주세요';
            if (got >= need) { $('#next').disabled = false; }
          } else {
            cur.ingWrong++; SFX.wrong(); n.classList.add('nope'); shake(n);
            $('#say').textContent = '이 빵에는 안 어울려요';
            setTimeout(function () { n.classList.remove('nope'); }, 700);
          }
        });
        on('#next', function () { cur.ai = 0; showMake(); });
      });
  }

  function showMake() {
    var key = cur.b.actions[cur.ai], labels = { knead: '반죽 치대기', shape: '모양 잡기', bake: '굽기' };
    render(photoOr('scene-bake', sceneBake()),
      '<div class="topbar"><span class="chip">' + cur.b.name + ' · ' + labels[key] + '</span>' + soundBtn() + '</div>' + stepbar(key) +
      '<div id="mini" style="display:flex;flex-direction:column;flex:1;min-height:0;margin-top:8px"></div>',
      function () {
        bindSound();
        var done = function (res) {
          cur.sc[key] = res; cur.ai++;
          if (cur.ai < cur.b.actions.length) { showMake(); } else { showResult(); }
        };
        var fn = { knead: miniKnead, shape: miniShape, bake: miniBake }[key];
        fn($('#mini'), done);
      });
  }

  /* ───────── 6) 미니 동작 ───────── */
  function svgPoint(svg, ev, vw, vh) {
    var r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * vw, y: (ev.clientY - r.top) / r.height * vh };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function actionBtn(label) { return '<button class="btn block" id="go">' + label + '</button>'; }
  // 화면 회전·크기 변경 때 미터 위치를 다시 재도록 걸어 두고, 화면을 떠날 때 푼다
  function watchResize(fn) {
    window.addEventListener('resize', fn); window.addEventListener('orientationchange', fn);
    return function () { window.removeEventListener('resize', fn); window.removeEventListener('orientationchange', fn); };
  }
  // 반죽 결 자국·소금 알갱이 (단위 크기 기준 장식)
  var GRAIN = '<path d="M-30 -8 Q0 -18 30 -8" stroke="#B5783A" stroke-opacity=".45" stroke-width="2.5" fill="none" vector-effect="non-scaling-stroke"/>' +
    '<path d="M-34 4 Q0 -4 34 4" stroke="#B5783A" stroke-opacity=".45" stroke-width="2.5" fill="none" vector-effect="non-scaling-stroke"/>' +
    '<path d="M-28 16 Q0 8 28 16" stroke="#B5783A" stroke-opacity=".45" stroke-width="2.5" fill="none" vector-effect="non-scaling-stroke"/>' +
    '<circle cx="-22" cy="-2" r="1.8" fill="#fff"/><circle cx="-4" cy="10" r="1.8" fill="#fff"/><circle cx="14" cy="-6" r="1.8" fill="#fff"/><circle cx="26" cy="6" r="1.8" fill="#fff"/>';

  // 치대기: 원을 4바퀴 돌리면 게이지가 가득 찬다. '찰지게' 구간(눈금·무늬)에서 멈추면 성공. 숫자 없음.
  function miniKnead(root, done) {
    var TURNS = 4, Z0 = 0.55, Z1 = 0.85;
    root.innerHTML = '<div class="say panel" id="say">원을 따라 손가락으로 문질러 보세요</div>' +
      '<div class="play"><svg id="ksvg" viewBox="0 0 320 300" width="300" height="281">' +
      '<circle cx="160" cy="150" r="112" fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="4 14" stroke-linecap="round"/>' +
      '<polyline id="trail" points="" fill="none" stroke="#B5783A" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>' +
      '<g id="dgrp"><ellipse id="dough" cx="160" cy="150" rx="70" ry="60" fill="#F1E3B8" stroke="#B5783A" stroke-width="4"/>' +
      '<g transform="translate(160 150) scale(1.3)">' + GRAIN + '</g></g>' +
      '<circle id="ring" cx="160" cy="38" r="26" fill="none" stroke="#fff" stroke-width="4"/>' +
      '<circle id="finger" cx="160" cy="38" r="17" fill="#F4D9C2" stroke="#7a5a3a" stroke-width="3"/></svg></div>' +
      '<div class="spacer"></div><div class="meterwrap"><div class="zone-label" id="zl">찰지게</div>' +
      '<div class="meter" id="meter"><div class="fill" id="fill"></div><div class="zone" id="zone"></div><i class="tick" data-t="1"></i><i class="tick" data-t="2"></i><i class="tick" data-t="3"></i></div></div>' +
      '<div style="height:10px"></div>' + actionBtn('다 됐어요');
    var svg = $('#ksvg', root), meter = $('#meter', root), zone = $('#zone', root), zl = $('#zl', root), fill = $('#fill', root), dough = $('#dough', root), dgrp = $('#dgrp', root);
    var finger = $('#finger', root), ring = $('#ring', root), trail = $('#trail', root), say = $('#say', root), go = $('#go', root);
    var prog = 0, prev = null, acc = 0, active = false, locked = false, pts = [], zstate = '';
    function layout() {
      var w = meter.clientWidth;
      zone.style.left = (w * Z0) + 'px'; zone.style.width = (w * (Z1 - Z0)) + 'px';
      zl.style.left = (w * Z0) + 'px'; zl.style.width = (w * (Z1 - Z0)) + 'px';
      Array.prototype.forEach.call(meter.querySelectorAll('.tick'), function (t) { t.style.left = (w * Number(t.getAttribute('data-t')) / TURNS) + 'px'; });
    }
    layout();
    cleanup = watchResize(layout);
    function gauge() { return clamp(prog / (Math.PI * 2 * TURNS), 0, 1); }
    function place(x, y) { finger.setAttribute('cx', x); finger.setAttribute('cy', y); ring.setAttribute('cx', x); ring.setAttribute('cy', y); }
    function status(g) {
      var s = g >= Z0 && g <= Z1 ? 'in' : g > Z1 ? 'over' : 'low';
      if (s === zstate) { return; }
      zstate = s;
      go.classList.toggle('green', s === 'in');
      go.textContent = s === 'in' ? '찰져요! 다 됐어요' : '다 됐어요';
      if (s === 'in') { say.textContent = '찰져졌어요! 지금 멈춰도 좋아요'; }
      else if (s === 'over') { say.textContent = '너무 오래 치대면 질겨져요'; }
    }
    function move(ev) {
      if (!active || locked) { return; }
      var p = svgPoint(svg, ev, 320, 300), dx = p.x - 160, dy = p.y - 150, ang = Math.atan2(dy, dx), r = Math.sqrt(dx * dx + dy * dy);
      var k = Math.min(1, 125 / Math.max(r, 1)), fx = 160 + dx * k, fy = 150 + dy * k;
      place(fx, fy);
      pts.push(Math.round(fx) + ',' + Math.round(fy)); if (pts.length > 18) { pts.shift(); }
      trail.setAttribute('points', pts.join(' '));
      if (prev !== null && Math.abs(r - 112) < 80) {
        var d = ang - prev; if (d > Math.PI) { d -= Math.PI * 2; } if (d < -Math.PI) { d += Math.PI * 2; }
        prog += Math.abs(d); acc += Math.abs(d);
        if (acc > 0.9) { acc = 0; SFX.knead(); }
        var g = gauge();
        fill.style.transform = 'scaleX(' + g + ')';
        dough.setAttribute('rx', 70 + Math.sin(prog * 3) * 6); dough.setAttribute('ry', 60 - Math.sin(prog * 3) * 6);
        dough.setAttribute('fill', g > Z1 ? '#E3C98A' : g > Z0 ? '#F5E8C0' : '#F1E3B8');
        dgrp.setAttribute('transform', 'rotate(' + Math.round(prog * 28) + ' 160 150)');
        status(g);
      }
      prev = ang;
    }
    function up() { active = false; prev = null; pts = []; trail.setAttribute('points', ''); }
    svg.addEventListener('pointerdown', function (e) { active = true; prev = null; try { svg.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ } move(e); });
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    go.addEventListener('click', function () {
      var g = gauge(); SFX.tap();
      if (g < 0.08) { say.textContent = '먼저 원을 따라 문질러 주세요'; return; }
      locked = true; this.disabled = true;
      var W = D.WORDS.knead, d = g < Z0 ? Z0 - g : g > Z1 ? g - Z1 : 0;
      var score = d === 0 ? 1 : clamp(1 - d / 0.45, 0.25, 0.9);
      var word = d === 0 ? W.hi : g < Z0 ? W.low : W.over;
      say.textContent = word; if (d === 0) { SFX.star(); }
      setTimeout(function () { done({ score: score, word: word }); }, 1000);
    });
  }

  // 성형: 소금빵은 길게 늘리기, 식빵은 틀에 넣기
  function miniShape(root, done) {
    var kind = cur.b.shapeKind || 'stretch';
    if (kind === 'pan') { return shapePan(root, done); }
    root.innerHTML = '<div class="say panel" id="say">끝의 손을 잡고 점선까지 길게 늘려 보세요</div>' +
      '<div class="play"><svg id="ssvg" viewBox="0 0 360 240" width="330" height="220">' +
      '<ellipse id="tgt" cx="130" cy="120" rx="100" ry="17" fill="rgba(43,122,113,.14)" stroke="#1F5C54" stroke-width="6" stroke-dasharray="10 8"/>' +
      '<line x1="230" y1="84" x2="230" y2="156" stroke="#1F5C54" stroke-width="5" stroke-linecap="round"/>' +
      '<text x="230" y="74" font-size="15" font-weight="800" text-anchor="middle" fill="#1F5C54">여기까지</text>' +
      '<g id="dg"><ellipse id="dgb" cx="0" cy="0" rx="50" ry="30" fill="#F1E3B8" stroke="#B5783A" stroke-width="4" vector-effect="non-scaling-stroke"/>' + GRAIN + '</g>' +
      '<circle id="hd" cx="100" cy="120" r="28" fill="#F4D9C2" stroke="#7a5a3a" stroke-width="3"/><text id="hdt" x="100" y="130" font-size="28" text-anchor="middle">✋</text></svg></div>' +
      '<div class="spacer"></div>' + actionBtn('이대로 할게요');
    var svg = $('#ssvg', root), say = $('#say', root), dgb = $('#dgb', root), tgt = $('#tgt', root);
    var L = 70, TL = 200, moved = false, drag = false, locked = false;
    function draw() {
      var h = clamp(7000 / L, 24, 100), d = L - TL;
      $('#dg', root).setAttribute('transform', 'translate(' + (30 + L / 2) + ' 120) scale(' + (L / 100) + ' ' + (h / 60) + ')');
      $('#hd', root).setAttribute('cx', 30 + L); $('#hdt', root).setAttribute('x', 30 + L);
      dgb.setAttribute('fill', d > 14 ? '#E8B89A' : '#F1E3B8');
      tgt.setAttribute('stroke', Math.abs(d) <= 14 ? '#345433' : '#1F5C54');
      say.textContent = Math.abs(d) <= 14 ? '딱 좋아요! 이대로 해도 돼요' : d > 14 ? '너무 길어졌어요! 조금 줄여 보세요' : '조금 더 길게 늘려 보세요';
    }
    draw(); say.textContent = '끝의 손을 잡고 점선까지 길게 늘려 보세요';
    function mv(e) { if (!drag || locked) { return; } var p = svgPoint(svg, e, 360, 240); L = clamp(p.x - 30, 60, 290); moved = true; draw(); }
    svg.addEventListener('pointerdown', function (e) { drag = true; try { svg.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ } mv(e); });
    svg.addEventListener('pointermove', mv);
    svg.addEventListener('pointerup', function () { drag = false; });
    svg.addEventListener('pointercancel', function () { drag = false; });
    $('#go', root).addEventListener('click', function () {
      SFX.tap();
      if (!moved) { say.textContent = '먼저 끝을 잡고 길게 늘려 주세요'; return; }
      locked = true; this.disabled = true;
      var d = Math.abs(L - TL), score = d <= 14 ? 1 : clamp(1 - (d - 14) / 110, 0.25, 1), W = D.WORDS.shape;
      var word = score > 0.85 ? W.hi : score > 0.55 ? W.mid : W.low;
      say.textContent = word; if (score > 0.85) { SFX.star(); }
      setTimeout(function () { done({ score: score, word: word }); }, 1000);
    });
  }
  function shapePan(root, done) {
    root.innerHTML = '<div class="say panel" id="say">반죽을 끌어서 틀에 넣어 보세요</div>' +
      '<div class="play"><svg id="psvg" viewBox="0 0 340 280" width="320" height="263">' +
      '<rect id="pan" x="100" y="170" width="140" height="80" rx="12" fill="rgba(255,255,255,.35)" stroke="#202022" stroke-width="6" stroke-dasharray="10 6"/>' +
      '<text x="170" y="271" font-size="14" font-weight="800" text-anchor="middle" fill="#202022">식빵 틀</text>' +
      '<g id="bl" transform="translate(70 65)"><rect x="-50" y="-32" width="100" height="64" rx="26" fill="#F1E3B8" stroke="#B5783A" stroke-width="4"/>' +
      '<g transform="scale(1.3)">' + GRAIN + '</g><text id="blt" x="0" y="10" font-size="28" text-anchor="middle">✋</text></g></svg></div>' +
      '<div class="spacer"></div>' + actionBtn('이대로 할게요');
    var svg = $('#psvg', root), say = $('#say', root), bl = $('#bl', root), pan = $('#pan', root), drag = false, moved = false, locked = false, cx = 70, cy = 65;
    function draw() {
      bl.setAttribute('transform', 'translate(' + cx + ' ' + cy + ')');
      var d = Math.hypot(cx - 170, cy - 210), inn = d < 24;
      pan.setAttribute('stroke', inn ? '#345433' : '#202022'); pan.setAttribute('stroke-width', inn ? 10 : 6);
      pan.setAttribute('stroke-dasharray', inn ? '0' : '10 6'); pan.setAttribute('fill', inn ? 'rgba(52,84,51,.28)' : 'rgba(255,255,255,.35)');
      say.textContent = inn ? '쏙 들어갔어요! 이대로 해도 돼요' : '반죽을 끌어서 틀에 넣어 보세요';
    }
    function mv(e) { if (!drag || locked) { return; } var p = svgPoint(svg, e, 340, 280); cx = clamp(p.x, 56, 284); cy = clamp(p.y, 40, 240); moved = true; draw(); }
    svg.addEventListener('pointerdown', function (e) { drag = true; try { svg.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ } mv(e); });
    svg.addEventListener('pointermove', mv);
    svg.addEventListener('pointerup', function () { drag = false; });
    svg.addEventListener('pointercancel', function () { drag = false; });
    $('#go', root).addEventListener('click', function () {
      SFX.tap();
      if (!moved) { say.textContent = '먼저 반죽을 끌어서 틀로 옮겨 주세요'; return; }
      locked = true; this.disabled = true;
      var d = Math.hypot(cx - 170, cy - 210), score = d <= 16 ? 1 : clamp(1 - (d - 16) / 130, 0.25, 1), W = D.WORDS.shape;
      var word = score > 0.85 ? W.hi : score > 0.55 ? W.mid : W.low;
      say.textContent = word; if (score > 0.85) { SFX.star(); }
      setTimeout(function () { done({ score: score, word: word }); }, 1000);
    });
  }

  // 굽기: 바늘이 '노릇한' 구간(42~72 지점)에 있을 때 꺼낸다. 5.2초에 한 번 왕복. 색·향·소리 연출만, 화면에 숫자 없음.
  function miniBake(root, done) {
    var art = cur.b.art;
    root.innerHTML = '<div class="say panel" id="say">노릇해졌을 때 꺼내 주세요</div>' +
      '<div class="play"><svg viewBox="0 0 320 220" width="300" height="206"><defs><radialGradient id="ovg" cx=".5" cy=".62" r=".62"><stop offset="0" stop-color="#FFD27A" stop-opacity=".8"/><stop offset="1" stop-color="#FFB347" stop-opacity="0"/></radialGradient></defs>' +
      '<rect x="10" y="10" width="300" height="200" rx="22" fill="#202022"/>' +
      '<circle cx="46" cy="24" r="5" fill="#E6DA9C"/><circle cx="66" cy="24" r="5" fill="#B9BEC2"/><circle cx="86" cy="24" r="5" fill="#B9BEC2"/><rect x="200" y="19" width="90" height="10" rx="5" fill="#3a3a3e"/>' +
      '<rect x="30" y="38" width="260" height="140" rx="14" fill="#5a3a22"/><rect x="30" y="38" width="260" height="140" rx="14" fill="url(#ovg)"/>' +
      '<path d="M44 52 H276" stroke="#FF8A3D" stroke-width="3" stroke-dasharray="14 6" opacity=".85"/>' +
      '<path d="M30 110 H290" stroke="#B9BEC2" stroke-width="2" opacity=".3"/><path d="M30 172 H290" stroke="#B9BEC2" stroke-width="5"/><path d="M62 172 v6 M258 172 v6" stroke="#B9BEC2" stroke-width="4"/>' +
      '<g id="bk" transform="translate(95 78) scale(1.35)"></g>' +
      '<path d="M44 46 L84 46 L58 176 L44 176Z" fill="#fff" opacity=".08"/>' +
      '<rect x="70" y="187" width="180" height="11" rx="5.5" fill="#B9BEC2"/><circle cx="50" cy="196" r="5" fill="#E6DA9C"/><circle cx="270" cy="196" r="5" fill="#E6DA9C"/></svg></div>' +
      '<div class="aroma panel"><div class="steam" id="steam"><span>♨</span> <span style="animation-delay:.3s">♨</span> <span style="animation-delay:.6s">♨</span></div><div class="big" id="smell">지글지글…</div></div>' +
      '<div class="spacer"></div><div class="live" id="live">아직 말랑해요</div>' +
      '<div class="meterwrap"><div class="zone-label" id="zl">노릇한 구간</div><div class="bakebar" id="bar"><div class="zone" id="zn"></div><div class="needle" id="nd"></div></div></div>' +
      '<div style="height:10px"></div>' + actionBtn('꺼내기!');
    var bk = $('#bk', root), bar = $('#bar', root), zn = $('#zn', root), zl = $('#zl', root), nd = $('#nd', root), say = $('#say', root), smell = $('#smell', root), live = $('#live', root);
    var G0 = 0.42, G1 = 0.72, MID = 0.57, HALF = 0.15, t = 0, running = true, raf = 0, start = performance.now(), lastTick = 0, lastSmell = '', lastLive = '';
    var SWEEP = 5200;   // 바늘이 한 번 왕복하는 연출 속도(요리 시간과 무관)
    function layout() {
      var w = bar.clientWidth;
      zn.style.left = (w * G0) + 'px'; zn.style.width = (w * (G1 - G0)) + 'px';
      zl.style.left = (w * G0) + 'px'; zl.style.width = (w * (G1 - G0)) + 'px';
    }
    layout();
    var unwatch = watchResize(layout);
    function frame(now) {
      if (!running) { return; }
      var ph = ((now - start) / SWEEP) % 2; t = ph < 1 ? ph : 2 - ph;
      nd.style.left = (clamp(t, 0, 1) * (bar.clientWidth - 8)) + 'px';
      bk.innerHTML = breadInner(art, t);
      var inZone = t >= G0 && t <= G1;
      var s = t < 0.2 ? '말랑말랑… 반죽이 부풀고 있어요' : t < G0 ? '고소한 냄새가 올라오기 시작해요' : inZone ? '고소한 향이 가득 퍼져요!' : '냄새가 조금 진해졌어요…';
      var l = t < G0 ? '아직 노릇하지 않아요' : inZone ? '지금 노릇해요! 꺼내 보세요' : '조금 늦었어요…';
      if (s !== lastSmell) { lastSmell = s; smell.textContent = s; }
      if (l !== lastLive) { lastLive = l; live.textContent = l; live.classList.toggle('in', inZone); }
      if (now - lastTick > 420) { lastTick = now; SFX.sizzle(); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    cleanup = function () { running = false; cancelAnimationFrame(raf); unwatch(); };
    $('#go', root).addEventListener('click', function () {
      if (!running) { return; }
      running = false; cancelAnimationFrame(raf); this.disabled = true; SFX.ding();
      var d = Math.abs(t - MID), score = d <= HALF ? 1 : clamp(1 - (d - HALF) / 0.4, 0.25, 0.9), W = D.WORDS.bake;
      var word = d <= HALF ? W.hi : t < MID ? W.early : W.late;
      say.textContent = '띵! ' + word; smell.textContent = ''; live.textContent = word;
      setTimeout(function () { done({ score: score, word: word, tone: t }); }, 1200);
    });
  }

  /* ───────── 채점·결과 ───────── */
  // 단계마다 점수와 말을 따로 보여 준다(평균 문구로 뭉개지 않는다)
  function scoreCurrent() {
    var ingScore = clamp(1 - 0.34 * cur.ingWrong, 0.3, 1);
    var hands = [], sc = cur.sc;
    ['knead', 'shape'].forEach(function (k) { if (sc[k]) { hands.push(sc[k].score); } });
    var hand = hands.length ? hands.reduce(function (a, b) { return a + b; }, 0) / hands.length : 1;
    var bake = sc.bake ? sc.bake.score : 1;
    var total = (ingScore + hand + bake) / 3;
    return {
      stars: total >= 0.82 ? 3 : total >= 0.55 ? 2 : 1, total: total,
      ingWord: D.WORDS.ingredient[cur.ingWrong === 0 ? 0 : cur.ingWrong === 1 ? 1 : 2],
      kneadWord: sc.knead ? sc.knead.word : '', shapeWord: sc.shape ? sc.shape.word : '',
      bakeWord: sc.bake ? sc.bake.word : '', tone: sc.bake ? sc.bake.tone : 0.575
    };
  }
  function showResult() {
    var r = scoreCurrent(), c = cur.c, b = cur.b, run = save.run, date = todayStr(), stampMsg = '';
    if (!cur.applied) {
      cur.applied = true;
      save.stars += r.stars; save.heart += r.stars;
      var e = save.dex[b.id] || { made: 0, best: 0 }; e.made++; e.best = Math.max(e.best, r.stars); save.dex[b.id] = e;
      run.results.push({ b: b.id, c: c.id, stars: r.stars, line: c.reaction[r.stars] });
      run.idx++;
      if (b.id === todayBread().id && r.stars === 3 && save.stamps.indexOf(date) < 0) { save.stamps.push(date); stampMsg = '오늘의 빵 별 3개! 스탬프를 한 개 받았어요.'; }
      persist();
    }
    var last = run.idx >= RUN_LEN;
    render(photoOr('scene-order', sceneOrder()),
      '<div class="topbar"><span class="chip">' + b.name + '</span>' + soundBtn() + '</div>' +
      '<div class="bubble pop" style="margin-top:10px">' + c.reaction[r.stars] + '</div>' +
      '<div class="spacer"></div>' +
      '<div class="customer-wrap" style="margin-bottom:-22px">' + avatar(c, r.stars, 190) + '</div>' +
      '<div class="panel center pop" style="z-index:1"><div>' + breadSvg(b.art, r.tone, 96, 64) + '</div>' + starsHtml(r.stars) +
      '<div class="axes" style="margin-top:6px;text-align:left">' +
      '<div class="axis"><b>재료</b>' + r.ingWord + '</div>' +
      (r.kneadWord ? '<div class="axis"><b>반죽</b>' + r.kneadWord + '</div>' : '') +
      (r.shapeWord ? '<div class="axis"><b>성형</b>' + r.shapeWord + '</div>' : '') +
      (r.bakeWord ? '<div class="axis"><b>굽기</b>' + r.bakeWord + '</div>' : '') + '</div>' +
      '<div class="small" style="margin-top:6px">단골 마음이 올랐어요' + (stampMsg ? ' · ' + stampMsg : '') + '</div></div>' +
      '<div style="height:10px"></div><button class="btn block" id="next">' + (last ? '하루 마무리하기' : '다음 손님 맞이하기') + '</button>',
      function () {
        bindSound(); SFX.star();
        on('#next', function () { if (last) { showSettle(); } else { showOrder(); } });
      });
  }

  /* 하루 정산 */
  function showSettle() {
    var run = save.run;
    if (run) {
      save.lastDay = { n: run.n, date: run.date, results: run.results };
      save.runsToday[run.date] = (save.runsToday[run.date] || 0) + 1;
      save.dayNo = run.n + 1; save.run = null; persist();
    }
    var day = save.lastDay, sum = day.results.reduce(function (a, r) { return a + r.stars; }, 0);
    var locked = D.BREADS.filter(function (b) { return !b.open; }).length;
    var stampN = Math.min(save.stamps.length, STAMP_GOAL), stampRow = '', earned = save.stamps.indexOf(day.date) >= 0;
    for (var si = 0; si < STAMP_GOAL; si++) { stampRow += '<span class="stamp ' + (si < stampN ? 'on' : '') + '">' + (si < stampN ? '🍞' : '') + '</span>'; }
    var nb = breadOn(tomorrowStr());
    render(sceneSoft(),
      '<div class="topbar"><span class="chip">Day ' + day.n + ' 마감</span>' + soundBtn() + '</div>' +
      '<div class="panel" style="margin-top:8px"><h2>오늘도 수고했어요</h2>' +
      '<div class="summary"><div class="num">' + sum + '</div><div><b>오늘의 별 ★</b><div class="small">손님 ' + day.results.length + '명 · 지금까지 별 ' + save.stars + '개</div></div></div>' +
      '<div class="list" style="margin-top:6px">' + day.results.map(function (r) { var b = breadById(r.b), c = custById(r.c); return '<div class="li"><span>' + b.name + ' · ' + c.name + '</span>' + starsHtml(r.stars).replace('class="stars"', 'class="stars" style="font-size:20px"') + '</div>'; }).join('') + '</div></div>' +
      '<div class="panel" style="margin-top:8px">' + heartHtml() + '</div>' +
      '<div class="panel" style="margin-top:8px"><b>스탬프 ' + stampN + '/' + STAMP_GOAL + '</b><span class="small"> · ' + (earned ? '오늘 도장을 받았어요' : '오늘의 빵을 별 3개로 만들면 받아요') + '</span><div class="stamps">' + stampRow + '</div></div>' +
      '<div class="panel" style="margin-top:8px"><b>내일 예고</b><div class="preview"><div>' + breadSvg(nb.art, 0.575, 84, 56) + '</div>' +
      '<div><b>내일의 빵 · ' + nb.name + '</b><div class="small">내일도 새로운 손님이 찾아와요. 아직 잠긴 빵 ' + locked + '종은 곧 만나요.</div></div></div></div>' +
      '<div class="spacer"></div><div class="stack"><button class="btn green block" id="card">결과 카드 이미지 저장</button><button class="btn block" id="home">매장 홈으로</button></div>',
      function () {
        bindSound();
        on('#card', function () { downloadCard(day, sum); });
        on('#home', showHome);
      });
  }
  // 글자 폭을 재서 줄을 나눈다 (단어 단위, 한 단어가 너무 길면 글자 단위)
  function wrapLines(g, text, maxW, maxLines) {
    var words = String(text).split(' '), lines = [], line = '';
    function push(s) { lines.push(s); }
    words.forEach(function (w) {
      var tryLine = line ? line + ' ' + w : w;
      if (g.measureText(tryLine).width <= maxW) { line = tryLine; return; }
      if (line) { push(line); line = ''; }
      if (g.measureText(w).width <= maxW) { line = w; return; }
      w.split('').forEach(function (ch) {
        if (g.measureText(line + ch).width <= maxW) { line += ch; } else { push(line); line = ch; }
      });
    });
    if (line) { push(line); }
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var lastL = lines[maxLines - 1];
      while (lastL.length > 1 && g.measureText(lastL + '…').width > maxW) { lastL = lastL.slice(0, -1); }
      lines[maxLines - 1] = lastL + '…';
    }
    return lines;
  }
  // 결과 카드: 빵 이름·별·손님 한 줄·매장명만. 이름·전화·위치 정보 없음.
  function downloadCard(day, sum) {
    var cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; var g = cv.getContext('2d');
    var font = "'Pretendard','Noto Sans KR','Apple SD Gothic Neo',sans-serif";
    g.fillStyle = '#D9C5B0'; g.fillRect(0, 0, 1080, 1350); g.fillStyle = '#E6DA9C'; g.fillRect(0, 0, 1080, 130);
    g.fillStyle = '#202022'; g.textAlign = 'center'; g.font = '800 64px ' + font; g.fillText(D.TEXT.gameTitle + ' · ' + D.TEXT.gameSub, 540, 88);
    g.font = '700 48px ' + font; g.fillText('Day ' + day.n + ' 결과', 540, 210);
    var y = 320;
    day.results.forEach(function (r) {
      g.fillStyle = '#F4F4F2'; g.fillRect(70, y - 60, 940, 275);
      g.fillStyle = '#202022'; g.textAlign = 'left'; g.font = '800 50px ' + font; g.fillText(breadById(r.b).name, 100, y);
      g.fillStyle = '#D9A21B'; g.font = '700 56px ' + font; g.fillText('★'.repeat(r.stars) + '☆'.repeat(3 - r.stars), 100, y + 62);
      g.fillStyle = '#5b5750'; g.font = '500 32px ' + font;
      wrapLines(g, custById(r.c).name + ': ' + r.line, 880, 3).forEach(function (ln, i) { g.fillText(ln, 100, y + 114 + i * 40); });
      y += 290;
    });
    g.textAlign = 'center'; g.fillStyle = '#202022'; g.font = '800 54px ' + font; g.fillText('오늘의 별 ' + sum + '개 · ' + heartInfo().title, 540, 1190);
    g.font = '500 32px ' + font; g.fillText('매장에서 직접 만나요 — ' + D.STORE.name, 540, 1250);
    g.fillText(D.STORE.address, 540, 1294);
    cv.toBlob(function (blob) {
      if (!blob) { toast('이미지를 만들지 못했어요.'); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'moamoa-day' + day.n + '.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); toast('결과 카드를 저장했어요');
    }, 'image/png');
  }

  /* 도감 */
  function showDex(back) {
    var openN = openBreads().length;
    render(sceneSoft(),
      '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">←</button><span class="chip">📖 모아모아 빵 도감 ' + openN + '/' + D.BREADS.length + '</span>' + soundBtn() + '</div>' +
      '<div class="scroll" style="margin-top:10px">' + D.CATS.map(function (cat) {
        var items = D.BREADS.filter(function (b) { return b.cat === cat.id; });
        return '<div class="catname">' + cat.name + '</div><div class="dexgrid">' + items.map(function (b) {
          if (!b.open) { return '<div class="dcard locked">' + silhouette(b.cat) + '<span>' + b.name + '</span><span class="small">🔒 곧 만나요</span></div>'; }
          var e = save.dex[b.id];
          return '<button class="dcard" data-b="' + b.id + '">' + breadSvg(b.art, 0.575, 72, 48) + '<span>' + b.name + '</span><span class="small">' + (e ? '별 기록 ' + '★'.repeat(e.best) : '아직 안 만들었어요') + '</span></button>';
        }).join('') + '</div>';
      }).join('') +
      '<div class="panel small">' + D.TEXT.notice + '<br>' + D.TEXT.allergy + '</div></div>',
      function () {
        bindSound();
        on('[data-act="back"]', back);
        on('[data-b]', function (n) { dexDetail(breadById(n.getAttribute('data-b'))); });
      });
  }
  function dexDetail(b) {
    var e = save.dex[b.id];
    modal('<div class="center">' + breadSvg(b.art, 0.575, 120, 80) + '<h2>' + b.name + '</h2><div class="small">' + b.desc + '</div>' +
      '<div class="small">' + (e ? '만든 횟수 ' + e.made + ' · 별 기록 ' + starsHtml(e.best) : '아직 만들어 보지 않았어요') + '</div></div>' +
      '<div class="stack">' + b.ingredients.map(function (x) { return '<div class="icard picked big" style="min-height:0"><span class="n">' + x.icon + ' ' + x.name + '</span><span class="w">' + x.why + '</span></div>'; }).join('') + '</div>' +
      '<div class="small" style="line-height:1.6">' + D.TEXT.notice + '<br>' + D.TEXT.allergy + '</div><button class="btn block" data-act="x">닫기</button>',
      function (m, close) { on('[data-act="x"]', close, m); });
  }

  /* 설정·안내 */
  function showSettings(back) {
    render(sceneSoft(),
      '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">←</button><span class="chip">설정·안내</span><span></span></div>' +
      '<div class="scroll" style="margin-top:10px"><div class="panel">' +
      '<div class="toggle"><span>소리 (효과음)</span><button class="sw ' + (save.settings.sound ? 'on' : '') + '" data-act="sound">' + (save.settings.sound ? '켜짐' : '꺼짐') + '</button></div>' +
      '<div class="toggle"><span>크리스마스 장식</span><button class="sw ' + (xmasOn() ? 'on' : '') + '" data-act="xmas">' + (xmasOn() ? '켜짐' : '꺼짐') + '</button></div></div>' +
      '<div class="panel"><b>안내</b><p class="small" style="margin:4px 0">' + D.TEXT.notice + '</p><p class="small" style="margin:4px 0">' + D.TEXT.allergy + '</p><p class="small" style="margin:4px 0">' + D.TEXT.deviceDate + '</p></div>' +
      '<div class="panel"><b>매장 정보</b><p class="small" style="margin:4px 0">' + D.STORE.name + '<br>' + D.STORE.address + '</p></div>' +
      '<div class="panel"><b>저장</b><p class="small" style="margin:4px 0">진행 상황은 이 기기의 브라우저에만 저장돼요.</p><button class="btn sub block" data-act="reset">저장 초기화</button></div></div>',
      function () {
        on('[data-act="back"]', back);
        on('[data-act="sound"]', function () { save.settings.sound = !save.settings.sound; persist(); showSettings(back); });
        on('[data-act="xmas"]', function () { save.settings.xmas = !xmasOn(); persist(); showSettings(back); });
        on('[data-act="reset"]', function () {
          modal('<h3>저장을 지울까요?</h3><p class="small" style="margin:0">도감·별·단골 마음이 모두 처음으로 돌아가요.</p><div class="row"><button class="btn sub" data-act="no">아니요</button><button class="btn" data-act="yes">지울게요</button></div>',
            function (m, close) {
              on('[data-act="no"]', close, m);
              on('[data-act="yes"]', function () { try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ } save = defSave(); persist(); close(); showTitle(); }, m);
            });
        });
      });
  }

  /* ───────── 7) 시작 ───────── */
  window.__moamoa = { save: function () { return save; }, show: { title: showTitle, home: showHome } }; // 점검용
  showTitle();
})();
