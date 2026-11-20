#!/usr/bin/env python3
"""Send a bounded operational notification; never include provider errors or logs."""

import argparse
from datetime import datetime, timezone
from email.headerregistry import Address
from email.message import EmailMessage
from email.utils import format_datetime, make_msgid
import json
import os
import re
import smtplib
import ssl
import sys


EVENTS = {
    "maintenance_failed": (
        "Maintenance failed / Échec de maintenance",
        "Production readiness or expired-upload cleanup failed. Review the workflow result.",
        "Le contrôle de disponibilité ou le nettoyage des dépôts expirés a échoué. Consultez le résultat du workflow.",
    ),
    "backup_failed": (
        "Backup failed / Échec de sauvegarde",
        "The encrypted database and evidence backup did not complete. Check the backup host.",
        "La sauvegarde chiffrée de la base et des preuves n’a pas abouti. Vérifiez le serveur de sauvegarde.",
    ),
    "backup_stale": (
        "Backup verification failed / Sauvegarde à vérifier",
        "No recent verified encrypted backup was found. Check archive age, completeness and integrity.",
        "Aucune sauvegarde chiffrée récente et vérifiée n’a été trouvée. Vérifiez son âge, son intégrité et son exhaustivité.",
    ),
    "alert_test": (
        "Alert delivery test / Test de notification",
        "This is an authorized notification test. It does not indicate a production failure.",
        "Ceci est un test de notification autorisé. Il ne signale aucune panne de production.",
    ),
}


def mailbox(value):
    if not value or len(value) > 254 or any(char.isspace() for char in value):
        raise ValueError("One plain email address is required")
    address = Address(addr_spec=value)
    if not address.username or not address.domain or address.addr_spec != value:
        raise ValueError("One plain email address is required")
    return value


def configuration(env):
    host = env.get("ALERT_SMTP_HOST", "")
    if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?", host):
        raise ValueError("SMTP host required")
    port = int(env.get("ALERT_SMTP_PORT") or "587")
    if port not in (465, 587):
        raise ValueError("Only verified TLS SMTP ports are supported")
    password = env.get("ALERT_SMTP_PASSWORD", "")
    if not password:
        raise ValueError("SMTP password required")
    return {
        "host": host,
        "port": port,
        "username": mailbox(env.get("ALERT_SMTP_USERNAME", "")),
        "password": password,
        "sender": mailbox(env.get("ALERT_FROM", "")),
        "recipient": mailbox(env.get("ALERT_TO", "")),
    }


def message(event, config, run_url=""):
    # Accept only this repository's run URL, without query tokens or arbitrary text.
    if run_url and not re.fullmatch(
        r"https://github\.com/adminecarteo/ecarteo/actions/runs/[0-9]+", run_url
    ):
        raise ValueError("Unexpected workflow URL")
    subject, english, french = EVENTS[event]
    email = EmailMessage()
    email["From"] = config["sender"]
    email["To"] = config["recipient"]
    email["Subject"] = "[Écartéo production] " + subject
    email["Date"] = format_datetime(datetime.now(timezone.utc))
    email["Message-ID"] = make_msgid(domain=config["sender"].split("@", 1)[1])
    email.set_content(
        english + "\n\n" + french + "\n\n"
        + "Application: https://ecarteo.fr\n"
        + ("Workflow: " + run_url + "\n" if run_url else "")
        + "No customer data, credentials or provider error details are included.\n"
    )
    return email


def deliver(config, email):
    context = ssl.create_default_context()
    if config["port"] == 465:
        connection = smtplib.SMTP_SSL(
            config["host"], 465, timeout=30, context=context
        )
    else:
        connection = smtplib.SMTP(config["host"], 587, timeout=30)
    with connection as smtp:
        smtp.ehlo()
        if config["port"] == 587:
            smtp.starttls(context=context)
            smtp.ehlo()
        smtp.login(config["username"], config["password"])
        refused = smtp.send_message(
            email, from_addr=config["sender"], to_addrs=[config["recipient"]]
        )
        if refused:
            raise RuntimeError("Recipient not accepted")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event", choices=EVENTS, required=True)
    parser.add_argument("--check-config", action="store_true")
    args = parser.parse_args()
    try:
        config = configuration(os.environ)
        email = message(args.event, config, os.environ.get("ALERT_RUN_URL", ""))
        if args.check_config:
            print(json.dumps({"event": args.event, "result": "configuration_valid", "sent": False}))
            return 0
        deliver(config, email)
        # SMTP acceptance is not proof of inbox receipt. Confirm receipt separately.
        print(json.dumps({"event": args.event, "result": "smtp_accepted"}))
        return 0
    except Exception:
        print(json.dumps({"event": args.event, "result": "alert_failed"}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
