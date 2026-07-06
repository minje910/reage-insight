/* ============================================================
   RE:AGE — 검색 쿠키 기반 역노화 인사이트 큐레이터
   · 맞춤 1개 인사이트 카드
   · /api/trends  검색 데이터(트렌드) 연동
   · /api/send    Gmail 전송 연동
   저장소: localStorage (쿠키 시뮬레이션)
   ============================================================ */

const STORE_KEY = 'ra_profile';
const COOKIE_KEY = 'ra_search_cookie';

let profile = null;
let searchCookie = {};
let trendWeights = {};      // { cardId: boostScore }
let onboarding = { wealth: null };

/* 트렌드 그룹명 → 카드 id 매핑 */
const TREND_TO_CARD = {
  '줄기세포': 'stemcell', '세놀리틱스': 'senolytics', '호르몬': 'hormone',
  '텔로미어': 'telomere', 'NMN': 'nmn', '단식': 'autophagy',
  '피부재생': 'skincare', '장수클리닉': 'clinic'
};

const $ = (s) => document.querySelector(s);
const overlay = $('#overlay');
const app = $('#app');

/* ============================================================ 1. 초기화 */
function init() {
  loadCookie();
  const saved = localStorage.getItem(STORE_KEY);
  if (saved) { profile = JSON.parse(saved); showApp(); }
  else { overlay.classList.remove('hidden'); }
  bindOnboarding();
}

/* ============================================================ 2. 온보딩 */
function bindOnboarding() {
  const name = $('#f-name'), age = $('#f-age'), go = $('#f-go');
  document.querySelectorAll('.opt').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.opt').forEach((o) => o.classList.remove('sel'));
      el.classList.add('sel');
      onboarding.wealth = el.dataset.wealth;
      validate();
    });
  });
  [name, age].forEach((el) => el.addEventListener('input', validate));
  function validate() {
    go.disabled = !(name.value.trim() && +age.value >= 10 && +age.value <= 120 && onboarding.wealth);
  }
  go.addEventListener('click', () => {
    const nm = name.value.trim(), ag = +age.value;
    if (!nm || ag < 10 || ag > 120 || !onboarding.wealth) { $('#f-err').classList.add('show'); return; }
    profile = {
      name: nm, age: ag, wealth: onboarding.wealth,
      persona: classifyPersona(ag), joinedAt: new Date().toISOString()
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(profile));
    overlay.classList.add('hidden');
    showApp();
  });
}

function classifyPersona(age) {
  if (age >= 50 && age <= 69) return 'senior';
  if (age >= 30 && age <= 49) return 'active';
  if (age < 30) return 'active';
  return 'senior';
}

/* ============================================================ 3. 검색 쿠키 */
function loadCookie() {
  try { searchCookie = JSON.parse(localStorage.getItem(COOKIE_KEY)) || {}; }
  catch { searchCookie = {}; }
}
function saveCookie() { localStorage.setItem(COOKIE_KEY, JSON.stringify(searchCookie)); }
function addSearch(term) {
  const t = term.trim().toLowerCase();
  if (!t) return;
  t.split(/\s+/).forEach((tok) => { if (tok) searchCookie[tok] = (searchCookie[tok] || 0) + 1; });
  saveCookie();
}

/* ============================================================ 4. 검색 데이터 API */
async function fetchTrends(keyword) {
  try {
    const res = await fetch('/api/trends?keyword=' + encodeURIComponent(keyword || ''));
    if (!res.ok) throw new Error('bad');
    const data = await res.json();
    trendWeights = {};
    (data.trends || []).forEach((t) => {
      const id = TREND_TO_CARD[t.keyword];
      if (id) trendWeights[id] = t.score;   // 0~100
    });
    renderTrendStrip(data);
    return data;
  } catch (e) {
    // 백엔드 미실행(정적 파일로 열람) 시 조용히 스킵
    $('#trend-strip').style.display = 'none';
    return null;
  }
}

function renderTrendStrip(data) {
  const strip = $('#trend-strip');
  const top = (data.trends || []).slice(0, 5);
  if (!top.length) { strip.style.display = 'none'; return; }
  const src = data.source === 'naver_datalab' ? '네이버 데이터랩' : '데모 데이터';
  strip.style.display = 'block';
  strip.innerHTML =
    `<div class="trend-head">🔥 실시간 검색 급상승 <small>(${src})</small></div>` +
    `<div class="trend-items">` +
    top.map((t) => `<span class="trend-pill">${t.keyword}<b>${t.score}</b></span>`).join('') +
    `</div>`;
}

/* ============================================================ 5. 추천 엔진 */
function scoreCard(card) {
  let score = 0; const reasons = [];
  if (card.persona === profile.persona) score += 40;
  else if (card.persona === 'both') score += 22;
  else score += 6;

  const priceLevel = card.price.length;
  if (profile.wealth === 'high') score += priceLevel * 5;
  else if (profile.wealth === 'mid') score += (priceLevel === 2 || priceLevel === 3) ? 12 : 4;
  else score += priceLevel <= 2 ? 14 : 1;
  if (profile.persona === 'senior' && profile.wealth === 'high' && priceLevel >= 3) score += 18;

  let cookieHits = 0; const matched = [];
  for (const [term, count] of Object.entries(searchCookie)) {
    for (const tag of card.tags) {
      if (tag.includes(term) || term.includes(tag)) {
        cookieHits += count;
        if (!matched.includes(tag)) matched.push(tag);
        break;
      }
    }
  }
  score += cookieHits * 16;

  // 검색 데이터(트렌드) 가중
  const tw = trendWeights[card.id] || 0;
  score += tw * 0.25;

  if (matched.length) reasons.push(`최근 검색한 <b>${matched.slice(0, 3).join(', ')}</b>와 연관`);
  if (card.persona === profile.persona) reasons.push(profile.persona === 'senior' ? '5060 시니어 맞춤' : '3040 건강관리 맞춤');
  if (tw >= 70) reasons.push(`실시간 검색 급상승 <b>${Math.round(tw)}pt</b>`);
  if (profile.wealth === 'high' && priceLevel >= 3) reasons.push('프리미엄 케어 추천');
  if (profile.wealth === 'low' && priceLevel <= 2) reasons.push('부담 없이 시작 가능');

  return { score, reasons, cookieHits };
}

function getBestCard() {
  return CARDS.map((c) => ({ card: c, ...scoreCard(c) }))
    .sort((a, b) => b.score - a.score)[0];
}

/* ============================================================ 6. 렌더 */
function showApp() {
  app.style.display = 'flex';
  renderProfileChip();
  renderCookieBar();
  renderChips();
  fetchTrends('').then(renderInsight);   // 최초 진입 시 트렌드 로드 후 인사이트
  bindSearch();
  bindEmail();
}

function renderProfileChip() {
  const p = profile;
  const wealthLabel = { low: '알뜰형', mid: '표준형', high: '프리미엄' }[p.wealth];
  const personaLabel = p.persona === 'senior' ? '5060 시니어' : '3040·건강관리';
  $('#profile-chip').innerHTML = `<b>${p.name}</b>님 · ${p.age}세<br>${personaLabel} · ${wealthLabel}`;
}

function renderCookieBar() {
  const bar = $('#cookie-bar');
  const entries = Object.entries(searchCookie).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!entries.length) {
    bar.innerHTML = `🍪 <span>아직 검색 기록이 없어요. <b>검색하기</b>로 관심사를 알려주시면 인사이트가 정교해져요.</span>`;
    return;
  }
  const kws = entries.map(([k, v]) => `<span class="k">${k}<sup>×${v}</sup></span>`).join(' · ');
  bar.innerHTML = `🍪 <b>검색 쿠키</b> 기반 &nbsp; ${kws}`;
}

function renderChips() {
  const suggestions = profile.persona === 'senior'
    ? ['줄기세포', '갱년기 호르몬', '노화세포', '무릎 관절', '건강검진', '장수 클리닉']
    : ['간헐적 단식', 'NMN 영양제', '피부 콜라겐', '수면 관리', '스마트워치', '체중 관리'];
  $('#chips').innerHTML = suggestions.map((s) => `<button class="chip" data-term="${s}">${s}</button>`).join('');
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => runSearch(c.dataset.term)));
}

let currentCard = null;

function renderInsight() {
  const best = getBestCard();
  currentCard = best.card;
  const c = best.card;
  const matchPct = Math.min(99, 60 + Math.round(best.score));
  const reason = best.reasons.length ? `<div class="reason">💡 ${best.reasons.join(' · ')}</div>` : '';

  const pt = $('#persona-tag');
  if (profile.persona === 'senior') { pt.className = 'persona-tag persona-senior'; pt.textContent = '👑 경제력을 갖춘 5060 시니어 맞춤 인사이트'; }
  else { pt.className = 'persona-tag persona-active'; pt.textContent = '💪 건강관리에 진심인 3040 맞춤 인사이트'; }

  $('#insight').innerHTML = `
    <article class="card insight">
      <div class="thumb">
        <img src="${c.image}" alt="${c.title}">
        <span class="rank">🏆 오늘의 맞춤 인사이트</span>
        <span class="price">${c.price}</span>
        <span class="match">적합도 ${matchPct}%</span>
      </div>
      <div class="body">
        <div class="cat">${c.category}</div>
        <h4>${c.title}</h4>
        <div class="sub">${c.subtitle}</div>
        <ul>${c.highlights.map((h) => `<li>${h}</li>`).join('')}</ul>
        <div class="desc">${c.desc}</div>
        ${reason}
      </div>
    </article>`;
}

/* ============================================================ 7. 검색 */
function bindSearch() {
  const input = $('#search-input');
  $('#search-btn').addEventListener('click', () => runSearch(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(input.value); });
  $('#reset-btn').addEventListener('click', resetAll);
  $('#profile-chip').addEventListener('click', resetAll);
}

async function runSearch(term) {
  term = (term || '').trim();
  if (!term) return;
  addSearch(term);
  $('#search-input').value = '';
  renderCookieBar();
  await fetchTrends(term);     // 검색 데이터 API 갱신
  renderInsight();
  toast(`🍪 "${term}" 검색 누적 · 인사이트 갱신`);
  $('#insight').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================ 8. Gmail 전송 */
function buildEmailHtml(card) {
  return `
  <div style="font-family:Segoe UI,Malgun Gothic,sans-serif;max-width:560px;margin:auto;background:#0b1120;color:#e8eefc;border-radius:16px;overflow:hidden;border:1px solid #26324d">
    <div style="padding:18px 20px;background:#111a2e;border-bottom:1px solid #26324d">
      <span style="font-weight:800;font-size:18px;color:#5eead4">RE:AGE</span>
      <span style="color:#94a3c4;font-size:12px"> · 오늘의 역노화 인사이트</span>
    </div>
    <img src="cid:none" style="display:none">
    <div style="padding:22px 20px">
      <div style="font-size:11px;font-weight:700;color:#5eead4;text-transform:uppercase">${card.category}</div>
      <h2 style="margin:6px 0 4px;font-size:22px">${card.title}</h2>
      <div style="color:#94a3c4;font-size:13px;margin-bottom:14px">${card.subtitle}</div>
      <ul style="padding-left:18px;color:#cdd7ee;font-size:14px;line-height:1.7">
        ${card.highlights.map((h) => `<li>${h}</li>`).join('')}
      </ul>
      <p style="color:#94a3c4;font-size:13px;line-height:1.7;border-top:1px solid #26324d;padding-top:14px">${card.desc}</p>
      <div style="margin-top:16px;font-size:12px;color:#5eead4">${profile.name}님(${profile.age}세)의 맞춤 추천 · 적합도 최상위</div>
    </div>
    <div style="padding:14px 20px;background:#111a2e;color:#64748b;font-size:11px">본 메일은 RE:AGE 검색 쿠키 기반으로 자동 큐레이션되었습니다.</div>
  </div>`;
}

function bindEmail() {
  const to = $('#email-to');
  if (!to.value) to.value = 'dongje.lee@gmail.com';
  $('#email-btn').addEventListener('click', async () => {
    const addr = to.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { toast('올바른 이메일을 입력하세요'); return; }
    if (!currentCard) { toast('먼저 인사이트를 생성하세요'); return; }
    const btn = $('#email-btn');
    btn.disabled = true; btn.textContent = '전송 중…';
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: addr,
          subject: `[RE:AGE] ${currentCard.title} — 오늘의 역노화 인사이트`,
          html: buildEmailHtml(currentCard)
        })
      });
      const data = await res.json();
      toast(data.ok ? `📧 ${data.message}` : `실패: ${data.message}`);
    } catch (e) {
      toast('⚠ 백엔드(server.py) 미실행 — python server.py 로 실행하세요');
    } finally {
      btn.disabled = false; btn.textContent = '📧 메일로 받기';
    }
  });
}

/* ============================================================ 9. 유틸 */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
function resetAll() {
  if (!confirm('가입 정보와 검색 쿠키를 모두 초기화할까요?')) return;
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(COOKIE_KEY);
  location.reload();
}

document.addEventListener('DOMContentLoaded', init);
