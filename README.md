# RE:AGE — 검색 쿠키 기반 역노화 인사이트 큐레이터

경제력을 갖춘 **5060 시니어**와 건강관리에 관심 많은 **3040 세대**를 대상으로,
검색 쿠키·검색 데이터를 바탕으로 **맞춤 역노화 기술 인사이트 1개**를 카드뉴스 형태로 추천하고,
**Gmail로 전송**하는 웹앱입니다.

## 핵심 기능
| 기능 | 설명 |
|---|---|
| 가입 온보딩 | 첫 방문 시 **이름·나이·경제적 여유**(알뜰/표준/프리미엄) 입력 → 페르소나 자동 분류 |
| 검색 쿠키 | 메인 **검색하기**로 검색 시 키워드가 `localStorage`에 누적(쿠키 시뮬레이션) |
| 검색 데이터 API | `/api/trends` — **Google 트렌드(pytrends) + 네이버 데이터랩**을 병합해 실시간 급상승 키워드 반영 |
| Google 통계 → 쿠키 연계 | 검색 시 Google 급상승/연관 키워드를 **검색 쿠키에 자동 주입**(🔎 표시), 추천에 반영 |
| 맞춤 인사이트 1개 | 페르소나 + 경제력 + 검색쿠키 + 트렌드 종합 점수 최상위 **1개 카드**만 노출 |
| Gmail 전송 | `/api/send` — 인사이트를 HTML 메일로 Gmail 발송 |

## 실행 방법
```bash
pip install -r requirements.txt
python server.py
# 브라우저에서 http://localhost:4599 접속
```
> 정적 파일로 그냥 열어도 UI는 동작하지만, **검색 데이터/Gmail 전송 API는 server.py 실행 시**에만 동작합니다.
> 자격증명을 넣지 않아도 **데모 모드**로 실행됩니다(트렌드=데모 데이터, 메일=`outbox.log` 기록).

## 실제 API 연동 (선택)
`config.example.py` → `config.py`로 복사 후 값 입력 (또는 동일 이름의 환경변수 설정):

### 1) Gmail 전송 (Gmail SMTP · 앱 비밀번호)
1. 구글 계정 → 보안 → **2단계 인증** 켜기
2. https://myaccount.google.com/apppasswords 에서 **앱 비밀번호**(16자) 생성
3. `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` 입력 → 재실행 시 실제 발송

### 2) 검색 데이터
**Google 트렌드**는 별도 키가 필요 없습니다 — `pip install pytrends`만 하면 자동 사용됩니다.
> ⚠️ pytrends는 **비공식** Google Trends로, 짧은 시간에 여러 번 호출하면 Google이 `429`(요청제한)를 반환합니다.
> 이 경우 자동으로 **네이버/데모 데이터로 폴백**하며(성공 결과는 30분 캐시), 잠시 후 다시 실데이터가 들어옵니다.
> 운영 환경에서 안정적인 Google 데이터가 필요하면 SerpApi·DataForSEO 같은 유료 공식 소스로 교체하세요.

**네이버 데이터랩**(선택, 폴백/병합용):
1. https://developers.naver.com/apps 애플리케이션 등록 → **데이터랩(검색어트렌드)** 추가
2. `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 입력 → Google과 병합되어 반영

## 파일 구조
```
index.html        온보딩 + 메인 UI
styles.css        다크 프리미엄 폰 프레임 디자인
app.js            페르소나 분류·검색쿠키·추천엔진·트렌드/메일 API 호출
data.js           역노화 기술 카드 10종 데이터
server.py         Flask 백엔드 (정적 서빙 + /api/trends + /api/send)
config.example.py 자격증명 템플릿 (→ config.py 로 복사)
requirements.txt  flask, requests
images/           인사이트 인포그래픽 SVG 11종
```

## 추천 점수 로직 (app.js `scoreCard`)
- 페르소나 일치 +40 / both +22 / 불일치 +6
- 경제력 가중: 프리미엄=고가 선호, 알뜰=저가 선호
- 검색 쿠키 태그 매칭 × 16 (누적 횟수 반영)
- 검색 데이터 트렌드 점수 × 0.25
- 위 합산 최상위 1개를 "오늘의 맞춤 인사이트"로 노출

## 보안 메모
- `config.py`, `outbox.log`는 자격증명·발송기록을 포함하므로 **버전관리에서 제외**하세요.
- 앱 비밀번호는 SMTP 발송 전용이며 절대 프론트엔드에 노출되지 않습니다(서버에서만 사용).
