# Adding New Forms - Each Form Gets Its Own JavaScript File

**No TypeScript compilation required. No shared configuration. Just create a new .js file for each form!**

---

## Architecture

Each form is completely independent with its own JavaScript file:

```
public/
├── index.html                 ← Loads forms via script tags
├── application.css            ← Shared styles
├── application.js             ← Volunteer Application form
├── donor.js                   ← Donor form (when created)
├── survey.js                  ← Survey form (when created)
└── event.js                   ← Event form (when created)
```

### In Your HTML

```html
<!-- Load the form you want to display -->

<!-- For Volunteer Application: -->
<script src="application.js"></script>

<!-- For Donor Registration: -->
<!-- <script src="donor.js"></script> -->

<!-- For Survey: -->
<!-- <script src="survey.js"></script> -->
```

---

## Adding a New Form (3 Steps)

### Step 1: Copy Template
```bash
# Copy the donor form template
cp public/donor.js.template public/yourform.js

# Or copy an existing form as a base
cp public/application.js public/yourform.js
```

### Step 2: Customize Configuration

Edit `public/yourform.js`:

```javascript
const FORM_CONFIG = {
  id: 'yourform',
  name: 'Your Form Name',
  salesforce: {
    objectName: 'YourObject__c',        // Salesforce object
    recordTypeName: 'YourRecordType',   // Record type
    allowedFields: [ /* your fields */ ],
    queryFields: [ /* optimized fields */ ],
    updateFields: [ /* restricted fields */ ],
    searchField: 'FormCode__c',
    lookupEmailField: 'Email__c'
  }
};

const phases = {
  initial: {
    name: "Your Form Title",
    steps: [
      { title: "Step 1", fields: ["Field1", "Field2"] },
      { title: "Step 2", fields: ["Field3"] }
    ]
  }
};

const fieldMeta = {
  Field1: { label: "Label 1", type: "text", required: true },
  Field2: { label: "Label 2", type: "email", required: true },
  // ... etc
};

const fieldToSf = {
  Field1: 'Field1__c',
  Field2: 'Field2__c',
  // ...
};
```

### Step 3: Deploy

```bash
# Just deploy the new .js file to public/
# No build, no compilation needed!

# Update your HTML to point to the new form
<script src="yourform.js"></script>
```

---

## Form Configuration Reference

Every form .js file contains:

### 1. FORM_CONFIG
```javascript
const FORM_CONFIG = {
  id: 'unique-id',                              // Unique form identifier
  name: 'Display Name',                         // User-facing name
  salesforce: {
    objectName: 'Form__c',                      // Salesforce object
    recordTypeName: 'RecordTypeName',           // Record type
    allowedFields: [],                          // Fields for CREATE
    queryFields: [],                            // Fields for SELECT (optimized)
    updateFields: [],                           // Fields for UPDATE (restricted)
    searchField: 'FormCode__c',                 // Lookup field
    lookupEmailField: 'Email__c'                // Email lookup field
  }
};
```

### 2. phases
```javascript
const phases = {
  initial: {                                    // Phase ID
    name: "Application",                        // Display name
    description: "Tell us about yourself",      // Subtitle
    estimatedTime: 15,                          // Minutes
    steps: [
      { 
        title: "Basic Information",
        description: "Your name and email",
        fields: ["FirstName", "LastName", "Email"] 
      },
      { 
        title: "Details",
        description: "More information",
        fields: ["Phone", "Address"] 
      }
    ]
  }
};
```

### 3. fieldMeta
```javascript
const fieldMeta = {
  FirstName: { label: "First Name", type: "text", required: true },
  Email: { label: "Email", type: "email", required: true },
  Gender: { label: "Gender", type: "select", options: ["Male", "Female"], required: true },
  Comments: { label: "Comments", type: "textarea", required: false },
  BirthDate: { label: "Birth Date", type: "date", required: false },
  Checkbox: { label: "I agree", type: "checkbox", required: true },
  // ...
};
```

### 4. fieldToSf
```javascript
const fieldToSf = {
  FirstName: 'FirstName__c',
  Email: 'Email__c',
  Gender: 'Gender__c',
  // Maps client field names to Salesforce field names
};
```

---

## Complete Example: Donor Form

### File: public/donor.js

```javascript
(() => {
  const ENDPOINT = "http://localhost:7071/api/form";
  
  // Form configuration
  const FORM_CONFIG = {
    id: 'donor',
    name: 'Donor Registration',
    salesforce: {
      objectName: 'Account',
      recordTypeName: 'Donor',
      allowedFields: [
        'Name', 'Email__c', 'Phone', 'Website',
        'DonationAmount__c', 'DonationType__c', 'TaxId__c'
      ],
      queryFields: [
        'Id', 'DonorCode__c', 'Name', 'Email__c', 
        'Phone', 'DonationAmount__c'
      ],
      updateFields: [
        'DonationAmount__c', 'DonationType__c', 'Phone'
      ],
      searchField: 'DonorCode__c',
      lookupEmailField: 'Email__c'
    }
  };

  const phases = {
    initial: {
      name: "Donor Information",
      steps: [
        { title: "Contact", fields: ["Name", "Email", "Phone"] },
        { title: "Donation", fields: ["DonationAmount", "DonationType"] }
      ]
    }
  };

  const fieldMeta = {
    Name: { label: "Organization Name", type: "text", required: true },
    Email: { label: "Email", type: "email", required: true },
    Phone: { label: "Phone", type: "tel", required: false },
    Website: { label: "Website", type: "url", required: false },
    DonationAmount: { label: "Amount ($)", type: "number", required: true },
    DonationType: { label: "Type", type: "select", 
      options: ["One-Time", "Monthly", "Annual"], required: true }
  };

  const fieldToSf = {
    Name: 'Name',
    Email: 'Email__c',
    Phone: 'Phone',
    Website: 'Website',
    DonationAmount: 'DonationAmount__c',
    DonationType: 'DonationType__c'
  };

  const sfToField = Object.entries(fieldToSf).reduce((acc, [k, v]) => {
    acc[v] = k;
    return acc;
  }, {});

  // Form state
  let data = {};
  let formCode = null;
  let currentStep = 0;

  // Save form
  const saveProgress = async () => {
    const payload = {};
    
    // Collect form data
    Object.entries(data).forEach(([k, v]) => {
      const sfKey = fieldToSf[k] || k;
      payload[sfKey] = v;
    });

    // Set record type on create
    if (!formCode) {
      payload['RecordType__c'] = FORM_CONFIG.salesforce.recordTypeName;
      payload['RecordTypeName'] = FORM_CONFIG.salesforce.recordTypeName;
    }

    // Attach form config
    payload['__formConfig'] = FORM_CONFIG;

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        formCode = json.FormCode || json.DonorCode;
        alert('Donation registered!');
      } else {
        alert('Error: ' + (json.message || res.statusText));
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  // Render form
  const renderForm = () => {
    const phase = phases.initial;
    const step = phase.steps[currentStep];
    
    let html = `<h2>${step.title}</h2>`;
    step.fields.forEach(fieldKey => {
      const field = fieldMeta[fieldKey];
      const value = data[fieldKey] || '';
      
      let input = '';
      if (field.type === 'select') {
        input = `<select id="${fieldKey}">
          <option value="">-- Select --</option>
          ${field.options.map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>`;
      } else {
        input = `<input type="${field.type}" id="${fieldKey}" value="${value}" />`;
      }
      
      html += `
        <div>
          <label>${field.label}${field.required ? '*' : ''}</label>
          ${input}
        </div>
      `;
    });

    html += `
      <button onclick="previousStep()">Back</button>
      <button onclick="${currentStep < phase.steps.length - 1 ? 'nextStep()' : 'submitForm()'}">
        ${currentStep < phase.steps.length - 1 ? 'Next' : 'Submit'}
      </button>
    `;

    document.getElementById('form').innerHTML = html;

    // Bind events
    step.fields.forEach(fieldKey => {
      const el = document.getElementById(fieldKey);
      if (el) {
        el.addEventListener('change', (e) => {
          data[fieldKey] = e.target.value;
        });
      }
    });
  };

  // Navigation
  window.nextStep = () => {
    const phase = phases.initial;
    if (currentStep < phase.steps.length - 1) {
      currentStep++;
      renderForm();
    }
  };

  window.previousStep = () => {
    if (currentStep > 0) {
      currentStep--;
      renderForm();
    }
  };

  window.submitForm = () => {
    saveProgress();
  };

  // Initialize
  window.addEventListener('DOMContentLoaded', renderForm);
})();
```

### HTML File to Use It

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="application.css">
</head>
<body>
  <div id="form"></div>
  
  <!-- Load donor form instead of application form -->
  <script src="donor.js"></script>
</body>
</html>
```

---

## Key Points

### ✅ Each Form is Independent
- Own JavaScript file
- Own configuration
- Own phases and fields
- No shared state between forms

### ✅ No Build Required
- Edit .js file
- Deploy
- Done!

### ✅ Multiple Forms Possible
- Create as many form .js files as needed
- Each completely independent
- Switch by changing `<script>` tag in HTML

### ✅ Same API Endpoint
- All forms post to `/api/form`
- API uses form config to determine behavior
- Services remain generic

### ✅ Form Config Sent with Each Request
- JavaScript includes `FORM_CONFIG` in payload
- API receives form config and uses it
- No server-side configuration needed

---

## Form Types Supported

### Text Inputs
```javascript
fieldMeta: {
  FirstName: { label: "First Name", type: "text", required: true }
}
```

### Email
```javascript
fieldMeta: {
  Email: { label: "Email", type: "email", required: true }
}
```

### Phone
```javascript
fieldMeta: {
  Phone: { label: "Phone", type: "tel", required: false }
}
```

### URL
```javascript
fieldMeta: {
  Website: { label: "Website", type: "url", required: false }
}
```

### Number
```javascript
fieldMeta: {
  Amount: { label: "Amount", type: "number", required: true }
}
```

### Date
```javascript
fieldMeta: {
  BirthDate: { label: "Birth Date", type: "date", required: true }
}
```

### Select Dropdown
```javascript
fieldMeta: {
  Country: { label: "Country", type: "select", options: ["USA", "Canada", "Mexico"], required: true }
}
```

### Textarea
```javascript
fieldMeta: {
  Comments: { label: "Comments", type: "textarea", required: false }
}
```

### Checkbox
```javascript
fieldMeta: {
  Agree: { label: "I agree", type: "checkbox", required: true }
}
```

---

## Getting Started

1. **Copy template**: `cp public/donor.js.template public/myform.js`
2. **Edit FORM_CONFIG**: Update with your form details
3. **Edit phases**: Define form steps
4. **Edit fieldMeta**: Define field types and labels
5. **Edit fieldToSf**: Map to Salesforce fields
6. **Deploy**: Just upload the .js file
7. **Use**: Add `<script src="myform.js"></script>` to your HTML

---

## Folder Structure

```
forms/
├── public/
│   ├── index.html              ← HTML template, loads forms
│   ├── application.css         ← Shared styles
│   ├── application.js          ← Volunteer form
│   ├── donor.js                ← Donor form (when created)
│   ├── survey.js               ← Survey form (when created)
│   └── donor.js.template       ← Template for new forms
│
├── src/
│   ├── functions/
│   │   └── createForm/index.ts ← API handler (generic)
│   └── services/
│       └── salesforceService.ts ← Generic service
│
└── docs/
    └── ADDING_NEW_FORMS.md     ← This file
```

---

## Summary

| Item | Setup |
|------|-------|
| **Each form** | Own .js file |
| **Configuration** | In the .js file (FORM_CONFIG) |
| **Phases/Steps** | In the .js file (phases) |
| **Fields** | In the .js file (fieldMeta, fieldToSf) |
| **Build step** | Not needed ❌ |
| **Deploy** | Just the .js file |
| **Backend changes** | Not needed ❌ |
| **Time to add** | ~5-10 minutes |

Each form is completely self-contained. No dependencies on other forms. No shared configuration. Pure simplicity!
