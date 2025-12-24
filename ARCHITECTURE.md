# Architecture Overview

## Form Configuration: JavaScript Forms with Generic Fallback

This application prioritizes JavaScript forms that send their own configuration, with a generic fallback for backward compatibility.

### Primary: JavaScript Forms

**Location**: `public/*.js`

Each form is a self-contained JavaScript file that:
- Defines its own `FORM_CONFIG` object
- Sends configuration with every API request
- Requires **zero backend changes** to add new forms
- Requires **no TypeScript compilation**

**Example**: [public/application.js](public/application.js) (Volunteer form)  
**Template**: [public/donor.js.template](public/donor.js.template)

**How it works**:
```javascript
// Each .js file contains:
const FORM_CONFIG = {
  id: 'volunteer',
  name: 'Volunteer Application',
  salesforce: {
    objectName: 'Form__c',
    recordTypeName: 'Volunteer',
    allowedFields: [...],
    queryFields: [...],
    updateFields: [...]
  }
};

// Sent with POST requests
payload['__formConfig'] = FORM_CONFIG;

// Sent with GET requests  
fetch(`/api/form?code=abc12&formConfig=${encodeURIComponent(JSON.stringify(FORM_CONFIG))}`);
```

### Fallback: Generic Configuration

**Location**: `src/config/genericFormConfig.ts`

Generic fallback configuration used when:
- JavaScript forms don't provide `__formConfig` or `formConfig` parameter
- Direct API calls without configuration
- **Tests that don't include formConfig** (tests should include it)

**Default**: The API defaults to `formId: 'general'` which provides minimal sensible defaults.

**Note**: Form-specific logic should come from JavaScript files, not TypeScript configs.

---

## API Endpoints

### POST /api/form
Creates or updates a form in Salesforce.

**Priority**:
1. Uses `__formConfig` from request body (JavaScript forms)
2. Falls back to `getFormConfig(formId)` (TypeScript registry)
3. Defaults to `formId: 'volunteer'` if not specified

**Request with JavaScript config**:
```json
{
  "FirstName": "John",
  "LastName": "Doe",
  "Email": "john@example.com",
  "__formConfig": {
    "id": "volunteer",
    "salesforce": {...}
  }
}
```

**Request without config (uses fallback)**:
```json
{
  "formId": "volunteer",
  "FirstName": "John",
  "LastName": "Doe"
}
```

### GET /api/form?code=abc12
Retrieves a form by code.

**Priority**:
1. Uses `formConfig` query parameter (JavaScript forms)
2. Falls back to `getFormConfig(formId)` (TypeScript registry)
3. Defaults to `formId: 'volunteer'` if not specified

**Request with JavaScript config**:
```
GET /api/form?code=abc12&formConfig=%7B%22id%22%3A%22volunteer%22...%7D
```

**Request without config (uses fallback)**:
```
GET /api/form?code=abc12&formId=volunteer
```

---

## Services

### SalesforceService
Handles all Salesforce operations:
- Authentication (Client Credentials OAuth)
- CRUD operations on forms
- SOQL query building from configuration
- Field filtering and validation

**Configuration-driven**:
```typescript
// All operations accept form config as parameter
await salesforceService.createForm(data, requestId, formConfig);
await salesforceService.getFormByCode(code, formConfig);
await salesforceService.updateForm(id, data, requestId);
```

### EmailService
Sends emails via Azure Communication Services or SMTP:
- Application code emails
- Application copy emails
- Template variable substitution

### Logger
Structured logging with request IDs for tracing.

---

## File Structure

```
c:\Projects\forms\
│
├── public/                          # JavaScript forms (no build needed)
│   ├── application.js               # Volunteer form (working example)
│   ├── application.css              # Form styles
│   └── donor.js.template            # Template for new forms
│
├── src/                             # TypeScript backend
│   ├── config/                      # Fallback form configurations
│   │   ├── volunteerFormConfig.ts   # Volunteer config (TypeScript)
│   │   ├── FormConfigLoader.ts      # Registry initialization
│   │   ├── FormRegistry.ts          # Configuration registry
│   │   ├── formConfigTypes.ts       # TypeScript interfaces
│   │   └── FormConfigUtils.ts       # Utility functions
│   │
│   ├── functions/                   # Azure Functions
│   │   ├── createForm/              # POST/GET /api/form
│   │   ├── updateForm/              # POST /api/updateForm
│   │   ├── sendCode/                # POST /api/sendCode
│   │   └── sendCodeDiagnostics/     # GET /api/sendCodeDiagnostics
│   │
│   └── services/                    # Business logic
│       ├── salesforceService.ts     # Salesforce integration
│       ├── emailService.ts          # Email sending
│       └── logger.ts                # Structured logging
│
├── tests/                           # Unit tests (use TypeScript fallback)
│   ├── createForm.test.ts
│   ├── updateForm.test.ts
│   ├── sendCode.test.ts
│   └── salesforceService.test.ts
│
├── docs/                            # Additional documentation
│   └── azure-communication-setup.md
│
├── README.md                        # Main documentation
├── QUICK_START.md                   # JavaScript forms guide
├── ADDING_FORMS_JAVASCRIPT.md       # Complete JavaScript forms guide
└── ARCHITECTURE.md                  # This file
```

---

## Adding a New Form

### JavaScript Form (Recommended)
1. Copy template: `cp public/donor.js.template public/myform.js`
2. Edit configuration in `myform.js`
3. Deploy (no build needed)

See [QUICK_START.md](QUICK_START.md) for details.

### TypeScript Form (Fallback)
1. Create config: `src/config/myFormConfig.ts`
2. Register in `FormConfigLoader.ts`
3. Build: `npm run build`
4. Deploy

---

## Why This Approach?

**JavaScript forms** enable:
- ✅ No build step for new forms
- ✅ Independent form files
- ✅ Easy customization
- ✅ No backend code changes

**Generic fallback** provides:
- ✅ Backward compatibility
- ✅ Sensible defaults
- ✅ API works without client-provided config

JavaScript forms are the primary approach. The generic fallback exists only for compatibility.

---

## Build and Deploy

```bash
# Build (compiles TypeScript, copies assets)
npm run build

# Output goes to dist/
# Deploy dist/ to Azure Functions
```

**Note**: JavaScript forms in `public/` can be deployed independently without rebuilding the backend.

---

## Configuration Format

Both JavaScript and TypeScript forms use the same configuration structure:

```typescript
interface FormConfig {
  id: string;
  name: string;
  salesforce: {
    objectName: string;           // Salesforce object (e.g., 'Form__c')
    recordTypeName: string;       // Record type name
    allowedFields: string[];      // Fields that can be written
    queryFields: string[];        // Fields to retrieve (subset of allowedFields)
    updateFields: string[];       // Fields that can be updated (subset of allowedFields)
    searchField: string;          // Field to search by (e.g., 'FormCode__c')
    lookupEmailField: string;     // Email field for lookups
  };
  phases?: {...};                 // Form phases and steps (JavaScript only)
  fieldMetadata?: {...};          // Field definitions (JavaScript only)
  salesforceMapping?: {...};      // Field name mappings (JavaScript only)
}
```

---

## Testing

```bash
# Run tests (use TypeScript fallback)
npm test

# Tests don't require JavaScript forms
# They use volunteerFormConfig.ts from registry
```

---

## Environment Variables

```bash
# Required
SF_LOGIN_URL=https://login.salesforce.com
SF_CLIENT_ID=your_client_id
SF_CLIENT_SECRET=your_client_secret

# Optional: Email (Azure Communication Services)
AZURE_COMMUNICATION_CONNECTION_STRING=endpoint=https://...

# Optional: Email (SMTP fallback)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_password
```

See [docs/azure-communication-setup.md](docs/azure-communication-setup.md) for email setup.

---

## Key Design Decisions

1. **JavaScript-first**: Prioritize JavaScript forms for ease of use
2. **TypeScript fallback**: Maintain server-side configs for compatibility
3. **Configuration-driven**: Services accept form config as parameters
4. **No shared state**: JavaScript forms are completely independent
5. **Backward compatible**: API works with or without client-provided config

This dual approach provides flexibility while maintaining simplicity for the common case (JavaScript forms).
