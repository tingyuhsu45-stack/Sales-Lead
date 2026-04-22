import pytest
from unittest.mock import MagicMock, patch
from src import config
from src.agents.reply_drafter import ReplyDrafterAgent


def make_agent(mock_sheets, mock_gmail, mock_llm):
    with patch("src.agents.reply_drafter.SheetsClient", return_value=mock_sheets), \
         patch("src.agents.reply_drafter.GmailClient", return_value=mock_gmail), \
         patch("src.agents.reply_drafter.LLMClient", return_value=mock_llm):
        return ReplyDrafterAgent()


def _make_response(body="我們有興趣！"):
    return {
        "company_name": "公司甲",
        "company_email": "sponsor@company.com",
        "row_num": 3,
        "sender": "sponsor@company.com",
        "subject": "Re: YIT",
        "body": body,
    }


def test_sends_draft_to_user_not_sponsor():
    mock_sheets = MagicMock()
    mock_sheets.get_all_rows.return_value = [["Programs", "400+ students"]]
    mock_gmail = MagicMock()
    mock_llm = MagicMock()
    mock_llm.complete.return_value = "感謝您的回覆..."

    agent = make_agent(mock_sheets, mock_gmail, mock_llm)
    agent.run(_make_response())

    send_calls = mock_gmail.send_email.call_args_list
    assert len(send_calls) == 1
    assert send_calls[0].kwargs["to"] == config.USER_EMAIL  # Not the sponsor


def test_draft_labelled_do_not_send():
    mock_sheets = MagicMock()
    mock_sheets.get_all_rows.return_value = [["Programs", "400+ students"]]
    mock_gmail = MagicMock()
    mock_llm = MagicMock()
    mock_llm.complete.return_value = "Draft text"

    agent = make_agent(mock_sheets, mock_gmail, mock_llm)
    agent.run(_make_response())

    body = mock_gmail.send_email.call_args.kwargs["body"]
    assert "DRAFT" in body or "草稿" in body


def test_empty_context_skips_llm_and_sends_raw():
    mock_sheets = MagicMock()
    mock_sheets.get_all_rows.return_value = []  # Empty YIT_Context
    mock_gmail = MagicMock()
    mock_llm = MagicMock()

    agent = make_agent(mock_sheets, mock_gmail, mock_llm)
    agent.run(_make_response())

    mock_llm.complete.assert_not_called()
    send_calls = mock_gmail.send_email.call_args_list
    assert len(send_calls) == 1
    body = send_calls[0].kwargs["body"]
    assert "Context" in body or "手動" in body or "無法" in body


def test_draft_contains_needs_human_input_placeholder():
    mock_sheets = MagicMock()
    mock_sheets.get_all_rows.return_value = [["Programs", "400+ students"]]
    mock_gmail = MagicMock()
    mock_llm = MagicMock()
    # LLM returns a draft with a [NEEDS HUMAN INPUT] marker
    mock_llm.complete.return_value = "[NEEDS HUMAN INPUT: budget question]"

    agent = make_agent(mock_sheets, mock_gmail, mock_llm)
    agent.run(_make_response(body="你們的預算是多少？"))

    body = mock_gmail.send_email.call_args.kwargs["body"]
    assert "NEEDS HUMAN INPUT" in body


def test_llm_receives_yit_context_in_prompt():
    mock_sheets = MagicMock()
    mock_sheets.get_all_rows.return_value = [["Impact", "服務400位學生"]]
    mock_gmail = MagicMock()
    mock_llm = MagicMock()
    mock_llm.complete.return_value = "reply"

    agent = make_agent(mock_sheets, mock_gmail, mock_llm)
    agent.run(_make_response())

    call_kwargs = mock_llm.complete.call_args.kwargs
    full_prompt = str(call_kwargs.get("system", "")) + str(call_kwargs.get("user", ""))
    assert "400" in full_prompt or "YIT" in full_prompt


def test_sheet_status_updated_to_reply_drafted():
    mock_sheets = MagicMock()
    mock_sheets.get_all_rows.return_value = [["Programs", "info"]]
    mock_gmail = MagicMock()
    mock_llm = MagicMock()
    mock_llm.complete.return_value = "draft"

    agent = make_agent(mock_sheets, mock_gmail, mock_llm)
    agent.run(_make_response())

    all_args = [c.args for c in mock_sheets.update_cell.call_args_list]
    statuses = [a[3] for a in all_args if len(a) >= 4]
    assert config.STATUS_REPLY_DRAFTED in statuses
