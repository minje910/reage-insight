# -*- coding: utf-8 -*-
# 이 파일을 config.py 로 복사한 뒤 값을 채우세요.
# (환경변수로 설정해도 됩니다. 환경변수가 우선합니다.)

# ---- Gmail 전송 (Gmail SMTP / 앱 비밀번호) ----
# 1) 구글 계정 > 보안 > 2단계 인증 활성화
# 2) '앱 비밀번호' 생성 (메일용) → 16자리 코드
# https://myaccount.google.com/apppasswords
GMAIL_ADDRESS = "your_gmail@gmail.com"
GMAIL_APP_PASSWORD = "xxxxxxxxxxxxxxxx"   # 공백 없이 16자

# ---- 검색 데이터 (네이버 데이터랩 통합검색어 트렌드) ----
# https://developers.naver.com/apps → 애플리케이션 등록 → '데이터랩(검색어트렌드)' 추가
NAVER_CLIENT_ID = "your_naver_client_id"
NAVER_CLIENT_SECRET = "your_naver_client_secret"

# ---- 서버 포트 ----
PORT = "4599"
