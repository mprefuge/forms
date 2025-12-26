# Azure Functions Form Application

A production-ready TypeScript Azure Functions application for managing Salesforce forms with integrated email verification and multi-phase workflow support.

## Features

- **Multi-Form Support**: Volunteer applications, parental waivers, and event registration
- **Email Verification**: Azure Communication Services integration for secure code verification
- **Salesforce Integration**: Direct integration with Salesforce Form__c custom object
- **Multi-Phase Workflows**: Support for multi-step application processes
- **Attachment Support**: File upload with Salesforce ContentVersion integration
- **Production Ready**: Secure configuration management and comprehensive error handling

## Available Forms

- **Volunteer Application** ([public/application.js](public/application.js)) - Multi-phase volunteer recruitment with pastoral references
- **Parental Waiver** ([public/waiver.js](public/waiver.js)) - Youth program consent and liability waiver
- **Event Registration** ([public/event.js](public/event.js)) - Event registration with optional Salesforce campaign linking

## Prerequisites

- Node.js >= 18.0.0
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

Create a `local.settings.json` file for local development:

```bash
cp .env.example local.settings.json
```

Edit `local.settings.json` with your actual credentials:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "WEBSITE_NODE_DEFAULT_VERSION": "18.x",
    "SF_LOGIN_URL": "https://login.salesforce.com",
    "SF_CLIENT_ID": "your_salesforce_connected_app_client_id",
    "SF_CLIENT_SECRET": "your_salesforce_connected_app_client_secret",
    "AZURE_COMMUNICATION_CONNECTION_STRING": "endpoint=https://your-resource.communication.azure.com/;accesskey=your_key",
    "EMAIL_FROM": "noreply@yourdomain.com"
  },
  "Host": {
    "CORS": "*",
    "CORSCredentials": false
  }
}
```

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

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SF_LOGIN_URL` | Salesforce instance URL | `https://login.salesforce.com` or `https://test.salesforce.com` |
| `SF_CLIENT_ID` | Salesforce Connected App Consumer Key | `3MVG9kBt168mda_...` |
| `SF_CLIENT_SECRET` | Salesforce Connected App Consumer Secret | `16C092610...` |
| `AZURE_COMMUNICATION_CONNECTION_STRING` | Azure Communication Services connection string | `endpoint=https://...;accesskey=...` |
| `EMAIL_FROM` | Verified sender email address | `noreply@yourdomain.com` |

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

### POST /api/form

Create a new form submission.

**Request Body**:
```json
{
  "FirstName__c": "John",
  "LastName__c": "Doe",
  "Email__c": "john@example.com",
  "Phone__c": "555-1234",
  "RecordType": "Volunteer Application"
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

Retrieve form by code.

**Response** (200):
```json
{
  "Id": "a01xx000003DHzAAM",
  "FormCode__c": "abc12",
  "FirstName__c": "John",
  "Email__c": "john@example.com"
}
```

### POST /api/sendCode

Send verification code to email.

**Request Body**:
```json
{
  "email": "user@example.com",
  "formCode": "abc12"
}
```

### POST /api/form (Update)

Update existing form.

**Request Body**:
```json
{
  "formId": "a01xx000003DHzAAM",
  "FirstName__c": "Jane"
}
```

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
   - Use Azure Key Vault for production secrets
   - Rotate credentials regularly

2. **Use Managed Identity** (when possible):
   - Enable Managed Identity on Function App
   - Grant access to Azure resources without storing credentials

3. **Secure CORS**:
   - Configure specific allowed origins in production
   - Avoid using `"*"` for CORS in production

4. **Monitor and Log**:
   - Enable Application Insights
   - Review logs regularly for suspicious activity
   - Set up alerts for errors

## Project Structure

```
├── src/
│   ├── functions/
│   │   ├── createForm/        # Create and retrieve forms
│   │   ├── sendCode/           # Email verification
│   │   ├── sendCodeDiagnostics/ # Email diagnostics
│   │   └── updateForm/         # Update existing forms
│   ├── services/
│   │   ├── emailService.ts     # Azure Communication Services
│   │   ├── salesforceService.ts # Salesforce integration
│   │   └── logger.ts           # Logging utility
│   └── config/
│       └── FormConfigLoader.ts # Form configuration
├── public/
│   ├── application.js          # Volunteer application form
│   ├── waiver.js              # Parental waiver form
│   ├── event.js               # Event registration form
│   └── *.html                 # Form pages
├── tests/                      # Unit tests
├── .env.example               # Environment template
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
