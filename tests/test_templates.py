from src.templates import render_cold_email


def test_render_subject_replaces_org():
    subject, _ = render_cold_email("台灣科技股份有限公司")
    assert "台灣科技股份有限公司" in subject
    assert "{organisation}" not in subject


def test_render_body_replaces_org_and_sender():
    _, body = render_cold_email("測試公司")
    assert "測試公司" in body
    assert "{organisation}" not in body
    assert "{greeting}" not in body
    assert "{senderInfo" not in body


def test_render_body_contains_yit_url():
    _, body = render_cold_email("測試公司")
    assert "https://www.youthimpacttaiwan.com" in body


def test_render_body_contains_annual_report_link():
    _, body = render_cold_email("測試公司")
    assert "drive.google.com" in body


def test_render_body_is_html():
    _, body = render_cold_email("測試公司")
    assert "<div" in body or "<p>" in body


def test_render_body_hides_phone_when_blank(monkeypatch):
    import src.config as cfg
    monkeypatch.setattr(cfg, "SENDER_PHONE", "")
    _, body = render_cold_email("測試公司")
    assert "phoneDisplay" not in body
