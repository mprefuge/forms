# Quick Start: Adding a New Form

## 30-Second Overview

To add a new form:

1. **Copy template** - Copy `public/donor.js.template` to `public/myform.js`
2. **Edit config** - Change FORM_CONFIG, phases, fieldMeta, fieldToSf
3. **Deploy** - Upload the .js file (no build needed!)
4. **Use in HTML** - Add `<script src="myform.js"></script>`

That's it! **No TypeScript. No build. No complexity.**

---

## Step-by-Step Example

### Step 1: Copy Template

```bash
cp public/donor.js.template public/myform.js
```

### Step 2: Edit Configuration

Open `public/myform.js` and update these 4 objects:

#### 2a. FORM_CONFIG
```javascript
const FORM_CONFIG = {
  id: 'myform',                           // ← Change: Unique ID
  name: 'My Form Title',                  // ← Change: Display name
  salesforce: {
    objectName: 'MyObject__c',            // ← Change: Salesforce object
    recordTypeName: 'MyRecordType',       // ← Change: Record type name
    allowedFields: [                      // ← Change: Your fields
      'Field1__c', 'Field2__c', 'Field3__c'
    ],
    queryFields: [                        // ← Change: Query fields (subset)
      'Id', 'FormCode__c', 'Field1__c'
    ],
    updateFields: [                       // ← Change: Updatable fields
      'Field1__c'
    ],
    searchField: 'FormCode__c',
    lookupEmailField: 'Email__c'
  }
};
```

#### 2b. phases
```javascript
const phases = {
  initial: {
    name: "My Form",
    steps: [
      {
        title: "Step 1",
        fields: ['Field1', 'Field2']
      },
      {
        title: "Step 2", 
        fields: ['Field3']
      }
    ]
  }
};
```

#### 2c. fieldMeta
```javascript
const fieldMeta = {
  Field1: { 
    label: 'Field 1 Label',
    type: 'text',
    required: true
  },
  Field2: { 
    label: 'Field 2 Label',
    type: 'email',
    required: true
  },
  Field3: { 
    label: 'Field 3 Label',
    type: 'select',
    options: ['Option 1', 'Option 2'],
    required: false
  }
};
```

#### 2d. fieldToSf
```javascript
const fieldToSf = {
  Field1: 'Field1__c',
  Field2: 'Field2__c',
  Field3: 'Field3__c'
};
```

### Step 3: Deploy

```bash
# Upload myform.js to public/ folder
# No build needed!
```

### Step 4: Use in HTML

```html
<script src="myform.js"></script>
```

That's it!

---

## Field Types

- `"text"` - Text input
- `"email"` - Email input  
- `"tel"` - Phone number
- `"date"` - Date picker
- `"textarea"` - Multi-line text
- `"select"` - Dropdown
- `"checkbox"` - Yes/no checkbox
- `"number"` - Numeric input

---

## Example: Donor Form

```javascript
const FORM_CONFIG = {
  id: 'donor',
  name: 'Donor Registration',
  salesforce: {
    objectName: 'Account',  // Different object
    recordTypeName: 'Donor',
    allowedFields: [
      'Name', 'Email__c', 'Phone',
      'DonationAmount__c', 'TaxId__c'
    ],
    queryFields: [
      'Id', 'DonorCode__c', 'Name', 'Email__c'
    ],
    updateFields: [
      'DonationAmount__c'
    ],
    searchField: 'DonorCode__c',
    lookupEmailField: 'Email__c'
  }
};

const phases = {
  initial: {
    name: "Donor Information",
    steps: [
      {
        title: "Contact",
        fields: ['Name', 'Email', 'Phone']
      },
      {
        title: "Donation",
        fields: ['DonationAmount', 'TaxId']
      }
    ]
  }
};

const fieldMeta = {
  Name: { label: 'Organization', type: 'text', required: true },
  Email: { label: 'Email', type: 'email', required: true },
  Phone: { label: 'Phone', type: 'tel', required: false },
  DonationAmount: { label: 'Amount ($)', type: 'number', required: true },
  TaxId: { label: 'Tax ID', type: 'text', required: false }
};

const fieldToSf = {
  Name: 'Name',
  Email: 'Email__c',
  Phone: 'Phone',
  DonationAmount: 'DonationAmount__c',
  TaxId: 'TaxId__c'
};
```

---

## Common Changes

### Add a Field

1. Add to `fieldMeta`:
```javascript
NewField: { label: 'New Field Label', type: 'text', required: true }
```

2. Add to `fieldToSf`:
```javascript
NewField: 'NewField__c'
```

3. Add to `phases` step:
```javascript
fields: ['Field1', 'NewField']
```

4. Add to `FORM_CONFIG.salesforce.allowedFields`:
```javascript
'NewField__c'
```

### Make Field Optional
```javascript
MyField: { label: 'My Field', type: 'text', required: false }
```

### Add Select Dropdown
```javascript
Status: { 
  label: 'Status',
  type: 'select',
  options: ['Active', 'Inactive', 'Pending'],
  required: true
}
```

### Change Salesforce Object
```javascript
salesforce: {
  objectName: 'Contact__c',  // Changed
  recordTypeName: 'MyType',
  // ... rest of config
}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Form doesn't appear | Check `<script src="myform.js"></script>` in HTML |
| Fields not showing | Verify field is in `phases` step AND `fieldMeta` |
| Data not saving | Check `fieldToSf` mapping matches Salesforce field names |
| RecordType error | Verify `recordTypeName` exists in Salesforce |
| Email not working | Check API logs for errors |

---

## Important Notes

- ✅ **No build needed** - Just edit and deploy the .js file
- ✅ **Each form independent** - `myform.js` doesn't know about `donor.js`
- ✅ **Each form complete** - All configuration in one file
- ✅ **Easy to copy** - Use the template for any new form

---

## Real Example: Complete Feedback Form

Here's a minimal complete working form:

```javascript
const FORM_CONFIG = {
  id: 'feedback',
  name: 'Feedback Form',
  salesforce: {
    objectName: 'Form__c',
    recordTypeName: 'Feedback',
    allowedFields: ['Email__c', 'Message__c'],
    queryFields: ['Id', 'FormCode__c'],
    updateFields: [],
    searchField: 'FormCode__c',
    lookupEmailField: 'Email__c'
  }
};

const phases = {
  initial: {
    name: "Send Feedback",
    steps: [
      {
        title: "Feedback",
        fields: ['Email', 'Message']
      }
    ]
  }
};

const fieldMeta = {
  Email: { label: 'Email', type: 'email', required: true },
  Message: { label: 'Feedback', type: 'textarea', required: true }
};

const fieldToSf = {
  Email: 'Email__c',
  Message: 'Message__c'
};
```

**That's all you need!** Copy, edit, deploy. Done.

---

## Files to Know

| File | Purpose |
|------|---------|
| `public/application.js` | Volunteer form (example) |
| `public/donor.js.template` | Template for new forms |
| `ADDING_FORMS_JAVASCRIPT.md` | Complete guide |
| `FORM_CONFIG_TEMPLATE.md` | Configuration reference |

---

## Get Started Now

```bash
# 1. Copy template
cp public/donor.js.template public/myform.js

# 2. Edit myform.js
#    - Change FORM_CONFIG
#    - Update phases
#    - Edit fieldMeta
#    - Fix fieldToSf

# 3. Deploy
#    Upload myform.js to server

# 4. Use
#    <script src="myform.js"></script>

# Done! ✅ No build. No compilation. No complexity.
```

---

## Questions?

See **ADDING_FORMS_JAVASCRIPT.md** for complete step-by-step guide with more examples.
