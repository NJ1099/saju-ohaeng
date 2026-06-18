// ============================================================
//  saju · engine/astro.js
//  천문 계산 — 율리우스일, Meeus 태양 황경, ΔT, 24절기 솔버.
//  시간 규약: JD는 모두 "UT(세계시) 기준"의 율리우스일.
//             태양위치 공식은 TT(지구시)를 쓰므로 ΔT로 변환.
//  KST = UT + 9h 는 호출부(saju.js)에서 처리.
// ============================================================

const DEG = Math.PI / 180;
const TROPICAL = 365.2422; // 회귀년(일)

export function mod360(x) {
  return ((x % 360) + 360) % 360;
}

/** 그레고리력 → 율리우스일(JD). hour/min/sec 는 UT 기준. */
export function toJD(y, m, d, hour = 0, min = 0, sec = 0) {
  let Y = y, M = m;
  if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4); // 그레고리력 보정 (1582-10-15 이후)
  const dayFrac = d + (hour + min / 60 + sec / 3600) / 24;
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + dayFrac + B - 1524.5;
}

/** 율리우스일(JD) → {year, month, day, hour, min, sec} (그레고리력) */
export function fromJD(jd) {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let A;
  if (z < 2299161) A = z;
  else {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    A = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const dayF = B - D - Math.floor(30.6001 * E) + f;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const day = Math.floor(dayF);
  let rem = (dayF - day) * 24;
  let hour = Math.floor(rem);
  rem = (rem - hour) * 60;
  let min = Math.floor(rem);
  let sec = Math.round((rem - min) * 60);
  if (sec >= 60) { sec -= 60; min += 1; }
  if (min >= 60) { min -= 60; hour += 1; }
  return { year, month, day, hour, min, sec };
}

/** 정수 율리우스일수(JDN) — 일주(日柱) 60갑자 계산용. 정오 기준. */
export function jdnFromYMD(y, m, d) {
  return Math.floor(toJD(y, m, d, 12, 0, 0) + 0.5);
}

/**
 * ΔT (TT − UT), 초 단위. Espenak & Meeus(2006) 다항식.
 * 약 1800~2150 범위 커버. decYear = 연도(소수 가능).
 */
export function deltaT(decYear) {
  const y = decYear;
  let t, dt;
  if (y < 1860) {
    t = y - 1800;
    dt = 13.72 - 0.332447 * t + 0.0068612 * t ** 2 + 0.0041116 * t ** 3
      - 0.00037436 * t ** 4 + 0.0000121272 * t ** 5
      - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7;
  } else if (y < 1900) {
    t = y - 1860;
    dt = 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3
      - 0.0004473624 * t ** 4 + t ** 5 / 233174;
  } else if (y < 1920) {
    t = y - 1900;
    dt = -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
  } else if (y < 1941) {
    t = y - 1920;
    dt = 21.20 + 0.84493 * t - 0.076100 * t ** 2 + 0.0020936 * t ** 3;
  } else if (y < 1961) {
    t = y - 1950;
    dt = 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
  } else if (y < 1986) {
    t = y - 1975;
    dt = 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
  } else if (y < 2005) {
    t = y - 2000;
    dt = 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3
      + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
  } else if (y < 2050) {
    t = y - 2000;
    dt = 62.92 + 0.32217 * t + 0.005589 * t ** 2;
  } else {
    dt = -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
  }
  return dt;
}

// VSOP87 (절단판) — 지구 일심황경 급수항 [A, B, C]; value = A·cos(B + C·τ),
// τ = J2000부터의 율리우스 천년(millennia). 단위 1e-8 rad. Meeus 부록 III.
const VSOP_L0 = [
  [175347046, 0, 0], [3341656, 4.6692568, 6283.0758500], [34894, 4.62610, 12566.15170],
  [3497, 2.7441, 5753.3849], [3418, 2.8289, 3.5231], [3136, 3.6277, 77713.7715],
  [2676, 4.4181, 7860.4194], [2343, 6.1352, 3930.2097], [1324, 0.7425, 11506.7698],
  [1273, 2.0371, 529.6910], [1199, 1.1096, 1577.3435], [990, 5.233, 5884.927],
  [902, 2.045, 26.298], [857, 3.508, 398.149], [780, 1.179, 5223.694],
  [753, 2.533, 5507.553], [505, 4.583, 18849.228], [492, 4.205, 775.523],
  [357, 2.920, 0.067], [317, 5.849, 11790.629], [284, 1.899, 796.298],
  [271, 0.315, 10977.079], [243, 0.345, 5486.778], [206, 4.806, 2544.314],
  [205, 1.869, 5573.143], [202, 2.458, 6069.777], [156, 0.833, 213.299],
  [132, 3.411, 2942.463], [126, 1.083, 20.775], [115, 0.645, 0.980],
  [103, 0.636, 4694.003], [102, 0.976, 15720.839], [102, 4.267, 7.114],
  [99, 6.21, 2146.17], [98, 0.68, 155.42], [86, 5.98, 161000.69],
  [85, 1.30, 6275.96], [85, 3.67, 71430.70],
];
const VSOP_L1 = [
  [628331966747, 0, 0], [206059, 2.678235, 6283.075850], [4303, 2.635100, 12566.151700],
  [425, 1.590, 3.523], [119, 5.796, 26.298], [109, 2.966, 1577.344],
  [93, 2.59, 18849.23], [72, 1.14, 529.69], [68, 1.87, 398.15],
  [67, 4.41, 5507.55], [59, 2.89, 5223.69], [56, 2.17, 155.42],
  [45, 0.40, 796.30], [36, 0.47, 775.52], [29, 2.65, 7.11],
  [21, 5.34, 0.98], [19, 1.85, 5486.78], [19, 4.97, 213.30],
  [17, 2.99, 6275.96], [16, 0.03, 2544.31],
];
const VSOP_L2 = [
  [52919, 0, 0], [8720, 1.0721, 6283.0758], [309, 0.867, 12566.152],
  [27, 0.05, 3.52], [16, 5.19, 26.30], [16, 3.68, 155.42],
  [10, 0.76, 18849.23], [9, 2.06, 77713.77], [7, 0.83, 775.52], [5, 4.66, 1577.34],
];
const VSOP_L3 = [[289, 5.844, 6283.076], [35, 0, 0], [17, 5.49, 12566.15], [3, 5.20, 155.42]];
const VSOP_L4 = [[114, 3.142, 0], [8, 4.13, 6283.08]];
const VSOP_L5 = [[1, 3.14, 0]];

function vsopSum(terms, tau) {
  let s = 0;
  for (const [a, b, c] of terms) s += a * Math.cos(b + c * tau);
  return s;
}

/**
 * 태양의 겉보기 황경(apparent geocentric longitude), 도(°) [0,360).
 * VSOP87 절단 급수 기반 고정밀(~0.0005°≈1분 미만). jde = TT 기준 JD.
 */
export function sunApparentLongitude(jde) {
  const tau = (jde - 2451545.0) / 365250;
  const L = vsopSum(VSOP_L0, tau) + vsopSum(VSOP_L1, tau) * tau
    + vsopSum(VSOP_L2, tau) * tau ** 2 + vsopSum(VSOP_L3, tau) * tau ** 3
    + vsopSum(VSOP_L4, tau) * tau ** 4 + vsopSum(VSOP_L5, tau) * tau ** 5;
  const earthLonDeg = mod360((L * 1e-8) / DEG); // 지구 일심황경
  let theta = mod360(earthLonDeg + 180); // 태양 기하 지심황경
  const T = (jde - 2451545.0) / 36525;
  // FK5 보정
  const lambdaP = (theta - 1.397 * T - 0.00031 * T * T) * DEG;
  theta += -0.09033 / 3600 + (0.03916 / 3600) * (Math.cos(lambdaP) - Math.sin(lambdaP));
  // 장동(주항) + 광행차
  const omega = (125.04452 - 1934.136261 * T) * DEG;
  const lambda = theta - 0.00478 * Math.sin(omega) - 0.00569;
  return mod360(lambda);
}

/** UT 기준 JD에서의 태양 겉보기 황경. (ΔT로 TT 변환 후 계산) */
export function sunLongitudeAtUT(jdUT, decYear) {
  const jde = jdUT + deltaT(decYear) / 86400;
  return sunApparentLongitude(jde);
}

/**
 * 태양 황경이 targetLon(°)에 도달하는 순간의 JD(UT)를 구한다.
 * approxYear 의 해당 절기를 찾도록 초기추정 후 뉴턴식 수렴.
 */
export function solarTermJD(approxYear, targetLon) {
  // 1월1일 황경은 약 280.6° → targetLon 까지의 일수 추정
  const jan1 = toJD(approxYear, 1, 1, 0, 0, 0);
  const daysGuess = mod360(targetLon - 280.6) * (TROPICAL / 360);
  let jd = jan1 + daysGuess;
  for (let i = 0; i < 8; i++) {
    const lam = sunLongitudeAtUT(jd, approxYear);
    let diff = mod360(targetLon - lam + 180) - 180; // [-180,180]
    jd += diff * (TROPICAL / 360);
    if (Math.abs(diff) < 1e-6) break;
  }
  return jd;
}

/** JD(UT) → KST 민간 날짜번호(정수). KST 자정 기준 day-count. */
export function kstDayNumber(jdUT) {
  return Math.floor(jdUT + 9 / 24 + 0.5);
}

/** 연도 소수 표현 (ΔT용). */
export function decimalYear(y, m) {
  return y + (m - 0.5) / 12;
}
