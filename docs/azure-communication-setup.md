# Azure Communication Services (Email) — Setup Walkthrough

This walkthrough shows how to set up **Azure Communication Services (ACS) Email** and configure this project to send application codes to applicants by email.

> Quick summary: create an ACS resource in your subscription, register a verified sender (your email or domain), copy the connection string, set environment variables (`AZURE_COMMUNICATION_CONNECTION_STRING` or `AZURE_EMAIL_CONNECTION_STRING` and `EMAIL_FROM`), and test sending via the local `send-code` endpoint.

---

## 1) Prerequisites

- An Azure subscription where you can create resources (Contributor or Owner role).
- The Azure CLI installed (optional but convenient): https://learn.microsoft.com/cli/azure/install-azure-cli
- This repository checked out locally and dependencies installed:

```bash
npm install
```

**Note:** This project uses a lazy `require()` for the ACS SDK at runtime. To use ACS Email in your environment, install the SDK into the project dependencies (recommended for local testing and deployment):

```bash
npm install @azure/communication-email
# (optional) nodemailer if you prefer SMTP fallback
npm install nodemailer
```

---

## 2) Create a Communication Services resource

You can create the resource either via the Azure Portal or the Azure CLI.

- Portal: Go to the Azure Portal → "Create a resource" → search for **Communication Services** → follow the wizard.
- Azure CLI example:

```bash
az login
az group create --name my-rg --location westus2
az communication create --name my-comm-service --resource-group my-rg --location westus2
```

After creation, open the resource in the Azure Portal.

---

## 3) Configure Email senders / Verified Domains

The ACS Email capability requires you to register a sender identity. The steps differ depending on whether you want to send from a single verified email address or a verified sending domain:

1. In the Communication Services resource blade, open **Email** (or look for Email) and follow the UI to add a **sender** (an email address) or **domain**.
2. If you add a domain, follow the DNS instructions provided (TXT records) to prove ownership and enable domain sending.
3. If you add a single email sender, you may need to click a verification link sent to that inbox.

Make sure the email address you plan to use in `EMAIL_FROM` is listed as a verified sender.

---

## 4) Get the Connection String (access key)

1. In the Communication Services resource, open **Keys and connection strings** (or "Access keys").
2. Copy the **Primary connection string**.

Set it in your environment as `AZURE_COMMUNICATION_CONNECTION_STRING` (or `AZURE_EMAIL_CONNECTION_STRING` — the code accepts either name).

---

## 5) Configure environment variables (local testing)

Add the connection string and the `EMAIL_FROM` address to your local environment (e.g., `.env.local` or `local.settings.json`). Example `local.settings.json` snippet:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_COMMUNICATION_CONNECTION_STRING": "endpoint=https://<your-resource>.communication.azure.com/;accesskey=...",
    "EMAIL_FROM": "no-reply@yourdomain.com",
    "SF_CLIENT_ID": "...",
    "SF_CLIENT_SECRET": "...",
    "SF_LOGIN_URL": "https://login.salesforce.com"
  }
}
```

> Tip: Use `EMAIL_FROM` for the verified sender address you registered in the ACS Email portal.

---

## 6) Test locally (end-to-end)

1. Start the Functions host locally:

```bash
npm run build
npm start
```

2. Create a test form (so an entry exists in Salesforce) using the normal `POST /api/form` create endpoint (include `Email__c` set to the address you'll test with).

3. Trigger the send-code flow (this project exposes a helper endpoint that looks up a form by email and sends the code):

```bash
curl -X POST http://localhost:7071/api/form/send-code -H "Content-Type: application/json" -d '{"email":"john@example.com"}'
```

4. Check the inbox for the `EMAIL_FROM` sender. If the message doesn't arrive, review the function logs and the Communication Services message trace in the Azure Portal.

---

## 7) Troubleshooting

- Error: "Azure Communication Email SDK is not available in this environment"
  - Ensure `@azure/communication-email` is installed and included in your deployment's `package.json`.

- Error: "Failed to send email via Azure Communication Services: ..."
  - Verify that `EMAIL_FROM` is a verified sender or that your sending domain is verified.
  - Check the connection string is correct (no whitespace or truncated keys).
  - Inspect resource quotas and email sending limits in the Azure Portal and check message traces.

- If you prefer not to use ACS or want a fallback, the code supports SMTP via environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`). Install `nodemailer` to enable SMTP.

---

## 8) Production notes

- Store `AZURE_COMMUNICATION_CONNECTION_STRING` and `EMAIL_FROM` in Azure Function App Settings or Azure Key Vault — do not commit secrets to source control.
- Consider adding retry and observability (Application Insights) for production email sends, and enforce rate limiting on `send-code` if you expect many requests to prevent abuse.

---

## Useful Links

- Azure Communication Services - Email quickstart: https://learn.microsoft.com/azure/communication-services/quickstarts/email/send-email
- Communication Services documentation: https://learn.microsoft.com/azure/communication-services

---

If you'd like, I can also add an automated integration test that exercises the `send-code` endpoint against a test ACS resource or Mailtrap-like service—tell me which option you prefer.