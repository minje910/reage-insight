# -*- coding: utf-8 -*-
"""
RE:AGE 백엔드 서버
  - 정적 사이트 서빙
  - /api/trends  : 검색 데이터(트렌드) API — 네이버 데이터랩 연동 (미설정 시 데모 데이터)
  - /api/send    : Gmail 전송 API — Gmail SMTP(앱 비밀번호) 연동 (미설정 시 데모 모드)

실행:
  pip install -r requirements.txt
  python server.py
  브라우저에서 http://localhost:4599 접속

자격증명은 환경변수 또는 config.py 로 주입합니다. (config.example.py 참고)
"""
import os
import json
import ssl
import smtplib
import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from flask import Flask, request, jsonify, send_from_directory

try:
    import requests
except ImportError:
    requests = None

# ---- 설정 로드: 환경변수 우선, 없으면 config.py ----
try:
    import config as _cfg
except Exception:
    _cfg = None


def cfg(name, default=""):
    if name in os.environ and os.environ[name]:
        return os.environ[name]
    if _cfg is not None and hasattr(_cfg, name):
        return getattr(_cfg, name)
    return default


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")

# ============================================================
#  정적 파일
# ============================================================
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory(BASE_DIR, path)


# ============================================================
#  검색 데이터 API  (GET /api/trends?keyword=역노화)
#  네이버 데이터랩 '통합검색어 트렌드' 사용.
#  NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 설정 시 실데이터,
#  아니면 카드 태그 기반 데모 트렌드 반환.
# ============================================================
# 카드 태그와 연결되는 역노화 키워드 그룹
TREND_GROUPS = [
    {"name": "줄기세포", "keywords": ["줄기세포", "재생치료"]},
    {"name": "세놀리틱스", "keywords": ["노화세포", "세놀리틱스"]},
    {"name": "호르몬", "keywords": ["갱년기", "호르몬치료"]},
    {"name": "텔로미어", "keywords": ["텔로미어", "세포노화"]},
    {"name": "NMN", "keywords": ["NMN", "NAD"]},
    {"name": "단식", "keywords": ["간헐적단식", "단식모방"]},
    {"name": "피부재생", "keywords": ["콜라겐", "피부재생"]},
    {"name": "장수클리닉", "keywords": ["항노화클리닉", "장수클리닉"]},
]


def _naver_datalab(seed_keyword):
    """네이버 데이터랩에서 그룹별 상대 검색량을 받아 정렬해 반환."""
    cid = cfg("NAVER_CLIENT_ID")
    csec = cfg("NAVER_CLIENT_SECRET")
    if not (cid and csec and requests):
        return None
    today = datetime.date.today()
    start = today - datetime.timedelta(days=90)
    body = {
        "startDate": start.isoformat(),
        "endDate": today.isoformat(),
        "timeUnit": "week",
        "keywordGroups": [
            {"groupName": g["name"], "keywords": g["keywords"]} for g in TREND_GROUPS[:5]
        ],
    }
    try:
        r = requests.post(
            "https://openapi.naver.com/v1/datalab/search",
            headers={
                "X-Naver-Client-Id": cid,
                "X-Naver-Client-Secret": csec,
                "Content-Type": "application/json",
            },
            data=json.dumps(body),
            timeout=8,
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        out = []
        for item in results:
            pts = item.get("data", [])
            latest = pts[-1]["ratio"] if pts else 0
            out.append({"keyword": item["title"], "score": round(latest, 1)})
        out.sort(key=lambda x: x["score"], reverse=True)
        return out
    except Exception as e:
        app.logger.warning("Naver DataLab 실패: %s", e)
        return None


def _demo_trends(seed_keyword):
    """자격증명이 없을 때 사용하는 결정적 데모 트렌드."""
    base = {
        "줄기세포": 88, "세놀리틱스": 74, "호르몬": 69, "텔로미어": 52,
        "NMN": 81, "단식": 77, "피부재생": 66, "장수클리닉": 61,
    }
    # 검색어가 특정 그룹과 관련되면 가중 (빈 검색어는 가중 없음)
    s = (seed_keyword or "").lower().strip()
    if s:
        for g in TREND_GROUPS:
            if any(k.lower() in s or s in k.lower() for k in g["keywords"] + [g["name"]]):
                base[g["name"]] = min(100, base.get(g["name"], 50) + 15)
    out = [{"keyword": k, "score": v} for k, v in base.items()]
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


@app.route("/api/trends")
def api_trends():
    keyword = request.args.get("keyword", "")
    data = _naver_datalab(keyword)
    source = "naver_datalab"
    if data is None:
        data = _demo_trends(keyword)
        source = "demo"
    return jsonify({"source": source, "keyword": keyword, "trends": data})


# ============================================================
#  Gmail 전송 API  (POST /api/send)
#  body: { to, subject, html }
#  GMAIL_ADDRESS / GMAIL_APP_PASSWORD 설정 시 실제 발송,
#  아니면 데모 모드(outbox.log 기록 후 성공 반환).
# ============================================================
def _send_via_gmail(to_addr, subject, html_body):
    sender = cfg("GMAIL_ADDRESS")
    app_pw = cfg("GMAIL_APP_PASSWORD")
    if not (sender and app_pw):
        # 데모 모드: 실제 발송 대신 기록
        with open(os.path.join(BASE_DIR, "outbox.log"), "a", encoding="utf-8") as f:
            f.write("=== %s ===\nTo: %s\nSubject: %s\n\n%s\n\n"
                    % (datetime.datetime.now().isoformat(), to_addr, subject, html_body))
        return True, "demo"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_addr
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as smtp:
        smtp.login(sender, app_pw)
        smtp.sendmail(sender, [to_addr], msg.as_string())
    return True, "sent"


@app.route("/api/send", methods=["POST"])
def api_send():
    payload = request.get_json(silent=True) or {}
    to_addr = payload.get("to", "").strip()
    subject = payload.get("subject", "RE:AGE 역노화 인사이트")
    html_body = payload.get("html", "")
    if not to_addr:
        return jsonify({"ok": False, "message": "받는 사람 이메일이 없습니다."}), 400
    try:
        ok, mode = _send_via_gmail(to_addr, subject, html_body)
        note = {
            "sent": "Gmail로 실제 전송되었습니다.",
            "demo": "데모 모드: 자격증명 미설정으로 outbox.log에 기록했습니다. "
                    "config.py에 GMAIL_ADDRESS/GMAIL_APP_PASSWORD를 넣으면 실제 발송됩니다.",
        }[mode]
        return jsonify({"ok": ok, "mode": mode, "message": note})
    except Exception as e:
        return jsonify({"ok": False, "message": "전송 실패: %s" % e}), 500


if __name__ == "__main__":
    port = int(cfg("PORT", "4599"))
    print("RE:AGE server → http://localhost:%d" % port)
    app.run(host="0.0.0.0", port=port, debug=False)
