// ============================================================
//  persona.js — 생년월일 한 줄 해석 (일간 물상 × 태어난 계절)
//
//  "내가 어떤 사람인가"를 원국 전체를 읽지 않고도 한눈에 잡아 주는 유형 라벨.
//  근거는 두 가지 정통 관법을 겹친 것이다.
//   ① 십간 물상론(物象論) — 甲=큰 나무, 乙=화초, 丙=태양 … 辛=보석, 癸=이슬.
//      일간(日干)을 자연물에 빗대 성향을 읽는 관법.
//   ② 월령(月令)·조후(調候) — 태어난 계절이 일간에 어떤 온도로 작용하는가.
//      같은 辛(보석)이라도 봄에 난 辛과 겨울에 난 辛은 쓰임이 다르다.
//
//  ⚠️ 물상론은 명리의 본류(억부·격국)가 아니라 **보조 관법**이다.
//     정밀 판정은 engine/theory.js 가 맡고, 여기서는 "첫인상"만 준다.
//     그래서 문구는 단정하지 않고, 우열을 매기지 않으며, 어떤 유형도
//     좋고 나쁨으로 나누지 않는다. (THEORY.md 톤 규약 계승)
// ============================================================
import { STEMS, BRANCHES, STEM_ELEMENT, BRANCH_ELEMENT } from './constants.js';

/** 십간 물상 — 상징·기질·강점. */
export const STEM_IMAGE = {
  갑: {
    image: '큰 나무', hanja: '甲', emoji: '🌳',
    short: '큰나무',
    core: '곧게 뻗는 힘',
    traits: ['주도', '원칙', '성장'],
    desc: '위로 곧게 자라는 나무처럼, 방향이 정해지면 흔들리지 않고 밀고 나가는 결이에요. 처음 길을 내는 자리에 잘 어울려요.',
    caution: '한번 정한 방향을 바꾸기 어려워, 돌아가는 길이 더 빠를 때를 놓치기 쉬워요.',
  },
  을: {
    image: '화초', hanja: '乙', emoji: '🌿',
    short: '화초',
    core: '휘어도 꺾이지 않는 힘',
    traits: ['유연', '섬세', '끈기'],
    desc: '덩굴처럼 상황에 맞춰 모양을 바꾸면서도 결국 제 자리를 차지하는 결이에요. 사람 사이를 살피는 감각이 좋아요.',
    caution: '맞춰 주다 보면 내 자리를 뒤로 미루기 쉬워요. 원하는 것은 말로 꺼내야 전해져요.',
  },
  병: {
    image: '태양', hanja: '丙', emoji: '☀️',
    short: '태양',
    core: '드러내어 밝히는 힘',
    traits: ['활력', '개방', '표현'],
    desc: '있는 자리를 환하게 만드는 결이에요. 숨기지 않고 먼저 보여 주며, 분위기를 끌어올리는 데 재능이 있어요.',
    caution: '너무 환하면 그늘이 필요한 사람이 부담을 느껴요. 잠깐 빛을 줄여 주는 배려가 힘이 돼요.',
  },
  정: {
    image: '등불', hanja: '丁', emoji: '🕯️',
    short: '등불',
    core: '가까이서 데우는 힘',
    traits: ['집중', '온기', '헌신'],
    desc: '넓게 퍼지지는 않아도 곁에 있는 사람을 확실히 데우는 결이에요. 한 가지를 깊게 파고드는 힘이 있어요.',
    caution: '스스로를 태워 밝히는 자리라, 내 심지가 얼마나 남았는지 자주 확인해야 해요.',
  },
  무: {
    image: '큰 산', hanja: '戊', emoji: '⛰️',
    short: '산',
    core: '버티어 품는 힘',
    traits: ['안정', '포용', '신용'],
    desc: '쉽게 움직이지 않고 기댈 자리를 내주는 결이에요. 사람들이 자연스럽게 중심으로 두는 편이에요.',
    caution: '움직여야 할 때도 버티는 쪽을 고르기 쉬워요. 변화가 늦으면 기회가 먼저 지나가요.',
  },
  기: {
    image: '기름진 밭', hanja: '己', emoji: '🌾',
    short: '밭',
    core: '키워 내는 힘',
    traits: ['실용', '헌신', '수용'],
    desc: '무엇을 심어도 길러 내는 결이에요. 티 나지 않게 뒤를 받쳐 주며, 실제로 굴러가게 만드는 사람이에요.',
    caution: '남을 키우다 내 몫을 놓치기 쉬워요. 내가 심고 싶은 것도 한 이랑은 남겨 두세요.',
  },
  경: {
    image: '무쇠', hanja: '庚', emoji: '⚒️',
    short: '무쇠',
    core: '잘라 내는 힘',
    traits: ['결단', '의리', '추진'],
    desc: '군더더기를 쳐내고 형태를 만드는 결이에요. 미루지 않고 결론을 내는 데 강해요.',
    caution: '자를 때의 말이 상대에게는 오래 남아요. 결단은 그대로 두고 표현만 부드럽게 해도 충분해요.',
  },
  신: {
    image: '보석', hanja: '辛', emoji: '💎',
    short: '보석',
    core: '다듬어 빛내는 힘',
    traits: ['정교', '심미', '기준'],
    desc: '작은 차이를 알아보고 끝을 다듬는 결이에요. 기준이 분명해서 결과물의 완성도가 남달라요.',
    caution: '기준이 높아 스스로를 먼저 깎기 쉬워요. 다듬는 손을 자신에게도 부드럽게 써 주세요.',
  },
  임: {
    image: '큰물', hanja: '壬', emoji: '🌊',
    short: '큰물',
    core: '흘러가 넓히는 힘',
    traits: ['포용', '지혜', '유동'],
    desc: '한곳에 머물지 않고 흘러가며 시야를 넓히는 결이에요. 큰 그림을 보고 사람과 정보를 모아요.',
    caution: '넓게 흐르다 깊이가 얕아질 수 있어요. 한 곳을 오래 파는 시간이 힘을 만들어요.',
  },
  계: {
    image: '이슬비', hanja: '癸', emoji: '💧',
    short: '이슬',
    core: '스며드는 힘',
    traits: ['감수성', '통찰', '조용함'],
    desc: '소리 없이 스며들어 결국 적시는 결이에요. 남이 보지 못하는 결을 먼저 알아채요.',
    caution: '안으로 담아 두면 스스로만 무거워져요. 알아챈 것을 꺼내 놓으면 관계가 편해져요.',
  },
};

/** 계절 — 월지(月支)가 속한 절기 구간. */
export const SEASONS = {
  봄: { emoji: '🌸', element: '목', branches: ['인', '묘', '진'], mood: '싹이 트고 뻗어 나가는 계절' },
  여름: { emoji: '🔥', element: '화', branches: ['사', '오', '미'], mood: '한껏 피어나 드러나는 계절' },
  가을: { emoji: '🍂', element: '금', branches: ['신', '유', '술'], mood: '거두어 매듭짓는 계절' },
  겨울: { emoji: '❄️', element: '수', branches: ['해', '자', '축'], mood: '안으로 갈무리하는 계절' },
};

/** 계절 × 일간 40조합의 한 줄. 물상과 월령을 함께 읽은 결과다. */
const TAGLINE = {
  봄: {
    갑: '누구보다 먼저 자라 그늘을 만들어 주는 사람',
    을: '부드럽게 파고들어 끝내 제자리를 만드는 사람',
    병: '막 피어나는 것들을 데워 주는 사람',
    정: '작은 온기로 곁을 오래 지키는 사람',
    무: '새싹이 기댈 자리를 먼저 내어 주는 사람',
    기: '무엇을 심어도 기어이 키워 내는 사람',
    경: '설익은 것을 다듬어 쓸모를 만드는 사람',
    신: '작은 차이를 알아보고 완성도를 바꿔 놓는 사람',
    임: '메마른 곳을 먼저 찾아 흘러가는 사람',
    계: '티 나지 않게 자라도록 적셔 주는 사람',
  },
  여름: {
    갑: '그늘이 필요한 때 가장 크게 서 주는 사람',
    을: '뜨거운 날에도 쉽게 시들지 않는 사람',
    병: '있는 것만으로 판을 환하게 밝히는 사람',
    정: '밝은 곳에서도 제 색을 잃지 않는 사람',
    무: '열기를 품고도 흔들리지 않는 사람',
    기: '뜨거울수록 결실을 준비하는 사람',
    경: '달궈질수록 단단해지는 사람',
    신: '열기 속에서도 서늘한 판단을 내리는 사람',
    임: '모두가 목마를 때 흘러와 주는 사람',
    계: '잠깐의 시원함으로 숨통을 틔우는 사람',
  },
  가을: {
    갑: '거둘 때를 알고 매듭을 짓는 사람',
    을: '마지막까지 제 향을 남기는 사람',
    병: '짧아진 해를 아껴 쓸 줄 아는 사람',
    정: '어두워질수록 더 필요해지는 사람',
    무: '거둔 것을 끝까지 지켜 내는 사람',
    기: '수확을 갈무리해 나눌 줄 아는 사람',
    경: '필요한 결단을 미루지 않는 사람',
    신: '제 값을 알아보는 눈을 가진 사람',
    임: '거둔 것을 다음 자리로 옮기는 사람',
    계: '서늘한 아침처럼 정신을 맑게 하는 사람',
  },
  겨울: {
    갑: '언 땅에서도 봄을 준비하는 사람',
    을: '추위 속에서도 뿌리를 놓지 않는 사람',
    병: '가장 필요한 때 떠올라 주는 사람',
    정: '추운 방을 데우는 단 한 사람',
    무: '찬 바람을 대신 막아서는 사람',
    기: '봄에 심을 것을 미리 고르는 사람',
    경: '차가울수록 날이 서는 사람',
    신: '고요할 때 더 빛나는 사람',
    임: '깊어질 대로 깊어진 사람',
    계: '조용히 스며들어 오래 남는 사람',
  },
};

/** 일간이 계절에서 놓이는 다섯 가지 상태 — 조후·억부의 뼈대만 옮긴 것. */
const STANCE = {
  왕: {
    key: '왕', label: '기운이 한창인 자리',
    line: '태어난 계절이 일간과 같은 기운이라, 타고난 힘이 넉넉한 자리예요.',
    advice: '힘이 넉넉할수록 쓸 곳을 정하는 게 중요해요. 벌여 놓기보다 하나를 끝까지 가져가 보세요.',
  },
  생: {
    key: '생', label: '받쳐 주는 기운을 받는 자리',
    line: '계절의 기운이 일간을 밀어 주는 자리라, 뒤가 든든한 편이에요.',
    advice: '받은 힘은 안에 쌓아 두기보다 밖으로 내보낼 때 커져요. 표현하고 나눠 보세요.',
  },
  설: {
    key: '설', label: '기운을 내어 주는 자리',
    line: '일간이 계절을 살리는 자리라, 쓰는 만큼 빠져나가기도 해요.',
    advice: '쓴 만큼 채우는 시간이 필요해요. 잘 자고 잘 먹는 게 실제로 성과를 바꿔요.',
  },
  극: {
    key: '극', label: '스스로 감당하는 자리',
    line: '일간이 계절의 기운을 눌러 세우는 자리라, 혼자 짊어지는 일이 잦아요.',
    advice: '다 감당하지 않아도 괜찮아요. 나눠 맡기는 연습이 오히려 결과를 좋게 해요.',
  },
  압: {
    key: '압', label: '단련되는 자리',
    line: '계절의 기운이 일간을 누르는 자리라, 버티며 배우는 시간이 길 수 있어요.',
    advice: '버틴 시간이 그대로 실력이 되는 자리예요. 조급해하지 말고 한 계단씩 밟아 가세요.',
  },
};

/** 오행 상생·상극 (constants 의 테이블과 같은 내용을 이 파일 안에서 짧게 쓴다) */
const SHENG = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };  // A가 B를 생한다
const KE = { 목: '토', 토: '수', 수: '화', 화: '금', 금: '목' };      // A가 B를 극한다

/** 월지 → 계절 이름. */
export function seasonOfBranch(branchKor) {
  for (const [name, s] of Object.entries(SEASONS)) {
    if (s.branches.includes(branchKor)) return name;
  }
  return null;
}

/** 일간 오행이 계절 오행 사이에서 어떤 자리에 놓이는지. */
function stanceOf(dayEl, seasonEl) {
  if (dayEl === seasonEl) return STANCE.왕;
  if (SHENG[seasonEl] === dayEl) return STANCE.생;   // 계절이 나를 생한다
  if (SHENG[dayEl] === seasonEl) return STANCE.설;   // 내가 계절을 생한다
  if (KE[dayEl] === seasonEl) return STANCE.극;      // 내가 계절을 극한다
  return STANCE.압;                                  // 계절이 나를 극한다
}

/**
 * 생년월일 한 줄 해석.
 * @param {object} saju computeSaju() 결과
 * @returns {{label:string, emoji:string, tagline:string, stemImage:object,
 *            season:string, seasonMood:string, stance:object, traits:string[],
 *            desc:string, caution:string, short:string}}
 */
export function buildPersona(saju) {
  const stem = STEMS[saju.pillars.day.stemIdx];
  const img = STEM_IMAGE[stem];
  const monthBranch = saju.pillars.month ? BRANCHES[saju.pillars.month.branchIdx] : null;
  const season = monthBranch ? seasonOfBranch(monthBranch) : null;

  const dayEl = STEM_ELEMENT[saju.pillars.day.stemIdx];
  const seasonEl = season ? SEASONS[season].element : null;
  const stance = seasonEl ? stanceOf(dayEl, seasonEl) : null;

  // 월주가 없을 일은 사실상 없지만(월주는 항상 계산된다), 방어적으로 물상만 돌려준다.
  const label = season ? `${season} ${img.short}형` : `${img.short}형`;
  const emoji = season ? SEASONS[season].emoji : img.emoji;

  return {
    label,
    emoji,
    tagline: season ? TAGLINE[season][stem] : img.core,
    stem,
    stemImage: img,
    season,
    seasonMood: season ? SEASONS[season].mood : null,
    stance,
    traits: img.traits,
    desc: img.desc,
    caution: img.caution,
    /** 한 줄로 줄여 쓸 때 (공유 카드·귀인 지도) */
    short: `${emoji} ${label}`,
  };
}

/** 두 사람의 유형을 한 줄로 견주어 볼 때 쓰는 짧은 문구. */
export function personaLine(persona) {
  return `${persona.emoji} ${persona.label} — ${persona.tagline}`;
}

/** 월지에서 바로 계절을 얻는다(귀인 지도처럼 사주 전체가 필요 없을 때). */
export function seasonOfSaju(saju) {
  return saju.pillars.month ? seasonOfBranch(BRANCHES[saju.pillars.month.branchIdx]) : null;
}

/** 지지 오행 참조가 필요할 때 (내부 일관성 확인용) */
export const _internal = { stanceOf, SHENG, KE, BRANCH_ELEMENT };
