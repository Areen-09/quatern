import json
import re
import urllib.request
import urllib.parse
import urllib.error
import base64
from typing import Dict, Any, Optional

def clean_phone_number(phone: str, default_country_code: str = "91") -> str:
    """Extract clean digits. For Indian numbers (10 digits), prepend 91."""
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 10:
        return f"{default_country_code}{digits}"
    if digits.startswith("0") and len(digits) == 11:
        return f"{default_country_code}{digits[1:]}"
    return digits

def send_whatsapp_message(
    provider: str,
    to_phone: str,
    message: str,
    meta_access_token: str = "",
    meta_phone_number_id: str = "",
    meta_template_name: str = "",
    twilio_account_sid: str = "",
    twilio_auth_token: str = "",
    twilio_whatsapp_number: str = "",
) -> Dict[str, Any]:
    """Send WhatsApp message via Meta Cloud API, Twilio, or return wa.me link."""
    clean_to = clean_phone_number(to_phone)
    if not clean_to:
        return {"ok": False, "error": "Invalid recipient phone number"}

    if provider == "none":
        return {
            "ok": False,
            "error": "WhatsApp messaging is disabled in settings.",
        }

    # Mode 1: wa.me Direct (Zero setup, opens browser/desktop WhatsApp)
    if provider == "wa_me" or not provider:
        encoded_msg = urllib.parse.quote(message)
        wa_url = f"https://wa.me/{clean_to}?text={encoded_msg}"
        return {
            "ok": True,
            "provider": "wa_me",
            "message": "Direct WhatsApp link generated",
            "url": wa_url,
        }

    # Mode 2: Meta WhatsApp Cloud API (Official Business API)
    elif provider == "meta_cloud":
        if not meta_access_token or not meta_phone_number_id:
            return {
                "ok": False,
                "error": "Meta Cloud API credentials missing: Phone Number ID and Permanent Access Token are required.",
            }

        url = f"https://graph.facebook.com/v21.0/{meta_phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {meta_access_token.strip()}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_to,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": message,
            },
        }

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                return {
                    "ok": True,
                    "provider": "meta_cloud",
                    "message": "WhatsApp message sent successfully via Meta Cloud API",
                    "details": resp_data,
                }
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            try:
                err_json = json.loads(error_body)
                err_msg = err_json.get("error", {}).get("message", error_body)
            except Exception:
                err_msg = error_body
            return {
                "ok": False,
                "provider": "meta_cloud",
                "error": f"Meta API Error ({e.code}): {err_msg}",
            }
        except Exception as e:
            return {"ok": False, "provider": "meta_cloud", "error": f"Network error: {str(e)}"}

    # Mode 3: Twilio WhatsApp
    elif provider == "twilio":
        if not twilio_account_sid or not twilio_auth_token or not twilio_whatsapp_number:
            return {
                "ok": False,
                "error": "Twilio credentials missing: Account SID, Auth Token, and WhatsApp Sender Number required.",
            }

        url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_account_sid}/Messages.json"
        from_num = twilio_whatsapp_number.strip()
        if not from_num.startswith("whatsapp:"):
            from_num = f"whatsapp:{from_num}"
        to_num = f"whatsapp:+{clean_to}"

        data = urllib.parse.urlencode({
            "From": from_num,
            "To": to_num,
            "Body": message,
        }).encode("utf-8")

        auth_str = f"{twilio_account_sid}:{twilio_auth_token}"
        auth_bytes = base64.b64encode(auth_str.encode("utf-8")).decode("ascii")
        headers = {
            "Authorization": f"Basic {auth_bytes}",
            "Content-Type": "application/x-www-form-urlencoded",
        }

        try:
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                return {
                    "ok": True,
                    "provider": "twilio",
                    "message": "WhatsApp message dispatched via Twilio",
                    "sid": resp_data.get("sid"),
                }
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            return {"ok": False, "provider": "twilio", "error": f"Twilio Error ({e.code}): {error_body}"}
        except Exception as e:
            return {"ok": False, "provider": "twilio", "error": f"Twilio request failed: {str(e)}"}

    return {"ok": False, "error": f"Unknown WhatsApp provider: {provider}"}

def send_sms_message(
    provider: str,
    to_phone: str,
    message: str,
    sms_auth_key: str = "",
    sms_sender_id: str = "",
    sms_entity_id: str = "",
    sms_template_id: str = "",
    twilio_account_sid: str = "",
    twilio_auth_token: str = "",
    twilio_phone_number: str = "",
) -> Dict[str, Any]:
    """Send SMS message via MSG91, Fast2SMS, Twilio, or return error if disabled."""
    clean_to = clean_phone_number(to_phone)
    if not clean_to:
        return {"ok": False, "error": "Invalid recipient phone number"}

    if provider == "none" or not provider:
        return {
            "ok": False,
            "error": "SMS Gateway is disabled in settings. Select MSG91, Fast2SMS, or Twilio to enable SMS.",
        }

    # Provider 1: MSG91 (DLT Compliant - India)
    if provider == "msg91":
        if not sms_auth_key or not sms_sender_id:
            return {
                "ok": False,
                "error": "MSG91 requires Auth Key and 6-character DLT Sender ID.",
            }

        url = "https://control.msg91.com/api/v5/flow/"
        headers = {
            "authkey": sms_auth_key.strip(),
            "content-type": "application/json",
        }
        # MSG91 flow payload or transactional payload
        payload = {
            "template_id": sms_template_id.strip() if sms_template_id else "",
            "sender": sms_sender_id.strip(),
            "short_url": 0,
            "recipients": [
                {
                    "mobiles": clean_to,
                    "message": message,
                }
            ],
        }

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                return {
                    "ok": True,
                    "provider": "msg91",
                    "message": "SMS dispatched via MSG91",
                    "details": resp_data,
                }
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            return {"ok": False, "provider": "msg91", "error": f"MSG91 error ({e.code}): {error_body}"}
        except Exception as e:
            return {"ok": False, "provider": "msg91", "error": f"MSG91 request failed: {str(e)}"}

    # Provider 2: Fast2SMS (India)
    elif provider == "fast2sms":
        if not sms_auth_key:
            return {"ok": False, "error": "Fast2SMS Authorization API Key is required."}

        url = "https://www.fast2sms.com/dev/bulkV2"
        headers = {
            "authorization": sms_auth_key.strip(),
            "Content-Type": "application/json",
        }
        # 10-digit number for Fast2SMS
        phone_10 = clean_to[-10:] if len(clean_to) >= 10 else clean_to
        payload = {
            "route": "v3",
            "sender_id": sms_sender_id.strip() if sms_sender_id else "TXTIND",
            "message": message,
            "language": "english",
            "flash": 0,
            "numbers": phone_10,
        }

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                if resp_data.get("return") is True:
                    return {
                        "ok": True,
                        "provider": "fast2sms",
                        "message": "SMS sent successfully via Fast2SMS",
                        "details": resp_data,
                    }
                else:
                    return {
                        "ok": False,
                        "provider": "fast2sms",
                        "error": resp_data.get("message", "Fast2SMS failed to deliver message"),
                    }
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            return {"ok": False, "provider": "fast2sms", "error": f"Fast2SMS error ({e.code}): {error_body}"}
        except Exception as e:
            return {"ok": False, "provider": "fast2sms", "error": f"Fast2SMS failed: {str(e)}"}

    # Provider 3: Twilio SMS
    elif provider == "twilio":
        if not twilio_account_sid or not twilio_auth_token or not twilio_phone_number:
            return {
                "ok": False,
                "error": "Twilio SMS requires Account SID, Auth Token, and Sender Phone Number.",
            }

        url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_account_sid}/Messages.json"
        data = urllib.parse.urlencode({
            "From": twilio_phone_number.strip(),
            "To": f"+{clean_to}",
            "Body": message,
        }).encode("utf-8")

        auth_str = f"{twilio_account_sid}:{twilio_auth_token}"
        auth_bytes = base64.b64encode(auth_str.encode("utf-8")).decode("ascii")
        headers = {
            "Authorization": f"Basic {auth_bytes}",
            "Content-Type": "application/x-www-form-urlencoded",
        }

        try:
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                return {
                    "ok": True,
                    "provider": "twilio",
                    "message": "SMS dispatched via Twilio",
                    "sid": resp_data.get("sid"),
                }
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            return {"ok": False, "provider": "twilio", "error": f"Twilio SMS Error ({e.code}): {error_body}"}
        except Exception as e:
            return {"ok": False, "provider": "twilio", "error": f"Twilio request failed: {str(e)}"}

    return {"ok": False, "error": f"Unknown SMS provider: {provider}"}
