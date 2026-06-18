// ============================================================
//  saju · engine/constants.js
//  명리(命理) 기초 표준 데이터 테이블 — 천간·지지·오행·지장간·
//  공망·삼합·오호둔·오서둔·태극귀인·십성 규칙.
//
//  모든 인덱스 규약:
//    천간(stem)  0=갑 1=을 2=병 3=정 4=무 5=기 6=경 7=신 8=임 9=계
//    지지(branch)0=자 1=축 2=인 3=묘 4=진 5=사 6=오 7=미 8=신 9=유 10=술 11=해
//  ESM 모듈 — 브라우저(<script type=module>)와 Node 양쪽에서 import 가능.
// ============================================================

/** 천간 10 — 한글 */
export const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
/** 천간 10 — 한자 */
export const STEMS_HANJA = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
/** 지지 12 — 한글 */
export const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
/** 지지 12 — 한자 */
export const BRANCHES_HANJA = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 오행 5 */
export const ELEMENTS = ['목', '화', '토', '금', '수'];
export const ELEMENTS_HANJA = { 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' };
/** 오행별 색상 토큰 (UI에서 사용) — 동양 전통 오색 기반 */
export const ELEMENT_COLOR = {
  목: '#0AC17B', // 청(靑) → 모던 그린
  화: '#F04452', // 적(赤)
  토: '#C18A3D', // 황(黃) → 흙색
  금: '#9AA3AE', // 백(白) → 메탈 그레이
  수: '#3182F6', // 흑(黑) → 딥 블루(토스블루)
};

/** 천간 → 오행 (인덱스 0~9) */
export const STEM_ELEMENT = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
/** 천간 → 음양 (true=양/陽) : 갑병무경임=양, 을정기신계=음 */
export const STEM_YANG = [true, false, true, false, true, false, true, false, true, false];

/** 지지 → 오행 (인덱스 0~11) : 자수 축토 인목 묘목 진토 사화 오화 미토 신금 유금 술토 해수 */
export const BRANCH_ELEMENT = ['수', '토', '목', '목', '토', '화', '화', '토', '금', '금', '토', '수'];
/** 지지 → 음양 (true=양) : 양지=子寅辰午申戌, 음지=丑卯巳未酉亥 */
export const BRANCH_YANG = [true, false, true, false, true, false, true, false, true, false, true, false];

/**
 * 지장간(地藏干) — 각 지지에 숨은 천간 [여기, (중기), 정기].
 * 정기(본기)는 항상 배열의 마지막 원소. 분석에서 본기는 가중 1.0, 그 외는 보조.
 */
export const HIDDEN_STEMS = {
  자: ['임', '계'],
  축: ['계', '신', '기'],
  인: ['무', '병', '갑'],
  묘: ['갑', '을'],
  진: ['을', '계', '무'],
  사: ['무', '경', '병'],
  오: ['병', '기', '정'],
  미: ['정', '을', '기'],
  신: ['무', '임', '경'],
  유: ['경', '신'],
  술: ['신', '정', '무'],
  해: ['무', '갑', '임'],
};

/**
 * 지장간 가중치(司令 비례, 합계 30일 기준의 근사) — 본기에 가장 큰 가중.
 * 오행 분포를 "정밀 모드"로 계산할 때 사용.
 */
export const HIDDEN_WEIGHTS = {
  자: [10, 20],
  축: [9, 3, 18],
  인: [7, 7, 16],
  묘: [10, 20],
  진: [9, 3, 18],
  사: [7, 7, 16],
  오: [10, 9, 11],
  미: [9, 3, 18],
  신: [7, 7, 16],
  유: [10, 20],
  술: [9, 3, 18],
  해: [7, 7, 16],
};

/**
 * 공망(空亡) — 60갑자를 6개 순(旬)으로 나눈 각 순의 공망 2지지.
 * 일주(또는 년주)의 60갑자 인덱스 → 순 인덱스(0~5) → 공망.
 *   갑자순(0~9)   → 술해
 *   갑술순(10~19) → 신유
 *   갑신순(20~29) → 오미
 *   갑오순(30~39) → 진사
 *   갑진순(40~49) → 인묘
 *   갑인순(50~59) → 자축
 */
export const GONGMANG_BY_SUN = [
  ['술', '해'],
  ['신', '유'],
  ['오', '미'],
  ['진', '사'],
  ['인', '묘'],
  ['자', '축'],
];

/**
 * 삼합(三合) 국(局) — [지지3, 오행국, 묘(墓)=화개글자]
 * 화개성(華蓋星) 판단의 근거: 해당 그룹의 墓 글자가 화개.
 */
export const SAMHAP = [
  { branches: ['신', '자', '진'], element: '수', hwagae: '진' },
  { branches: ['인', '오', '술'], element: '화', hwagae: '술' },
  { branches: ['사', '유', '축'], element: '금', hwagae: '축' },
  { branches: ['해', '묘', '미'], element: '목', hwagae: '미' },
];

/** 사고(四庫) — 辰戌丑未 (오행의 창고) */
export const SAGO = ['진', '술', '축', '미'];
export const SAGO_MEANING = {
  진: '수고(水庫) — 숨은 지혜, 현학',
  술: '화고(火庫) — 종교성, 신념',
  축: '금고(金庫) — 신비, 내면의 응축',
  미: '목고(木庫) — 영수, 치유와 성장',
};

/** 사정성(四正星) — 子午卯酉 : 영적 각성·감각의 예민함·변화의 문 */
export const SAJEONG = ['자', '오', '묘', '유'];

/**
 * 태극귀인(太極貴人) — 일간(천간) → 해당 지지가 사주에 있으면 성립.
 * 프롬프트 규약 그대로.
 */
export const TAEGEUK = {
  갑: ['자', '오'], 을: ['자', '오'],
  병: ['묘', '유'], 정: ['묘', '유'],
  무: ['진', '술', '축', '미'], 기: ['진', '술', '축', '미'],
  경: ['인', '해'], 신: ['인', '해'],
  임: ['사', '신'], 계: ['사', '신'],
};

/**
 * 오호둔(五虎遁) — 년간 → 寅월(첫 월)의 천간 시작 인덱스.
 * 공식: startStem = (yearStem % 5) * 2 + 2, mod 10.
 *   甲己→丙(2) 乙庚→戊(4) 丙辛→庚(6) 丁壬→壬(8) 戊癸→甲(0)
 */
export function monthStemStart(yearStemIdx) {
  return ((yearStemIdx % 5) * 2 + 2) % 10;
}

/**
 * 오서둔(五鼠遁) — 일간 → 子시의 천간 시작 인덱스.
 * 공식: startStem = (dayStem % 5) * 2, mod 10.
 *   甲己→甲(0) 乙庚→丙(2) 丙辛→戊(4) 丁壬→庚(6) 戊癸→壬(8)
 */
export function hourStemStart(dayStemIdx) {
  return ((dayStemIdx % 5) * 2) % 10;
}

/**
 * 시지(時支) 블록 — 2시간 단위. 子시 23:00~00:59.
 * 분(minute) 단위 시각(0~1439)을 받아 지지 인덱스(0=자) 반환.
 */
export function hourBranchIndex(minuteOfDay) {
  // 23:00~24:00 과 00:00~01:00 모두 子. (23*60=1380)
  if (minuteOfDay >= 1380 || minuteOfDay < 60) return 0; // 子
  return Math.floor((minuteOfDay - 60) / 120) + 1; // 丑(1)부터
}

/** 시지 인덱스 → 시간 구간 라벨 */
export const HOUR_RANGES = [
  '23:00~00:59', '01:00~03:00', '03:00~05:00', '05:00~07:00',
  '07:00~09:00', '09:00~11:00', '11:00~13:00', '13:00~15:00',
  '15:00~17:00', '17:00~19:00', '19:00~21:00', '21:00~23:00',
];

/** 십성(十星) 이름 — [생극관계][음양동이] */
// 관계: same(비겁) / output(식상,내가 생) / wealth(재성,내가 극) / officer(관살,나를 극) / resource(인성,나를 생)
export const SIPSEONG = {
  same: { same: '비견', diff: '겁재' },
  output: { same: '식신', diff: '상관' },
  wealth: { same: '편재', diff: '정재' },
  officer: { same: '편관', diff: '정관' }, // 편관=칠살(七殺)
  resource: { same: '편인', diff: '정인' },
};

/** 오행 생(生) 관계: key가 생하는 오행 */
export const SAENG = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
/** 오행 극(克) 관계: key가 극하는 오행 */
export const GEUK = { 목: '토', 토: '수', 수: '화', 화: '금', 금: '목' };

/**
 * 일간(日干) 오행/음양 대비, 대상 천간의 오행/음양으로 십성 판정.
 * @param {string} dayStem 일간(한글)
 * @param {string} targetStem 대상 천간(한글)
 * @returns {string} 십성명
 */
export function sipseongOf(dayStem, targetStem) {
  const di = STEMS.indexOf(dayStem);
  const ti = STEMS.indexOf(targetStem);
  const de = STEM_ELEMENT[di], te = STEM_ELEMENT[ti];
  const sameYinYang = STEM_YANG[di] === STEM_YANG[ti];
  let rel;
  if (de === te) rel = 'same';
  else if (SAENG[de] === te) rel = 'output'; // 일간이 대상을 생
  else if (GEUK[de] === te) rel = 'wealth'; // 일간이 대상을 극
  else if (GEUK[te] === de) rel = 'officer'; // 대상이 일간을 극
  else rel = 'resource'; // 대상이 일간을 생 (SAENG[te]===de)
  return SIPSEONG[rel][sameYinYang ? 'same' : 'diff'];
}

/** 60갑자 인덱스(0~59) → {stemIdx, branchIdx, kor, hanja} */
export function ganjiFromIndex(idx) {
  const i = ((idx % 60) + 60) % 60;
  const s = i % 10, b = i % 12;
  return {
    stemIdx: s,
    branchIdx: b,
    kor: STEMS[s] + BRANCHES[b],
    hanja: STEMS_HANJA[s] + BRANCHES_HANJA[b],
  };
}

/** stemIdx, branchIdx → 60갑자 인덱스(0~59). (중국식 갑자 순환) */
export function ganjiIndex(stemIdx, branchIdx) {
  // 60갑자에서 stem(10)·branch(12)이 동시에 맞는 유일 인덱스: i ≡ s (mod10), i ≡ b (mod12)
  for (let i = 0; i < 60; i++) {
    if (i % 10 === stemIdx && i % 12 === branchIdx) return i;
  }
  return -1;
}

/** 천간합(天干合) — 갑기합토, 을경합금, 병신합수, 정임합목, 무계합화 */
export const STEM_HAP = {
  갑: ['기', '토'], 기: ['갑', '토'],
  을: ['경', '금'], 경: ['을', '금'],
  병: ['신', '수'], 신: ['병', '수'],
  정: ['임', '목'], 임: ['정', '목'],
  무: ['계', '화'], 계: ['무', '화'],
};

/** 지지 육합(六合) */
export const BRANCH_YUKHAP = {
  자: '축', 축: '자', 인: '해', 해: '인', 묘: '술', 술: '묘',
  진: '유', 유: '진', 사: '신', 신: '사', 오: '미', 미: '오',
};

/** 지지 충(沖) — 7번째 지지끼리 */
export const BRANCH_CHUNG = {
  자: '오', 오: '자', 축: '미', 미: '축', 인: '신', 신: '인',
  묘: '유', 유: '묘', 진: '술', 술: '진', 사: '해', 해: '사',
};

/** 한글 간지 → 한자 변환 (예: '갑인' → '甲寅') */
export function korToHanja(kor) {
  if (!kor || kor.length < 2) return kor || '';
  const s = STEMS.indexOf(kor[0]);
  const b = BRANCHES.indexOf(kor[1]);
  if (s < 0 || b < 0) return kor;
  return STEMS_HANJA[s] + BRANCHES_HANJA[b];
}

/** 24절기 정의 — [한글명, 태양황경(deg)]. 節(월 경계)에는 isJeol=true. */
export const SOLAR_TERMS = [
  { name: '소한', lon: 285, jeol: true }, // 丑월 시작
  { name: '대한', lon: 300, jeol: false },
  { name: '입춘', lon: 315, jeol: true }, // 寅월 시작 (=사주 새해)
  { name: '우수', lon: 330, jeol: false },
  { name: '경칩', lon: 345, jeol: true }, // 卯월
  { name: '춘분', lon: 0, jeol: false },
  { name: '청명', lon: 15, jeol: true }, // 辰월
  { name: '곡우', lon: 30, jeol: false },
  { name: '입하', lon: 45, jeol: true }, // 巳월
  { name: '소만', lon: 60, jeol: false },
  { name: '망종', lon: 75, jeol: true }, // 午월
  { name: '하지', lon: 90, jeol: false },
  { name: '소서', lon: 105, jeol: true }, // 未월
  { name: '대서', lon: 120, jeol: false },
  { name: '입추', lon: 135, jeol: true }, // 申월
  { name: '처서', lon: 150, jeol: false },
  { name: '백로', lon: 165, jeol: true }, // 酉월
  { name: '추분', lon: 180, jeol: false },
  { name: '한로', lon: 195, jeol: true }, // 戌월
  { name: '상강', lon: 210, jeol: false },
  { name: '입동', lon: 225, jeol: true }, // 亥월
  { name: '소설', lon: 240, jeol: false },
  { name: '대설', lon: 255, jeol: true }, // 子월
  { name: '동지', lon: 270, jeol: false },
];

/**
 * 월지 인덱스: 태양황경 → 지지 인덱스. 입춘(315°)부터 寅(2).
 * sector 0=寅, 1=卯 ... 11=丑.
 */
export function monthBranchFromLongitude(lon) {
  const sector = Math.floor((((lon - 315) % 360) + 360) % 360 / 30);
  return (2 + sector) % 12; // 寅(2) + sector
}
