import pytest
from unittest.mock import MagicMock, patch


def test_weekly_finder_job_runs_agent():
    with patch("main.CompanyFinderAgent") as MockFinder:
        mock_instance = MagicMock()
        MockFinder.return_value = mock_instance
        from main import run_weekly_finder
        run_weekly_finder()
        mock_instance.run.assert_called_once()


def test_monitor_job_triggers_drafter_for_each_response():
    mock_response = {
        "company_name": "公司甲",
        "company_email": "a@a.com",
        "row_num": 2,
        "sender": "a@a.com",
        "subject": "Re: YIT",
        "body": "Interested",
    }
    with patch("main.ResponseMonitorAgent") as MockMonitor, \
         patch("main.ReplyDrafterAgent") as MockDrafter:
        MockMonitor.return_value.run.return_value = [mock_response]
        mock_drafter_instance = MagicMock()
        MockDrafter.return_value = mock_drafter_instance

        from main import run_monitor
        run_monitor()

        mock_drafter_instance.run.assert_called_once_with(mock_response)


def test_monitor_job_with_no_responses_does_not_trigger_drafter():
    with patch("main.ResponseMonitorAgent") as MockMonitor, \
         patch("main.ReplyDrafterAgent") as MockDrafter:
        MockMonitor.return_value.run.return_value = []

        from main import run_monitor
        run_monitor()

        MockDrafter.assert_not_called()
