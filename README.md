# Azure Functions Form App

A TypeScript-based Azure Functions application for managing Salesforce forms using Client Credentials OAuth flow.

## Requirements

- Node.js >= 18.0.0
- Azure Functions v4
- TypeScript 5.0+

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create or update `.env.local` with your Salesforce Connected App credentials:

```
FUNCTIONS_WORKER_RUNTIME=node
WEBSITE_NODE_DEFAULT_VERSION=18.x
SF_LOGIN_URL=https://login.salesforce.com
SF_CLIENT_ID=your_connected_app_consumer_key
SF_CLIENT_SECRET=your_connected_app_consumer_secret
```

**Note:** Use Client Credentials flow (not JWT). Obtain credentials from your Salesforce Connected App settings.

### 3. Build

```bash
npm run build
```

### 4. Run Locally

```bash
npm start
```

The function will be available at: `http://localhost:7071/api/form`

## Running Tests

```bash
npm test
npm run test:watch
```

> **Note:** Some unit tests rely on Salesforce credentials being present. The test suite sets test credentials for `updateForm` tests automatically and some tests set credentials inline; you can also export `SF_CLIENT_ID` and `SF_CLIENT_SECRET` in your environment before running the tests if you prefer.

## API Endpoints

### Create Form

**Endpoint:** `POST /api/form`

**Request Headers:**
- `X-Request-Id` (optional): Custom request ID for tracing. If not provided, one will be generated.
- `Content-Type`: `application/json`

**Request Body:**

```json
{
  "FirstName__c": "John",
  "LastName__c": "Doe",
  "Email__c": "john@example.com",
  "Phone__c": "555-1234",
  "RecordType": "Registration",
  "Attachments": [
    {
      "fileName": "resume.pdf",
      "contentType": "application/pdf",
      "base64": "base64encodedcontent"
    }
  ],
  "Notes": [
    {
      "Title": "Application Note",
      "Body": "This applicant was referred by..."
    }
  ]
}
```

**Note:** The form accepts any updateable field from the Salesforce `Form__c` object. The API dynamically queries Salesforce to determine which fields are updateable, so you're not limited to a hardcoded list.

**Success Response (201 Created):**

```json
{
  "id": "a01xx000003DHzAAM",
  "formCode": "abc12"
}
```

### Get Form

**Endpoint:** `GET /api/form?code={formCode}`

**Query Parameters:**
- `code`: The 5-character form code (e.g., "abc12")

**Success Response (200 OK):**

```json
{
  "Id": "a01xx000003DHzAAM",
  "FormCode__c": "abc12",
  "FirstName__c": "John",
  "LastName__c": "Doe",
  "Email__c": "john@example.com",
  "Phone__c": "555-1234",
  "CreatedDate": "2025-12-20T10:30:00.000Z"
}
```

### Update Form

**Endpoint:** `POST /api/form/{id}` or `POST /api/form`

**Route Parameters:**
- `id`: Form ID or form code (optional if provided in body)

**Request Body:**

```json
{
  "formId": "a01xx000003DHzAAM",
  "FirstName__c": "Jane",
  "Email__c": "jane@example.com",
  "Attachments": [
    {
      "fileName": "updated_resume.pdf",
      "contentType": "application/pdf",
      "base64": "base64encodedcontent"
    }
  ],
  "Notes": [
    {
      "Title": "Follow-up Note",
      "Body": "Candidate accepted position"
    }
  ]
}
```

**Alternative:** You can also use `formCode` instead of `formId`:

```json
{
  "formCode": "abc12",
  "FirstName__c": "Jane"
}
```

**Note:** Like the create endpoint, this accepts any updateable field from the Salesforce `Form__c` object. The API dynamically determines which fields can be updated.

**Success Response (200 OK):**

```json
{
  "id": "a01xx000003DHzAAM",
  "message": "Form updated successfully",
  "attachmentsCreated": 1,
  "notesCreated": 1
}
```

**Error Responses:**

- `400 Bad Request`: Invalid JSON, invalid fields, or missing required parameters
- `404 Not Found`: Form not found with provided code or ID
- `405 Method Not Allowed`: Invalid HTTP method
- `500 Internal Server Error`: Salesforce authentication or connection error

## Logging

All requests are logged with:
- Timestamp
- Log level (INFO, ERROR, DEBUG)
- Request ID
- Invocation ID
- Sensitive data is masked

Example log entry:
```json
{
  "timestamp": "2025-12-20T10:30:00.000Z",
  "level": "INFO",
  "requestId": "req-123-abc",
  "invocationId": "inv-456-def",
  "message": "Form created successfully",
  "context": {
    "formId": "a01xx000003DHzAAM"
  }
}
```

## Project Structure

```
├── src/
│   ├── functions/
│   │   ├── createForm/
│   │   │   ├── index.ts           (HTTP trigger for create/get)
│   │   │   └── function.json      (Function binding configuration)
│   │   └── updateForm/
│   │       ├── index.ts           (HTTP trigger for update)
│   │       └── function.json      (Function binding configuration)
│   └── services/
│       ├── salesforceService.ts   (Salesforce API integration)
│       └── logger.ts              (Logging utility)
├── tests/
│   ├── createForm.test.ts         (Unit tests for create/get)
│   ├── updateForm.test.ts         (Unit tests for update)
│   └── salesforceService.test.ts  (Service layer tests)
├── host.json                      (Azure Functions host config)
├── package.json                   (Dependencies and scripts)
├── tsconfig.json                  (TypeScript configuration)
└── jest.config.js                 (Jest configuration)
```

## Development

- **TypeScript Compilation:** `npm run build`
- **Watch Mode:** Use VS Code or set up a file watcher
- **Local Debugging:** `npm start` and attach debugger to Node process

## Deployment to Azure

```bash
npm run build
# The build step copies non-TS assets (function.json, host.json) into `dist/`
# You can publish the contents of `dist/` using the Azure Functions CLI or CI/CD
func azure functionapp publish <your-function-app-name> --publish-local-settings
```

**Important:** Do not commit production secrets to the repository.
- `local.settings.json` is intended for local development only and **must not** be committed. This repo ignores `local.settings.json` by default. 
- Store production secrets in **Azure Function App Settings** or **Azure Key Vault** and reference them from the Function App (use Managed Identity for Key Vault access).

### CI/CD
A GitHub Actions workflow is included (`.github/workflows/ci.yml`) which:
- Runs tests and builds on push/PR to `main`
- Archives the build artifact (`dist/`)
- Optionally deploys to Azure when `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` and `AZURE_FUNCTIONAPP_NAME` are set in repository secrets.

To enable automatic deployment add the following GitHub repository secrets:
- `AZURE_FUNCTIONAPP_NAME` — the name of your Function App
- `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` — the publish profile content (copy from the Azure portal)

For higher security, prefer **Key Vault** references instead of storing secrets directly in Function App settings.
