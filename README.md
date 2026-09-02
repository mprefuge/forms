# Azure Functions Form Application

A production-ready TypeScript Azure Functions application for managing Salesforce forms with integrated email verification and multi-phase workflow support.

## Features

- **Multi-Form Support**: Volunteer applications, parental waivers, event registration, and standalone registration
- **Email Verification**: Azure Communication Services integration for secure code verification
- **Salesforce Integration**: Direct integration with Salesforce Form__c custom object
- **Multi-Phase Workflows**: Support for multi-step application processes
- **Attachment Support**: File upload with Salesforce ContentVersion integration
- **Production Ready**: Secure configuration management and comprehensive error handling

## Available Forms

- **Volunteer Application** ([public/application.js](public/application.js)) - Multi-phase volunteer recruitment with pastoral references
- **Parental Waiver** ([public/waiver.js](public/waiver.js)) - Youth program consent and liability waiver. Can be displayed full‑page or embedded as a modal popup by calling the generic `window.openModal()` helper.
- **Event Registration** ([public/event.js](public/event.js)) - Event registration with optional Salesforce campaign linking. Supports a rich‑text Salesforce field (`Additional_Information__c`) that is shown below the description. Description and additional information are displayed even if no location is provided.
- **Registration Form** ([public/registration.js](public/registration.js)) - Standalone registration form with `location`, `type`, and `language` parameters. If `language` is omitted or unsupported, the form defaults to English.

## Prerequisites

- Node.js >= 20.0.0 (CI and the Function App run Node 22)
- Azure Functions v4
- Azure subscription (for deployment)
- Salesforce org with Connected App configured
- Azure Communication Services resource (for email)

## Local Development Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd forms
npm install
```

### 2. Configure Environment Variables

Create a `local.settings.json` file for local development from the checked-in example:

```bash
cp local.settings.example.json local.settings.json
```

Then fill in your Salesforce and email credentials. `NODE_ENV` is set to `development` in the example so that debug logging and error details are enabled locally; leave it unset in Azure (the code treats anything other than `development`/`test` as production).

**Important**: Never commit `local.settings.json` to version control. It's already in `.gitignore`.

### 3. Build and Run

```bash
# Build TypeScript
npm run build

# Start local Azure Functions
npm start
```

The API will be available at `http://localhost:7071/api/form`

### 4. Test Locally

Open the test pages in your browser:
- Volunteer Application: `index.html`
- Parental Waiver: `public/waiver.html`
- Event Registration: `public/event.html`
- Registration Form: `public/registration.html`

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SF_LOGIN_URL` | Salesforce instance URL | `https://login.salesforce.com` or `https://test.salesforce.com` |
| `SF_CLIENT_ID` | Salesforce Connected App Consumer Key | `3MVG9kBt168mda_...` |
| `SF_CLIENT_SECRET` | Salesforce Connected App Consumer Secret | `16C092610...` |
| `AZURE_COMMUNICATION_CONNECTION_STRING` | Azure Communication Services connection string | `endpoint=https://...;accesskey=...` |
| `EMAIL_FROM` | Verified sender email address | `noreply@yourdomain.com` |
| `MAILCHIMP_API_KEY` | Mailchimp API key used for list sync | `xxxx-us21` |
| `MAILCHIMP_AUDIENCE_ID` | Mailchimp Audience/List ID for opted-in registrants | `a1b2c3d4e5` |

### Security and Operations Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ADMIN_EMAIL` | Recipient(s) for submission notifications and failure alerts (comma/semicolon separated) | `staff@yourdomain.org` |
| `NOTIFICATION_EMAIL_ALLOWED_DOMAINS` | Domains that client-supplied notification recipients may belong to. The domains of `ADMIN_EMAIL` and `EMAIL_FROM` are always allowed. Recipients outside this set are ignored. | `yourdomain.org,partner.org` |
| `NOTIFICATION_EMAIL_ALLOWED_ADDRESSES` | Exact addresses that may receive notifications when their domain is not allowlisted (for example volunteers on Gmail). The Farmdale ESL registration form currently notifies two Gmail addresses that must be listed here. | `person@gmail.com,other@gmail.com` |
| `SF_ALLOWED_RECORD_TYPES` | Optional allowlist of `Form__c` record type names a submission may target. When unset, any record type the integration user can create is accepted. | `Registration,Volunteer Application` |
| `PUBLIC_BASE_URL` | Public URL of this Function App, used to build calendar and file links in emails. Defaults to `https://$WEBSITE_HOSTNAME`. | `https://forms.yourdomain.org` |
| `NODE_ENV` | Leave unset in Azure. Set to `development` locally to enable debug logging and error details in responses. | `development` |
| `LOG_LEVEL` | Set to `debug` to enable debug-level log lines in production temporarily. | `debug` |

### Optional Mailchimp Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MAILCHIMP_SERVER_PREFIX` | Data center prefix if not inferred from API key | `us21` |
| `MAILCHIMP_TAGS` | Comma-separated default tags applied to synced members | `forms,registration` |
| `MAILCHIMP_DOUBLE_OPT_IN` | Send new members as pending instead of subscribed (`true`/`false`) | `true` |

When `ReceiveUpdates` is `true`, new and updated registrants are automatically upserted into Mailchimp. Sync is non-blocking: form submission succeeds even if Mailchimp is unavailable.

### Salesforce Setup

1. **Create a Connected App** in Salesforce:
   - Setup → App Manager → New Connected App
   - Enable OAuth Settings
   - Enable "Client Credentials Flow"
   - Add required OAuth scopes: `api`, `refresh_token`
   - Note the Consumer Key (Client ID) and Consumer Secret

2. **Configure API User**:
   - Create a dedicated API integration user
   - Assign appropriate permissions to access Form__c object
   - Link the user to the Connected App

3. **Custom Object Requirements**:
   - Your Salesforce org must have a custom object named `Form__c`
   - Required fields: `FormCode__c` (unique identifier), record types for different form types
   - The application dynamically queries available fields

### Azure Communication Services Setup

1. **Create ACS Resource**:
   - Azure Portal → Create Resource → Communication Services
   - Choose a resource name and region

2. **Configure Email**:
   - In the ACS resource, go to Email → Domains
   - Add and verify your domain OR use the provided Azure domain
   - Add verified sender addresses

3. **Get Connection String**:
   - Navigate to Keys in your ACS resource
   - Copy the connection string
   - Set as `AZURE_COMMUNICATION_CONNECTION_STRING`

## Production Deployment

### Option 1: GitHub Actions (Recommended)

The repository includes a GitHub Actions workflow for automated deployment.

1. **Configure GitHub Secrets**:

Go to your repository → Settings → Secrets and variables → Actions

Add the following secrets:
- `AZUREAPPSERVICE_CLIENTID_*` - Azure Service Principal Client ID
- `AZUREAPPSERVICE_TENANTID_*` - Azure Tenant ID  
- `AZUREAPPSERVICE_SUBSCRIPTIONID_*` - Azure Subscription ID

2. **Configure Azure App Settings**:

After deployment, configure environment variables in Azure Portal:
- Navigate to your Function App → Configuration → Application settings
- Add all required environment variables (see Environment Variables Reference above)

3. **Update Frontend Configuration**:

Edit the `window.APP_CONFIG` in your HTML files:
```javascript
window.APP_CONFIG = {
  apiEndpoint: 'https://your-app.azurewebsites.net/api/form',
  statementUrl: 'https://your-cdn.com/statement.pdf',
  orgName: 'Your Organization'
};
```

4. **Deploy**:
- Push to your main branch or trigger workflow manually
- GitHub Actions will build and deploy automatically

### Option 2: Azure CLI

```bash
# Build the application
npm run build

# Login to Azure
az login

# Deploy to Function App
func azure functionapp publish <your-function-app-name>
```

**Important**: Do NOT use `--publish-local-settings` flag in production to avoid exposing secrets.

### Option 3: VS Code Azure Extension

1. Install "Azure Functions" extension in VS Code
2. Sign in to Azure
3. Right-click on Function App → Deploy to Function App
4. Configure application settings in Azure Portal after deployment

## Frontend Configuration

### Waiver Modal Example

Any form script may expose its own rendering logic; the available modal helper is generic. For the waiver form you can do:

```html
<button onclick="openModal({ onOpen: container => { hostOverride = container; /* render form */ }})">
  Click here to complete the waiver
</button>
```

The form will render inside a modal overlay rather than navigating away.


### Default Configuration

The forms work out of the box with sensible defaults for local development:
- `apiEndpoint`: `http://localhost:7071/api/form`
- `statementUrl`: Empty (can be set per form if needed)
- `orgName`: `Refuge International`

### Production Configuration

For production, add a single configuration block **before** loading your form script:

```html
<!-- Option 1: Simple one-line configuration -->
<script>window.FORMS_CONFIG = { apiEndpoint: 'https://your-app.azurewebsites.net/api/form' };</script>
<script src="./application.js"></script>

<!-- Option 2: With all options -->
<script>
  window.FORMS_CONFIG = {
    apiEndpoint: 'https://your-app.azurewebsites.net/api/form',
    statementUrl: 'https://your-cdn.com/statement.pdf'  // Optional, for volunteer form
  };
</script>
<script src="./application.js"></script>
```

That's it! The configuration applies to all forms. Just use the appropriate script filename:
- `application.js` - Volunteer Application
- `waiver.js` - Parental Waiver
- `event.js` - Event Registration
- `registration.js` - Standalone Registration Form

### Example: Complete HTML Setup

```html
<!DOCTYPE html>
<html>
<head>
  <title>Volunteer Application</title>
  <link rel="stylesheet" href="./public/application.css">
</head>
<body>
  <div id="volunteer-app"></div>
  
  <!-- Single configuration block for production -->
  <script>
    window.FORMS_CONFIG = {
      apiEndpoint: 'https://your-app.azurewebsites.net/api/form'
    };
  </script>
  <script src="./public/application.js"></script>
</body>
</html>
```

For local development, you don't even need the configuration block—just load the script and it uses localhost defaults.

## API Reference

All endpoints are anonymous. The browser sends its form configuration with each request as `__formConfig` (POST) or `formConfig` (GET); the API sanitizes it before use (see `src/config/clientFormConfig.ts`): the Salesforce object is always `Form__c`, lookups are always by `FormCode__c`, every field name must be a plain identifier, and the record type can be restricted with `SF_ALLOWED_RECORD_TYPES`. Email templates are owned by the API (`src/config/emailTemplates.ts`) and selected by the form config `id`; any templates in the request are ignored.

### POST /api/form

Create a new form submission. When the body contains a `FormCode__c`, the matching record is updated instead.

**Request Body**:
```json
{
  "FirstName__c": "John",
  "LastName__c": "Doe",
  "Email__c": "john@example.com",
  "Phone__c": "555-1234",
  "__sendEmail": true,
  "__formConfig": { "id": "volunteer", "name": "Volunteer Application", "salesforce": { "recordTypeName": "Volunteer Application", "allowedFields": ["FirstName__c", "LastName__c", "Email__c", "Phone__c"] } }
}
```

**Response** (201):
```json
{
  "id": "a01xx000003DHzAAM",
  "formCode": "abc12"
}
```

### GET /api/form?code={formCode}

Retrieve form by code. An optional `fields` parameter (comma-separated field names) limits the returned columns. Lookup by email address is not supported on this endpoint; use the send-code endpoint below so the code is delivered to the address on file.

**Response** (200):
```json
{
  "Id": "a01xx000003DHzAAM",
  "FormCode__c": "abc12",
  "FirstName__c": "John",
  "Email__c": "john@example.com"
}
```

### POST /api/form/send-code

Email the form code to the address on file. The response is the same whether or not a submission exists for the address.

**Request Body**:
```json
{
  "email": "user@example.com",
  "formId": "volunteer"
}
```

### GET /api/calendar

Returns an `.ics` file for the event details passed in the query string. Links to this endpoint are embedded in event confirmation emails.

### Other query modes on GET /api/form

- `?eventId={campaignId}` returns campaign metadata for an event.
- `?listActiveEvents=true` lists active Event campaigns.
- `?downloadContentVersion={id}` / `?downloadAttachment={id}` proxy campaign images referenced by the event pages.

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm test -- --coverage
```

## Security Best Practices

1. **Never commit secrets**:
   - `local.settings.json` is in `.gitignore`
   - Use Azure Key Vault references for production app settings
   - Rotate credentials regularly

2. **Lock down the Salesforce integration user**: the API is anonymous and the browser supplies the list of fields it wants to write. The integration user's profile and field-level security are the backstop, so grant it create/edit only on the `Form__c` fields the forms use, create on `Contact`/`CampaignMember`, and read on `Campaign`. Set `SF_ALLOWED_RECORD_TYPES` to the record types the forms use.

3. **Restrict who can be emailed**: set `NOTIFICATION_EMAIL_ALLOWED_DOMAINS` and, for individual recipients on shared providers, `NOTIFICATION_EMAIL_ALLOWED_ADDRESSES` (the `ADMIN_EMAIL`/`EMAIL_FROM` domains are always allowed). Recipients outside the allowlist are dropped and logged.

4. **Rate limit the public endpoints**: form codes are short and the endpoints are anonymous. Put the Function App behind Azure Front Door or API Management with a per-IP rate limit, or use App Service access restrictions, before exposing it broadly.

5. **Secure CORS**: configure the specific site origins in the Function App's CORS settings; do not use `*`.

6. **Monitor and Log**: Application Insights is enabled through `host.json`. Logs mask secrets, email addresses and phone numbers; set `LOG_LEVEL=debug` only while troubleshooting.

## Project Structure

```
├── src/
│   ├── functions/
│   │   ├── createForm/        # Create, update and retrieve forms (entry point; imports the others)
│   │   ├── sendCode/           # Email the form code to the address on file
│   │   ├── calendar/           # .ics download used by event confirmation emails
│   │   ├── updateForm/         # Legacy update handler (not registered with the host)
│   │   └── shared/             # Request parsing, SOQL safety, env and recipient helpers
│   ├── services/
│   │   ├── emailService.ts     # Azure Communication Services / SMTP
│   │   ├── salesforceService.ts # Salesforce integration
│   │   ├── contactMatchService.ts # Contact matching
│   │   ├── mailchimpService.ts # Mailchimp sync
│   │   └── logger.ts           # Structured logging with PII masking
│   └── config/
│       ├── clientFormConfig.ts # Sanitizes browser-supplied form configs
│       ├── emailTemplates.ts   # Server-owned email templates per form
│       └── FormConfigLoader.ts # Server-side form registry
├── public/
│   ├── application.js          # Volunteer application form
│   ├── waiver.js              # Parental waiver form
│   ├── event.js               # Event registration form
│   └── *.html                 # Form pages
├── tests/                      # Unit tests
├── local.settings.example.json # Local settings template
├── host.json                  # Azure Functions configuration
└── package.json
```

## Troubleshooting

### Common Issues

**Issue**: "Unable to authenticate with Salesforce"
- Verify `SF_CLIENT_ID` and `SF_CLIENT_SECRET` are correct
- Check that Client Credentials Flow is enabled in Salesforce Connected App
- Verify API user has necessary permissions

**Issue**: "Email not sending"
- Verify `EMAIL_FROM` is a verified sender in Azure Communication Services
- Check `AZURE_COMMUNICATION_CONNECTION_STRING` is correct
- Review Azure Communication Services logs in Azure Portal

**Issue**: "CORS errors in browser"
- Update CORS settings in `host.json` or Azure Portal
- Ensure frontend is using correct API endpoint

**Issue**: "Form not found"
- Verify `FormCode__c` exists in Salesforce
- Check that form code is being passed correctly
- Review Salesforce permissions for API user

## Support

For issues and questions:
1. Check troubleshooting section above
2. Review Azure Function logs
3. Check Salesforce API logs
4. Review Azure Communication Services message status

## License

[Your License Here]
