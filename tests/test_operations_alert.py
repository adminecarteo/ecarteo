"""Offline SMTP boundary tests. No network or real mailbox is used."""
import importlib.util
from pathlib import Path
import ssl
import unittest
from unittest.mock import MagicMock, patch


spec = importlib.util.spec_from_file_location(
    "operations_alert", Path(__file__).parents[1] / "scripts/send-operations-alert.py"
)
alert = importlib.util.module_from_spec(spec)
spec.loader.exec_module(alert)


class OperationsAlertTests(unittest.TestCase):
    def setUp(self):
        self.env = {
            "ALERT_SMTP_HOST": "smtp.example.test",
            "ALERT_SMTP_USERNAME": "sender@example.test",
            "ALERT_SMTP_PASSWORD": "never-print-this-fixture",
            "ALERT_FROM": "sender@example.test",
            "ALERT_TO": "owner@example.test",
        }

    def test_message_is_bounded_and_never_contains_credentials(self):
        config = alert.configuration(self.env)
        text = alert.message("maintenance_failed", config).as_string()
        self.assertNotIn(config["password"], text)
        self.assertNotIn(config["host"], text)
        self.assertIn("https://ecarteo.fr", text)
        with self.assertRaises(ValueError):
            alert.message("alert_test", config, "https://example.test/?token=secret")

    def test_rejects_header_injection_multiple_recipients_and_plain_smtp(self):
        for value in ["owner@example.test\r\nBcc: other@example.test", "a@example.test,b@example.test"]:
            with self.assertRaises(ValueError):
                alert.configuration({**self.env, "ALERT_TO": value})
        with self.assertRaises(ValueError):
            alert.configuration({**self.env, "ALERT_SMTP_PORT": "25"})

    def test_starttls_is_verified_and_precedes_authentication(self):
        smtp = MagicMock()
        smtp.send_message.return_value = {}
        connection = MagicMock()
        connection.__enter__.return_value = smtp
        with patch.object(alert.smtplib, "SMTP", return_value=connection):
            config = alert.configuration(self.env)
            alert.deliver(config, alert.message("alert_test", config))
        names = [call[0] for call in smtp.mock_calls]
        self.assertEqual(names[:4], ["ehlo", "starttls", "ehlo", "login"])
        context = smtp.starttls.call_args.kwargs["context"]
        self.assertTrue(context.check_hostname)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertEqual(smtp.send_message.call_args.kwargs["to_addrs"], ["owner@example.test"])

    def test_starttls_failure_never_sends_credentials(self):
        smtp = MagicMock()
        smtp.starttls.side_effect = OSError("fixture failure")
        connection = MagicMock()
        connection.__enter__.return_value = smtp
        with patch.object(alert.smtplib, "SMTP", return_value=connection):
            with self.assertRaises(OSError):
                config = alert.configuration(self.env)
                alert.deliver(config, alert.message("backup_failed", config))
        smtp.login.assert_not_called()
        smtp.send_message.assert_not_called()


if __name__ == "__main__":
    unittest.main()
