# 배포 가이드 — 「오행」 사주 분석

이 앱은 **빌드가 필요 없는 순수 정적 사이트**(HTML+CSS+ESM JS)입니다. 모든 계산이 브라우저에서 일어나므로 서버·API 키가 필요 없고, 어떤 정적 호스팅에도 그대로 올릴 수 있습니다.

> ⚠️ **중요 — 보안**: 상위 폴더 `D:\Claude` 는 여러 **비공개 프로젝트**(브리핑·자산 계산기 등)를 담은 모노레포입니다.
> **절대 `D:\Claude` 전체를 공개 저장소/호스팅에 올리지 마세요.** 반드시 **`saju/` 폴더만** 배포합니다.
> 아래 방법들은 모두 `saju/` 폴더만 올리도록 구성돼 있습니다.

배포 후 별도 설정 없이 모바일·PC 어디서나 접속됩니다. 상대경로(`./engine/…`)만 쓰므로 하위 경로(`/saju/`)에 올려도 동작합니다.

---

## 방법 1 — Netlify Drop (가장 쉬움, 1분, 계정 가입만)

1. https://app.netlify.com/drop 접속
2. 탐색기에서 **`D:\Claude\saju` 폴더를 통째로 드래그&드롭**
3. 끝. `https://랜덤이름.netlify.app` URL이 즉시 발급됩니다. (이후 사이트 설정에서 이름 변경 가능)

`netlify.toml`이 포함돼 있어 빌드 없이 그대로 서빙됩니다.

## 방법 2 — Netlify CLI (재배포 자동화)

```bash
npm i -g netlify-cli
cd D:\Claude\saju
netlify deploy --prod --dir=.
```

## 방법 3 — Vercel CLI

```bash
npm i -g vercel
cd D:\Claude\saju
vercel --prod            # 프로젝트 루트로 saju 폴더가 잡힘
```

## 방법 4 — GitHub Pages (별도 공개 저장소 사용)

GitHub Pages는 저장소 단위로 동작하므로, **`saju` 내용만 담은 새 공개 저장소**를 만들어 올립니다
(모노레포 `D:\Claude`를 그대로 push하면 비공개 프로젝트가 노출되니 금지).

```bash
# saju 폴더 내용만 새 저장소로
cd D:\Claude\saju
git init
git add . && git commit -m "오행 사주 분석"
gh repo create saju-ohaeng --public --source=. --push   # gh CLI 필요 (gh auth login)
# GitHub → 저장소 Settings → Pages → Branch: main / root 선택 → 저장
```
`.nojekyll`이 포함돼 있어 `engine/` 등 폴더가 정상 서빙됩니다.
발급 URL: `https://<유저명>.github.io/saju-ohaeng/`

> 참고: 이미 다른 용도로 GitHub Pages를 쓰고 있다면, 사용자 페이지(`<user>.github.io`)가 아니라
> **프로젝트 페이지**(저장소별)이므로 충돌하지 않습니다.

---

## 로컬 실행

```bash
node server.js          # → http://localhost:4476/
```

## 배포 후 점검 체크리스트
- [ ] 입력 → 결과 정상 렌더 (만세력 4기둥·오행·대운/세운·풀이)
- [ ] "프롬프트 복사" 동작 (클립보드)
- [ ] "이미지 저장" 동작 (PNG 다운로드)
- [ ] 모바일에서 "공유" 버튼 노출 및 동작 (Web Share 지원 기기)
- [ ] 음력·윤달 입력 동작
